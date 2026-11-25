import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectedProgression, projectedLeagueMinutes } from "../engine/progression";
import { seasonStartDate, WORLD_START_YEAR } from "../engine/world";
import { youthKeyPrefix } from "../engine/youth";
import { ageInYears } from "../lib/dates";
import type { prisma as prismaClient } from "./client";
import type { PlayerProfile } from "./players";
import { roundChange } from "./progression-view";

/** The managed club's league matches played before the reading: ten of its season's. */
const PLAYED_ROUNDS = 10;
const LEAGUE_MINUTES = 620;
const CUP_MINUTES = 180;
const NEXT_FIRST_JULY = seasonStartDate(WORLD_START_YEAR + 1);

/** A player as read before and after the turn. */
type Row = { id: string; playerKey: string; overall: number; potential: number; previousOverall: number | null; retired: boolean };

// The players' progression (docs/design/effectif-adjoint.md § 3), on two throwaway worldVersion 1 twins of the demo save.
// The first plays a part of its season: the managed club's first ten league matches marked played, a young player of its
// with league minutes and, in a cup season added to the save for the purpose (a worldVersion 1 save has none), cup
// minutes, which the progression never counts. The second's first season is marked over (every fixture a 1-1 draw: the
// turn needs the season finished, not its matches) and turned. Runs against DATABASE_URL and is skipped without it;
// modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the players' progression", () => {
  let db: typeof prismaClient | undefined;
  let players: typeof import("./players") | undefined;
  const saveIds: string[] = [];
  let reading: { saveId: string; managedId: string; young: Row; leagueMatches: number } | undefined;
  let turned: { saveId: string; managedId: string; before: Map<string, Row>; managedBefore: Set<string>; after: Row[] } | undefined;

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("The database is not set up");
    }
    return db;
  };
  const profilesOf = (saveId: string, clubSaveId: string): Promise<PlayerProfile[]> => {
    if (players === undefined) {
      throw new Error("The database is not set up");
    }
    return players.getPlayerProfiles(saveId, { clubSaveId });
  };
  const rowsOf = (saveId: string): Promise<Row[]> =>
    database().playerSave.findMany({
      where: { saveId },
      select: { id: true, playerKey: true, overall: true, potential: true, previousOverall: true, retired: true },
    });

  beforeAll(async () => {
    const [{ prisma }, support, season, playersModule] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./season"),
      import("./players"),
    ]);
    db = prisma;
    players = playersModule;
    const [readId, turnedId] = await Promise.all([
      support.createDemoTwin("Test progression, lecture", 1),
      support.createDemoTwin("Test progression, passage", 1),
    ]);
    saveIds.push(readId, turnedId);
    const managedOf = async (saveId: string) =>
      prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, competitionId: true } });

    // The first twin: ten league matches of the managed club played, a young player's minutes in the league and the cup.
    const managed = await managedOf(readId);
    const leagueSeason = await prisma.season.findFirstOrThrow({
      where: { saveId: readId, competitionId: managed.competitionId, startYear: WORLD_START_YEAR },
      select: { id: true },
    });
    const fixtures = await prisma.fixture.findMany({
      where: { saveId: readId, seasonId: leagueSeason.id, OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }] },
      orderBy: { round: "asc" },
      select: { id: true },
    });
    await prisma.fixture.updateMany({
      where: { saveId: readId, id: { in: fixtures.slice(0, PLAYED_ROUNDS).map((fixture) => fixture.id) } },
      data: { played: true, status: "PLAYED", homeGoals: 1, awayGoals: 1, homeHalfTimeGoals: 0, awayHalfTimeGoals: 0 },
    });
    const squad = await prisma.playerSave.findMany({
      where: { saveId: readId, clubSaveId: managed.id },
      orderBy: { playerKey: "asc" },
      select: { id: true, playerKey: true, overall: true, potential: true, previousOverall: true, retired: true, birthDate: true },
    });
    const young = squad.find((player) => ageInYears(player.birthDate, NEXT_FIRST_JULY) <= 22 && player.potential - player.overall >= 6);
    if (young === undefined) {
      throw new Error("No young player with room in the squad");
    }
    const cup = await prisma.competition.findUniqueOrThrow({ where: { code: "fr.cup" }, select: { id: true } });
    const cupSeason = await prisma.season.create({
      data: { saveId: readId, competitionId: cup.id, startYear: WORLD_START_YEAR },
      select: { id: true },
    });
    await prisma.playerSeasonStats.createMany({
      data: [
        { saveId: readId, seasonId: leagueSeason.id, playerSaveId: young.id, appearances: 8, starts: 7, minutes: LEAGUE_MINUTES },
        { saveId: readId, seasonId: cupSeason.id, playerSaveId: young.id, appearances: 2, starts: 2, minutes: CUP_MINUTES },
      ],
    });
    reading = { saveId: readId, managedId: managed.id, young, leagueMatches: fixtures.length };

    // The second twin: its season marked over, then turned.
    await prisma.fixture.updateMany({
      where: { saveId: turnedId },
      data: { played: true, status: "PLAYED", homeGoals: 1, awayGoals: 1, homeHalfTimeGoals: 0, awayHalfTimeGoals: 0 },
    });
    const turnedManaged = await managedOf(turnedId);
    const before = await rowsOf(turnedId);
    const managedBefore = await prisma.playerSave.findMany({ where: { saveId: turnedId, clubSaveId: turnedManaged.id }, select: { playerKey: true } });
    await season.advanceToNextSeason(turnedId);
    turned = {
      saveId: turnedId,
      managedId: turnedManaged.id,
      before: new Map(before.map((row) => [row.playerKey, row])),
      managedBefore: new Set(managedBefore.map((row) => row.playerKey)),
      after: await rowsOf(turnedId),
    };
  }, 600_000);

  // Deleting a save cascades to thousands of rows: allow more than the hook default.
  afterAll(async () => {
    for (const saveId of saveIds) {
      await db?.save.deleteMany({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 120_000);

  const readSetUp = () => {
    if (reading === undefined) {
      throw new Error("The first twin is not set up");
    }
    return reading;
  };
  const turnSetUp = () => {
    if (turned === undefined) {
      throw new Error("The second twin is not set up");
    }
    return turned;
  };

  it("reads a player's league minutes alone for his summer, his club's league matches to prorate them", async () => {
    const { saveId, managedId, young, leagueMatches } = readSetUp();
    const profile = (await profilesOf(saveId, managedId)).find((player) => player.id === young.id);
    if (profile === undefined) {
      throw new Error("The young player has no profile");
    }
    // Every competition on the sheet's tiles; the league only for the summer.
    expect(profile.seasonStats.minutes).toBe(LEAGUE_MINUTES + CUP_MINUTES);
    expect(profile.progression.outlook?.leagueMinutes).toBe(LEAGUE_MINUTES);

    const ageNext = ageInYears(profile.birthDate, NEXT_FIRST_JULY);
    const at = (minutes: number): number => roundChange(expectedProgression(young, ageNext, minutes));
    expect(profile.progression.outlook?.growth).toEqual({
      expected: at(projectedLeagueMinutes(LEAGUE_MINUTES, PLAYED_ROUNDS, leagueMatches)),
      idle: at(0),
      starter: at(2250),
    });
    // A career's first season: no summer passed, and one point on the curve, this season's.
    expect(profile.progression.last).toBeNull();
    expect(profile.progression.history).toEqual([{ startYear: WORLD_START_YEAR, overall: young.overall, potential: young.potential }]);
  });

  it("gives the managed club's players their outlook, every other player none", async () => {
    const { saveId, managedId } = readSetUp();
    const squad = await profilesOf(saveId, managedId);
    expect(squad.every((player) => player.progression.outlook !== null)).toBe(true);
    // A player who never played: the idle bound, whatever his club played.
    for (const player of squad.filter((profile) => profile.seasonStats.minutes === 0)) {
      expect(player.progression.outlook?.growth?.expected ?? null).toBe(player.progression.outlook?.growth?.idle ?? null);
    }

    const other = await database().clubSave.findFirstOrThrow({ where: { saveId, isManaged: false }, select: { id: true } });
    const others = await profilesOf(saveId, other.id);
    expect(others.length).toBeGreaterThan(0);
    for (const player of others) {
      expect(player.progression).toEqual({ last: null, outlook: null, history: [] });
    }
  });

  it("keeps every player's rating of before at the turn, and none for a young player come since", () => {
    const { before, after } = turnSetUp();
    const youthPrefix = youthKeyPrefix(WORLD_START_YEAR + 1);
    let kept = 0;
    for (const row of after) {
      const former = before.get(row.playerKey);
      if (former === undefined) {
        // Arrived at the preseason: the academy's young players.
        expect(row.playerKey.startsWith(youthPrefix), row.playerKey).toBe(true);
        expect(row.previousOverall).toBeNull();
      } else if (!former.retired) {
        expect(row.previousOverall, row.playerKey).toBe(former.overall);
        kept++;
      }
    }
    // The world's players, some 2 300 in a worldVersion 1 save.
    expect(kept).toBeGreaterThan(2000);
  });

  it("writes the squad's potential in the season's highlights, and shows the summer passed and the curve", async () => {
    const { saveId, managedId, before, managedBefore } = turnSetUp();
    const result = await database().seasonResult.findFirstOrThrow({ where: { saveId, season: { startYear: WORLD_START_YEAR } }, select: { highlights: true } });
    const { parseSeasonHighlights } = await import("./season-highlights");
    const highlights = parseSeasonHighlights(result.highlights);
    expect(highlights?.squad.map((player) => player.playerKey).sort()).toEqual([...managedBefore].sort());
    for (const player of highlights?.squad ?? []) {
      expect(player.potential, player.playerKey).toBe(before.get(player.playerKey)?.potential);
      expect(player.overall, player.playerKey).toBe(before.get(player.playerKey)?.overall);
    }

    const squad = await profilesOf(saveId, managedId);
    for (const profile of squad) {
      const former = before.get(profile.playerKey);
      if (former === undefined) {
        expect(profile.progression.last).toBeNull();
        expect(profile.progression.history).toHaveLength(1);
      } else {
        expect(profile.progression.last).toBe(profile.overall - former.overall);
        // At the club at the season's end: its point, then this season's.
        if (managedBefore.has(profile.playerKey)) {
          expect(profile.progression.history).toEqual([
            { startYear: WORLD_START_YEAR, overall: former.overall, potential: former.potential },
            { startYear: WORLD_START_YEAR + 1, overall: profile.overall, potential: profile.potential },
          ]);
        }
      }
    }
  });

  it("falls back on the last season's highlights for the managed club's players while the column is empty, never for anyone else's", async () => {
    const { saveId, managedId, before, managedBefore } = turnSetUp();
    const squad = await profilesOf(saveId, managedId);
    const stayed = squad.filter((profile) => managedBefore.has(profile.playerKey));
    expect(stayed.length).toBeGreaterThan(10);
    const other = await database().clubSave.findFirstOrThrow({ where: { saveId, isManaged: false }, select: { id: true } });
    const others = await profilesOf(saveId, other.id);
    expect(others.some((profile) => profile.progression.last !== null)).toBe(true);
    // A career turned before the column: the two clubs' ratings of before forgotten.
    const forgotten = [...squad, ...others];
    await database().playerSave.updateMany({ where: { saveId, clubSaveId: { in: [managedId, other.id] } }, data: { previousOverall: null } });
    try {
      const again = new Map((await profilesOf(saveId, managedId)).map((profile) => [profile.playerKey, profile.progression.last]));
      for (const profile of squad) {
        const former = before.get(profile.playerKey);
        expect(again.get(profile.playerKey), profile.playerKey).toBe(
          managedBefore.has(profile.playerKey) && former !== undefined ? profile.overall - former.overall : null,
        );
      }
      for (const profile of await profilesOf(saveId, other.id)) {
        expect(profile.progression.last).toBeNull();
      }
    } finally {
      const previous = new Map(turnSetUp().after.map((row) => [row.id, row.previousOverall]));
      for (const profile of forgotten) {
        await database().playerSave.update({ where: { id: profile.id, saveId }, data: { previousOverall: previous.get(profile.id) ?? null } });
      }
    }
  });
});
