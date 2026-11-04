import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HALF_TIME_MINUTE, MAX_SUBSTITUTION_WINDOWS, MAX_SUBSTITUTIONS, SEGMENT_MINUTES } from "../engine/balance";
import { CHOICE_OPTIONS, ChoiceError, optionIndex } from "../engine/choices";
import { fitnessFactor, playingFactor } from "../engine/fitness";
import type { LivePause } from "../engine/live";
import { automaticHalfTimeChoice, currentInstructionOf, fitnessAt, HalfTimeChoiceError, type HalfTimeChoice } from "../engine/match";
import { condition } from "../engine/strength";
import { firstMatchdayDate, WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

// Throwaway twins of the demo save play their first matchday: one plays the managed club's match live, segment by
// segment, its assistant deciding and no change at half-time; one plays it straight through; one changes the eleven at
// half-time; one decides against its assistant; one is resumed twice at once; one changes its eleven and its instruction
// between two segments. Runs against DATABASE_URL and is skipped
// without it; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("a managed match played live", () => {
  let db: typeof prismaClient | undefined;
  let modules:
    | {
        matchday: typeof import("./matchday");
        live: typeof import("./live-match");
        liveState: typeof import("./live-state");
        simulation: typeof import("./simulation");
        season: typeof import("./season");
      }
    | undefined;
  const saves = { live: "", straight: "", changed: "", decided: "", twice: "", coached: "" };

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

  const managedFixture = (saveId: string) =>
    database().fixture.findFirstOrThrow({
      where: { saveId, scheduledAt: firstMatchdayDate(WORLD_START_YEAR), OR: [{ homeClubSave: { isManaged: true } }, { awayClubSave: { isManaged: true } }] },
      select: {
        id: true,
        status: true,
        played: true,
        homeGoals: true,
        awayGoals: true,
        homeHalfTimeGoals: true,
        awayHalfTimeGoals: true,
        liveState: true,
        events: {
          orderBy: [{ minute: "asc" }, { id: "asc" }],
          select: { minute: true, type: true, side: true, playerSave: { select: { playerKey: true } }, relatedPlayerSave: { select: { playerKey: true } } },
        },
        decisions: {
          orderBy: { sequence: "asc" },
          select: { sequence: true, minute: true, kind: true, option: true, assistant: true, playerSave: { select: { playerKey: true } } },
        },
      },
    });

  const eventKeys = (fixture: Awaited<ReturnType<typeof managedFixture>>) =>
    fixture.events.map((event) => [event.minute, event.type, event.side, event.playerSave?.playerKey, event.relatedPlayerSave?.playerKey]);

  const liveFixtureIdOf = async (saveId: string) =>
    (await database().save.findUniqueOrThrow({ where: { id: saveId }, select: { liveFixtureId: true } })).liveFixtureId;

  /** The state stored for a save's match at its pause. */
  const stored = async (saveId: string) => {
    const fixture = await managedFixture(saveId);
    return loaded().liveState.parseLiveState(fixture.id, fixture.liveState);
  };

  /** Where a save's match waits, refused when it waits nowhere. */
  const pauseOf = async (saveId: string): Promise<LivePause> => {
    const pause = await loaded().live.getLivePause(saveId);
    if (pause === null) {
      throw new Error(`Save ${saveId} has no match waiting`);
    }
    return { phase: pause.phase, minute: pause.minute };
  };

  /** Plays a save's match on segment by segment, its assistant deciding and no change at the breaks, to its end. */
  const playToEnd = async (saveId: string): Promise<number> => {
    let steps = 0;
    for (let pause = await loaded().live.getLivePause(saveId); pause !== null; pause = await loaded().live.getLivePause(saveId)) {
      await loaded().live.advanceLiveMatch(saveId, pause, {}, "segment");
      steps++;
    }
    return steps;
  };

  beforeAll(async () => {
    const [{ prisma }, support, matchday, live, liveState, simulation, season, lineup] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./matchday"),
      import("./live-match"),
      import("./live-state"),
      import("./simulation"),
      import("./season"),
      import("./lineup"),
    ]);
    db = prisma;
    modules = { matchday, live, liveState, simulation, season };
    [saves.live, saves.straight, saves.changed, saves.decided, saves.twice, saves.coached] = await Promise.all([
      support.createDemoTwin("Test direct"),
      support.createDemoTwin("Test sans pause"),
      support.createDemoTwin("Test changements"),
      support.createDemoTwin("Test décision"),
      support.createDemoTwin("Test deux reprises"),
      support.createDemoTwin("Test pause du joueur"),
    ]);
    // The two saves whose matches are compared start them closed: the starting instruction saved with the lineup, the
    // eleven left to the automatic choice.
    for (const saveId of [saves.live, saves.straight]) {
      await lineup.saveManagedLineup(saveId, { formation: "4-3-3", lineup: { starters: [], benchOrder: [], instruction: "DEFEND" } });
    }
    await Promise.all([
      matchday.playNextMatchday(saves.live, { pauseManagedMatch: true }),
      matchday.playNextMatchday(saves.straight),
      matchday.playNextMatchday(saves.changed, { pauseManagedMatch: true }),
      matchday.playNextMatchday(saves.decided, { pauseManagedMatch: true }),
      matchday.playNextMatchday(saves.twice, { pauseManagedMatch: true }),
      matchday.playNextMatchday(saves.coached, { pauseManagedMatch: true }),
    ]);
  }, 300_000);

  afterAll(async () => {
    for (const saveId of Object.values(saves)) {
      if (saveId !== "") {
        await db?.save.delete({ where: { id: saveId } });
      }
    }
    await db?.$disconnect();
  }, 120_000);

  it("plays the managed club's first segment only, and every other match of the day in full", async () => {
    const db = database();
    const fixture = await managedFixture(saves.live);
    const [others, save] = await Promise.all([
      db.fixture.groupBy({
        by: ["status"],
        where: { saveId: saves.live, scheduledAt: firstMatchdayDate(WORLD_START_YEAR), id: { not: fixture.id } },
        _count: true,
      }),
      db.save.findUniqueOrThrow({ where: { id: saves.live }, select: { liveFixtureId: true, currentDate: true } }),
    ]);

    expect(fixture).toMatchObject({ status: "IN_PLAY", played: false, homeGoals: null, awayGoals: null, homeHalfTimeGoals: null });
    expect(fixture.liveState).not.toBeNull();
    // Nothing past the first boundary: the browser reads the events, never what could still change.
    expect(fixture.events.every((event) => event.minute <= SEGMENT_MINUTES)).toBe(true);
    expect(await pauseOf(saves.live)).toEqual({ phase: "IN_PLAY", minute: SEGMENT_MINUTES });
    expect(others).toEqual([{ status: "PLAYED", _count: 47 }]);
    expect(save.liveFixtureId).toBe(fixture.id);
    expect(save.currentDate.toISOString()).toBe(firstMatchdayDate(WORLD_START_YEAR).toISOString());
    // From kick-off, the starting instruction saved with its lineup, which the live page reads with the pause.
    const { managedSide, state } = await stored(saves.live);
    expect(state[managedSide].startingInstruction).toBe("DEFEND");
    expect(state[managedSide].instructions?.[0]).toEqual({ from: 0, instruction: "DEFEND", source: "START" });
    const waiting = await loaded().live.getLiveWaiting(saves.live);
    expect(waiting?.pause).toMatchObject({ phase: "IN_PLAY", minute: SEGMENT_MINUTES });
    expect(waiting?.instructions).toEqual([{ from: 0, instruction: "DEFEND", source: "START" }]);
  });

  it("refuses to play on, simulate or change season while the match waits", async () => {
    const { matchday, simulation, season } = loaded();
    const nextYear = new Date(Date.UTC(WORLD_START_YEAR + 1, 5, 30));

    await expect(matchday.playNextMatchday(saves.live, { pauseManagedMatch: true })).rejects.toBeInstanceOf(matchday.MatchInProgressError);
    await expect(matchday.playNextMatchday(saves.live)).rejects.toBeInstanceOf(matchday.MatchInProgressError);
    await expect(simulation.simulateMatchdays(saves.live, nextYear)).rejects.toBeInstanceOf(matchday.MatchInProgressError);
    expect(await simulation.planSimulation(saves.live, { kind: "season-end" })).toMatchObject({ matchInProgress: true, matchdays: 0 });
    await expect(season.advanceToNextSeason(saves.live)).rejects.toBeInstanceOf(matchday.MatchInProgressError);
    expect(await liveFixtureIdOf(saves.live)).not.toBeNull();
  });

  it("refuses a resume naming a pause the match does not wait at, and writes nothing", async () => {
    const before = await managedFixture(saves.live);
    for (const at of [
      { phase: "IN_PLAY", minute: 2 * SEGMENT_MINUTES },
      { phase: "HALF_TIME", minute: HALF_TIME_MINUTE },
    ] as const) {
      await expect(loaded().live.advanceLiveMatch(saves.live, at, {}, "segment")).rejects.toBeInstanceOf(loaded().live.PauseMismatchError);
    }
    expect(await managedFixture(saves.live)).toEqual(before);
  });

  it("brings each step's new events and decisions, its next pause and the managed club there, nothing further", async () => {
    const { live } = loaded();
    const before = await managedFixture(saves.live);
    const moved = await live.advanceLiveMatch(saves.live, await pauseOf(saves.live), {}, "segment");
    const step = await live.getLiveStep(saves.live, moved);
    const after = await managedFixture(saves.live);

    expect(step.events.map((event) => [event.minute, event.type])).toEqual(
      after.events.slice(before.events.length).map((event) => [event.minute, event.type]),
    );
    expect(step.events.every((event) => event.minute > SEGMENT_MINUTES && event.minute <= 2 * SEGMENT_MINUTES)).toBe(true);
    expect(step.decisions.map((decision) => decision.sequence)).toEqual(after.decisions.slice(before.decisions.length).map((decision) => decision.sequence));
    expect(step.pause === null ? null : { phase: step.pause.phase, minute: step.pause.minute }).toEqual(await pauseOf(saves.live));
    // Closed from the start, and nothing has changed it: a span from kick-off, the rule giving it again next.
    expect(step.instructions).toEqual([{ from: 0, instruction: "DEFEND", source: "START" }]);
    expect(step.team).toMatchObject({
      phase: "IN_PLAY",
      minute: 2 * SEGMENT_MINUTES,
      windows: { used: 0, max: MAX_SUBSTITUTION_WINDOWS, open: true },
      manual: false,
      instruction: { current: "DEFEND", source: "START", assistant: "DEFEND", starting: "DEFEND" },
    });
    expect(step.result).toBeNull();
  });

  it("takes one resume of a pause, refuses the other of two at once, and never writes an event twice", async () => {
    const { live } = loaded();
    const at = await pauseOf(saves.twice);
    const results = await Promise.allSettled([
      live.advanceLiveMatch(saves.twice, at, {}, "segment"),
      live.advanceLiveMatch(saves.twice, at, {}, "segment"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((result) => result.status === "rejected");
    expect(refused?.status === "rejected" ? refused.reason : null).toBeInstanceOf(live.PauseMismatchError);
    await playToEnd(saves.twice);
    const [twice, straight] = await Promise.all([managedFixture(saves.twice), managedFixture(saves.straight)]);
    expect(eventKeys(twice)).toEqual(eventKeys(straight));
    expect(twice.decisions).toEqual(straight.decisions);
  });

  it("stops at half-time with its score, and shows the break each player's form, fitness and condition, read from its state", async () => {
    const { live } = loaded();
    for (let pause = await pauseOf(saves.live); pause.phase !== "HALF_TIME"; pause = await pauseOf(saves.live)) {
      await live.advanceLiveMatch(saves.live, pause, {}, "segment");
    }
    const fixture = await managedFixture(saves.live);
    expect(fixture.status).toBe("HALF_TIME");
    expect(fixture.events.filter((event) => event.type === "GOAL").length).toBe((fixture.homeHalfTimeGoals ?? 0) + (fixture.awayHalfTimeGoals ?? 0));

    const { managedSide, state } = await stored(saves.live);
    const team = state[managedSide];
    const breakTeam = await live.getHalfTimeTeam(saves.live);
    if (breakTeam === null) {
      throw new Error("No match waits at a break");
    }
    expect(breakTeam.booked).toEqual(team.booked);
    // The starters have played 45 minutes, the substitutes none: fresh at kick-off, worn since; a substitute has his
    // freshness alone.
    const fitness = [
      ...team.pitch.map((entry) => [entry.player, fitnessAt(entry, HALF_TIME_MINUTE), playingFactor(entry.player.fitness, fitnessAt(entry, HALF_TIME_MINUTE))] as const),
      ...team.bench.map((player) => [player, player.fitness, fitnessFactor(player.fitness)] as const),
    ];
    expect(breakTeam.players.map((player) => [player.id, player.form, player.fitness, player.fitnessFactor, player.condition])).toEqual(
      fitness.map(([player, atBreak, factor]) => [player.id, player.form, atBreak, factor, condition(player) * factor]),
    );
  });

  it("refuses an invalid half-time choice, or changes away from a break, and writes nothing", async () => {
    const { managedSide, state } = await stored(saves.live);
    const team = state[managedSide];
    const automatic = automaticHalfTimeChoice(state, managedSide);
    const starters = team.pitch.filter((entry) => entry.status === "ON");
    const tooMany: HalfTimeChoice = {
      ...automatic,
      substitutions: team.bench.slice(0, MAX_SUBSTITUTIONS + 1).map((player, index) => ({ in: player.id, out: starters[index].player.id })),
    };

    await expect(loaded().live.advanceLiveMatch(saves.live, { phase: "HALF_TIME", minute: HALF_TIME_MINUTE }, { changes: tooMany }, "segment")).rejects.toBeInstanceOf(
      HalfTimeChoiceError,
    );
    expect((await managedFixture(saves.live)).status).toBe("HALF_TIME");
  });

  it("played on with the assistant's decisions and no change, gives the very match played without a pause", async () => {
    await playToEnd(saves.live);
    const [live, straight] = await Promise.all([managedFixture(saves.live), managedFixture(saves.straight)]);

    expect(live).toMatchObject({ status: "PLAYED", played: true, liveState: null });
    expect(await liveFixtureIdOf(saves.live)).toBeNull();
    expect([live.homeGoals, live.awayGoals, live.homeHalfTimeGoals, live.awayHalfTimeGoals]).toEqual([
      straight.homeGoals,
      straight.awayGoals,
      straight.homeHalfTimeGoals,
      straight.awayHalfTimeGoals,
    ]);
    expect(eventKeys(live)).toEqual(eventKeys(straight));
    // Its choice events, written as they were decided, the same as those of the match simulated in one go.
    expect(live.decisions.length).toBeGreaterThan(0);
    expect(live.decisions).toEqual(straight.decisions);
    expect(live.decisions.every((decision) => decision.assistant)).toBe(true);
  });

  it("keeps the same season stats, form, fitness and injuries as a match played without a pause", async () => {
    const db = database();
    const snapshot = async (saveId: string) => {
      const [stats, players] = await Promise.all([
        db.playerSeasonStats.findMany({
          where: { saveId },
          select: { appearances: true, minutes: true, goals: true, assists: true, yellowCards: true, redCards: true, playerSave: { select: { playerKey: true } } },
          orderBy: { playerSave: { playerKey: "asc" } },
        }),
        db.playerSave.findMany({
          where: { saveId },
          select: { playerKey: true, form: true, fitness: true, injuredUntil: true, leagueYellows: true },
          orderBy: { playerKey: "asc" },
        }),
      ]);
      return { stats, players };
    };

    expect(await snapshot(saves.live)).toEqual(await snapshot(saves.straight));
  });

  it("plays the second half with the manager's substitution and formation, the substitution dated 46'", async () => {
    const { live } = loaded();
    for (let pause = await pauseOf(saves.changed); pause.phase !== "HALF_TIME"; pause = await pauseOf(saves.changed)) {
      await live.advanceLiveMatch(saves.changed, pause, {}, "segment");
    }
    const { managedSide, state } = await stored(saves.changed);
    const automatic = automaticHalfTimeChoice(state, managedSide);
    const team = state[managedSide];
    const comingOn = new Set(automatic.substitutions.map((substitution) => substitution.in));
    const leaving = automatic.starters.find((starter) => starter.slot === 9) ?? automatic.starters[automatic.starters.length - 1];
    const substitute = team.bench.find((player) => player.position !== "GK" && !comingOn.has(player.id));
    if (substitute === undefined) {
      throw new Error("No substitute left");
    }
    const choice: HalfTimeChoice = {
      formation: "4-4-2",
      starters: automatic.starters.map((starter) => (starter === leaving ? { ...starter, playerKey: substitute.id } : starter)),
      substitutions: [...automatic.substitutions, { in: substitute.id, out: leaving.playerKey }],
    };

    await live.advanceLiveMatch(saves.changed, { phase: "HALF_TIME", minute: HALF_TIME_MINUTE }, { changes: choice }, "segment");
    await playToEnd(saves.changed);
    const fixture = await managedFixture(saves.changed);
    const managedEvent = managedSide === "home" ? "HOME" : "AWAY";

    expect(fixture.status).toBe("PLAYED");
    expect(fixture.events).toContainEqual({
      minute: HALF_TIME_MINUTE + 1,
      type: "SUBSTITUTION",
      side: managedEvent,
      playerSave: { playerKey: substitute.id },
      relatedPlayerSave: { playerKey: leaving.playerKey },
    });
    const stats = await database().playerSeasonStats.findFirstOrThrow({
      where: { saveId: saves.changed, playerSave: { saveId: saves.changed, playerKey: leaving.playerKey } },
      select: { minutes: true },
    });
    expect(stats.minutes).toBe(HALF_TIME_MINUTE);
    // The half-time formation is for this match only: the saved one does not change.
    const club = await database().clubSave.findFirstOrThrow({ where: { saveId: saves.changed, isManaged: true }, select: { formation: true } });
    expect(club.formation).toBe("4-3-3");
  });

  it("writes the manager's own decision on a choice event, refuses one not offered, and plays on from it", async () => {
    const { live } = loaded();
    let view = await live.getLivePause(saves.decided);
    while (view !== null && view.choice === null) {
      await live.advanceLiveMatch(saves.decided, view, {}, "segment");
      view = await live.getLivePause(saves.decided);
    }
    if (view === null || view.choice === null) {
      throw new Error("The match had no choice event");
    }
    const at: LivePause = { phase: view.phase, minute: view.minute };
    const { state, managedSide } = await stored(saves.decided);
    const event = state.choices?.pending;
    if (event === undefined || event === null) {
      throw new Error("No event stored");
    }
    expect(view.choice).toMatchObject({ minute: event.minute, kind: event.kind, assistant: event.assistant });
    expect(view.choice.options.map((option) => option.option)).toEqual(event.options.map((option) => option.option));
    // A late tactical choice says the instruction it gives (STEADY: Équilibré), and marks the one the club plays with.
    const gives = (option: string) => (option === "DEFEND" || option === "ATTACK" ? option : option === "STEADY" ? "BALANCED" : null);
    expect(view.choice.options.map((option) => option.instruction)).toEqual(event.options.map((option) => gives(option.option)));
    const current = currentInstructionOf(state[managedSide]);
    expect(view.choice.options.map((option) => option.current)).toEqual(event.options.map((option) => gives(option.option) === current));

    // Not offered: refused, nothing written.
    const before = await managedFixture(saves.decided);
    const notOffered = CHOICE_OPTIONS.find((option) => !event.options.some((offered) => offered.option === option)) ?? "TAKER";
    await expect(live.advanceLiveMatch(saves.decided, at, { decision: { option: notOffered } }, "segment")).rejects.toBeInstanceOf(ChoiceError);
    expect(await managedFixture(saves.decided)).toEqual(before);

    // Another option than the assistant's: written as the manager's, then the match plays on.
    const own = event.options.findIndex((_, index) => index !== event.assistant);
    const option = event.options[own];
    const decision = { option: option.option, playerId: option.playerId };
    expect(optionIndex(event, decision)).toBe(own);
    await live.advanceLiveMatch(saves.decided, at, { decision }, "segment");
    const after = await managedFixture(saves.decided);
    expect(after.decisions.at(-1)).toMatchObject({ minute: event.minute, kind: event.kind, option: option.option, assistant: false });
    expect(after.events.length).toBeGreaterThanOrEqual(before.events.length);
    const next = await live.getLivePause(saves.decided);
    expect(next === null ? null : { phase: next.phase, minute: next.minute }).not.toEqual(at);
  });

  it("takes the manager's substitution and instruction between two segments, in one of his windows, then plays to the end", async () => {
    const { live } = loaded();
    // A pause between two segments with no event open: the changes are made on the eleven as it stands.
    let view = await live.getLivePause(saves.coached);
    while (view !== null && (view.phase !== "IN_PLAY" || view.choice !== null)) {
      await live.advanceLiveMatch(saves.coached, view, {}, "segment");
      view = await live.getLivePause(saves.coached);
    }
    if (view === null || view.minute > 2 * SEGMENT_MINUTES) {
      throw new Error("No pause without an event before half-time");
    }
    const at: LivePause = { phase: view.phase, minute: view.minute };
    const { managedSide, state } = await stored(saves.coached);
    const team = state[managedSide];
    const leaving = team.pitch.find((entry) => entry.status === "ON" && entry.slot !== "GK");
    const substitute = team.bench.find((player) => player.position !== "GK");
    if (leaving === undefined || substitute === undefined) {
      throw new Error("No substitution to make");
    }
    const choice: HalfTimeChoice = {
      formation: team.formation,
      starters: team.pitch
        .filter((entry) => entry.status === "ON")
        .map((entry) => ({ slot: entry.index, playerKey: entry === leaving ? substitute.id : entry.player.id })),
      substitutions: [{ in: substitute.id, out: leaving.player.id }],
    };

    const step = await live.getLiveStep(
      saves.coached,
      await live.advanceLiveMatch(saves.coached, at, { changes: choice, instruction: "ATTACK" }, "segment"),
    );
    const after = await stored(saves.coached);
    expect(after.state[managedSide]).toMatchObject({ windows: [at.minute + 1], manual: true });
    expect(after.state.modifiers?.instructions[managedSide]).toBe("ATTACK");
    // His from that pause on, which the step brings to the score card.
    expect(step.instructions.at(-1)).toEqual({ from: at.minute, instruction: "ATTACK", source: "MANAGER" });
    expect((await managedFixture(saves.coached)).events).toContainEqual({
      minute: at.minute + 1,
      type: "SUBSTITUTION",
      side: managedSide === "home" ? "HOME" : "AWAY",
      playerSave: { playerKey: substitute.id },
      relatedPlayerSave: { playerKey: leaving.player.id },
    });
    expect(await live.getHalfTimeTeam(saves.coached)).toMatchObject({
      windows: { used: 1, max: MAX_SUBSTITUTION_WINDOWS },
      manual: true,
      instruction: { current: "ATTACK", source: "MANAGER", starting: "BALANCED" },
    });

    // On to the end: the last step says how the match ended, and leaves nothing to wait at.
    let pause = await live.getLivePause(saves.coached);
    let last = null;
    while (pause !== null) {
      last = await live.getLiveStep(saves.coached, await live.advanceLiveMatch(saves.coached, pause, {}, "break"));
      pause = await live.getLivePause(saves.coached);
    }
    const fixture = await managedFixture(saves.coached);
    expect(last).toMatchObject({ pause: null, team: null, result: { homeGoals: fixture.homeGoals, awayGoals: fixture.awayGoals } });
  });

  it("never pauses in the quick simulation, and keeps the assistant's decisions with the match", async () => {
    const { simulation } = loaded();
    const batch = await simulation.simulateMatchdays(saves.straight, new Date(Date.UTC(WORLD_START_YEAR + 1, 5, 30)), 1);

    expect(batch.played).toBe(1);
    expect(batch.matches.every((match) => match.played)).toBe(true);
    expect(await liveFixtureIdOf(saves.straight)).toBeNull();
    expect(await database().fixture.count({ where: { saveId: saves.straight, status: { in: ["IN_PLAY", "HALF_TIME", "REGULATION_END"] } } })).toBe(0);
    expect(await database().matchDecision.count({ where: { fixture: { saveId: saves.straight } } })).toBeGreaterThan(1);
  });
});
