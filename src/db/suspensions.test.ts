import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { YELLOWS_PER_SUSPENSION } from "../engine/balance";
import type { Discipline } from "../engine/discipline";
import type { prisma as prismaClient } from "./client";

const ON_THE_LIMIT = YELLOWS_PER_SUSPENSION - 1;

const NOTHING = { suspended: false, suspendedLater: null, bookingRisks: [], bookingRiskNextMatch: false };

// The managed club's suspensions and yellow cards as the screens read them (lineup, profiles, dashboard, opponent, sales),
// on a throwaway save with the demo seed, a league-only world: its discipline written by hand, its first match to come.
// Runs against DATABASE_URL and is skipped without it; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("suspensions and yellow cards on the screens", () => {
  let db: typeof prismaClient | undefined;
  let saveId = "";
  let starters: string[] = []; // the saved eleven's keys, by slot
  let reserve = ""; // a player out of the eleven and off the bench

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  const discipline = (playerKey: string, data: Partial<Discipline>) =>
    database().playerSave.updateMany({ where: { saveId, playerKey }, data });

  beforeAll(async () => {
    const [{ prisma }, support, lineups] = await Promise.all([import("./client"), import("./test-support"), import("./lineup")]);
    db = prisma;
    saveId = await support.createDemoTwin("Test suspensions");

    // The automatic eleven, saved: the starters the match will miss are the saved ones.
    const { formation, lineup } = await lineups.getManagedLineup(saveId);
    starters = lineup.starters.map(({ player }) => player.id);
    await lineups.saveManagedLineup(saveId, {
      formation,
      lineup: {
        starters: lineup.starters.map(({ player, index }) => ({ slot: index, playerKey: player.id })),
        benchOrder: lineup.bench.map(({ id }) => id),
      },
    });
    const squad = (await lineups.getLineupEditor(saveId)).players.map(({ id }) => id);
    const benched = new Set(lineup.bench.map(({ id }) => id));
    reserve = squad.find((key) => !starters.includes(key) && !benched.has(key)) ?? "";

    // A starter sent off, one on four league yellows, one suspended in a cup this world does not have, a reserve on four.
    await discipline(starters[9], { suspendedMatches: 1 });
    await discipline(starters[6], { leagueYellows: ON_THE_LIMIT });
    await discipline(starters[2], { suspendedCupMatches: 1, cupYellows: ON_THE_LIMIT });
    await discipline(reserve, { leagueYellows: ON_THE_LIMIT });
  }, 120_000);

  // Deleting a save cascades to thousands of rows, slower while the other test files run: more than the default.
  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 60_000);

  it("leaves a suspended starter out of the line-up, still among the saved starters the match will miss", async () => {
    const { getLineupEditor, getManagedLineup } = await import("./lineup");
    const editor = await getLineupEditor(saveId);
    const byKey = new Map(editor.players.map((player) => [player.id, player]));

    expect(byKey.get(starters[9])).toMatchObject({ suspended: true, injured: false, discipline: { ...NOTHING, suspended: true } });
    expect(byKey.get(starters[6])).toMatchObject({
      suspended: false,
      discipline: { ...NOTHING, bookingRisks: [{ competition: "LEAGUE", yellows: ON_THE_LIMIT }], bookingRiskNextMatch: true },
    });
    // No cup in this world: nothing to say of a cup ban or cup yellows.
    expect(byKey.get(starters[2])).toMatchObject({ suspended: false, discipline: NOTHING });

    const managed = await getManagedLineup(saveId);
    const fielded = managed.lineup.starters.map(({ player }) => player.id);
    expect(fielded).toHaveLength(11);
    expect(fielded).not.toContain(starters[9]);
    expect(fielded).toContain(starters[6]);
    expect(managed.lineup.bench.map(({ id }) => id)).not.toContain(starters[9]);
    expect(managed.missingStarters.map(({ id, suspended }) => [id, suspended])).toEqual([[starters[9], true]]);
  });

  it("gives the managed club's profiles their discipline, and anyone else's none", async () => {
    const { getPlayerProfiles } = await import("./players");
    const managed = await database().clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
    const profiles = await getPlayerProfiles(saveId, { clubSaveId: managed.id });
    const byKey = new Map(profiles.map((profile) => [profile.playerKey, profile]));

    expect(byKey.get(starters[9])?.discipline).toEqual({ ...NOTHING, suspended: true });
    expect(byKey.get(reserve)?.discipline?.bookingRisks).toEqual([{ competition: "LEAGUE", yellows: ON_THE_LIMIT }]);
    expect(byKey.get(starters[0])?.discipline).toEqual(NOTHING);

    const other = await database().playerSave.findFirstOrThrow({
      where: { saveId, clubSave: { saveId, isManaged: false } },
      select: { id: true },
    });
    expect((await getPlayerProfiles(saveId, { id: other.id }))[0].discipline).toBeNull();
  });

  it("lists on the dashboard the players one booking from a suspension, by name", async () => {
    const { getDashboard } = await import("./dashboard");
    const players = await database().playerSave.findMany({
      where: { saveId, playerKey: { in: [starters[6], reserve] } },
      select: { firstName: true, lastName: true },
    });
    const expected = players
      .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr"))
      .map(({ firstName, lastName }) => ({ name: `${firstName.charAt(0)}. ${lastName}`, competitions: ["LEAGUE"] }));

    expect((await getDashboard(saveId)).bookingRisks).toEqual(expected);
  });

  it("keeps a suspended starter off the sales: he is of the eleven he comes back to", async () => {
    const { getMarketSales } = await import("./market-sales");
    const offered = (await getMarketSales(saveId)).rows.map(({ playerKey }) => playerKey);

    expect(offered).not.toContain(starters[9]);
    expect(offered).toContain(reserve);
  });

  it("leaves the suspended starter to the assistant once he makes the eleven: out of it, never offered for sale", async () => {
    const [{ setLineupByAssistant }, { getLineupEditor, getManagedLineup }, { getMarketSales }, { formationPositions }, { selectLineup }] =
      await Promise.all([
        import("./assistant-settings"),
        import("./lineup"),
        import("./market-sales"),
        import("../engine/formations"),
        import("../engine/lineup"),
      ]);
    await setLineupByAssistant(saveId, true);
    try {
      const [managed, editor] = await Promise.all([getManagedLineup(saveId), getLineupEditor(saveId)]);
      const fielded = managed.lineup.starters.map(({ player }) => player.id);
      const everyone = editor.players.map((player) => ({ ...player, injured: false, suspended: false }));
      const eleven = selectLineup(everyone, formationPositions(editor.formation)).starters.map(({ player }) => player.id);

      // He replaces him himself: no starter to do without, nothing to say on the dashboard.
      expect(managed.byAssistant).toBe(true);
      expect(managed.missingStarters).toEqual([]);
      expect(fielded).toHaveLength(11);
      expect(fielded).not.toContain(starters[9]);
      // His eleven with the whole squad available, the suspended one in it, stays off the sales.
      expect(managed.keptOffSales).toEqual(eleven);
      expect(editor.players.find((player) => player.id === starters[9])?.suspended).toBe(true);
      const offered = (await getMarketSales(saveId)).rows.map(({ playerKey }) => playerKey);
      expect(offered.filter((key) => eleven.includes(key))).toEqual([]);
      expect(offered).toContain(reserve);
    } finally {
      await setLineupByAssistant(saveId, false);
    }
  });

  it("leaves the next opponent's suspended starter out of his probable eleven", async () => {
    const { getOpponentPreview } = await import("./opponent");
    const before = await getOpponentPreview(saveId);
    const banned = before?.lineup.starters[0].player.id ?? "";
    await database().playerSave.updateMany({
      where: { saveId, playerKey: banned, clubSave: { saveId, isManaged: false } },
      data: { suspendedLeagueMatches: 1 },
    });

    const keys = (await getOpponentPreview(saveId))?.lineup.starters.map(({ player }) => player.id);
    expect(keys).toHaveLength(11);
    expect(keys).not.toContain(banned);
  });
});
