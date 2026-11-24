import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { decodeSeason, SeasonArchiveError, type ArchiveJson, type DecodedSeason, type EncodedSeason } from "../lib/season-archive";

// Reads of the archives of completed seasons (SeasonArchive, chantier « archives », 10/11). Once a season has an
// archive, it is read instead of the season's Fixture and PlayerSeasonStats rows, whether they still exist (archived,
// not deleted yet) or not: the honours' lazy rebuild (season-results.ts), the cup's winner on a season's review
// (cup-view.ts), the opponent's recent form (opponent.ts), the first steps (first-steps.ts), the sign-in banner
// (saves.ts), /admin/stats (stats.ts), a past season's table (standings.ts) and the club count of the Club screen's
// dotation (club.ts). Every other reader reads seasons in progress only, never archived. Scoped by saveId.

type Db = PrismaClient | Prisma.TransactionClient;

/** The columns a decoding needs: the stats' only when asked for. */
const FIXTURES_SELECT = {
  seasonId: true,
  version: true,
  clubSaveIds: true,
  fixtures: true,
  goalTimes: true,
  instructions: true,
  fixtureCount: true,
} as const;
const WITH_STATS_SELECT = { ...FIXTURES_SELECT, playerSaveIds: true, stats: true, statCount: true } as const;

type ArchiveRow = {
  version: number;
  clubSaveIds: string[];
  fixtures: number[];
  goalTimes: number[];
  instructions: Prisma.JsonValue;
  fixtureCount: number;
  playerSaveIds?: string[];
  stats?: number[];
  statCount?: number;
};

/** A JSON value read from a Json column, checked as the archive's own type. */
export function archiveJson(value: unknown): ArchiveJson {
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(archiveJson);
  }
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, archiveJson(inner)]));
  }
  throw new SeasonArchiveError(`${typeof value} is not a JSON value`);
}

/** The instructions column of an archive: null, or [fixture index, instructions] pairs. */
function archiveInstructions(value: Prisma.JsonValue): [number, ArchiveJson][] | null {
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new SeasonArchiveError("An archive's instructions are not a list");
  }
  return value.map((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "number") {
      throw new SeasonArchiveError("An archive's instructions are not [index, instructions] pairs");
    }
    return [pair[0], archiveJson(pair[1])];
  });
}

/** A row's arrays as the codec takes them; without its stats' columns, a season without statistics. */
export function encodedOf(row: ArchiveRow): EncodedSeason {
  return {
    version: row.version,
    clubSaveIds: row.clubSaveIds,
    fixtures: row.fixtures,
    goalTimes: row.goalTimes,
    instructions: archiveInstructions(row.instructions),
    playerSaveIds: row.playerSaveIds ?? [],
    stats: row.stats ?? [],
    fixtureCount: row.fixtureCount,
    statCount: row.statCount ?? 0,
  };
}

/** The ids of the save's archived seasons: their rows, if any remain, are never read. */
export async function archivedSeasonIds(db: Db, saveId: string): Promise<string[]> {
  const rows = await db.seasonArchive.findMany({ where: { saveId }, select: { seasonId: true } });
  return rows.map((row) => row.seasonId);
}

/** A season's archive, decoded, its statistics only when asked for; null when the season has none. */
export async function readArchivedSeason(db: Db, saveId: string, seasonId: string, { stats = false } = {}): Promise<DecodedSeason | null> {
  const row = await db.seasonArchive.findFirst({ where: { saveId, seasonId }, select: stats ? WITH_STATS_SELECT : FIXTURES_SELECT });
  return row === null ? null : decodeSeason(encodedOf(row));
}

/**
 * The save's archived seasons whose clubs include a club, decoded (their statistics only when asked for), with their
 * start year, most recent first: the matches a club played in completed seasons.
 */
export async function readArchivedSeasonsOfClub(
  db: Db,
  saveId: string,
  clubSaveId: string,
  { stats = false } = {},
): Promise<{ seasonId: string; startYear: number; season: DecodedSeason }[]> {
  const rows = await db.seasonArchive.findMany({
    where: { saveId, clubSaveIds: { has: clubSaveId } },
    orderBy: { season: { startYear: "desc" } },
    select: { ...(stats ? WITH_STATS_SELECT : FIXTURES_SELECT), season: { select: { startYear: true } } },
  });
  return rows.map((row) => ({ seasonId: row.seasonId, startYear: row.season.startYear, season: decodeSeason(encodedOf(row)) }));
}

/**
 * The save's archived seasons of a start year: the ids of every one of them, whose rows (if any remain) are never read,
 * and those whose clubs include a club, decoded with their statistics.
 */
export async function readArchivedYear(
  db: Db,
  saveId: string,
  startYear: number,
  clubSaveId: string,
): Promise<{ archivedIds: string[]; ofClub: DecodedSeason[] }> {
  const archived = await db.seasonArchive.findMany({ where: { saveId, season: { startYear } }, select: { seasonId: true, clubSaveIds: true } });
  const ofClubIds = archived.filter((row) => row.clubSaveIds.includes(clubSaveId)).map((row) => row.seasonId);
  const rows =
    ofClubIds.length === 0 ? [] : await db.seasonArchive.findMany({ where: { saveId, seasonId: { in: ofClubIds } }, select: WITH_STATS_SELECT });
  return { archivedIds: archived.map((row) => row.seasonId), ofClub: rows.map((row) => decodeSeason(encodedOf(row))) };
}

/** The matches the managed club played in the save's archived seasons: counted when the season was archived. */
export async function archivedManagedMatches(db: Db, saveId: string): Promise<number> {
  const { _sum } = await db.seasonArchive.aggregate({ where: { saveId }, _sum: { managedPlayed: true } });
  return _sum.managedPlayed ?? 0;
}

const CLUB_SELECT = { id: true, clubId: true, isManaged: true, club: { select: { slug: true, name: true } } } as const;

export type ArchivedClub = { id: string; clubId: string; isManaged: boolean; club: { slug: string; name: string } };

/** The clubs an archive names, by their ClubSave id: a club of the save never goes away. */
export async function clubsOfSave(db: Db, saveId: string, clubSaveIds: readonly string[]): Promise<Map<string, ArchivedClub>> {
  const rows = await db.clubSave.findMany({ where: { saveId, id: { in: [...new Set(clubSaveIds)] } }, select: CLUB_SELECT });
  return new Map(rows.map((row) => [row.id, row]));
}

/** A club of the map, which holds every club its archive names. */
export function clubOf(clubs: ReadonlyMap<string, ArchivedClub>, clubSaveId: string): ArchivedClub {
  const club = clubs.get(clubSaveId);
  if (club === undefined) {
    throw new SeasonArchiveError(`Club ${clubSaveId} of an archive is not in its save`);
  }
  return club;
}
