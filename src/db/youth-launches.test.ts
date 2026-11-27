import "dotenv/config";
import { revalidatePath } from "next/cache";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { YOUTH_ENTRY_MAX_TARGETS } from "../engine/balance";
import { formationPositions } from "../engine/formations";
import { selectRestedLineup } from "../engine/lineup";
import type { Position } from "../engine/positions";
import { seasonEndDate, WORLD_START_DATE, WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

// « Le lancer » (docs/design/effectif-adjoint.md § 9) in the database: the marks of Save.youthLaunches, written by the
// sheet and the squad's « Jeunes » view, three at most, of an outfield player of the club aged 21 or under on 1 July;
// read by « Lancer les jeunes » in a league match; dropped for a player sold, released, gone free, past the age or a
// goalkeeper, kept for an injured or a suspended one, left out of the match while he is. Runs against DATABASE_URL on
// throwaway world-1 twins of the demo save and is skipped without it; modules are imported lazily because the client
// throws without it.

// The viewer the mocked requireOwnedSave checks the save against: the action runs without a request here.
const viewer = vi.hoisted(() => ({ current: null as { id: string } | null }));

vi.mock("../auth/current-user", async () => {
  const { loadOwnedSave } = await import("./access");
  return { requireOwnedSave: (saveId: string) => loadOwnedSave(saveId, viewer.current) };
});

// Nor Next's cache, nor its language: the action's words in French.
vi.mock("next/cache", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/cache")>()), revalidatePath: vi.fn() }));
vi.mock("next-intl/server", async () => {
  const { testTranslator } = await import("../i18n/test-intl");
  return {
    getTranslations: async (namespace: "actions.youthLaunch") => testTranslator("fr", namespace),
    getLocale: async () => "fr",
  };
});

type Db = typeof prismaClient;
type Modules = {
  db: Db;
  launches: typeof import("./youth-launches");
  lineup: typeof import("./lineup");
  matchday: typeof import("./matchday");
  players: typeof import("./players");
  settings: typeof import("./assistant-settings");
  transfers: typeof import("./transfers");
  contracts: typeof import("./contracts");
  season: typeof import("./season");
  actions: typeof import("../../app/saves/[id]/squad/actions");
};

/** A player of the managed club the tests mark: his PlayerSave.id and his key. */
type Marked = { id: string; key: string };

/** Born on a day of `year`, 1 January unless told: whole years on 1 July of the seasons. */
const born = (year: number, month = 0, day = 1): Date => new Date(Date.UTC(year, month, day));

describe.skipIf(process.env.DATABASE_URL === undefined)("« Le lancer » in the database", () => {
  let modules: Modules | undefined;
  let saveId = "";
  let turnSaveId = "";
  let owner = "";
  // Four reserves made 19 on 1 July, each at a position of the eleven, far below its starter: none of them starts. Their
  // potentials apart, the first the highest: the assistant's own two, without any mark.
  const young: Marked[] = [];
  let keeper: Marked = { id: "", key: "" }; // a goalkeeper of the club made 18
  let older: Marked = { id: "", key: "" }; // an outfield player of the club 22 on 1 July
  let foreign: Marked = { id: "", key: "" }; // an AI club's outfield player made 19

  const api = (): Modules => {
    if (modules === undefined) {
      throw new Error("Modules not loaded");
    }
    return modules;
  };
  const marksOf = async (id: string = saveId): Promise<string[]> =>
    (await api().db.save.findUniqueOrThrow({ where: { id }, select: { youthLaunches: true } })).youthLaunches;
  const mark = (player: Marked, launch = true, id: string = saveId) =>
    api().launches.setYouthLaunch({ saveId: id, playerSaveId: player.id, launch });
  const setMarks = async (players: readonly Marked[], id: string = saveId): Promise<void> => {
    await api().db.save.update({ where: { id }, data: { youthLaunches: [] } });
    for (const player of players) {
      expect(await mark(player, true, id)).toMatchObject({ ok: true });
    }
  };
  const setPolicy = async (policy: "BEST" | "YOUTH", id: string = saveId): Promise<void> => {
    await api().db.save.update({ where: { id }, data: { assistantPolicy: policy } });
  };
  const keys = (players: readonly Marked[]): string[] => players.map((player) => player.key);

  /** The managed club made ready: nobody young but the players chosen here, its rested eleven untouched. */
  const prepare = async (id: string): Promise<{ young: Marked[]; keeper: Marked; older: Marked }> => {
    const { db, lineup } = api();
    const club = await db.clubSave.findFirstOrThrow({ where: { saveId: id, isManaged: true }, select: { id: true } });
    await db.playerSave.updateMany({ where: { saveId: id, clubSaveId: club.id }, data: { birthDate: born(1999) } });
    const { players, formation } = await lineup.getLineupEditor(id);
    const rested = selectRestedLineup(players, formationPositions(formation));
    const starting = new Set(rested.starters.map(({ player }) => player.id));
    const reserves = players.filter((player) => !starting.has(player.id));
    const chosen: Marked[] = [];
    const positions = new Set<Position>();
    for (const { player, slot } of rested.starters) {
      const reserve = reserves.find((other) => other.position === slot && !chosen.some(({ key }) => key === other.id));
      if (slot === "GK" || player.position !== slot || positions.has(slot) || reserve === undefined || chosen.length === 4) {
        continue;
      }
      positions.add(slot);
      chosen.push({ id: "", key: reserve.id });
    }
    expect(chosen).toHaveLength(4);
    const rows = await db.playerSave.findMany({ where: { saveId: id, clubSaveId: club.id }, select: { id: true, playerKey: true, position: true } });
    const idOf = (key: string): string => rows.find((row) => row.playerKey === key)?.id ?? "";
    for (const [index, player] of chosen.entries()) {
      player.id = idOf(player.key);
      await db.playerSave.update({
        where: { id: player.id, saveId: id },
        data: { birthDate: born(WORLD_START_YEAR - 19), overall: 40, potential: 85 - index },
      });
    }
    const usedKeys = new Set(chosen.map(({ key }) => key));
    const keeperRow = rows.find((row) => row.position === "GK" && !starting.has(row.playerKey));
    const olderRow = rows.find((row) => row.position !== "GK" && !starting.has(row.playerKey) && !usedKeys.has(row.playerKey));
    if (keeperRow === undefined || olderRow === undefined) {
      throw new Error("No reserve goalkeeper or outfield reserve left");
    }
    await db.playerSave.update({ where: { id: keeperRow.id, saveId: id }, data: { birthDate: born(WORLD_START_YEAR - 18) } });
    // 22 on 1 July of the season: his birthday the day before.
    await db.playerSave.update({ where: { id: olderRow.id, saveId: id }, data: { birthDate: born(WORLD_START_YEAR - 22, 5, 30) } });
    return {
      young: chosen,
      keeper: { id: keeperRow.id, key: keeperRow.playerKey },
      older: { id: olderRow.id, key: olderRow.playerKey },
    };
  };

  beforeAll(async () => {
    const [{ prisma }, launches, lineup, matchday, players, settings, transfers, contracts, season, actions, support] = await Promise.all([
      import("./client"),
      import("./youth-launches"),
      import("./lineup"),
      import("./matchday"),
      import("./players"),
      import("./assistant-settings"),
      import("./transfers"),
      import("./contracts"),
      import("./season"),
      import("../../app/saves/[id]/squad/actions"),
      import("./test-support"),
    ]);
    modules = { db: prisma, launches, lineup, matchday, players, settings, transfers, contracts, season, actions };
    saveId = await support.createDemoTwin("Test jeunes lancés");
    turnSaveId = await support.createDemoTwin("Test jeunes lancés · passage de saison");
    owner = (await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { ownerId: true } })).ownerId ?? "";

    const prepared = await prepare(saveId);
    young.push(...prepared.young);
    keeper = prepared.keeper;
    older = prepared.older;
    const aiPlayer = await prisma.playerSave.findFirstOrThrow({
      where: { saveId, position: "CM", clubSave: { isManaged: false } },
      orderBy: { playerKey: "asc" },
      select: { id: true, playerKey: true },
    });
    await prisma.playerSave.update({ where: { id: aiPlayer.id, saveId }, data: { birthDate: born(WORLD_START_YEAR - 19) } });
    foreign = { id: aiPlayer.id, key: aiPlayer.playerKey };
  }, 300_000);

  afterAll(async () => {
    await modules?.db.save.deleteMany({ where: { id: { in: [saveId, turnSaveId].filter((id) => id !== "") } } });
    await modules?.db.$disconnect();
  }, 120_000);

  it("marks an outfield player of the club aged 21 or under, three at most, in the manager's order; taking one off is never refused", async () => {
    const [a, b, c, d] = young;
    await setMarks([]);
    expect(await mark(a)).toEqual({ ok: true, launches: [a.key] });
    expect(await mark(b)).toEqual({ ok: true, launches: [a.key, b.key] });
    expect(await mark(c)).toEqual({ ok: true, launches: [a.key, b.key, c.key] });
    expect(YOUTH_ENTRY_MAX_TARGETS).toBe(3);
    expect(await mark(d)).toEqual({ ok: false, reason: "full" });
    // Marked again: nothing changes, nothing refused.
    expect(await mark(b)).toEqual({ ok: true, launches: [a.key, b.key, c.key] });
    expect(await mark(a, false)).toEqual({ ok: true, launches: [b.key, c.key] });
    expect(await mark(d)).toEqual({ ok: true, launches: [b.key, c.key, d.key] });
    // Not marked: nothing to take off, never refused, even at three.
    expect(await mark(a, false)).toEqual({ ok: true, launches: [b.key, c.key, d.key] });
    expect(await marksOf()).toEqual([b.key, c.key, d.key]);
  });

  it("refuses a goalkeeper, a player past 21 on 1 July and another club's player, writing nothing", async () => {
    await setMarks([]);
    for (const player of [keeper, older, foreign]) {
      expect(await mark(player), player.key).toEqual({ ok: false, reason: "not-eligible" });
    }
    expect(await mark({ id: "no-such-player", key: "" })).toEqual({ ok: false, reason: "not-eligible" });
    expect(await marksOf()).toEqual([]);
  });

  it("gives the sheet whether each young player is marked, the marks that hold, and when they bring anyone on", async () => {
    const [a, b] = young;
    await setPolicy("YOUTH");
    await setMarks([a]);
    const profiles = await api().players.getPlayerProfiles(saveId, { id: { in: [a.id, b.id, keeper.id, older.id, foreign.id] } });
    const viewOf = (player: Marked) => profiles.find((profile) => profile.id === player.id)?.youthLaunch;
    expect(viewOf(a)).toEqual({ marked: true, marks: 1, policy: "YOUTH", lineupByAssistant: true });
    expect(viewOf(b)).toEqual({ marked: false, marks: 1, policy: "YOUTH", lineupByAssistant: true });
    // Nothing to mark: a goalkeeper, a player too old, another club's.
    expect(viewOf(keeper)).toBeNull();
    expect(viewOf(older)).toBeNull();
    expect(viewOf(foreign)).toBeNull();

    await setPolicy("BEST");
    expect((await api().players.getPlayerProfiles(saveId, { id: a.id }))[0]?.youthLaunch).toEqual({
      marked: true,
      marks: 1,
      policy: "BEST",
      lineupByAssistant: true,
    });
  });

  it("tells Club → Réglages whom « Lancer les jeunes » brings on: the marks, or his two with the most potential", async () => {
    const [a, b, c, d] = young;
    const plan = () => api().settings.getYouthLaunchPlan(saveId, { policy: "YOUTH", lineupByAssistant: true });
    const named = (players: readonly Marked[]) => players.map((player) => expect.objectContaining({ playerKey: player.key }));

    await setMarks([c, d]);
    expect(await plan()).toEqual({ kind: "targets", byMarks: true, players: named([c, d]) });
    await setMarks([]);
    expect(await plan()).toEqual({ kind: "targets", byMarks: false, players: named([a, b]) });
    expect(await api().settings.getYouthLaunchPlan(saveId, { policy: "YOUTH", lineupByAssistant: false })).toEqual({ kind: "byPlayer" });
    expect(await api().settings.getYouthLaunchPlan(saveId, { policy: "BEST", lineupByAssistant: true })).toBeNull();
  });

  it("puts the marked players on the assistant's bench after its backup goalkeeper under « Lancer les jeunes » alone", async () => {
    const [, b, c] = young;
    await setMarks([c, b]);
    await setPolicy("YOUTH");
    const { lineup } = await api().lineup.getManagedLineup(saveId);
    expect(lineup.youthEntries).toEqual([c.key, b.key]);
    expect(lineup.starters.map(({ player }) => player.id)).not.toContain(c.key);
    expect(lineup.bench.map((player) => player.position)[0]).toBe("GK");
    expect(lineup.bench.slice(1, 3).map((player) => player.id)).toEqual([c.key, b.key]);

    await setPolicy("BEST");
    expect((await api().lineup.getManagedLineup(saveId)).lineup.youthEntries).toBeUndefined();
  });

  it("keeps an injured or a suspended player's mark, leaving him out of the match while he is, and back once he is not", async () => {
    const [a, b, c] = young;
    const { db } = api();
    await setPolicy("YOUTH");
    await setMarks([a, b, c]);
    await db.playerSave.update({ where: { id: a.id, saveId }, data: { injuredUntil: new Date(WORLD_START_DATE.getTime() + 60 * 86_400_000) } });
    await db.playerSave.update({ where: { id: b.id, saveId }, data: { suspendedMatches: 1 } });
    try {
      expect(await api().launches.readYouthLaunches(db, saveId)).toEqual(keys([a, b, c]));
      expect((await api().lineup.getManagedLineup(saveId)).lineup.youthEntries).toEqual([c.key]);
      // Nor does marking him again write anything, his mark held.
      expect(await mark(a)).toEqual({ ok: true, launches: keys([a, b, c]) });
      expect((await api().players.getPlayerProfiles(saveId, { id: a.id }))[0]?.youthLaunch?.marked).toBe(true);
    } finally {
      await db.playerSave.update({ where: { id: a.id, saveId }, data: { injuredUntil: null } });
      await db.playerSave.update({ where: { id: b.id, saveId }, data: { suspendedMatches: 0 } });
    }
    expect((await api().lineup.getManagedLineup(saveId)).lineup.youthEntries).toEqual(keys([a, b, c]));
  });

  it("takes the mark of a goalkeeper or of a player past 21 out at once, the list written cleaned", async () => {
    const [a, b, c] = young;
    const { db } = api();
    await setMarks([a, b, c]);
    // Neither happens to a player during a season: the game never moves a position, nor an age on 1 July.
    const { position } = await db.playerSave.findUniqueOrThrow({ where: { id: a.id, saveId }, select: { position: true } });
    await db.playerSave.update({ where: { id: a.id, saveId }, data: { position: "GK" } });
    await db.playerSave.update({ where: { id: b.id, saveId }, data: { birthDate: born(WORLD_START_YEAR - 22, 5, 30) } });
    try {
      expect(await api().launches.readYouthLaunches(db, saveId)).toEqual([c.key]);
      expect((await api().lineup.getManagedLineup(saveId)).lineup.youthEntries ?? []).not.toContain(a.key);
      expect(await mark(young[3])).toEqual({ ok: true, launches: [c.key, young[3].key] });
      expect(await marksOf()).toEqual([c.key, young[3].key]);
    } finally {
      await db.playerSave.update({ where: { id: a.id, saveId }, data: { position } });
      await db.playerSave.update({ where: { id: b.id, saveId }, data: { birthDate: born(WORLD_START_YEAR - 19) } });
    }
  });

  it("drops a released or a sold player's mark at once, and his alone", async () => {
    const [a, b, c] = young;
    const { db, transfers } = api();
    await setMarks([a, b, c]);
    expect(await transfers.releasePlayer({ saveId, playerSaveId: a.id })).toMatchObject({ ok: true });
    expect(await marksOf()).toEqual(keys([b, c]));

    // A player some AI club buys, made young enough, marked, then sold.
    const club = await db.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
    const candidates = await db.playerSave.findMany({
      where: { saveId, clubSaveId: club.id, position: { not: "GK" }, id: { notIn: young.map((player) => player.id) } },
      orderBy: [{ overall: "desc" }, { playerKey: "asc" }],
      select: { id: true, playerKey: true },
    });
    const reserves = candidates.slice(11);
    await db.playerSave.updateMany({ where: { saveId, id: { in: reserves.map((reserve) => reserve.id) } }, data: { birthDate: born(WORLD_START_YEAR - 20) } });
    try {
      const terms = await transfers.quoteSquad(saveId);
      const sold = reserves.find((reserve) => terms.get(reserve.id)?.sale.ok === true);
      if (sold === undefined) {
        throw new Error("No player of the club with a buyer");
      }
      expect(await mark({ id: sold.id, key: sold.playerKey })).toEqual({ ok: true, launches: [b.key, c.key, sold.playerKey] });
      expect(await transfers.sellPlayer({ saveId, playerSaveId: sold.id })).toMatchObject({ ok: true });
      expect(await marksOf()).toEqual(keys([b, c]));
    } finally {
      // The others as they were: 27 on 1 July.
      await db.playerSave.updateMany({
        where: { saveId, clubSaveId: club.id, id: { in: reserves.map((reserve) => reserve.id) } },
        data: { birthDate: born(1999) },
      });
    }
  });

  it("answers the sheet's action in words, the save's owner checked, every screen of the save read again", async () => {
    const [, b, c, d] = young;
    const { actions } = api();
    await setMarks([b, c]);
    viewer.current = { id: owner };
    expect(await actions.setYouthLaunchAction(saveId, d.id, true)).toEqual({
      ok: true,
      message: "Sous « Lancer les jeunes », ton adjoint le fera entrer en championnat quand il ne démarre pas.",
    });
    expect(revalidatePath).toHaveBeenLastCalledWith(`/saves/${saveId}`, "layout");
    expect(await actions.setYouthLaunchAction(saveId, keeper.id, true)).toEqual({
      ok: false,
      message: "Seul un joueur de champ du club de 21 ans ou moins peut être lancé.",
    });
    expect(await actions.setYouthLaunchAction(saveId, d.id, false)).toEqual({ ok: true, message: "Il ne fait plus partie des jeunes que ton adjoint lance." });
    expect(await actions.setYouthLaunchAction(saveId, d.id, "oui" as unknown as boolean)).toEqual({
      ok: false,
      message: "Choix invalide : le lancer, ou ne plus le lancer.",
    });
    await setMarks([b, c, d]);
    expect(await actions.setYouthLaunchAction(saveId, young[0].id, true)).toEqual({
      ok: false,
      message: "Seul un joueur de champ du club de 21 ans ou moins peut être lancé.",
    });

    viewer.current = { id: "someone-else" };
    try {
      await expect(actions.setYouthLaunchAction(saveId, b.id, false)).rejects.toThrow();
    } finally {
      viewer.current = { id: owner };
    }
    expect(await marksOf()).toEqual(keys([b, c, d]));
  });

  it("refuses a fourth mark in words", async () => {
    const [, b, c, d] = young;
    await setMarks([b, c]);
    // A fourth young player of the club: the older one made 20.
    await api().db.playerSave.update({ where: { id: older.id, saveId }, data: { birthDate: born(WORLD_START_YEAR - 20) } });
    try {
      await setMarks([b, c, d]);
      viewer.current = { id: owner };
      expect(await api().actions.setYouthLaunchAction(saveId, older.id, true)).toEqual({
        ok: false,
        message: "Tu lances déjà trois jeunes : retires-en un d'abord.",
      });
    } finally {
      await api().db.playerSave.update({ where: { id: older.id, saveId }, data: { birthDate: born(WORLD_START_YEAR - 22, 5, 30) } });
    }
  });

  it("brings the marked players on at the hour of a league match, from the bench", async () => {
    const [, b, c] = young;
    const { db, matchday } = api();
    await setPolicy("YOUTH");
    await setMarks([b, c]);
    await matchday.playNextMatchday(saveId);
    const club = await db.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { competitionId: true } });
    const season = await db.season.findFirstOrThrow({
      where: { saveId, competitionId: club.competitionId, startYear: WORLD_START_YEAR },
      select: { id: true },
    });
    const stats = await db.playerSeasonStats.findMany({
      where: { saveId, seasonId: season.id, playerSaveId: { in: [b.id, c.id] } },
      select: { playerSaveId: true, appearances: true, starts: true, minutes: true },
    });
    for (const player of [b, c]) {
      const line = stats.find((row) => row.playerSaveId === player.id);
      expect(line, player.key).toMatchObject({ appearances: 1, starts: 0 });
      expect(line?.minutes ?? 0, player.key).toBeGreaterThanOrEqual(25);
    }
  }, 120_000);

  it("drops at the season's turn the mark of a player gone free or past 21 on the new 1 July, and keeps the others", async () => {
    const { db, contracts, season } = api();
    const prepared = await prepare(turnSaveId);
    const [gone, staying, other] = prepared.young;
    // 21 on this 1 July, 22 on the next: his birthday the day after it.
    const turning = other;
    await db.playerSave.update({ where: { id: turning.id, saveId: turnSaveId }, data: { birthDate: born(WORLD_START_YEAR - 22, 6, 2) } });
    await setPolicy("YOUTH", turnSaveId);
    await setMarks([gone, staying, turning], turnSaveId);
    // His contract ends with the season and he leaves on a free; the others' run on.
    const club = await db.clubSave.findFirstOrThrow({ where: { saveId: turnSaveId, isManaged: true }, select: { id: true } });
    await db.playerSave.updateMany({
      where: { saveId: turnSaveId, clubSaveId: club.id },
      data: { contractUntil: seasonEndDate(WORLD_START_YEAR + 2) },
    });
    await db.playerSave.update({ where: { id: gone.id, saveId: turnSaveId }, data: { contractUntil: seasonEndDate(WORLD_START_YEAR) } });
    expect(await contracts.setContractChoice({ saveId: turnSaveId, playerSaveId: gone.id, choice: "LEAVE" })).toMatchObject({ ok: true });
    // The season over: every match marked played.
    await db.fixture.updateMany({
      where: { saveId: turnSaveId },
      data: { played: true, status: "PLAYED", homeGoals: 1, awayGoals: 1, homeHalfTimeGoals: 0, awayHalfTimeGoals: 0 },
    });

    await season.advanceToNextSeason(turnSaveId);
    const goneRow = await db.playerSave.findUniqueOrThrow({ where: { id: gone.id, saveId: turnSaveId }, select: { clubSaveId: true } });
    expect(goneRow.clubSaveId).not.toBe(club.id);
    expect(await marksOf(turnSaveId)).toEqual([staying.key]);
  }, 300_000);
});
