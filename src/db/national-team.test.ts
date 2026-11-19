import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LivePause } from "../engine/live";
import { breakWindows } from "../engine/schedule";
import { WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

const DAY = (date: Date): string => date.toISOString().slice(0, 10);

// The national coach (docs/design/selections.md § 5, N4 and N4b), on throwaway twins of the demo save: his first break
// played in steps, his qualifier live in one twin and simulated in the other (the same match, his assistant deciding),
// his friendly left to his assistant on the way, the other nations' matches as a save without a coach plays them; his
// offer, its acceptance and his leaving. Runs against DATABASE_URL and is skipped without it; modules are imported lazily
// because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("a national coach's break", () => {
  let db: typeof prismaClient | undefined;
  let modules:
    | {
        matchday: typeof import("./matchday");
        coach: typeof import("./national-coach");
        team: typeof import("./national-team");
        live: typeof import("./national-live");
        view: typeof import("./national-view");
      }
    | undefined;
  const saves = { live: "", simulated: "", plain: "" };
  const [first, second] = breakWindows(WORLD_START_YEAR)[0].dates;

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

  /** Plays the save's dates up to its coach's first match at stake, left for him. */
  async function playToStop(saveId: string): Promise<void> {
    for (;;) {
      const matchday = await loaded().matchday.playNextMatchday(saveId, { untilNationalStop: true });
      if (matchday === null || matchday.national?.stopNext === true) {
        return;
      }
    }
  }

  /** Makes the save's player the coach of Portugal: the federation's offer, accepted. */
  async function becomeCoach(saveId: string): Promise<void> {
    await database().nationSave.updateMany({ where: { saveId, code: "POR" }, data: { offeredIn: WORLD_START_YEAR } });
    await loaded().coach.acceptCoachOffer(saveId, "POR");
  }

  beforeAll(async () => {
    const [{ prisma }, support, matchday, coach, team, live, view] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./matchday"),
      import("./national-coach"),
      import("./national-team"),
      import("./national-live"),
      import("./national-view"),
    ]);
    db = prisma;
    modules = { matchday, coach, team, live, view };
    saves.live = await support.createDemoTwin("Test sélectionneur direct", 2);
    saves.simulated = await support.createDemoTwin("Test sélectionneur simulé", 2);
    saves.plain = await support.createDemoTwin("Test sans sélectionneur", 2);
    await becomeCoach(saves.live);
    await becomeCoach(saves.simulated);
  }, 180_000);

  afterAll(async () => {
    for (const id of Object.values(saves)) {
      if (id !== "") {
        await db?.save.delete({ where: { id } });
      }
    }
    await db?.$disconnect();
  }, 120_000);

  it("starts a mission with the federation's objective, the offers gone", async () => {
    const save = await database().save.findUniqueOrThrow({ where: { id: saves.live }, select: { nationCode: true, nationFriendlies: true } });
    expect(save).toEqual({ nationCode: "POR", nationFriendlies: true });
    const spell = await database().coachSpell.findFirstOrThrow({ where: { saveId: saves.live } });
    expect(spell).toMatchObject({ code: "POR", fromYear: WORLD_START_YEAR, toYear: null, objectiveYear: WORLD_START_YEAR + 2, outcome: null });
    expect([1, 2, 3]).toContain(spell.objective);
    expect(await database().nationSave.count({ where: { saveId: saves.live, offeredIn: { not: null } } })).toBe(0);
    // What his screens read before his first break: its two matches, his assistant's list, his lineup's 23.
    const view = await loaded().view.getNationalTeamView(saves.live);
    expect(view).toMatchObject({ code: "POR", fromYear: WORLD_START_YEAR, friendliesByAssistant: true, canLeave: true });
    expect(view?.session?.matches.map((match) => [match.competition, match.byAssistant])).toEqual([
      ["int.qual.eu", false],
      ["int.friendly", true],
    ]);
    expect(view?.callUp).toMatchObject({ by: "assistant", locked: false });
    expect((view?.callUp?.league ?? 0) + (view?.callUp?.reserve ?? 0)).toBe(23);
    const editor = await loaded().view.getCallUpEditor(saves.live);
    expect(DAY(editor?.date ?? new Date(0))).toBe(DAY(first));
    expect(editor?.assistant).toHaveLength(23);
    expect(editor?.chosen).toBeNull();
    expect(editor?.candidates.length).toBeGreaterThan(23);
    const lineup = await loaded().view.getCoachLineupEditor(saves.live);
    expect(lineup?.players).toHaveLength(23);
    expect(DAY(lineup?.matchDate ?? new Date(0))).toBe(DAY(first));
    // His club plays first: his next match at stake is not the next thing yet.
    expect(await loaded().view.getNationalNext(saves.live)).toBeNull();
  }, 180_000);

  it("takes his own list: a player of his instead of one of his assistant's", async () => {
    await playToStop(saves.live);
    const next = await loaded().view.getNationalNext(saves.live);
    expect(next).toMatchObject({ code: "POR", competition: "int.qual.eu", live: false });
    expect(DAY(next?.date ?? new Date(0))).toBe(DAY(first));
    expect((await loaded().view.getCoachTodos(saves.live)).map((todo) => todo.kind)).toContain("call-up");
    const editor = await loaded().view.getCallUpEditor(saves.live);
    const assistant = editor?.assistant ?? [];
    const out = assistant[assistant.length - 1];
    const extra = editor?.candidates.find((candidate) => !assistant.includes(candidate.key) && !candidate.injured && candidate.position !== "GK");
    expect(extra).toBeDefined();
    const keys = [...assistant.slice(0, -1), extra?.key ?? ""];
    await loaded().coach.saveCoachCallUp(saves.live, keys);
    expect((await loaded().view.getCallUpEditor(saves.live))?.chosen).toEqual(keys);
    expect((await loaded().view.getCoachTodos(saves.live)).map((todo) => todo.kind)).not.toContain("call-up");
    // A list of 22, or without three goalkeepers, is refused.
    await expect(loaded().coach.saveCoachCallUp(saves.live, keys.slice(1))).rejects.toThrow(loaded().coach.NationalCoachError);
    // Kept for the break once it starts: his player in, his assistant's last one out.
    await loaded().matchday.playNextMatchday(saves.live, { untilNationalStop: true });
    const squad = await database().nationSave.findUniqueOrThrow({ where: { saveId_code: { saveId: saves.live, code: "POR" } }, select: { squad: true } });
    const kept = JSON.stringify(squad.squad);
    expect(kept).toContain(extra?.key ?? "?");
    expect(kept).not.toContain(`"${out}"`);
  }, 180_000);

  it("stops before his qualifier, then plays it live, the other matches of its date played with it", async () => {
    const before = await database().save.findUniqueOrThrow({ where: { id: saves.live }, select: { currentDate: true, liveInternationalId: true } });
    expect(before.currentDate < first).toBe(true);
    expect(before.liveInternationalId).toBeNull();
    expect(await database().internationalMatch.count({ where: { saveId: saves.live, scheduledAt: first, played: true } })).toBe(0);

    const kickOff = await loaded().matchday.playNextMatchday(saves.live, { pauseManagedMatch: true });
    expect(kickOff?.national).toMatchObject({ live: true });
    const matchId = kickOff?.national?.matchId ?? "";
    const row = await database().internationalMatch.findUniqueOrThrow({ where: { id: matchId }, select: { competition: true, scheduledAt: true, home: true, away: true, played: true } });
    expect(row.competition).toBe("int.qual.eu");
    expect(DAY(row.scheduledAt)).toBe(DAY(first));
    expect([row.home, row.away]).toContain("POR");
    expect(row.played).toBe(false);
    // The other six matches of the Friday are played.
    expect(await database().internationalMatch.count({ where: { saveId: saves.live, scheduledAt: first, played: true } })).toBe(6);
    const waiting = await database().save.findUniqueOrThrow({ where: { id: saves.live }, select: { currentDate: true, liveInternationalId: true } });
    expect(waiting).toEqual({ currentDate: first, liveInternationalId: matchId });
    // Nothing moves the save on while it waits.
    await expect(loaded().matchday.playNextMatchday(saves.live)).rejects.toThrow(loaded().matchday.MatchInProgressError);

    // Played on to its end, his assistant deciding, no change: the break then goes on to its end, his friendly simulated.
    let view = await loaded().live.getNationalLive(saves.live, matchId);
    for (let pause: LivePause | null = view?.pause ?? null; pause !== null; ) {
      const moved = await loaded().live.advanceNationalLiveMatch(saves.live, pause, {}, "break");
      pause = moved.pause;
      if (pause === null) {
        expect(moved.step?.completed?.matches).toBe(14);
      }
    }
    view = await loaded().live.getNationalLive(saves.live, matchId);
    expect(view?.pause).toBeNull();
    expect(view?.match.events.length).toBeGreaterThan(0);
    expect(view?.others).toHaveLength(6);
    expect([view?.match.home.isManaged, view?.match.away.isManaged]).toContain(true);
  }, 180_000);

  it("ends the break as a break of another save: every match played, the save on its last date, the caps counted", async () => {
    const save = await database().save.findUniqueOrThrow({ where: { id: saves.live }, select: { currentDate: true, liveInternationalId: true } });
    expect(save).toEqual({ currentDate: second, liveInternationalId: null });
    const matches = await database().internationalMatch.findMany({
      where: { saveId: saves.live, scheduledAt: { in: [first, second] } },
      select: { played: true, home: true, away: true, competition: true, outcome: true, events: true },
    });
    expect(matches).toHaveLength(14);
    expect(matches.every((match) => match.played)).toBe(true);
    // His two matches by the full engine, his friendly among them; the others light.
    const own = matches.filter((match) => match.home === "POR" || match.away === "POR");
    expect(own).toHaveLength(2);
    expect(own.every((match) => match.outcome !== null && match.events !== null)).toBe(true);
    expect(own.map((match) => match.competition).sort()).toEqual(["int.friendly", "int.qual.eu"]);
    expect(matches.filter((match) => match.home !== "POR" && match.away !== "POR").every((match) => match.outcome === null)).toBe(true);
    expect(await database().playerSave.count({ where: { saveId: saves.live, caps: { gt: 0 } } })).toBeGreaterThan(100);
  }, 180_000);

  it("plays the very same qualifier simulated, his assistant deciding, and the other nations' Friday as without a coach", async () => {
    await playToStop(saves.simulated);
    // The same list as the live twin's: the very same squads.
    const own = await database().nationSave.findUniqueOrThrow({ where: { saveId_code: { saveId: saves.live, code: "POR" } }, select: { callUp: true } });
    await loaded().coach.saveCoachCallUp(saves.simulated, loaded().team.parseCallUp(own.callUp)?.keys ?? []);
    const simulated = await loaded().matchday.playNextMatchday(saves.simulated);
    expect(simulated?.national).toMatchObject({ live: false });
    // Simulated, the step goes on to the end of the break: his friendly is his assistant's.
    expect(simulated?.internationalBreak?.matches).toBe(14);
    const select = { home: true, away: true, homeGoals: true, awayGoals: true, scorers: true, goalTimes: true, scheduledAt: true } as const;
    const ofSave = (saveId: string) =>
      database().internationalMatch.findMany({ where: { saveId, scheduledAt: { in: [first, second] } }, orderBy: [{ scheduledAt: "asc" }, { home: "asc" }], select });
    const [live, sim] = [await ofSave(saves.live), await ofSave(saves.simulated)];
    expect(sim).toEqual(live);

    // A save without a coach plays the same Friday but for Portugal's match: the other nations' matches are theirs.
    for (;;) {
      const matchday = await loaded().matchday.playNextMatchday(saves.plain);
      if (matchday === null || matchday.internationalBreak !== undefined) {
        break;
      }
    }
    const plain = await ofSave(saves.plain);
    const friday = (rows: typeof plain) => rows.filter((row) => DAY(row.scheduledAt) === DAY(first) && row.home !== "POR" && row.away !== "POR");
    expect(friday(plain)).toEqual(friday(live));
  }, 180_000);

  it("lets him leave between two breaks, never during one, his mission kept", async () => {
    await loaded().coach.resignNationalTeam(saves.simulated);
    const save = await database().save.findUniqueOrThrow({ where: { id: saves.simulated }, select: { nationCode: true } });
    expect(save.nationCode).toBeNull();
    const spell = await database().coachSpell.findFirstOrThrow({ where: { saveId: saves.simulated } });
    expect(spell).toMatchObject({ code: "POR", toYear: WORLD_START_YEAR, outcome: "RESIGNED" });
  }, 180_000);
});
