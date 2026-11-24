import { FREE_AGENT_STAY_MIN_OVERALL, SQUAD_LIMIT } from "../engine/balance";
import { contractEndDate } from "../engine/economy";
import type { Position } from "../engine/positions";
import { NAME_BANK } from "../engine/names";
import { planSquad, squadPlanRngSeed, type RosterPlayer, type SquadDecision } from "../engine/squad-ai";
import { competitionTier } from "../engine/tiers";
import { seasonEndDate, seasonStartYear, WORLD_START_DATE } from "../engine/world";
import { generateYouthPlayer, youthKeyPrefix, youthPositions, youthRngSeed } from "../engine/youth";
import { Prisma } from "../generated/prisma/client";
import { chunk } from "../lib/arrays";
import { ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import { makeRng } from "../lib/rng";
import { prisma } from "./client";
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
  renewals: number; // of the clubs planning their squads: the AI clubs, and the managed club for the assistant
  releases: number;
  signings: number;
  bonuses: number; // euros: the signing bonuses those signings paid out of their clubs' budgets
  // The managed club's own renewals, releases and signings, when the assistant manages its contracts; absent otherwise.
  managed?: { renewals: number; releases: number; signings: number };
};

/** How a preseason treats the managed club. */
export type PreseasonOptions = {
  /**
   * The assistant manages the managed club's contracts (the measurement scripts and tests only, never the game): the
   * club plans its squad as an AI club does (planSquad), renewing or releasing its expiring contracts and signing free
   * agents, in its place among them by reputation, with its own stream and its own budget, which pays its signings'
   * bonuses. Otherwise its player manages them: the preseason never touches its squad but for its young players.
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
 * 2. every club, the managed one included, receives its young players, as many as the places left under SQUAD_LIMIT
 *    allow (docs/design/simplification.md § 1.4): two, fewer near the limit, none at it;
 * 3. AI clubs, most reputed first, renew or release their expiring contracts and sign free agents, sharing one market,
 *    each signing's bonus paid out of the club's budget (planSquad); signings and releases write FREE transfers, a
 *    signing's with its bonus as the fee, the budgets debited; renewals update contract and wage. The managed club plans
 *    its squad with them when the assistant manages its contracts (options.assistantContracts), never otherwise.
 * No AI club sells to another since the simplification (§ 1.5): the sales for a wage bill above its budget are gone.
 * A season whose young players already exist has had its preseason: nothing is done. Some club always has a place left
 * for one: the AI clubs keep 20 to 25 players.
 */
export async function runPreseasonInTransaction(
  tx: Prisma.TransactionClient,
  saveId: string,
  options: PreseasonOptions = {},
): Promise<PreseasonSummary> {
  const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { seed: true, currentDate: true } });
  const date = save.currentDate;
  const startYear = seasonStartYear(date);
  const summary: PreseasonSummary = {
    startYear,
    skipped: false,
    departures: 0,
    youthPlayers: 0,
    renewals: 0,
    releases: 0,
    signings: 0,
    bonuses: 0,
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

  // 2. Young players arrive at every club, in the places left under SQUAD_LIMIT: the first ones of its intake, the same as
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

  // 3. AI clubs manage their squads, most reputed first.
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
  const aiClubs = clubs.filter((club) => !club.isManaged).sort(byReputation);

  // The clubs planning their squads, most reputed first: the AI clubs, and the managed club in its place among them when
  // the assistant manages its contracts, with its own budget and its own stream, the one its slug gives, which no AI club
  // draws from. Each budget is the dotation the transition just gave (src/db/season-finances.ts), the creation's on the
  // first preseason; what its signings' bonuses take, it no longer has to bid for the managed club's players.
  const planners = options.assistantContracts === true ? [...clubs].sort(byReputation) : aiClubs;
  const bonusesByClub = new Map<string, number>();
  for (const club of planners) {
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
    if (club.isManaged) {
      const count = (type: SquadDecision["type"]): number => decisions.filter((decision) => decision.type === type).length;
      summary.managed = { renewals: count("renew"), releases: count("release"), signings: count("sign") };
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
