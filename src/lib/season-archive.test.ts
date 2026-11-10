import { describe, expect, it } from "vitest";
import {
  decodeSeason,
  encodeSeason,
  FIXTURE_FIELDS,
  sameSeason,
  SEASON_ARCHIVE_VERSION,
  SeasonArchiveError,
  STAT_FIELDS,
  type ArchivedFixture,
  type ArchivedStat,
} from "./season-archive";

// The compact form of a completed season (SeasonArchive): every column of its rows comes back, in its canonical order,
// whatever the order it was given in; a value it could not keep exactly is refused.

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const fixture = (overrides: Partial<ArchivedFixture>): ArchivedFixture => ({
  round: 1,
  scheduledAt: day("2026-08-15"),
  homeClubSaveId: "club-b",
  awayClubSaveId: "club-a",
  status: "PLAYED",
  played: true,
  homeGoals: 2,
  awayGoals: 1,
  homeHalfTimeGoals: 1,
  awayHalfTimeGoals: 0,
  decidedBy: null,
  homePenalties: null,
  awayPenalties: null,
  winnerClubSaveId: null,
  goalTimes: [12, -40, 77],
  instructions: null,
  ...overrides,
});

const stat = (playerSaveId: string, goals: number): ArchivedStat => ({
  playerSaveId,
  appearances: 30,
  starts: 28,
  minutes: 2_480,
  goals,
  assists: 4,
  yellowCards: 5,
  redCards: 1,
});

/** A league match, a cup tie won on penalties after extra time, a match of the managed club with its instructions. */
const fixtures: ArchivedFixture[] = [
  fixture({ round: 2, scheduledAt: day("2026-08-22"), homeClubSaveId: "club-a", awayClubSaveId: "club-c", goalTimes: [], homeGoals: 0, awayGoals: 0 }),
  fixture({
    round: 5,
    scheduledAt: day("2027-03-03"),
    homeClubSaveId: "club-c",
    awayClubSaveId: "club-b",
    homeGoals: 1,
    awayGoals: 1,
    homeHalfTimeGoals: null,
    awayHalfTimeGoals: null,
    decidedBy: "PENALTIES",
    homePenalties: 5,
    awayPenalties: 3,
    winnerClubSaveId: "club-c",
    goalTimes: [33, -1105],
  }),
  fixture({
    instructions: [
      { from: 0, instruction: "ATTACK", source: "start" },
      { from: 60, instruction: "PARK", source: "assistant", note: null },
    ],
  }),
];
const stats: ArchivedStat[] = [stat("player-b", 9), stat("player-a", 0)];

describe("the compact form of a completed season", () => {
  it("decodes to its fixtures and statistics, every column, in their canonical order", () => {
    const encoded = encodeSeason(fixtures, stats);
    const decoded = decodeSeason(encoded);

    expect(encoded.version).toBe(SEASON_ARCHIVE_VERSION);
    expect(encoded.clubSaveIds).toEqual(["club-a", "club-b", "club-c"]);
    expect(encoded.playerSaveIds).toEqual(["player-a", "player-b"]);
    expect(encoded.fixtures).toHaveLength(3 * FIXTURE_FIELDS);
    expect(encoded.stats).toHaveLength(2 * STAT_FIELDS);
    expect([encoded.fixtureCount, encoded.statCount]).toEqual([3, 2]);
    // By date: the 15 August match, the 22 August one, then the cup tie of March.
    expect(decoded.fixtures).toEqual([fixtures[2], fixtures[0], fixtures[1]]);
    expect(decoded.stats).toEqual([stats[1], stats[0]]);
    expect(encoded.goalTimes).toEqual([12, -40, 77, 33, -1105]);
    // Only the managed club's match keeps instructions, by its index in the canonical order.
    expect(encoded.instructions).toEqual([[0, fixtures[2].instructions]]);
    expect(sameSeason(decoded, { fixtures, stats })).toBe(true);
  });

  it("keeps integers only, the nulls as -1, and survives a database round trip of its arrays", () => {
    const encoded = encodeSeason(fixtures, stats);
    const throughDatabase = JSON.parse(JSON.stringify(encoded)) as typeof encoded;

    expect([...encoded.fixtures, ...encoded.stats, ...encoded.goalTimes].every(Number.isInteger)).toBe(true);
    expect(sameSeason(decodeSeason(throughDatabase), { fixtures, stats })).toBe(true);
  });

  it("archives a season without statistics, and an empty one", () => {
    expect(decodeSeason(encodeSeason(fixtures, []))).toEqual({ fixtures: [fixtures[2], fixtures[0], fixtures[1]], stats: [] });
    expect(decodeSeason(encodeSeason([], []))).toEqual({ fixtures: [], stats: [] });
  });

  it("tells a season apart from one with a goal, a minute or a line of statistics changed", () => {
    const decoded = decodeSeason(encodeSeason(fixtures, stats));

    expect(sameSeason(decoded, { fixtures: [fixture({ awayGoals: 2 }), fixtures[0], fixtures[1]], stats })).toBe(false);
    expect(sameSeason(decoded, { fixtures, stats: [stats[0], { ...stats[1], minutes: 2_481 }] })).toBe(false);
    expect(sameSeason(decoded, { fixtures: fixtures.slice(1), stats })).toBe(false);
    expect(sameSeason(decoded, { fixtures, stats: [stats[0]] })).toBe(false);
    expect(sameSeason(decoded, { fixtures: [fixture({ goalTimes: [12, -40, 78] }), fixtures[0], fixtures[1]], stats })).toBe(false);
  });

  it("refuses what it could not keep exactly", () => {
    const refused = (season: { fixtures: ArchivedFixture[]; stats: ArchivedStat[] }) => () => encodeSeason(season.fixtures, season.stats);

    expect(refused({ fixtures: [fixture({ scheduledAt: new Date("2026-08-15T00:00:30.000Z") })], stats: [] })).toThrow(SeasonArchiveError);
    expect(refused({ fixtures: [fixture({ homeGoals: -2 })], stats: [] })).toThrow(SeasonArchiveError);
    expect(refused({ fixtures: [fixture({ round: 1.5 })], stats: [] })).toThrow(SeasonArchiveError);
    expect(refused({ fixtures: [fixture({ played: false })], stats: [] })).toThrow(SeasonArchiveError);
    expect(refused({ fixtures: [], stats: [stat("player-a", 1), stat("player-a", 2)] })).toThrow(SeasonArchiveError);
    expect(refused({ fixtures: [], stats: [{ ...stat("player-a", 1), minutes: 3_000_000_000 }] })).toThrow(SeasonArchiveError);
  });

  it("refuses arrays of another version or of the wrong lengths", () => {
    const encoded = encodeSeason(fixtures, stats);

    expect(() => decodeSeason({ ...encoded, version: SEASON_ARCHIVE_VERSION + 1 })).toThrow(SeasonArchiveError);
    expect(() => decodeSeason({ ...encoded, fixtures: encoded.fixtures.slice(1) })).toThrow(SeasonArchiveError);
    expect(() => decodeSeason({ ...encoded, goalTimes: encoded.goalTimes.slice(1) })).toThrow(SeasonArchiveError);
    expect(() => decodeSeason({ ...encoded, playerSaveIds: ["player-a"] })).toThrow(SeasonArchiveError);
  });
});
