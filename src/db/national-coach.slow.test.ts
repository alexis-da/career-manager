import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COACH_STAGES, stageReached } from "../engine/national-coach";
import { isNationCode, NATION_CODES, nationByCode, type NationCode } from "../engine/nations";
import { FINAL_ROUND, OLD_CONTINENT_CUP, QUALIFIER_EUROPE, QUALIFIER_WORLD, SEMI_FINAL_ROUND, tournamentDates } from "../engine/tournaments";
import { WORLD_START_YEAR } from "../engine/world";
import { Prisma } from "../generated/prisma/client";
import type { prisma as prismaClient } from "./client";

const DAY = (date: Date): string => date.toISOString().slice(0, 10);

// A national coach's whole cycle (docs/design/selections.md § 5, N4), on two throwaway twins of the demo save, every match
// simulated as « Simuler » plays it (his assistant deciding). The first coaches the strongest nation of Europe from the
// first season: every match of his nation by the full engine while he is in post, then the federation's verdict at the
// end of the qualifiers (not qualified: the end of his mission) or of the tournament. The second takes over a nation just
// qualified once the qualifiers are over: its summer tournament played in June in steps, his season ending with it, the
// federation's verdict at the transition. Then the offers of a strong club's manager. Runs against DATABASE_URL and is
// skipped without it; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("a national coach's cycle", () => {
  let db: typeof prismaClient | undefined;
  let modules:
    | {
        season: typeof import("./season");
        matchday: typeof import("./matchday");
        missions: typeof import("./national-missions");
        view: typeof import("./national-view");
        nations: typeof import("./nations-view");
      }
    | undefined;
  const saves = { fromStart: "", qualified: "" };
  let firstCode: NationCode = "GER";
  let qualifiedCode: NationCode = "GER";
  let unfinished: unknown = null;
  let transition: Awaited<ReturnType<typeof import("./season").advanceToNextSeason>> | undefined;

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

  /** Plays the save's dates while `more` says so. */
  async function playWhile(id: string, more: () => Promise<boolean>): Promise<void> {
    while (await more()) {
      if ((await loaded().matchday.playNextMatchday(id)) === null) {
        return;
      }
    }
  }

  beforeAll(async () => {
    const [{ prisma }, support, season, matchday, coach, missions, view, nations] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./season"),
      import("./matchday"),
      import("./national-coach"),
      import("./national-missions"),
      import("./national-view"),
      import("./nations-view"),
    ]);
    db = prisma;
    modules = { season, matchday, missions, view, nations };
    saves.fromStart = await support.createDemoTwin("Test sélectionneur dès le début", 2);
    saves.qualified = await support.createDemoTwin("Test sélectionneur qualifié", 2);

    // The first twin: the strongest nation of Europe, from the first season.
    const strengths = await prisma.nationSave.findMany({ where: { saveId: saves.fromStart }, select: { code: true, strength: true } });
    firstCode = strengths
      .flatMap((row) => (isNationCode(row.code) && nationByCode(row.code).zone === "EUROPE" ? [{ code: row.code, strength: row.strength ?? 0 }] : []))
      .sort((a, b) => b.strength - a.strength)[0].code;
    await prisma.nationSave.updateMany({ where: { saveId: saves.fromStart, code: firstCode }, data: { offeredIn: WORLD_START_YEAR } });
    await coach.acceptCoachOffer(saves.fromStart, firstCode);
    await support.playRemainingMatchdays(saves.fromStart);
    await season.advanceToNextSeason(saves.fromStart, { assistantContracts: true });
    await playWhile(saves.fromStart, async () => (await prisma.fixture.count({ where: { saveId: saves.fromStart, played: false } })) > 0);

    // The second twin: two seasons of qualifiers without a coach, then a nation just qualified taken over.
    await support.playRemainingMatchdays(saves.qualified);
    await season.advanceToNextSeason(saves.qualified, { assistantContracts: true });
    await playWhile(
      saves.qualified,
      async () => (await prisma.internationalMatch.count({ where: { saveId: saves.qualified, played: false, competition: { in: [QUALIFIER_EUROPE, QUALIFIER_WORLD] } } })) > 0,
    );
    const draw = (await nations.getNationsView(saves.qualified))?.campaign?.draw;
    qualifiedCode = draw?.groups[0].rows[0].code ?? "GER";
    await prisma.coachSpell.create({ data: { saveId: saves.qualified, code: qualifiedCode, fromYear: WORLD_START_YEAR + 1, objective: COACH_STAGES.QUALIFIED, objectiveYear: WORLD_START_YEAR + 2 } });
    await prisma.save.update({ where: { id: saves.qualified }, data: { nationCode: qualifiedCode } });
    await playWhile(saves.qualified, async () => (await prisma.fixture.count({ where: { saveId: saves.qualified, played: false } })) > 0);
    unfinished = await season.advanceToNextSeason(saves.qualified, { assistantContracts: true }).catch((error: unknown) => error);
    await support.playRemainingMatchdays(saves.qualified);
    transition = await season.advanceToNextSeason(saves.qualified, { assistantContracts: true });
  }, 2_400_000);

  afterAll(async () => {
    for (const id of Object.values(saves)) {
      if (id !== "") {
        await db?.save.delete({ where: { id } });
      }
    }
    await db?.$disconnect();
  }, 300_000);

  it("plays every match of his nation by the full engine while he is in post, the other nations' light; the federation judges the qualifiers", async () => {
    const spell = await database().coachSpell.findFirstOrThrow({ where: { saveId: saves.fromStart } });
    const own = await database().internationalMatch.findMany({
      where: { saveId: saves.fromStart, played: true, OR: [{ home: firstCode }, { away: firstCode }] },
      select: { outcome: true, events: true, competition: true },
    });
    // The sixteen dates of the two seasons' breaks, and a tournament's three to five when it qualified.
    expect(own.length).toBeGreaterThanOrEqual(16);
    expect(own.every((match) => match.outcome !== null && match.events !== null)).toBe(true);
    const others = await database().internationalMatch.count({
      where: { saveId: saves.fromStart, played: true, outcome: { not: Prisma.DbNull }, NOT: { OR: [{ home: firstCode }, { away: firstCode }] } },
    });
    expect(others).toBe(0);
    const tables = await loaded().nations.getNationsView(saves.fromStart);
    const qualified = tables?.campaign?.draw?.groups.some((group) => group.rows.some((row) => row.code === firstCode)) ?? false;
    if (qualified) {
      expect(spell).toMatchObject({ code: firstCode, toYear: null, outcome: null });
    } else {
      // The federation's verdict at the qualifiers' last break: « La fédération met fin à ta mission ».
      expect(spell).toMatchObject({ code: firstCode, toYear: WORLD_START_YEAR + 1, outcome: "NOT_QUALIFIED" });
      const save = await database().save.findUniqueOrThrow({ where: { id: saves.fromStart }, select: { nationCode: true } });
      expect(save.nationCode).toBeNull();
      expect((await loaded().view.getCoachTodos(saves.fromStart)).map((todo) => todo.kind)).toContain("ended");
    }
  });

  it("ends the season with his tournament: refused before it, played in June in steps, written once", async () => {
    expect(unfinished).toBeInstanceOf(loaded().season.SeasonNotFinishedError);
    const tournament = await database().internationalMatch.findMany({
      where: { saveId: saves.qualified, competition: OLD_CONTINENT_CUP, startYear: WORLD_START_YEAR + 1 },
      select: { round: true, scheduledAt: true, home: true, away: true, winner: true, played: true, neutral: true, outcome: true },
    });
    expect(tournament).toHaveLength(9);
    expect(tournament.every((match) => match.played && match.neutral)).toBe(true);
    const dates = tournamentDates(WORLD_START_YEAR + 2).map(DAY);
    expect(tournament.every((match) => dates.includes(DAY(match.scheduledAt)))).toBe(true);
    // His nation's by the full engine, the others light.
    const own = tournament.filter((match) => match.home === qualifiedCode || match.away === qualifiedCode);
    expect(own.length).toBeGreaterThanOrEqual(2);
    expect(own.every((match) => match.outcome !== null)).toBe(true);
    expect(tournament.filter((match) => match.home !== qualifiedCode && match.away !== qualifiedCode).every((match) => match.outcome === null)).toBe(true);
    expect(transition?.tournament).toMatchObject({ tournament: OLD_CONTINENT_CUP, year: WORLD_START_YEAR + 2, matches: 9 });
    expect(transition?.tournament?.winner).toBe(tournament.find((match) => match.round === FINAL_ROUND)?.winner);
  });

  it("judges his tournament against the federation's objective at the transition", async () => {
    const tournament = await database().internationalMatch.findMany({
      where: { saveId: saves.qualified, competition: OLD_CONTINENT_CUP, startYear: WORLD_START_YEAR + 1 },
      select: { round: true, home: true, away: true, winner: true },
    });
    const stage = stageReached(
      qualifiedCode,
      tournament.flatMap((match) =>
        isNationCode(match.home) && isNationCode(match.away)
          ? [{ round: match.round, home: match.home, away: match.away, winner: match.winner !== null && isNationCode(match.winner) ? match.winner : null }]
          : [],
      ),
      SEMI_FINAL_ROUND,
      FINAL_ROUND,
    );
    expect(stage).toBeGreaterThanOrEqual(COACH_STAGES.QUALIFIED);
    // The qualification was his objective: reached at least, past it from the semi-finals.
    expect(transition?.coachTournament).toMatchObject({ code: qualifiedCode, stage, verdict: stage > COACH_STAGES.QUALIFIED ? "EXCEEDED" : "ACHIEVED" });
    const spell = await database().coachSpell.findFirstOrThrow({ where: { saveId: saves.qualified } });
    // A new cycle, a new objective: the Hemispheres Cup of 2030.
    expect(spell).toMatchObject({ toYear: null, outcome: null, objectiveYear: WORLD_START_YEAR + 4, exceeded: stage > COACH_STAGES.QUALIFIED ? 1 : 0 });
    const history = await loaded().view.getCoachHistory(saves.qualified);
    expect(history?.spells[0].tournaments).toEqual([{ tournament: OLD_CONTINENT_CUP, year: WORLD_START_YEAR + 2, stage }]);
  });

  it("offers a strong club's manager who coaches no nation up to two of the strongest, none to a modest one", async () => {
    const id = saves.qualified;
    await database().save.update({ where: { id }, data: { nationCode: null } });
    await database().clubSave.updateMany({ where: { saveId: id, isManaged: true }, data: { reputation: 90 } });
    const save = await database().save.findUniqueOrThrow({ where: { id }, select: { seed: true, challengeId: true } });
    const offers = await database().$transaction((tx) =>
      loaded().missions.openCoachOffers(tx, { id, seed: save.seed, nationCode: null, challengeId: save.challengeId }, WORLD_START_YEAR + 2),
    );
    expect(offers.length).toBe(2);
    expect(offers.every((offer) => NATION_CODES.includes(offer))).toBe(true);
    await database().clubSave.updateMany({ where: { saveId: id, isManaged: true }, data: { reputation: 50 } });
    const none = await database().$transaction((tx) =>
      loaded().missions.openCoachOffers(tx, { id, seed: save.seed, nationCode: null, challengeId: save.challengeId }, WORLD_START_YEAR + 2),
    );
    expect(none).toEqual([]);
  });
});
