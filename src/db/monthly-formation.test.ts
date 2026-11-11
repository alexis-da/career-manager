import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chooseFormation, formationMonthOf } from "../engine/formation-choice";
import { formationPositions } from "../engine/formations";
import { selectRestedLineup, type SquadPlayer } from "../engine/lineup";
import { competitionTier } from "../engine/tiers";
import { firstMatchdayDate, WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

// The formation of AI clubs on a matchday (lineupOf, src/db/matchday.ts): the clubs of the managed club's country choose
// it before each match, the others at their first match of each month of the game, kept on their row for the rest of
// it. Plays the first date of a throwaway twin of the demo save (Lyon, France: every club plays that day), then deletes
// it. Runs against DATABASE_URL and is skipped without it; modules are imported lazily because the client throws
// without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the formation AI clubs of other countries keep for a month", () => {
  let db: typeof prismaClient | undefined;
  let saveId = "";
  const firstMatchday = firstMatchdayDate(WORLD_START_YEAR);
  const month = formationMonthOf(firstMatchday);
  // Three clubs of other countries: one keeping a formation chosen this month, one a formation of the month before, one
  // with none kept; their squads and divisions before the match, as the matchday reads them (squadsOf).
  const clubs = { keeping: "", stale: "", fresh: "" };
  const squads = new Map<string, SquadPlayer[]>();
  const tiers = new Map<string, number>();
  let managedCountry = "";

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  /** The keys of a club's starters in the match of the date, from its players' season stats. */
  const startersOf = async (clubSaveId: string): Promise<string[]> => {
    const rows = await database().playerSeasonStats.findMany({
      where: { saveId, starts: 1, playerSave: { clubSaveId } },
      select: { playerSave: { select: { playerKey: true } } },
    });
    return rows.map((row) => row.playerSave.playerKey).sort();
  };

  const keysOf = (players: readonly { player: SquadPlayer }[]): string[] => players.map(({ player }) => player.id).sort();

  beforeAll(async () => {
    const [{ prisma }, support, { playNextMatchday, squadsOf, PLAYER_SELECT }] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./matchday"),
    ]);
    db = prisma;
    saveId = await support.createDemoTwin("Test dispositif du mois");
    const managed = await prisma.clubSave.findFirstOrThrow({
      where: { saveId, isManaged: true },
      select: { competition: { select: { country: true } } },
    });
    managedCountry = managed.competition.country;
    const foreign = await prisma.clubSave.findMany({
      where: { saveId, competition: { country: { not: managedCountry } } },
      orderBy: { club: { slug: "asc" } },
      take: 3,
      select: { id: true, competition: { select: { tier: true } } },
    });
    [clubs.keeping, clubs.stale, clubs.fresh] = foreign.map((club) => club.id);
    for (const club of foreign) {
      tiers.set(club.id, club.competition.tier);
    }
    // Formations no squad chooses at the first date: what they play shows which one they kept.
    await prisma.clubSave.update({ where: { id: clubs.keeping }, data: { formation: "5-4-1", formationMonth: month } });
    await prisma.clubSave.update({ where: { id: clubs.stale }, data: { formation: "5-4-1", formationMonth: month - 1 } });
    const rows = await prisma.playerSave.findMany({ where: { saveId, clubSaveId: { in: foreign.map((club) => club.id) } }, select: PLAYER_SELECT });
    for (const [clubSaveId, squad] of squadsOf(rows, firstMatchday).squads) {
      squads.set(clubSaveId, squad);
    }
    await playNextMatchday(saveId);
  }, 120_000);

  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 60_000);

  it("plays the formation kept for the month, its eleven picked for the match, and keeps it", async () => {
    const squad = squads.get(clubs.keeping) ?? [];
    const row = await database().clubSave.findUniqueOrThrow({ where: { id: clubs.keeping }, select: { formation: true, formationMonth: true } });

    expect(row).toEqual({ formation: "5-4-1", formationMonth: month });
    expect(await startersOf(clubs.keeping)).toEqual(keysOf(selectRestedLineup(squad, formationPositions("5-4-1")).starters));
  });

  it("chooses again at its first match of another month, or with none kept, and keeps that one for the month", async () => {
    for (const clubSaveId of [clubs.stale, clubs.fresh]) {
      const chosen = chooseFormation(squads.get(clubSaveId) ?? [], competitionTier(tiers.get(clubSaveId) ?? 1));
      const row = await database().clubSave.findUniqueOrThrow({ where: { id: clubSaveId }, select: { formation: true, formationMonth: true } });

      expect(chosen.formation).not.toBe("5-4-1");
      expect(row).toEqual({ formation: chosen.formation, formationMonth: month });
      expect(await startersOf(clubSaveId)).toEqual(keysOf(chosen.lineup.starters));
    }
  });

  it("keeps a formation for every club of the other countries, none for the managed club's country", async () => {
    const rows = await database().clubSave.findMany({
      where: { saveId },
      select: { formationMonth: true, competition: { select: { country: true } } },
    });
    const home = rows.filter((row) => row.competition.country === managedCountry);
    const abroad = rows.filter((row) => row.competition.country !== managedCountry);

    expect(home.length).toBeGreaterThan(0);
    expect(abroad.length).toBeGreaterThan(home.length);
    expect(home.every((row) => row.formationMonth === null)).toBe(true);
    expect(abroad.every((row) => row.formationMonth === month)).toBe(true);
  });
});
