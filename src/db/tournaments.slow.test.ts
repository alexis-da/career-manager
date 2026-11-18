import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FULL_FITNESS } from "../engine/balance";
import { titleKey, tournamentDates } from "../engine/tournaments";
import { WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

const DAY = (date: Date): string => date.toISOString().slice(0, 10);

// A national teams' cycle of a new worldVersion 2 save (docs/design/selections.md, N3), on a throwaway twin of the demo
// save: two seasons of Europe's qualifiers at the breaks, the Old Continent Cup drawn once they are over, played light
// at the start of the second season's transition; its matches, its titles, its highlights; every player back to his full
// fitness and healed for the season after it; then the Hemispheres cycle's qualifiers, both zones. Runs against
// DATABASE_URL and is skipped without it; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("a national teams' cycle and its summer tournament", () => {
  let db: typeof prismaClient | undefined;
  let saveId = "";
  let modules: { season: typeof import("./season"); support: typeof import("./test-support"); view: typeof import("./nations-view") } | undefined;
  let transition: Awaited<ReturnType<typeof import("./season").advanceToNextSeason>> | undefined;
  let drawn: Awaited<ReturnType<typeof import("./nations-view").getNationsView>> = null;

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };
  const loaded = () => {
    if (modules === undefined) {
      throw new Error("Modules not loaded");
    }
    return modules;
  };

  beforeAll(async () => {
    const [{ prisma }, season, support, view] = await Promise.all([import("./client"), import("./season"), import("./test-support"), import("./nations-view")]);
    db = prisma;
    modules = { season, support, view };
    saveId = await support.createDemoTwin("Test tournoi d'été", 2);
    // The cycle's first season: no tournament at its end.
    await support.playRemainingMatchdays(saveId);
    const first = await season.advanceToNextSeason(saveId, { assistantContracts: true });
    expect(first.tournament).toBeNull();
    // Its second: the qualifiers over, the tournament drawn, then played as the season turns.
    await support.playRemainingMatchdays(saveId);
    drawn = await view.getNationsView(saveId);
    transition = await season.advanceToNextSeason(saveId, { assistantContracts: true });
  }, 1_800_000);

  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 300_000);

  it("plays Europe's nine matchdays of qualifiers over the cycle's two seasons, then draws the Old Continent Cup's six", () => {
    const campaign = drawn?.campaign;
    expect(campaign).toMatchObject({ tournament: "int.eu", year: WORLD_START_YEAR + 2, breaksPlayed: 8 });
    expect(campaign?.zones).toHaveLength(1);
    expect(campaign?.zones[0].rows.every((row) => row.played === 8)).toBe(true);
    expect(campaign?.draw?.state).toBe("drawn");
    expect(campaign?.draw?.groups.map((group) => group.rows.length)).toEqual([3, 3]);
    // The six first of Europe's table.
    const qualified = campaign?.zones[0].rows.slice(0, 6).map((row) => row.code).sort();
    expect(campaign?.draw?.groups.flatMap((group) => group.rows.map((row) => row.code)).sort()).toEqual(qualified);
  });

  it("plays the drawn tournament at the transition: nine matches on neutral ground, in June, the knockout ones decided", async () => {
    expect(transition?.tournament).toMatchObject({ tournament: "int.eu", year: WORLD_START_YEAR + 2, matches: 9 });
    expect(transition?.tournament?.groups).toEqual(drawn?.campaign?.draw?.groups.map((group) => group.rows.map((row) => row.code)));
    const matches = await database().internationalMatch.findMany({
      where: { saveId, competition: "int.eu" },
      orderBy: [{ scheduledAt: "asc" }, { pool: "asc" }],
      select: { startYear: true, round: true, pool: true, scheduledAt: true, neutral: true, played: true, home: true, away: true, decidedBy: true, winner: true, homeGoals: true, awayGoals: true, goalTimes: true },
    });
    expect(matches).toHaveLength(9);
    expect(matches.every((match) => match.played && match.neutral && match.startYear === WORLD_START_YEAR + 1)).toBe(true);
    expect([...new Set(matches.map((match) => DAY(match.scheduledAt)))]).toEqual(tournamentDates(WORLD_START_YEAR + 2).map(DAY));
    const groups = matches.filter((match) => match.round <= 3);
    const knockouts = matches.filter((match) => match.round > 3);
    expect(groups).toHaveLength(6);
    expect(groups.every((match) => match.decidedBy === null && match.winner === null && match.pool !== null)).toBe(true);
    expect(knockouts.map((match) => match.round)).toEqual([4, 4, 5]);
    expect(knockouts.every((match) => match.decidedBy !== null && match.winner !== null && match.pool === null)).toBe(true);
    const [final] = knockouts.filter((match) => match.round === 5);
    expect(final.winner).toBe(transition?.tournament?.winner);
    expect([final.home, final.away].sort()).toEqual(knockouts.filter((match) => match.round === 4).map((match) => match.winner ?? "").sort());
    for (const match of matches) {
      expect(match.goalTimes).toHaveLength((match.homeGoals ?? 0) + (match.awayGoals ?? 0));
    }
  });

  it("gives the title to the winner's players of our clubs, and keeps the managed club's in the season's highlights", async () => {
    const winner = transition?.tournament?.winner;
    const champions = await database().playerSave.findMany({
      where: { saveId, internationalTitles: { has: titleKey("int.eu", WORLD_START_YEAR + 2) } },
      select: { playerKey: true, nationality: true, caps: true },
    });
    expect(champions.length).toBeGreaterThan(0);
    // Only the winner's players who played in it: every champion is capped.
    expect(champions.every((player) => player.caps > 0)).toBe(true);
    expect(champions.length).toBeLessThanOrEqual(23);
    const result = await database().seasonResult.findFirstOrThrow({ where: { saveId, season: { startYear: WORLD_START_YEAR + 1 } }, select: { highlights: true } });
    const highlights = (await import("./season-highlights")).parseSeasonHighlights(result.highlights);
    expect(highlights).not.toBeNull();
    const titles = highlights?.internationalTitles ?? [];
    const managedChampions = transition?.tournament?.managedTitles ?? [];
    expect(titles).toEqual(
      managedChampions.length === 0
        ? []
        : [{ tournament: "int.eu", year: WORLD_START_YEAR + 2, nation: winner, players: managedChampions.map(({ playerKey, name }) => ({ playerKey, name })) }],
    );
  });

  it("starts the season after it with every player at full fitness and healed, tournament or not", async () => {
    const tired = await database().playerSave.count({ where: { saveId, retired: false, fitness: { lt: FULL_FITNESS } } });
    const injured = await database().playerSave.count({ where: { saveId, retired: false, injuredUntil: { not: null } } });
    expect(tired).toBe(0);
    expect(injured).toBe(0);
  });

  it("opens the Hemispheres cycle: both zones' qualifiers, and shows the tournament just played first", async () => {
    const matches = await database().internationalMatch.findMany({
      where: { saveId, startYear: WORLD_START_YEAR + 2 },
      select: { competition: true },
    });
    expect(matches).toHaveLength(56);
    expect(matches.filter((match) => match.competition === "int.qual.eu")).toHaveLength(16);
    expect(matches.filter((match) => match.competition === "int.qual.world")).toHaveLength(8);
    const view = await loaded().view.getNationsView(saveId);
    expect(view?.campaign).toMatchObject({ tournament: "int.world", year: WORLD_START_YEAR + 4, breaksPlayed: 0, draw: null });
    expect(view?.campaign?.zones.map((zone) => zone.zone)).toEqual(["EUROPE", "WORLD"]);
    expect(view?.freshTournament).toBe(true);
    expect(view?.lastTournament).toMatchObject({ tournament: "int.eu", state: "played", winner: transition?.tournament?.winner });
    expect(view?.lastTournament?.results).toHaveLength(9);
    expect(view?.lastTournament?.groups.map((group) => group.rows.length)).toEqual([3, 3]);
  });
});
