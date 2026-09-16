import { FREE_AGENT_STAY_MIN_OVERALL } from "../engine/balance";
import { contractEndDate } from "../engine/economy";
import type { Position } from "../engine/generation";
import { NAME_BANK } from "../engine/names";
import { planSquad, squadPlanRngSeed, type RosterPlayer } from "../engine/squad-ai";
import { seasonEndDate, seasonStartYear, WORLD_START_DATE } from "../engine/world";
import { generateYouthPlayer, youthKeyPrefix, youthPositions, youthRngSeed } from "../engine/youth";
import { Prisma } from "../generated/prisma/client";
import { ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import { makeRng } from "../lib/rng";
import { prisma } from "./client";

// A preseason reads every player of the save and writes a few thousand rows in bulk statements.
const TRANSACTION_MAX_WAIT_MS = 10_000;
const TRANSACTION_TIMEOUT_MS = 120_000;

export type PreseasonSummary = {
  startYear: number;
  skipped: boolean; // this season's preseason had already run
  departures: number; // free agents leaving the world
  youthPlayers: number;
  renewals: number;
  releases: number;
  signings: number;
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
 * 2. every club, the managed one included, receives its young players;
 * 3. AI clubs, most reputed first, renew or release their expiring contracts and sign free agents, sharing
 *    one market; signings and releases write FREE transfers, renewals update contract and wage.
 * A season whose young players already exist has had its preseason: nothing is done.
 */
export async function runPreseasonInTransaction(
  tx: Prisma.TransactionClient,
  saveId: string,
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
      wageBudget: true,
      club: { select: { id: true, slug: true, country: true } },
    },
  });
  const retirements = await tx.transfer.findMany({
    where: { saveId, type: "RETIREMENT" },
    select: { playerSaveId: true },
  });
  const retired = new Set(retirements.map((transfer) => transfer.playerSaveId));
  const releases = await tx.transfer.groupBy({
    by: ["playerSaveId"],
    where: { saveId, type: "FREE", toClubId: null },
    _max: { date: true },
  });
  const releasedOn = new Map(releases.map((row) => [row.playerSaveId, row._max.date]));
  const rows = await tx.playerSave.findMany({ where: { saveId }, select: PLAYER_STATE_SELECT });

  const transfers: Prisma.TransferCreateManyInput[] = [];
  const changed = new Set<PlayerState>();
  const squads = new Map<string, PlayerState[]>(clubs.map((club) => [club.id, []]));
  const market = new Map<string, PlayerState>();

  // 1. Free agents without a club since an earlier release leave the world, unless good enough.
  for (const { playerKey, ...row } of rows) {
    if (retired.has(row.id)) {
      continue;
    }
    const player: PlayerState = { ...row, key: playerKey };
    if (player.clubSaveId !== null) {
      getOrThrow(squads, player.clubSaveId, "squad").push(player);
      continue;
    }
    // Without a recorded release, the player belongs to the initial pool: free since the save started.
    const releaseDate = releasedOn.get(player.id) ?? WORLD_START_DATE;
    if (releaseDate < date && player.overall <= FREE_AGENT_STAY_MIN_OVERALL) {
      transfers.push({ saveId, playerSaveId: player.id, fromClubId: null, toClubId: null, type: "RETIREMENT", date });
      summary.departures++;
    } else {
      market.set(player.key, player);
    }
  }

  // 2. Young players arrive at every club.
  const youthRows: Prisma.PlayerSaveCreateManyInput[] = [];
  for (const club of [...clubs].sort(bySlug)) {
    const squad = getOrThrow(squads, club.id, "squad");
    const takenNames = new Set(squad.map((player) => `${player.firstName} ${player.lastName}`));
    youthPositions(squad.map((player) => player.position)).forEach((position, offset) => {
      const index = offset + 1;
      const { key, ...youth } = generateYouthPlayer(
        {
          club: { slug: club.club.slug, country: club.club.country, reputation: club.reputation },
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
  const aiClubs = clubs.filter((club) => !club.isManaged).sort((a, b) => b.reputation - a.reputation || bySlug(a, b));

  for (const club of aiClubs) {
    const squad = getOrThrow(squads, club.id, "squad");
    const squadByKey = new Map(squad.map((player) => [player.key, player]));
    const decisions = planSquad(
      { id: club.club.slug, wageBudget: club.wageBudget },
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
        transfers.push({ saveId, playerSaveId: player.id, fromClubId: null, toClubId: club.club.id, type: "FREE", date });
        summary.signings++;
      }
    }
  }

  if (transfers.length > 0) {
    await tx.transfer.createMany({ data: transfers });
  }

  // Dates go through ISO strings: a Date parameter would be sent in the server's local time zone.
  const updates = [...changed];
  if (updates.length > 0) {
    await tx.$executeRaw`
      UPDATE "PlayerSave" AS p
      SET "clubSaveId" = v."clubSaveId", "contractUntil" = v."contractUntil", "wage" = v."wage"
      FROM (VALUES ${Prisma.join(
        updates.map(
          (player) =>
            Prisma.sql`(${player.id}::text, ${player.clubSaveId}::text, ${player.contractUntil?.toISOString() ?? null}::timestamp(3), ${player.wage}::int)`,
        ),
      )}) AS v("id", "clubSaveId", "contractUntil", "wage")
      WHERE p."id" = v."id" AND p."saveId" = ${saveId}`;
  }

  return summary;
}
