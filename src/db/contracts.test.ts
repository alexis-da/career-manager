import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importantPlayers } from "../engine/assistant-contracts";
import { formationPositions } from "../engine/formations";
import type { Position } from "../engine/positions";
import { squadStandard } from "../engine/squad-ai";
import { seasonEndDate, seasonStartDate, WORLD_START_YEAR } from "../engine/world";
import { ageInYears } from "../lib/dates";
import type { prisma as prismaClient } from "./client";

const LAST_CONTRACT_DAY = seasonEndDate(WORLD_START_YEAR);
const RUNNING_CONTRACT_DAY = seasonEndDate(WORLD_START_YEAR + 3);
const TURN = seasonStartDate(WORLD_START_YEAR + 1);
const FEBRUARY = new Date(Date.UTC(WORLD_START_YEAR + 1, 1, 3));
const OCTOBER = new Date(Date.UTC(WORLD_START_YEAR, 9, 14));

type SquadRow = {
  id: string;
  playerKey: string;
  firstName: string;
  lastName: string;
  position: Position;
  birthDate: Date;
  overall: number;
  potential: number;
};

const shortName = ({ firstName, lastName }: { firstName: string; lastName: string }): string => `${firstName.charAt(0)}. ${lastName}`;

// The managed club's contracts ending on 30 June as its screens tell them (docs/design/simplification.md § 2.2, 2.3): its
// player's choice, what the turn will do with each on his sheet, and the dashboard's one alert, for an important player
// the assistant means to let go. On a throwaway world-1 save on 3 February of its first season, every contract of its
// club running past it but three: a starter under the squad's standard aged 34 on the turn's day, a substitute, and a
// young prospect. Runs against DATABASE_URL and is skipped without it; modules are imported lazily because the client
// throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the managed club's contracts ending on 30 June, on its screens", () => {
  let db: typeof prismaClient | undefined;
  let modules:
    | { contracts: typeof import("./contracts"); players: typeof import("./players"); dashboard: typeof import("./dashboard") }
    | undefined;
  let saveId = "";
  let club = { id: "", clubId: "" };
  let starter: SquadRow | undefined;
  let substitute: SquadRow | undefined;
  let prospect: SquadRow | undefined;
  let stayer: SquadRow | undefined;
  let rival = "";

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };
  const api = () => {
    if (modules === undefined) {
      throw new Error("Modules not loaded");
    }
    return modules;
  };
  const found = (row: SquadRow | undefined): SquadRow => {
    if (row === undefined) {
      throw new Error("The squad was not set up");
    }
    return row;
  };

  /** The sheet of a player of the save. */
  const profileOf = async (playerSaveId: string) => {
    const [profile] = await api().players.getPlayerProfiles(saveId, { id: playerSaveId });
    return profile;
  };
  const choose = (player: SquadRow | string, choice: "RENEW" | "LEAVE" | null) =>
    api().contracts.setContractChoice({ saveId, playerSaveId: typeof player === "string" ? player : player.id, choice });

  beforeAll(async () => {
    const [{ prisma }, { createSave }, contracts, players, dashboard, lineup, { createTestOwner }] = await Promise.all([
      import("./client"),
      import("./saves"),
      import("./contracts"),
      import("./players"),
      import("./dashboard"),
      import("./lineup"),
      import("./test-support"),
    ]);
    db = prisma;
    modules = { contracts, players, dashboard };
    const { id: clubId } = await prisma.club.findUniqueOrThrow({ where: { slug: "olympique-lyonnais" }, select: { id: true } });
    saveId = (
      await createSave({ name: "Test fins de contrat", managerName: "Test", clubId, seed: "contract-ends", ownerId: await createTestOwner(), worldVersion: 1 })
    ).id;
    await prisma.save.update({ where: { id: saveId }, data: { currentDate: FEBRUARY } });
    const managed = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, clubId: true, formation: true } });
    club = { id: managed.id, clubId: managed.clubId };
    await prisma.playerSave.updateMany({ where: { saveId, clubSaveId: managed.id }, data: { contractUntil: RUNNING_CONTRACT_DAY } });
    const squad: SquadRow[] = await prisma.playerSave.findMany({
      where: { saveId, clubSaveId: managed.id },
      orderBy: { playerKey: "asc" },
      select: { id: true, playerKey: true, firstName: true, lastName: true, position: true, birthDate: true, overall: true, potential: true },
    });

    // The rule's own figures: the squad's standard, the eleven in the club's formation.
    const standard = squadStandard(
      squad.map((row) => ({ ...row, id: row.playerKey, age: ageInYears(row.birthDate, TURN), wage: 0, contractExpiring: false })),
    );
    const important = importantPlayers(
      squad.map((row) => ({ id: row.playerKey, position: row.position, overall: row.overall })),
      formationPositions(lineup.parseFormation(managed.formation)),
    );
    const byOverall = (a: SquadRow, b: SquadRow): number => a.overall - b.overall || (a.playerKey < b.playerKey ? -1 : 1);
    // The eleven's weakest outfield player under the standard, aged 34 on the turn's day: past 32, he would have to reach it.
    starter = squad.filter((row) => important.has(row.playerKey) && row.position !== "GK" && row.overall < standard).sort(byOverall)[0];
    // The squad's weakest outfield player, aged 28: let go too, but no starter.
    const bench = squad.filter((row) => !important.has(row.playerKey) && row.position !== "GK").sort(byOverall);
    substitute = bench[0];
    // Another substitute, made 20 with a potential above the standard: a prospect, renewed.
    prospect = bench.at(-1);
    stayer = squad.find((row) => row !== starter && row !== substitute && row !== prospect);
    const [chosenStarter, chosenSubstitute, chosenProspect] = [found(starter), found(substitute), found(prospect)];
    expect(chosenSubstitute.overall).toBeLessThan(standard - 5);
    expect(chosenProspect).not.toBe(chosenSubstitute);
    await prisma.playerSave.update({
      where: { id: chosenStarter.id, saveId },
      data: { contractUntil: LAST_CONTRACT_DAY, birthDate: new Date(Date.UTC(WORLD_START_YEAR - 33, 0, 1)) },
    });
    await prisma.playerSave.update({
      where: { id: chosenSubstitute.id, saveId },
      data: { contractUntil: LAST_CONTRACT_DAY, birthDate: new Date(Date.UTC(WORLD_START_YEAR - 27, 0, 1)) },
    });
    await prisma.playerSave.update({
      where: { id: chosenProspect.id, saveId },
      data: { contractUntil: LAST_CONTRACT_DAY, birthDate: new Date(Date.UTC(WORLD_START_YEAR - 19, 0, 1)), potential: 95 },
    });
    // A player of an AI club whose contract ends too: his club decides it.
    const other = await prisma.playerSave.findFirstOrThrow({
      where: { saveId, clubSaveId: { not: null }, NOT: { clubSaveId: managed.id } },
      orderBy: { playerKey: "asc" },
      select: { id: true },
    });
    await prisma.playerSave.update({ where: { id: other.id, saveId }, data: { contractUntil: LAST_CONTRACT_DAY } });
    rival = other.id;
  }, 300_000);

  afterAll(async () => {
    await db?.save.deleteMany({ where: { id: saveId } });
    await db?.$disconnect();
  }, 120_000);

  it("reads a stored choice and a turn's moves only when they are the rule's", () => {
    const { contractChoiceOf, parseContractMoves } = api().contracts;
    expect(contractChoiceOf("RENEW")).toBe("RENEW");
    expect(contractChoiceOf("LEAVE")).toBe("LEAVE");
    expect(contractChoiceOf("MAYBE")).toBeNull();
    expect(contractChoiceOf(null)).toBeNull();
    const moves = {
      byAssistant: true,
      renewed: [{ id: "p1", firstName: "Jean", lastName: "Morel", until: "2029-06-30T00:00:00.000Z", by: "assistant" }],
      left: [{ id: "p2", firstName: "Yann", lastName: "Roux", by: "default" }],
      signed: [{ id: "p3", firstName: "Luc", lastName: "Blanc", position: "GK", bonus: 900_000 }],
      youths: 2,
      squad: 25,
    };
    expect(parseContractMoves(moves)).toEqual(moves);
    expect(parseContractMoves(null)).toBeNull();
    expect(parseContractMoves({ ...moves, squad: -1 })).toBeNull();
    expect(parseContractMoves({ ...moves, left: [{ id: "p2", firstName: "Yann", lastName: "Roux", by: "nobody" }] })).toBeNull();
  });

  it("tells on a sheet what the turn will do: the assistant lets the old starter and the substitute go, renews the prospect", async () => {
    const [ending, other, running] = [await profileOf(found(starter).id), await profileOf(found(prospect).id), await profileOf(found(stayer).id)];

    expect(ending).toMatchObject({ managed: true, contractExpiring: true, contractChoice: null, contractIntention: "leave", assistantIntention: "leave" });
    expect(await profileOf(found(substitute).id)).toMatchObject({ contractIntention: "leave", assistantIntention: "leave" });
    expect(other).toMatchObject({ contractExpiring: true, contractChoice: null, contractIntention: "renew", assistantIntention: "renew" });
    // Nothing to tell of a contract running past the season, nor of an AI club's: it decides its own.
    expect(running).toMatchObject({ contractExpiring: false, contractChoice: null, contractIntention: null, assistantIntention: null });
    expect(await profileOf(rival)).toMatchObject({ managed: false, contractExpiring: true, contractChoice: null, contractIntention: null });
    // The squad's sheets, read together, tell the same.
    const squad = await api().players.getPlayerProfiles(saveId, { clubSaveId: club.id });
    expect(squad.find((profile) => profile.id === found(starter).id)).toMatchObject({ contractIntention: "leave", assistantIntention: "leave" });
  });

  it("alerts the dashboard from 1 January of the one starter the assistant means to let go, never of the substitute", async () => {
    const dashboard = await api().dashboard.getDashboard(saveId);
    expect(dashboard.contractsByAssistant).toBe(true);
    expect(dashboard.importantContracts).toEqual([shortName(found(starter))]);
    expect([...dashboard.expiringContracts].sort()).toEqual([shortName(found(starter)), shortName(found(substitute)), shortName(found(prospect))].sort());

    await database().save.update({ where: { id: saveId }, data: { currentDate: OCTOBER } });
    try {
      const autumn = await api().dashboard.getDashboard(saveId);
      expect(autumn.importantContracts).toEqual([]);
      expect(autumn.expiringContracts).toEqual([]);
    } finally {
      await database().save.update({ where: { id: saveId }, data: { currentDate: FEBRUARY } });
    }
  });

  it("keeps the player's choice, which the sheet and the dashboard follow, and takes it back", async () => {
    expect(await choose(found(starter), "RENEW")).toEqual({ ok: true, byAssistant: true });
    expect(await profileOf(found(starter).id)).toMatchObject({ contractChoice: "RENEW", contractIntention: "renew", assistantIntention: "leave" });
    expect((await api().dashboard.getDashboard(saveId)).importantContracts).toEqual([]);

    // Let go by his own player: nothing to alert of either.
    expect(await choose(found(starter), "LEAVE")).toEqual({ ok: true, byAssistant: true });
    expect(await profileOf(found(starter).id)).toMatchObject({ contractChoice: "LEAVE", contractIntention: "leave", assistantIntention: "leave" });
    expect((await api().dashboard.getDashboard(saveId)).importantContracts).toEqual([]);

    // Kept for the prospect against the rule: the assistant would have renewed him.
    expect(await choose(found(prospect), "LEAVE")).toEqual({ ok: true, byAssistant: true });
    expect(await profileOf(found(prospect).id)).toMatchObject({ contractChoice: "LEAVE", contractIntention: "leave", assistantIntention: "renew" });

    expect(await choose(found(starter), null)).toEqual({ ok: true, byAssistant: true });
    expect(await choose(found(prospect), null)).toEqual({ ok: true, byAssistant: true });
    expect(await profileOf(found(starter).id)).toMatchObject({ contractChoice: null, contractIntention: "leave" });
    expect((await api().dashboard.getDashboard(saveId)).importantContracts).toEqual([shortName(found(starter))]);
  });

  it("refuses a choice for a contract running past the season, an AI club's player, or nobody, writing nothing", async () => {
    expect(await choose(found(stayer), "LEAVE")).toEqual({ ok: false });
    expect(await choose(rival, "RENEW")).toEqual({ ok: false });
    expect(await choose("no-such-player", "RENEW")).toEqual({ ok: false });
    expect(await database().playerSave.count({ where: { saveId, contractChoice: { not: null } } })).toBe(0);
    await expect(api().contracts.setContractChoice({ saveId, playerSaveId: found(starter).id, choice: "MAYBE" as "LEAVE" })).rejects.toThrow();
  });

  it("tells every contract ending while the player keeps them, the assistant having nothing to say", async () => {
    await database().save.update({ where: { id: saveId }, data: { contractsByAssistant: false } });
    try {
      const dashboard = await api().dashboard.getDashboard(saveId);
      expect(dashboard.contractsByAssistant).toBe(false);
      expect(dashboard.importantContracts).toEqual([]);
      expect(dashboard.expiringContracts).toHaveLength(3);
      expect(await profileOf(found(prospect).id)).toMatchObject({ contractChoice: null, contractIntention: "leave", assistantIntention: null });
      expect(await choose(found(prospect), "RENEW")).toEqual({ ok: true, byAssistant: false });
      expect(await profileOf(found(prospect).id)).toMatchObject({ contractChoice: "RENEW", contractIntention: "renew", assistantIntention: null });
    } finally {
      await choose(found(prospect), null);
      await database().save.update({ where: { id: saveId }, data: { contractsByAssistant: true } });
    }
  });
});
