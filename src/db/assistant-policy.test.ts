import "dotenv/config";
import { revalidatePath } from "next/cache";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { importantPlayers } from "../engine/assistant-contracts";
import type { AssistantPolicy } from "../engine/assistant-policy";
import { formationPositions } from "../engine/formations";
import { selectAssistantLineup, selectRestedLineup } from "../engine/lineup";
import type { Position } from "../engine/positions";
import { squadStandard } from "../engine/squad-ai";
import { seasonEndDate, seasonStartDate, WORLD_START_YEAR } from "../engine/world";
import { ageInYears } from "../lib/dates";
import type { prisma as prismaClient } from "./client";
import type { LineupEditor, ManagedLineup } from "./lineup";

// The assistant's policy (docs/design/effectif-adjoint.md § 2) in the database: the eleven a league match plays, simulated
// and live, the contracts the screens tell ahead and the turn decides, and the action of Club → Réglages. Runs against
// DATABASE_URL on throwaway world-1 saves and is skipped without it; modules are imported lazily because the client
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
  return { getTranslations: async (namespace: "assistantSettings") => testTranslator("fr", namespace) };
});

type Db = typeof prismaClient;

/** Born on 1 January of `year`. */
const bornIn = (year: number): Date => new Date(Date.UTC(year, 0, 1));

// A season's first league matchday, on three twins of the demo save: its Lyon under « Meilleur onze », the game before the
// policies, and under « Lancer les jeunes », simulated and live. Their Jeunesse objective set aside (Solidité chosen), and
// nobody young enough on 1 July but four reserves, made 19, each at a position of the eleven, three points below its
// weakest starter there, with ten points of room.
describe.skipIf(process.env.DATABASE_URL === undefined)("the assistant's policy in a league match", () => {
  let db: Db | undefined;
  const saves = { best: "", youth: "", live: "" };
  const before: Partial<Record<keyof typeof saves, { editor: LineupEditor; managed: ManagedLineup }>> = {};
  const young: { key: string; overall: number }[] = [];

  const database = (): Db => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };
  const read = (name: keyof typeof saves) => {
    const views = before[name];
    if (views === undefined) {
      throw new Error(`Nothing read of the ${name} twin`);
    }
    return views;
  };

  /** The keys of the managed club's starters of its first league match, played: one league start each. */
  const startersOf = async (saveId: string): Promise<string[]> => {
    const club = await database().clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, competitionId: true } });
    const season = await database().season.findFirstOrThrow({
      where: { saveId, competitionId: club.competitionId, startYear: WORLD_START_YEAR },
      select: { id: true },
    });
    const rows = await database().playerSeasonStats.findMany({
      where: { saveId, seasonId: season.id, starts: 1, playerSave: { clubSaveId: club.id } },
      select: { playerSave: { select: { playerKey: true } } },
    });
    return rows.map(({ playerSave }) => playerSave.playerKey).sort();
  };

  /** Every match played so far, by its clubs: the managed club's apart, or the others'. */
  const scoresOf = async (saveId: string, managed: boolean): Promise<string[]> => {
    const fixtures = await database().fixture.findMany({
      where: { saveId, played: true },
      select: {
        homeGoals: true,
        awayGoals: true,
        homeClubSave: { select: { isManaged: true, club: { select: { slug: true } } } },
        awayClubSave: { select: { isManaged: true, club: { select: { slug: true } } } },
      },
    });
    return fixtures
      .filter((fixture) => (fixture.homeClubSave.isManaged || fixture.awayClubSave.isManaged) === managed)
      .map((fixture) => `${fixture.homeClubSave.club.slug} ${fixture.homeGoals}-${fixture.awayGoals} ${fixture.awayClubSave.club.slug}`)
      .sort();
  };

  /** A twin made ready: Solidité its objective, only the four young enough, the policy given. */
  const prepare = async (saveId: string, policy: AssistantPolicy): Promise<void> => {
    const db = database();
    const club = await db.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, competitionId: true } });
    const season = await db.season.findFirstOrThrow({
      where: { saveId, competitionId: club.competitionId, startYear: WORLD_START_YEAR },
      select: { id: true },
    });
    await db.seasonObjective.updateMany({ where: { saveId, seasonId: season.id, imposed: false }, data: { chosen: false } });
    await db.seasonObjective.upsert({
      where: { seasonId_kind: { seasonId: season.id, kind: "SOLIDITY" } },
      create: { saveId, seasonId: season.id, kind: "SOLIDITY", imposed: false, chosen: true, target: 40 },
      update: { chosen: true },
    });
    await db.playerSave.updateMany({ where: { saveId, clubSaveId: club.id }, data: { birthDate: bornIn(1995) } });
    for (const { key, overall } of young) {
      await db.playerSave.updateMany({
        where: { saveId, clubSaveId: club.id, playerKey: key },
        data: { birthDate: bornIn(WORLD_START_YEAR - 19), overall, potential: overall + 10 },
      });
    }
    await db.save.update({ where: { id: saveId }, data: { assistantPolicy: policy } });
  };

  beforeAll(async () => {
    const [{ prisma }, support, matchday, lineup, live] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./matchday"),
      import("./lineup"),
      import("./live-match"),
    ]);
    db = prisma;
    saves.best = await support.createDemoTwin("Test consigne · meilleur onze");
    saves.youth = await support.createDemoTwin("Test consigne · lancer les jeunes");
    saves.live = await support.createDemoTwin("Test consigne · lancer les jeunes en direct");

    // The four young players, read on the first twin: the three others are the same squad.
    const { players, formation } = await lineup.getLineupEditor(saves.best);
    const rested = selectRestedLineup(players, formationPositions(formation));
    const starting = new Set(rested.starters.map(({ player }) => player.id));
    const weakestAt = (position: Position): number =>
      Math.min(...rested.starters.filter(({ player, slot }) => slot === position && player.position === position).map(({ player }) => player.overall));
    const positions = new Set<Position>();
    for (const { player, slot } of rested.starters) {
      const reserve = players.find((other) => !starting.has(other.id) && other.position === slot);
      if (slot === "GK" || player.position !== slot || positions.has(slot) || reserve === undefined || young.length === 4) {
        continue;
      }
      positions.add(slot);
      young.push({ key: reserve.id, overall: weakestAt(slot) - 3 });
    }
    expect(young).toHaveLength(4);

    for (const [name, saveId] of Object.entries(saves) as [keyof typeof saves, string][]) {
      await prepare(saveId, name === "best" ? "BEST" : "YOUTH");
      before[name] = { editor: await lineup.getLineupEditor(saveId), managed: await lineup.getManagedLineup(saveId) };
    }
    await matchday.playNextMatchday(saves.best);
    await matchday.playNextMatchday(saves.youth);
    // Live, the assistant deciding at every pause and nothing changed: the match simulated.
    await matchday.playNextMatchday(saves.live, { pauseManagedMatch: true });
    for (let pause = await live.getLivePause(saves.live); pause !== null; pause = await live.getLivePause(saves.live)) {
      await live.advanceLiveMatch(saves.live, { phase: pause.phase, minute: pause.minute }, {}, "segment");
    }
  }, 300_000);

  afterAll(async () => {
    await db?.save.deleteMany({ where: { id: { in: Object.values(saves).filter((id) => id !== "") } } });
    await db?.$disconnect();
  }, 120_000);

  it("plays under « Meilleur onze » the eleven of the game before the policies: the rested one, its young players unread", async () => {
    const { editor, managed } = read("best");
    const rested = selectRestedLineup(editor.players, formationPositions(editor.formation));

    expect(editor.policy).toBe("BEST");
    expect(editor.youth).toBeNull();
    expect(managed.lineup).toEqual(rested);
    expect(await startersOf(saves.best)).toEqual(rested.starters.map(({ player }) => player.id).sort());
  });

  it("starts under « Lancer les jeunes » three of its young players in a league match, as the rule says", async () => {
    const { editor, managed } = read("youth");
    const positions = formationPositions(editor.formation);
    const expected = selectAssistantLineup(editor.players, positions, editor.youth ?? null);
    const restedKeys = selectRestedLineup(editor.players, positions).starters.map(({ player }) => player.id);
    const startedKeys = expected.starters.map(({ player }) => player.id);

    expect(editor.policy).toBe("YOUTH");
    expect(editor.youth?.starter).toBeNull();
    expect([...(editor.youth?.prospects ?? [])].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      young
        .map(({ key, overall }) => ({ id: key, seasonAge: 19, potential: overall + 10, leagueStarts: 0 }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(managed.lineup).toEqual(expected);
    // Three of the four, ahead of the rating: the policy's most a match; none of them in the rested eleven.
    const youngKeys = young.map(({ key }) => key);
    expect(restedKeys.filter((key) => youngKeys.includes(key))).toEqual([]);
    expect(startedKeys.filter((key) => !restedKeys.includes(key)).filter((key) => youngKeys.includes(key))).toHaveLength(3);
    expect(startedKeys.filter((key) => !restedKeys.includes(key))).toHaveLength(3);
    expect(await startersOf(saves.youth)).toEqual([...startedKeys].sort());
  });

  it("kicks off live with that very eleven, and plays the match simulated, its assistant deciding", async () => {
    expect(read("live").managed.lineup).toEqual(read("youth").managed.lineup);
    expect(await startersOf(saves.live)).toEqual(await startersOf(saves.youth));
    expect(await scoresOf(saves.live, true)).toEqual(await scoresOf(saves.youth, true));
  });

  it("leaves every other club's match as it was", async () => {
    const others = await scoresOf(saves.best, false);
    expect(others.length).toBeGreaterThan(0);
    expect(await scoresOf(saves.youth, false)).toEqual(others);
  });
});

const LAST_CONTRACT_DAY = seasonEndDate(WORLD_START_YEAR);
const RUNNING_CONTRACT_DAY = seasonEndDate(WORLD_START_YEAR + 3);
const TURN = seasonStartDate(WORLD_START_YEAR + 1);
const FEBRUARY = new Date(Date.UTC(WORLD_START_YEAR + 1, 1, 3));

// The managed club's contracts ending on 30 June under each policy: on a throwaway world-1 save on 3 February of its first
// season, every contract of its club running past it but two, a starter aged 30 on the turn's day rated 3 points under
// the squad's standard (kept by « Meilleur onze », let go by « Lancer les jeunes »), and a substitute aged 23 whose
// potential reaches the standard minus 3 but not the standard (the other way round). What the sheet and « À faire » tell,
// then what the turn does.
describe.skipIf(process.env.DATABASE_URL === undefined)("the assistant's policy in the contracts", () => {
  let db: Db | undefined;
  let modules:
    | {
        players: typeof import("./players");
        dashboard: typeof import("./dashboard");
        settings: typeof import("./assistant-settings");
        preseason: typeof import("./preseason");
      }
    | undefined;
  let saveId = "";
  let veteran = { id: "", name: "" };
  let prospect = { id: "", name: "" };

  const api = () => {
    if (modules === undefined || db === undefined) {
      throw new Error("Modules not loaded");
    }
    return { ...modules, db };
  };
  const intentionsOf = async (playerSaveId: string) => {
    const [profile] = await api().players.getPlayerProfiles(saveId, { id: playerSaveId });
    return { contractIntention: profile.contractIntention, assistantIntention: profile.assistantIntention };
  };

  beforeAll(async () => {
    const [{ prisma }, { createSave }, players, dashboard, settings, preseason, lineup, { createTestOwner }] = await Promise.all([
      import("./client"),
      import("./saves"),
      import("./players"),
      import("./dashboard"),
      import("./assistant-settings"),
      import("./preseason"),
      import("./lineup"),
      import("./test-support"),
    ]);
    db = prisma;
    modules = { players, dashboard, settings, preseason };
    const { id: clubId } = await prisma.club.findUniqueOrThrow({ where: { slug: "olympique-lyonnais" }, select: { id: true } });
    saveId = (
      await createSave({ name: "Test consigne et contrats", managerName: "Test", clubId, seed: "assistant-policy", ownerId: await createTestOwner(), worldVersion: 1 })
    ).id;
    await prisma.save.update({ where: { id: saveId }, data: { currentDate: FEBRUARY } });
    const managed = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, formation: true } });
    await prisma.playerSave.updateMany({ where: { saveId, clubSaveId: managed.id }, data: { contractUntil: RUNNING_CONTRACT_DAY } });
    const select = { id: true, playerKey: true, firstName: true, lastName: true, position: true, birthDate: true, overall: true, potential: true } as const;
    const squadOf = () => prisma.playerSave.findMany({ where: { saveId, clubSaveId: managed.id }, orderBy: { playerKey: "asc" }, select });
    const standardOf = (rows: Awaited<ReturnType<typeof squadOf>>): number =>
      squadStandard(rows.map((row) => ({ ...row, id: row.playerKey, age: ageInYears(row.birthDate, TURN), wage: 0, contractExpiring: false })));
    const importantOf = (rows: Awaited<ReturnType<typeof squadOf>>) =>
      importantPlayers(
        rows.map((row) => ({ id: row.playerKey, position: row.position, overall: row.overall })),
        formationPositions(lineup.parseFormation(managed.formation)),
      );

    const squad = await squadOf();
    const standard = standardOf(squad);
    const important = importantOf(squad);
    const byOverall = (a: (typeof squad)[number], b: (typeof squad)[number]): number => a.overall - b.overall || (a.playerKey < b.playerKey ? -1 : 1);
    // The eleven's weakest outfield player, rated 3 points under the standard and made 30 on the turn's day.
    const starter = squad.filter((row) => important.has(row.playerKey) && row.position !== "GK").sort(byOverall)[0];
    // The squad's weakest outfield substitute, made 23 with a potential 3 points under the standard, rounded up.
    const substitute = squad.filter((row) => !important.has(row.playerKey) && row.position !== "GK").sort(byOverall)[0];
    await prisma.playerSave.update({
      where: { id: starter.id, saveId },
      data: { contractUntil: LAST_CONTRACT_DAY, birthDate: bornIn(WORLD_START_YEAR - 29), overall: Math.round(standard) - 3 },
    });
    await prisma.playerSave.update({
      where: { id: substitute.id, saveId },
      data: { contractUntil: LAST_CONTRACT_DAY, birthDate: bornIn(WORLD_START_YEAR - 22), potential: Math.ceil(standard - 3) },
    });
    veteran = { id: starter.id, name: `${starter.firstName.charAt(0)}. ${starter.lastName}` };
    prospect = { id: substitute.id, name: `${substitute.firstName.charAt(0)}. ${substitute.lastName}` };

    // The rule's own figures, once they are set: the policies' two bars fall between them.
    const after = await squadOf();
    const level = standardOf(after);
    const old = after.find((row) => row.id === veteran.id);
    const young = after.find((row) => row.id === prospect.id);
    expect(old !== undefined && old.overall >= level - 5 && old.overall < level - 2).toBe(true);
    expect(young !== undefined && young.potential >= level - 3 && young.potential < level && young.overall < level - 5).toBe(true);
    expect(importantOf(after).has(starter.playerKey)).toBe(true);
  }, 300_000);

  afterAll(async () => {
    await db?.save.deleteMany({ where: { id: saveId } });
    await db?.$disconnect();
  }, 120_000);

  it("tells under « Meilleur onze » the renewal of the veteran and the departure of the substitute, as before the policies", async () => {
    expect(await intentionsOf(veteran.id)).toEqual({ contractIntention: "renew", assistantIntention: "renew" });
    expect(await intentionsOf(prospect.id)).toEqual({ contractIntention: "leave", assistantIntention: "leave" });
    expect((await api().dashboard.getDashboard(saveId)).importantContracts).toEqual([]);
  });

  it("tells under « Lancer les jeunes » the other way round, and warns of the starter it lets go", async () => {
    await api().settings.setAssistantPolicy(saveId, "YOUTH");
    expect(await intentionsOf(veteran.id)).toEqual({ contractIntention: "leave", assistantIntention: "leave" });
    expect(await intentionsOf(prospect.id)).toEqual({ contractIntention: "renew", assistantIntention: "renew" });
    expect((await api().dashboard.getDashboard(saveId)).importantContracts).toEqual([veteran.name]);
  });

  it("decides them so at the season's turn", async () => {
    await api().db.save.update({ where: { id: saveId }, data: { currentDate: TURN } });
    const summary = await api().preseason.runPreseason(saveId);
    const rows = await api().db.playerSave.findMany({
      where: { saveId, id: { in: [veteran.id, prospect.id] } },
      select: { id: true, clubSaveId: true, contractUntil: true },
    });
    const row = (id: string) => rows.find((candidate) => candidate.id === id);

    expect(summary.contractMoves?.left.map(({ id, by }) => ({ id, by }))).toEqual([{ id: veteran.id, by: "assistant" }]);
    expect(summary.contractMoves?.renewed.map(({ id, by }) => ({ id, by }))).toEqual([{ id: prospect.id, by: "assistant" }]);
    expect(row(veteran.id)?.clubSaveId).toBeNull();
    expect(row(prospect.id)?.contractUntil?.getTime()).toBeGreaterThan(LAST_CONTRACT_DAY.getTime());
  });
});

// « Sa consigne » of Club → Réglages (docs/design/effectif-adjoint.md § 2.1): its Server Action, the save's owner checked,
// its choice validated, refused while a match waits live, as the assistant's switches are.
describe.skipIf(process.env.DATABASE_URL === undefined)("setAssistantPolicyAction", () => {
  let db: Db | undefined;
  let action: typeof import("../../app/saves/[id]/club/actions") | undefined;
  let saveId = "";
  let owner = "";

  const api = () => {
    if (action === undefined || db === undefined) {
      throw new Error("Modules not loaded");
    }
    return { action, db };
  };
  const policyOf = async (): Promise<AssistantPolicy> =>
    (await api().db.save.findUniqueOrThrow({ where: { id: saveId }, select: { assistantPolicy: true } })).assistantPolicy;

  beforeAll(async () => {
    const [{ prisma }, { createSave }, actions, { createTestOwner }] = await Promise.all([
      import("./client"),
      import("./saves"),
      import("../../app/saves/[id]/club/actions"),
      import("./test-support"),
    ]);
    db = prisma;
    action = actions;
    owner = await createTestOwner();
    const { id: clubId } = await prisma.club.findUniqueOrThrow({ where: { slug: "olympique-lyonnais" }, select: { id: true } });
    saveId = (await createSave({ name: "Test action de la consigne", managerName: "Test", clubId, seed: "assistant-policy-action", ownerId: owner, worldVersion: 1 })).id;
  }, 300_000);

  afterAll(async () => {
    await db?.save.deleteMany({ where: { id: saveId } });
    await db?.$disconnect();
  }, 120_000);

  it("chooses « Lancer les jeunes » for the save's owner, then « Meilleur onze » again, every screen of the save read again", async () => {
    viewer.current = { id: owner };
    expect(await policyOf()).toBe("BEST");

    expect(await api().action.setAssistantPolicyAction(saveId, "YOUTH")).toEqual({ ok: true, message: "Consigne de ton adjoint : Lancer les jeunes." });
    expect(await policyOf()).toBe("YOUTH");
    expect(revalidatePath).toHaveBeenLastCalledWith(`/saves/${saveId}`, "layout");

    expect(await api().action.setAssistantPolicyAction(saveId, "BEST")).toEqual({ ok: true, message: "Consigne de ton adjoint : Meilleur onze." });
    expect(await policyOf()).toBe("BEST");
  });

  it("refuses a policy the game does not have, and any while a match waits live, writing nothing", async () => {
    viewer.current = { id: owner };
    expect(await api().action.setAssistantPolicyAction(saveId, "ROTATION" as AssistantPolicy)).toEqual({ ok: false, message: "Ce réglage n'existe pas." });

    // Any id: the settings only read whether a match waits (Save.liveFixtureId has no foreign key).
    await api().db.save.update({ where: { id: saveId }, data: { liveFixtureId: "test-live-fixture" } });
    try {
      expect(await api().action.setAssistantPolicyAction(saveId, "YOUTH")).toEqual({
        ok: false,
        message: "Ton match attend la reprise : joue la suite avant de changer ce réglage.",
      });
    } finally {
      await api().db.save.update({ where: { id: saveId }, data: { liveFixtureId: null } });
    }
    expect(await policyOf()).toBe("BEST");
  });

  it("answers another player as for a save that does not exist, writing nothing", async () => {
    viewer.current = { id: "someone-else" };
    try {
      await expect(api().action.setAssistantPolicyAction(saveId, "YOUTH")).rejects.toThrow();
    } finally {
      viewer.current = { id: owner };
    }
    expect(await policyOf()).toBe("BEST");
  });
});
