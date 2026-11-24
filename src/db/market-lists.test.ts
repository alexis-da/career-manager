import "dotenv/config";
import { beforeAll, describe, expect, it } from "vitest";
import { displayClubName } from "../engine/club-name";
import { primariesWithSecondary, secondaryPositions } from "../engine/positions";
import type { Prisma } from "../generated/prisma/client";
import { clubColorsOf } from "../lib/color";
import { ageInYears } from "../lib/dates";
import type { ClubPlayerRow, MarketFilters } from "./market";

const PAGE_SIZE = 50;
const EUROS_PER_MILLION = 1_000_000;

// The filters of the list's URL, as the page reads them (marketFiltersSchema fills the sort, its direction and the page).
const FILTER_SETS: Record<string, string>[] = [
  {},
  { dir: "asc" },
  { minOverall: "70" },
  { position: "ST" },
  { position: "GK", dir: "asc" },
  { position: "CB", withSecondary: "1" },
  { competition: "fr.1" },
  { competition: "en.2", dir: "asc" },
  { maxAge: "17" },
  { maxAge: "21" },
  { maxAge: "28", dir: "asc" },
  { q: "an" },
  { q: "ma ar" },
  { maxPrice: "2.5" },
  { sort: "price" },
  { sort: "price", dir: "asc" },
  { position: "CM", minOverall: "65", maxAge: "25" },
  { competition: "it.1", maxAge: "30", dir: "asc" },
  { position: "LW", withSecondary: "1", maxPrice: "10", sort: "price", dir: "asc" },
];

// The list of the AI clubs' players, now filtered, counted and paged by the database (listClubPlayers), against the one it
// gave before (reference, below, as it was then: every candidate read, filtered, sorted and paged in memory), for many
// filters and pages on the demo saves of both worlds. Read only, against DATABASE_URL; skipped without it. The demo saves
// are created on the first run when missing (a whole season to play, hence the long hook timeout) and kept for later
// runs. Modules are imported lazily because the client throws without DATABASE_URL.
describe.skipIf(process.env.DATABASE_URL === undefined)("the AI clubs' players, paged by the database", () => {
  const saveIds: string[] = [];

  beforeAll(async () => {
    const { ensureDemoSave } = await import("./test-support");
    saveIds.push(await ensureDemoSave(1), await ensureDemoSave(2));
  }, 600_000);

  /** The whole list as listClubPlayers sorted it before the database paged it: every page of it, in order. */
  async function reference(saveId: string, filters: MarketFilters): Promise<ClubPlayerRow[]> {
    const { prisma } = await import("./client");
    const { quoteFor } = await import("./transfers");
    const { currentDate } = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
    const words = (filters.q ?? "").split(/\s+/).filter((word) => word !== "");
    const where: Prisma.PlayerSaveWhereInput = {
      saveId,
      clubSave: {
        saveId,
        isManaged: false,
        ...(filters.competition === undefined ? {} : { competition: { code: filters.competition } }),
      },
      ...(filters.position === undefined
        ? {}
        : {
            position:
              filters.withSecondary === undefined
                ? filters.position
                : { in: [filters.position, ...primariesWithSecondary(filters.position)] },
          }),
      ...(filters.minOverall === undefined ? {} : { overall: { gte: filters.minOverall } }),
      AND: words.map((word) => ({
        OR: [
          { firstName: { contains: word, mode: "insensitive" as const } },
          { lastName: { contains: word, mode: "insensitive" as const } },
        ],
      })),
    };
    const players = await prisma.playerSave.findMany({
      where,
      select: {
        id: true,
        playerKey: true,
        firstName: true,
        lastName: true,
        nationality: true,
        position: true,
        birthDate: true,
        overall: true,
        potential: true,
        wage: true,
        contractUntil: true,
        clubSave: {
          select: {
            isManaged: true,
            reputation: true,
            club: { select: { slug: true, name: true, primaryColor: true, secondaryColor: true } },
          },
        },
      },
    });
    const maxPrice = filters.maxPrice === undefined ? undefined : Math.round(filters.maxPrice * EUROS_PER_MILLION);
    const entries = players.flatMap((player) => {
      if (player.clubSave === null) {
        return [];
      }
      if (
        filters.position !== undefined &&
        player.position !== filters.position &&
        !secondaryPositions(player.playerKey, player.position).includes(filters.position)
      ) {
        return [];
      }
      const age = ageInYears(player.birthDate, currentDate);
      const quote = quoteFor(player, player.clubSave, currentDate);
      if ((filters.maxAge !== undefined && age > filters.maxAge) || (maxPrice !== undefined && quote.askingPrice > maxPrice)) {
        return [];
      }
      const row: ClubPlayerRow = {
        id: player.id,
        playerKey: player.playerKey,
        firstName: player.firstName,
        lastName: player.lastName,
        nationality: player.nationality,
        clubName: displayClubName(player.clubSave.club),
        clubColors: clubColorsOf(player.clubSave.club),
        position: player.position,
        age,
        overall: player.overall,
        potential: player.potential,
        askingPrice: quote.askingPrice,
        minimumReputation: quote.minimumReputation,
        contractUntil: player.contractUntil,
      };
      return [{ key: player.playerKey, row }];
    });
    const sign = filters.dir === "asc" ? 1 : -1;
    entries.sort((a, b) => {
      const byPrice = a.row.askingPrice - b.row.askingPrice;
      const byOverall = a.row.overall - b.row.overall;
      const byKey = a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
      return sign * (filters.sort === "price" ? byPrice || byOverall : byOverall || byPrice) || byKey;
    });
    return entries.map((entry) => entry.row);
  }

  it("gives every page of every filter as before, totals included", async () => {
    const { listClubPlayers, marketFiltersSchema } = await import("./market");
    let compared = 0;
    for (const saveId of saveIds) {
      for (const values of FILTER_SETS) {
        const filters = marketFiltersSchema.parse(values);
        const all = await reference(saveId, filters);
        if (Object.keys(values).length === 0) {
          expect(all.length).toBeGreaterThan(1000);
        }
        const pageCount = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
        // The first pages, one in the middle, the last, and one past it (the last again).
        const pages = [...new Set([1, 2, 3, Math.ceil(pageCount / 2), pageCount, pageCount + 4])];
        for (const page of pages) {
          const shown = Math.min(page, pageCount);
          const list = await listClubPlayers(saveId, { ...filters, page });
          expect(list, `${JSON.stringify(values)}, page ${page}`).toEqual({
            total: all.length,
            page: shown,
            pageCount,
            rows: all.slice((shown - 1) * PAGE_SIZE, shown * PAGE_SIZE),
          });
          compared++;
        }
      }
    }
    // Both saves, every filter: the list is never empty by accident.
    expect(compared).toBeGreaterThan(FILTER_SETS.length * 2 * 3);
  }, 120_000);
});
