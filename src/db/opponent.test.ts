import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chooseFormation } from "../engine/formation-choice";
import { averageStarterRating, type SquadPlayer } from "../engine/lineup";
import { formationStrength } from "../engine/strength";
import { competitionTier } from "../engine/tiers";
import type { prisma as prismaClient } from "./client";
import type { getOpponentPreview as getOpponentPreviewFunction } from "./opponent";

const DAY_MS = 86_400_000;

// Previews the managed club's next opponent on a throwaway save with the demo seed, before and after its first
// matchday, then deletes it. Runs against DATABASE_URL and is skipped without it; modules are imported lazily
// because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("getOpponentPreview", () => {
  let db: typeof prismaClient | undefined;
  let getOpponentPreview: typeof getOpponentPreviewFunction | undefined;
  let playNextMatchday: ((saveId: string, options?: { pauseManagedMatch?: boolean }) => Promise<unknown>) | undefined;
  let parseLiveState: typeof import("./live-state").parseLiveState | undefined;
  let saveId = "";

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };
  const preview = () => {
    if (getOpponentPreview === undefined) {
      throw new Error("Module not loaded");
    }
    return getOpponentPreview(saveId);
  };

  /**
   * The opponent of the managed club's next match, his squad as the matchday reads it before he has played (fit, nobody
   * suspended), his division and the match date.
   */
  async function nextOpponent() {
    const managed = await database().clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
    const next = await database().fixture.findFirstOrThrow({
      where: { saveId, played: false, OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }] },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true, homeClubSaveId: true, awayClubSaveId: true },
    });
    const clubSaveId = next.homeClubSaveId === managed.id ? next.awayClubSaveId : next.homeClubSaveId;
    const club = await database().clubSave.findFirstOrThrow({
      where: { id: clubSaveId, saveId },
      select: { competition: { select: { tier: true } } },
    });
    const rows = await database().playerSave.findMany({
      where: { saveId, clubSaveId },
      orderBy: { playerKey: "asc" },
      select: {
        playerKey: true,
        position: true,
        overall: true,
        pace: true,
        shooting: true,
        passing: true,
        dribbling: true,
        defending: true,
        physical: true,
        goalkeeping: true,
        form: true,
        morale: true,
        fitness: true,
        injuredUntil: true,
      },
    });
    const squad = rows.map(
      ({ playerKey, injuredUntil, ...row }): SquadPlayer => ({
        ...row,
        id: playerKey,
        injured: injuredUntil !== null && injuredUntil > next.scheduledAt,
      }),
    );
    return { clubSaveId, matchDate: next.scheduledAt, squad, tier: competitionTier(club.competition.tier) };
  }

  beforeAll(async () => {
    const [{ prisma }, support, opponent, matchday, liveState] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./opponent"),
      import("./matchday"),
      import("./live-state"),
    ]);
    db = prisma;
    getOpponentPreview = opponent.getOpponentPreview;
    playNextMatchday = matchday.playNextMatchday;
    parseLiveState = liveState.parseLiveState;
    saveId = await support.createDemoTwin("Test adversaire");
  }, 120_000);

  // Deleting a played save cascades to thousands of rows, slower while the other test files run: more than the default.
  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 120_000);

  it("shows the formation an AI club chooses for its squad, and its eleven in it", async () => {
    const result = await preview();
    const { squad, tier } = await nextOpponent();
    const { formation, lineup: expected } = chooseFormation(squad, tier);

    expect(result?.formation).toBe(formation);
    expect(result?.lineup.starters).toHaveLength(11);
    expect(result?.lineup.starters.map(({ player, slot }) => [player.id, slot])).toEqual(
      expected.starters.map(({ player, slot }) => [player.id, slot]),
    );
    expect(result?.averageRating).toBeCloseTo(averageStarterRating(expected), 10);
    // His strength, as the engine plays his eleven: the lineup screen sets the managed club's beside it.
    expect(result?.strength).toEqual(result === null ? undefined : formationStrength(result.lineup, result.formation));
    expect(result?.strength.attack).toBeGreaterThan(30);
    expect(result?.managedAverageRating).toBeGreaterThan(0);
    // Nothing played yet in this save.
    expect(result?.recent).toEqual([]);
    expect(result?.topScorer).toBeNull();
  });

  it("leaves out a starter injured past the match day, keeps one back on that day, and chooses again without him", async () => {
    const { clubSaveId, matchDate } = await nextOpponent();
    const before = await preview();
    const [first, second] = before?.lineup.starters.map(({ player }) => player.id) ?? [];
    const injure = (playerKey: string | undefined, until: Date) =>
      database().playerSave.updateMany({ where: { saveId, clubSaveId, playerKey }, data: { injuredUntil: until } });
    await injure(first, new Date(matchDate.getTime() + DAY_MS));
    await injure(second, matchDate);

    const result = await preview();
    const { squad, tier } = await nextOpponent();
    const keys = result?.lineup.starters.map(({ player }) => player.id);
    expect(keys).toHaveLength(11);
    expect(keys).not.toContain(first);
    expect(squad.find((player) => player.id === second)?.injured).toBe(false);
    // His squad as it stands: the choice made again, the injured one left out of every formation weighed.
    const chosen = chooseFormation(squad, tier);
    expect(result?.formation).toBe(chosen.formation);
    expect(keys).toEqual(chosen.lineup.starters.map(({ player }) => player.id));

    await database().playerSave.updateMany({ where: { saveId, clubSaveId }, data: { injuredUntil: null } });
  });

  it("after a matchday, shows the next opponent's result and his top scorer of the season", async () => {
    await playNextMatchday?.(saveId);
    const result = await preview();
    const { clubSaveId } = await nextOpponent();
    const goals = await database().playerSeasonStats.aggregate({
      where: { saveId, playerSave: { clubSaveId } },
      _max: { goals: true },
    });

    expect(result?.recent).toHaveLength(1);
    const [match] = result?.recent ?? [];
    expect(match.scored).toBeGreaterThanOrEqual(0);
    const best = goals._max.goals ?? 0;
    if (best === 0) {
      expect(result?.topScorer).toBeNull();
    } else {
      expect(result?.topScorer?.goals).toBe(best);
    }
    // A whole matchday, about 4 s alone: more than the 5 s default while every database suite runs at once.
  }, 60_000);

  it("previews the formation and the eleven the match then plays: the same choice, made the same way", async () => {
    const result = await preview();
    await playNextMatchday?.(saveId, { pauseManagedMatch: true });
    const fixture = await database().fixture.findFirstOrThrow({
      where: { saveId, status: { in: ["IN_PLAY", "HALF_TIME"] } },
      select: { id: true, liveState: true },
    });
    const live = parseLiveState?.(fixture.id, fixture.liveState);
    const opponent = live === undefined ? undefined : live.state[live.managedSide === "home" ? "away" : "home"];

    expect(opponent?.formation).toBe(result?.formation);
    // Fifteen minutes in, the starters still on are the previewed ones, slot for slot.
    const starters = new Map(result?.lineup.starters.map(({ index, player }) => [index, player.id]));
    const stillOn = opponent?.pitch.filter((entry) => entry.from === 0) ?? [];
    expect(stillOn.length).toBeGreaterThanOrEqual(9);
    for (const entry of stillOn) {
      expect(entry.player.id).toBe(starters.get(entry.index));
    }
  }, 60_000);
});
