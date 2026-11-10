// The compact form of a completed season's fixtures and statistics (SeasonArchive, chantier « archives », 10/11):
// fixed-width records of integers, a club or a player by its index in a sorted list of ids. Pure: the database layer
// reads the rows and writes the arrays (src/db/season-archiving.ts), and decodes them for the screens
// (src/db/season-archive.ts). Lossless for every column of a completed season's rows but their ids: a decoded season
// equals its rows (sameSeason), which the archiving checks before it writes an archive, and again before it deletes the
// rows. A value it cannot keep exactly (a date with seconds, a negative score) is refused, never rounded.

/** The format of the arrays: a decoder refuses another. */
export const SEASON_ARCHIVE_VERSION = 1;

export type FixtureStatus = "SCHEDULED" | "IN_PLAY" | "HALF_TIME" | "REGULATION_END" | "PLAYED";
export type DecidedBy = "REGULATION" | "EXTRA_TIME" | "PENALTIES";
/** A JSON value, as a Json column holds it (Fixture.instructions). */
export type ArchiveJson = string | number | boolean | null | ArchiveJson[] | { [key: string]: ArchiveJson };

/** A fixture as the archive keeps it: every column of its row but its id, its save and season, and its live state. */
export type ArchivedFixture = {
  round: number;
  scheduledAt: Date;
  homeClubSaveId: string;
  awayClubSaveId: string;
  status: FixtureStatus;
  played: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  homeHalfTimeGoals: number | null;
  awayHalfTimeGoals: number | null;
  decidedBy: DecidedBy | null;
  homePenalties: number | null;
  awayPenalties: number | null;
  winnerClubSaveId: string | null;
  goalTimes: number[];
  instructions: ArchiveJson | null;
};

/** A line of a season's statistics, as the archive keeps it: every column of its row but its id, save and season. */
export type ArchivedStat = {
  playerSaveId: string;
  appearances: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
};

/** The arrays of a SeasonArchive row. */
export type EncodedSeason = {
  version: number;
  clubSaveIds: string[]; // sorted
  fixtures: number[]; // FIXTURE_FIELDS integers a fixture
  goalTimes: number[]; // every fixture's goal times, one after the other
  instructions: [number, ArchiveJson][] | null; // [fixture index, its instructions] for the fixtures that have some
  playerSaveIds: string[]; // sorted
  stats: number[]; // STAT_FIELDS integers a line
  fixtureCount: number;
  statCount: number;
};

export type DecodedSeason = { fixtures: ArchivedFixture[]; stats: ArchivedStat[] };

/**
 * Integers a fixture: minutes since 1970 (UTC), round, home and away club indexes, status, home and away goals, home and
 * away half-time goals, decided by, home and away penalties, winner index, goal times. NONE for a null value.
 */
export const FIXTURE_FIELDS = 14;
/** Integers a line of statistics: player index, appearances, starts, minutes, goals, assists, yellow and red cards. */
export const STAT_FIELDS = 8;

const NONE = -1;
const MINUTE_MS = 60_000;
const INT_MAX = 2_147_483_647;
const STATUSES: readonly FixtureStatus[] = ["SCHEDULED", "IN_PLAY", "HALF_TIME", "REGULATION_END", "PLAYED"];
const DECIDED_BY: readonly DecidedBy[] = ["REGULATION", "EXTRA_TIME", "PENALTIES"];

/** A season the archive cannot keep exactly: it stays as rows. */
export class SeasonArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeasonArchiveError";
  }
}

/** Compares two ids by their code units, the same everywhere (no locale). */
const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The canonical order of a season's fixtures: by date, round, home club, away club; one fixture per key. */
export function compareFixtures(a: ArchivedFixture, b: ArchivedFixture): number {
  return (
    a.scheduledAt.getTime() - b.scheduledAt.getTime() ||
    a.round - b.round ||
    byId(a.homeClubSaveId, b.homeClubSaveId) ||
    byId(a.awayClubSaveId, b.awayClubSaveId)
  );
}

const compareStats = (a: ArchivedStat, b: ArchivedStat): number => byId(a.playerSaveId, b.playerSaveId);

/** A whole number from 0 (or from NONE when allowed) to the largest 4-byte integer, as an Int column takes it. */
function integer(value: number, what: string, min = 0): number {
  if (!Number.isInteger(value) || value < min || value > INT_MAX) {
    throw new SeasonArchiveError(`${what} ${value} is not an integer the archive keeps`);
  }
  return value;
}

const nullable = (value: number | null, what: string): number => (value === null ? NONE : integer(value, what));
const fromNullable = (value: number): number | null => (value === NONE ? null : value);

function indexOf(ids: ReadonlyMap<string, number>, id: string, what: string): number {
  const index = ids.get(id);
  if (index === undefined) {
    throw new SeasonArchiveError(`${what} ${id} is missing from the archive's list`);
  }
  return index;
}

/** The arrays of a season from its fixtures and statistics, in their canonical order. */
export function encodeSeason(fixtures: readonly ArchivedFixture[], stats: readonly ArchivedStat[]): EncodedSeason {
  const ordered = [...fixtures].sort(compareFixtures);
  const lines = [...stats].sort(compareStats);
  const clubSaveIds = [
    ...new Set(
      ordered.flatMap((fixture) =>
        fixture.winnerClubSaveId === null
          ? [fixture.homeClubSaveId, fixture.awayClubSaveId]
          : [fixture.homeClubSaveId, fixture.awayClubSaveId, fixture.winnerClubSaveId],
      ),
    ),
  ].sort(byId);
  const clubIndex = new Map(clubSaveIds.map((id, index) => [id, index]));
  const playerSaveIds = lines.map((line) => line.playerSaveId);
  if (new Set(playerSaveIds).size !== playerSaveIds.length) {
    throw new SeasonArchiveError("A player has two lines of statistics in the season");
  }

  const encodedFixtures: number[] = [];
  const goalTimes: number[] = [];
  const instructions: [number, ArchiveJson][] = [];
  ordered.forEach((fixture, index) => {
    const time = fixture.scheduledAt.getTime();
    if (!Number.isFinite(time) || time % MINUTE_MS !== 0) {
      throw new SeasonArchiveError(`Fixture date ${fixture.scheduledAt.toISOString()} is not a whole minute`);
    }
    const status = STATUSES.indexOf(fixture.status);
    if (status === NONE || fixture.played !== (fixture.status === "PLAYED")) {
      throw new SeasonArchiveError(`Fixture status ${fixture.status} does not match played ${fixture.played}`);
    }
    for (const goalTime of fixture.goalTimes) {
      integer(goalTime, "goal time", -INT_MAX);
    }
    encodedFixtures.push(
      integer(time / MINUTE_MS, "minute"),
      integer(fixture.round, "round"),
      indexOf(clubIndex, fixture.homeClubSaveId, "home club"),
      indexOf(clubIndex, fixture.awayClubSaveId, "away club"),
      status,
      nullable(fixture.homeGoals, "home goals"),
      nullable(fixture.awayGoals, "away goals"),
      nullable(fixture.homeHalfTimeGoals, "home half-time goals"),
      nullable(fixture.awayHalfTimeGoals, "away half-time goals"),
      fixture.decidedBy === null ? NONE : DECIDED_BY.indexOf(fixture.decidedBy),
      nullable(fixture.homePenalties, "home penalties"),
      nullable(fixture.awayPenalties, "away penalties"),
      fixture.winnerClubSaveId === null ? NONE : indexOf(clubIndex, fixture.winnerClubSaveId, "winner"),
      fixture.goalTimes.length,
    );
    goalTimes.push(...fixture.goalTimes);
    if (fixture.instructions !== null) {
      instructions.push([index, fixture.instructions]);
    }
  });

  const encodedStats = lines.flatMap((line, index) => [
    index,
    integer(line.appearances, "appearances"),
    integer(line.starts, "starts"),
    integer(line.minutes, "minutes"),
    integer(line.goals, "goals"),
    integer(line.assists, "assists"),
    integer(line.yellowCards, "yellow cards"),
    integer(line.redCards, "red cards"),
  ]);

  return {
    version: SEASON_ARCHIVE_VERSION,
    clubSaveIds,
    fixtures: encodedFixtures,
    goalTimes,
    instructions: instructions.length === 0 ? null : instructions,
    playerSaveIds,
    stats: encodedStats,
    fixtureCount: ordered.length,
    statCount: lines.length,
  };
}

function clubAt(clubSaveIds: readonly string[], index: number): string {
  const id = clubSaveIds[index];
  if (id === undefined) {
    throw new SeasonArchiveError(`Club index ${index} is out of the archive's list`);
  }
  return id;
}

/** A season's fixtures and statistics from its arrays, in their canonical order. */
export function decodeSeason(archive: EncodedSeason): DecodedSeason {
  const { version, clubSaveIds, fixtures, goalTimes, playerSaveIds, stats, fixtureCount, statCount } = archive;
  if (version !== SEASON_ARCHIVE_VERSION) {
    throw new SeasonArchiveError(`Archive version ${version} is not ${SEASON_ARCHIVE_VERSION}`);
  }
  if (fixtures.length !== fixtureCount * FIXTURE_FIELDS || stats.length !== statCount * STAT_FIELDS || playerSaveIds.length !== statCount) {
    throw new SeasonArchiveError("The archive's arrays do not have the lengths of its counts");
  }
  const instructions = new Map(archive.instructions ?? []);
  let goal = 0;
  const decodedFixtures = Array.from({ length: fixtureCount }, (_, index): ArchivedFixture => {
    const at = (field: number): number => fixtures[index * FIXTURE_FIELDS + field];
    const status = STATUSES[at(4)];
    if (status === undefined) {
      throw new SeasonArchiveError(`Status code ${at(4)} is unknown`);
    }
    const decidedBy = at(9) === NONE ? null : DECIDED_BY[at(9)];
    if (decidedBy === undefined) {
      throw new SeasonArchiveError(`Decided-by code ${at(9)} is unknown`);
    }
    const goals = goalTimes.slice(goal, goal + at(13));
    goal += at(13);
    return {
      round: at(1),
      scheduledAt: new Date(at(0) * MINUTE_MS),
      homeClubSaveId: clubAt(clubSaveIds, at(2)),
      awayClubSaveId: clubAt(clubSaveIds, at(3)),
      status,
      played: status === "PLAYED",
      homeGoals: fromNullable(at(5)),
      awayGoals: fromNullable(at(6)),
      homeHalfTimeGoals: fromNullable(at(7)),
      awayHalfTimeGoals: fromNullable(at(8)),
      decidedBy,
      homePenalties: fromNullable(at(10)),
      awayPenalties: fromNullable(at(11)),
      winnerClubSaveId: at(12) === NONE ? null : clubAt(clubSaveIds, at(12)),
      goalTimes: goals,
      instructions: instructions.get(index) ?? null,
    };
  });
  if (goal !== goalTimes.length) {
    throw new SeasonArchiveError("The archive's goal times do not add up to its fixtures'");
  }
  const decodedStats = Array.from({ length: statCount }, (_, index): ArchivedStat => {
    const at = (field: number): number => stats[index * STAT_FIELDS + field];
    const playerSaveId = playerSaveIds[at(0)];
    if (playerSaveId === undefined) {
      throw new SeasonArchiveError(`Player index ${at(0)} is out of the archive's list`);
    }
    return {
      playerSaveId,
      appearances: at(1),
      starts: at(2),
      minutes: at(3),
      goals: at(4),
      assists: at(5),
      yellowCards: at(6),
      redCards: at(7),
    };
  });
  return { fixtures: decodedFixtures, stats: decodedStats };
}

/**
 * A season's rows in a form to compare, whatever the order of its rows and of their keys: every column in a fixed order,
 * dates as numbers, JSON as its text (both readings come from a jsonb column, which orders its keys itself).
 */
function canonical(season: DecodedSeason): string {
  return JSON.stringify({
    fixtures: [...season.fixtures]
      .sort(compareFixtures)
      .map((fixture) => [
        fixture.scheduledAt.getTime(),
        fixture.round,
        fixture.homeClubSaveId,
        fixture.awayClubSaveId,
        fixture.status,
        fixture.played,
        fixture.homeGoals,
        fixture.awayGoals,
        fixture.homeHalfTimeGoals,
        fixture.awayHalfTimeGoals,
        fixture.decidedBy,
        fixture.homePenalties,
        fixture.awayPenalties,
        fixture.winnerClubSaveId,
        fixture.goalTimes,
        JSON.stringify(fixture.instructions),
      ]),
    stats: [...season.stats]
      .sort(compareStats)
      .map((line) => [line.playerSaveId, line.appearances, line.starts, line.minutes, line.goals, line.assists, line.yellowCards, line.redCards]),
  });
}

/** Whether two readings of a season hold the same fixtures and statistics, in any order: its rows and its archive. */
export function sameSeason(a: DecodedSeason, b: DecodedSeason): boolean {
  return canonical(a) === canonical(b);
}
