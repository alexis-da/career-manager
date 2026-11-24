import { assistantSignings, decideContracts } from "../engine/assistant-contracts";
import { FREE_AGENT_STAY_MIN_OVERALL, SQUAD_LIMIT } from "../engine/balance";
import { contractEndDate } from "../engine/economy";
import type { Position } from "../engine/positions";
import { NAME_BANK } from "../engine/names";
import { countByRole, planSquad, squadPlanRngSeed, type RosterPlayer } from "../engine/squad-ai";
import { competitionTier } from "../engine/tiers";
import { seasonEndDate, seasonStartYear, WORLD_START_DATE } from "../engine/world";
import { generateYouthPlayer, youthKeyPrefix, youthPositions, youthRngSeed } from "../engine/youth";
import { Prisma } from "../generated/prisma/client";
import { chunk } from "../lib/arrays";
import { ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import { makeRng } from "../lib/rng";
import { prisma } from "./client";
import { contractChoiceOf, type ContractMoves } from "./contracts";
import { TRANSACTION_MAX_WAIT_MS } from "./transactions";

// A preseason reads every player of the save and writes a few thousand rows in bulk statements.
const TRANSACTION_TIMEOUT_MS = 120_000;

/** Players per bulk UPDATE: PostgreSQL takes 65 535 parameters per statement at most. */
const UPDATE_BATCH_SIZE = 1_000;

export type PreseasonSummary = {
  startYear: number;
  skipped: boolean; // this season's preseason had already run
  departures: number; // free agents leaving the world
  youthPlayers: number; // two a club, fewer for a club with fewer places left under SQUAD_LIMIT
  // Every club's contracts: the AI clubs' (planSquad), and the managed club's ending on 30 June, renewed or gone free, and
  // the free agents its assistant signed.
  renewals: number;
  releases: number;
  signings: number;
  bonuses: number; // euros: the signing bonuses those signings paid out of their clubs' budgets
  // The managed club's own renewals, releases and signings, when its assistant takes care of its contracts; absent when
  // its player does.
  managed?: { renewals: number; releases: number; signings: number };
  // What the turn did to the managed club's squad, for the season it opens (SeasonBudget.contractMoves); null when the
  // preseason had already run, or without a managed club.
  contractMoves: ContractMoves | null;
};

/** How a preseason treats the managed club. */
export type PreseasonOptions = {
  /**
   * Who decides the managed club's contracts ending on 30 June (docs/design/simplification.md § 2.1): its assistant (true)
   * or its player (false), whatever the career's setting; absent, the career's (Save.contractsByAssistant). The
   * measurement scripts pass true: they measure the game's assistant.
   */
  assistantContracts?: boolean;
};

type PlayerState = {
  id: string; // PlayerSave.id
  key: string; // PlayerSave.playerKey
  firstName: string;
  lastName: string;
  birthDate: Date;
  position: Position;
  clubSaveId: string | null;
  overall: number;
  potential: number;
  wage: number;
  contractUntil: Date | null;
  contractChoice: string | null; // his player's choice for a contract of the managed club ending on 30 June
};

const PLAYER_STATE_SELECT = {
  id: true,
  playerKey: true,
  firstName: true,
  lastName: true,
  birthDate: true,
  position: true,
  clubSaveId: true,
  overall: true,
  potential: true,
  wage: true,
  contractUntil: true,
  contractChoice: true,
} as const;

const bySlug = (a: { club: { slug: string } }, b: { club: { slug: string } }): number =>
  a.club.slug < b.club.slug ? -1 : a.club.slug > b.club.slug ? 1 : 0;

type RankedClub = { reputation: number; club: { slug: string } };

/** Most reputed first, then by slug: the order in which the clubs plan their squads. */
const byReputation = (a: RankedClub, b: RankedClub): number => b.reputation - a.reputation || bySlug(a, b);

/** Runs the preseason of the save's current season in its own transaction. */
export async function runPreseason(saveId: string): Promise<PreseasonSummary> {
  return prisma.$transaction((tx) => runPreseasonInTransaction(tx, saveId), {
    maxWait: TRANSACTION_MAX_WAIT_MS,
    timeout: TRANSACTION_TIMEOUT_MS,
  });
}


/**
 * Preseason on the save's current date, inside the caller's transaction, once per season:
 * 1. free agents released before this preseason and rated FREE_AGENT_STAY_MIN_OVERALL or less leave the
 *    world (RETIREMENT transfer); the initial pool, never released, counts as released when the save started;
 * 2. the managed club's contracts ending on 30 June are decided (docs/design/simplification.md § 2.1, decideContracts):
 *    its player's choice, then its assistant's rule when he takes care of the contracts (options.assistantContracts, or
 *    the career's setting), a free departure otherwise; renewed from the club's own stream (squadPlanRngSeed), those who
 *    leave on the market for every AI club; every choice of the save then goes back to none;
 * 3. every club, the managed one included, receives its young players, as many as the places left under SQUAD_LIMIT
 *    allow (§ 1.4): two, fewer near the limit, none at it;
 * 4. the managed club's assistant signs free agents only when its squad is left under SQUAD_SIZE_MIN players or
 *    MIN_GOALKEEPERS goalkeepers (assistantSignings), before any AI club and never one it has just let go, each paying his
 *    bonus out of its budget; never a running contract broken;
 * 5. AI clubs, most reputed first, renew or release their expiring contracts and sign free agents, sharing one market,
 *    each signing's bonus paid out of the club's budget (planSquad).
 * Signings and releases write FREE transfers, a signing's with its bonus as the fee, the budgets debited; renewals update
 * contract and wage. No AI club sells to another since the simplification (§ 1.5). What the managed club's turn did is
 * returned (contractMoves), for its season's dotation. A season whose young players already exist has had its preseason:
 * nothing is done. Some club always has a place left for one: the AI clubs keep 20 to 25 players.
 */
export async function runPreseasonInTransaction(
  tx: Prisma.TransactionClient,
  saveId: string,
  options: PreseasonOptions = {},
): Promise<PreseasonSummary> {
  const save = await tx.save.findUniqueOrThrow({
    where: { id: saveId },
    select: { seed: true, currentDate: true, contractsByAssistant: true },
  });
  const date = save.currentDate;
  const startYear = seasonStartYear(date);
  const byAssistant = options.assistantContracts ?? save.contractsByAssistant;
  const summary: PreseasonSummary = {
    startYear,
    skipped: false,
    departures: 0,
    youthPlayers: 0,
    renewals: 0,
    releases: 0,
    signings: 0,
    bonuses: 0,
    contractMoves: null,
  };

  const youthAlreadyThere = await tx.playerSave.count({
    where: { saveId, playerKey: { startsWith: youthKeyPrefix(startYear) } },
  });
  if (youthAlreadyThere > 0) {
    return { ...summary, skipped: true };
  }

  const clubs = await tx.clubSave.findMany({
    where: { saveId },
    select: {
      id: true,
      isManaged: true,
      reputation: true,
      budget: true,
      competition: { select: { tier: true } },
      club: { select: { id: true, slug: true, country: true } },
    },
  });
  const releases = await tx.transfer.groupBy({
    by: ["playerSaveId"],
    where: { saveId, type: "FREE", toClubId: null },
    _max: { date: true },
  });
  const releasedOn = new Map(releases.map((row) => [row.playerSaveId, row._max.date]));
  // The retired players are out of the world.
  const rows = await tx.playerSave.findMany({ where: { saveId, retired: false }, select: PLAYER_STATE_SELECT });

  const transfers: Prisma.TransferCreateManyInput[] = [];
  const changed = new Set<PlayerState>();
  const squads = new Map<string, PlayerState[]>(clubs.map((club) => [club.id, []]));
  const market = new Map<string, PlayerState>();
  const bonusesByClub = new Map<string, number>();

  // 1. Free agents without a club since an earlier release leave the world, unless good enough.
  const departures: string[] = [];
  for (const { playerKey, ...row } of rows) {
    const player: PlayerState = { ...row, key: playerKey };
    if (player.clubSaveId !== null) {
      getOrThrow(squads, player.clubSaveId, "squad").push(player);
      continue;
    }
    // Without a recorded release, the player belongs to the initial pool: free since the save started.
    const releaseDate = releasedOn.get(player.id) ?? WORLD_START_DATE;
    if (releaseDate < date && player.overall <= FREE_AGENT_STAY_MIN_OVERALL) {
      transfers.push({ saveId, playerSaveId: player.id, fromClubId: null, toClubId: null, type: "RETIREMENT", date });
      departures.push(player.id);
      summary.departures++;
    } else {
      market.set(player.key, player);
    }
  }

  const lastContractDay = seasonEndDate(startYear - 1);
  const toRoster = (player: PlayerState): RosterPlayer => ({
    id: player.key,
    position: player.position,
    age: ageInYears(player.birthDate, date),
    overall: player.overall,
    potential: player.potential,
    wage: player.wage,
    contractExpiring: player.contractUntil !== null && player.contractUntil <= lastContractDay,
  });
  const moved = (player: PlayerState) => ({ id: player.id, firstName: player.firstName, lastName: player.lastName });

  // 2. The managed club's contracts ending on 30 June, before its young players come to the places its departures leave,
  // and before any AI club plans: who leaves is on the market for all of them, as a contract that ran out was before the
  // rule. Renewals and signings drawn from its own stream, the one its slug gives, which no AI club draws from.
  const managed = clubs.find((club) => club.isManaged) ?? null;
  const managedRng = managed === null ? null : makeRng(squadPlanRngSeed(save.seed, startYear, managed.club.slug));
  const moves: ContractMoves = { byAssistant, renewed: [], left: [], signed: [], youths: 0, squad: 0 };
  if (managed !== null && managedRng !== null) {
    const squad = getOrThrow(squads, managed.id, "squad");
    const squadByKey = new Map(squad.map((player) => [player.key, player]));
    const decisions = decideContracts(
      squad.map((player) => ({ ...toRoster(player), choice: contractChoiceOf(player.contractChoice) })),
      countByRole(market.values()),
      byAssistant,
      managedRng,
    );
    for (const decision of decisions) {
      const player = getOrThrow(squadByKey, decision.playerId, "squad player");
      if (decision.type === "renew") {
        const until = contractEndDate(date, decision.years);
        player.contractUntil = until;
        player.wage = decision.wage;
        changed.add(player);
        moves.renewed.push({ ...moved(player), until: until.toISOString(), by: decision.by });
        summary.renewals++;
      } else {
        player.clubSaveId = null;
        player.contractUntil = null;
        changed.add(player);
        market.set(player.key, player);
        transfers.push({ saveId, playerSaveId: player.id, fromClubId: managed.club.id, toClubId: null, type: "FREE", date });
        moves.left.push({ ...moved(player), by: decision.by });
        summary.releases++;
      }
    }
    squads.set(managed.id, squad.filter((player) => player.clubSaveId !== null));
  }

  // 3. Young players arrive at every club, in the places left under SQUAD_LIMIT: the first ones of its intake, the same as
  // they would be with room for all.
  const youthRows: Prisma.PlayerSaveCreateManyInput[] = [];
  for (const club of [...clubs].sort(bySlug)) {
    const squad = getOrThrow(squads, club.id, "squad");
    const takenNames = new Set(squad.map((player) => `${player.firstName} ${player.lastName}`));
    const places = Math.max(0, SQUAD_LIMIT - squad.length);
    youthPositions(squad.map((player) => player.position)).slice(0, places).forEach((position, offset) => {
      const index = offset + 1;
      const { key, ...youth } = generateYouthPlayer(
        {
          club: {
            slug: club.club.slug,
            country: club.club.country,
            reputation: club.reputation,
            tier: competitionTier(club.competition.tier),
          },
          position,
          startYear,
          index,
          takenNames,
        },
        NAME_BANK,
        makeRng(youthRngSeed(save.seed, startYear, club.club.slug, index)),
      );
      youthRows.push({ ...youth, saveId, playerKey: key, clubSaveId: club.id });
    });
  }
  const youthPlayers = await tx.playerSave.createManyAndReturn({ data: youthRows, select: PLAYER_STATE_SELECT });
  for (const { playerKey, ...row } of youthPlayers) {
    if (row.clubSaveId !== null) {
      getOrThrow(squads, row.clubSaveId, "squad").push({ ...row, key: playerKey });
    }
  }
  summary.youthPlayers = youthPlayers.length;

  // 4. The managed club's assistant signs free agents only to play on: under SQUAD_SIZE_MIN players or MIN_GOALKEEPERS
  // goalkeepers once the turn is over (§ 13, point 4), the first to choose from the market, but for the players it has
  // just let go: gone is gone, never signed back with a bonus. Its budget is the dotation the transition just gave
  // (src/db/season-finances.ts).
  if (managed !== null && managedRng !== null) {
    const squad = getOrThrow(squads, managed.id, "squad");
    const gone = new Set(moves.left.map((player) => player.id));
    moves.youths = youthPlayers.filter((row) => row.clubSaveId === managed.id).length;
    const signings = byAssistant
      ? assistantSignings(
          { budget: managed.budget, reputation: managed.reputation },
          squad.map(toRoster),
          [...market.values()].filter((player) => !gone.has(player.id)).map(toRoster),
          managedRng,
        )
      : [];
    for (const signing of signings) {
      const player = getOrThrow(market, signing.playerId, "free agent");
      market.delete(player.key);
      player.clubSaveId = managed.id;
      player.contractUntil = contractEndDate(date, signing.years);
      player.wage = signing.wage;
      changed.add(player);
      squad.push(player);
      // The bonus is the FREE transfer's fee, as a signing of the player's own writes it (signFreeAgent).
      transfers.push({ saveId, playerSaveId: player.id, fromClubId: null, toClubId: managed.club.id, fee: signing.bonus, type: "FREE", date });
      bonusesByClub.set(managed.id, (bonusesByClub.get(managed.id) ?? 0) + signing.bonus);
      moves.signed.push({ ...moved(player), position: player.position, bonus: signing.bonus });
      summary.signings++;
      summary.bonuses += signing.bonus;
    }
    moves.squad = squad.length;
    summary.contractMoves = moves;
    if (byAssistant) {
      summary.managed = { renewals: moves.renewed.length, releases: moves.left.length, signings: moves.signed.length };
    }
  }

  // 5. AI clubs manage their squads, most reputed first, each with the dotation the transition just gave as its budget
  // (src/db/season-finances.ts), the creation's on the first preseason: what its signings' bonuses take, it no longer has
  // to bid for the managed club's players. Each draws from its own stream, the one its slug gives.
  for (const club of clubs.filter((candidate) => !candidate.isManaged).sort(byReputation)) {
    const squad = getOrThrow(squads, club.id, "squad");
    const squadByKey = new Map(squad.map((player) => [player.key, player]));
    const decisions = planSquad(
      { id: club.club.slug, budget: club.budget },
      squad.map(toRoster),
      [...market.values()].map(toRoster),
      makeRng(squadPlanRngSeed(save.seed, startYear, club.club.slug)),
    );

    for (const decision of decisions) {
      if (decision.type === "renew") {
        const player = getOrThrow(squadByKey, decision.playerId, "squad player");
        player.contractUntil = contractEndDate(date, decision.years);
        player.wage = decision.wage;
        changed.add(player);
        summary.renewals++;
      } else if (decision.type === "release") {
        const player = getOrThrow(squadByKey, decision.playerId, "squad player");
        player.clubSaveId = null;
        player.contractUntil = null;
        changed.add(player);
        market.set(player.key, player);
        transfers.push({ saveId, playerSaveId: player.id, fromClubId: club.club.id, toClubId: null, type: "FREE", date });
        summary.releases++;
      } else {
        const player = getOrThrow(market, decision.playerId, "free agent");
        market.delete(player.key);
        player.clubSaveId = club.id;
        player.contractUntil = contractEndDate(date, decision.years);
        player.wage = decision.wage;
        changed.add(player);
        // The bonus is the FREE transfer's fee, as a signing of the managed club writes it (signFreeAgent).
        transfers.push({
          saveId,
          playerSaveId: player.id,
          fromClubId: null,
          toClubId: club.club.id,
          fee: decision.bonus,
          type: "FREE",
          date,
        });
        bonusesByClub.set(club.id, (bonusesByClub.get(club.id) ?? 0) + decision.bonus);
        summary.signings++;
        summary.bonuses += decision.bonus;
      }
    }
  }

  if (transfers.length > 0) {
    await tx.transfer.createMany({ data: transfers });
  }
  // Each club's budget, less the bonuses it paid: one statement for them all.
  if (bonusesByClub.size > 0) {
    await tx.$executeRaw`
      UPDATE "ClubSave" AS c
      SET "budget" = c."budget" - v."bonuses"
      FROM (VALUES ${Prisma.join([...bonusesByClub].map(([id, bonuses]) => Prisma.sql`(${id}::text, ${bonuses}::int)`))}) AS v("id", "bonuses")
      WHERE c."id" = v."id" AND c."saveId" = ${saveId}`;
  }
  // The free agents who left the world are retired: out of the market for good.
  if (departures.length > 0) {
    await tx.playerSave.updateMany({ where: { saveId, id: { in: departures } }, data: { retired: true } });
  }
  // Every choice of a contract ending on 30 June has been applied: none is left, for a contract renewed earlier or a player
  // gone since either. No statement when nobody made one, as at a save's creation.
  if (rows.some((row) => row.contractChoice !== null)) {
    await tx.playerSave.updateMany({ where: { saveId, contractChoice: { not: null } }, data: { contractChoice: null } });
  }

  // Dates go through ISO strings: a Date parameter would be sent in the server's local time zone.
  for (const batch of chunk([...changed], UPDATE_BATCH_SIZE)) {
    await tx.$executeRaw`
      UPDATE "PlayerSave" AS p
      SET "clubSaveId" = v."clubSaveId", "contractUntil" = v."contractUntil", "wage" = v."wage"
      FROM (VALUES ${Prisma.join(
        batch.map(
          (player) =>
            Prisma.sql`(${player.id}::text, ${player.clubSaveId}::text, ${player.contractUntil?.toISOString() ?? null}::timestamp(3), ${player.wage}::int)`,
        ),
      )}) AS v("id", "clubSaveId", "contractUntil", "wage")
      WHERE p."id" = v."id" AND p."saveId" = ${saveId}`;
  }

  return summary;
}
