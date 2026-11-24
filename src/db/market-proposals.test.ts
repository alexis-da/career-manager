import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SIGNING_BONUS_MIN, SQUAD_LIMIT } from "../engine/balance";
import { displayClubName } from "../engine/club-name";
import { marketValueFor, signingBonus } from "../engine/economy";
import { elevenOf, MARKET_ENTRIES, MAX_PROPOSALS_PER_ENTRY } from "../engine/market-proposals";
import { clubColorsOf } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import type { prisma as prismaClient } from "./client";
import type * as LineupModule from "./lineup";
import type * as MarketModule from "./market";
import type { getMarketProposals, MarketProposal, MarketProposals } from "./market-proposals";
import type * as TransfersModule from "./transfers";

type Loaded = {
  db: typeof prismaClient;
  proposals: typeof getMarketProposals;
  lineups: typeof LineupModule;
  market: typeof MarketModule;
  transfers: typeof TransfersModule;
  saveId: string;
  first: MarketProposals;
};

// Checks the proposals of the demo save, against DATABASE_URL. Skipped without it. The demo save is created on the
// first run when missing (a whole season to play, hence the long hook timeout) and kept for later runs; these tests only
// read it. Modules are imported lazily because the client throws without DATABASE_URL.
describe.skipIf(process.env.DATABASE_URL === undefined)("getMarketProposals on the demo save", () => {
  let state: Loaded | undefined;

  const loaded = (): Loaded => {
    if (state === undefined) {
      throw new Error("Demo save not loaded");
    }
    return state;
  };

  /** Every proposal of every entry, a player once. */
  const proposed = (): MarketProposal[] => [
    ...new Map(MARKET_ENTRIES.flatMap((entry) => loaded().first.entries[entry]).map((proposal) => [proposal.id, proposal])).values(),
  ];

  beforeAll(async () => {
    const [{ prisma }, { getMarketProposals: proposals }, lineups, market, transfers, { ensureDemoSave }] = await Promise.all([
      import("./client"),
      import("./market-proposals"),
      import("./lineup"),
      import("./market"),
      import("./transfers"),
      import("./test-support"),
    ]);
    const saveId = await ensureDemoSave();
    state = { db: prisma, proposals, lineups, market, transfers, saveId, first: await proposals(saveId) };
  }, 900_000);

  afterAll(async () => {
    await state?.db.$disconnect();
  });

  it("gives the same result twice", async () => {
    const { proposals, saveId, first } = loaded();

    expect(await proposals(saveId)).toEqual(first);
  });

  it("finds the weak spot in the eleven: a slot held out of line first, else the starter rated lowest", async () => {
    const { lineups, saveId, first } = loaded();
    // The eleven the market weighs (docs/design/simplification.md § 3.4).
    const { formation, weakSpotLineup } = await lineups.getManagedLineup(saveId);
    const eleven = elevenOf(formation, weakSpotLineup.starters);
    const outOfLine = eleven.filter((slot) => slot.outOfLine === true);
    const pool = outOfLine.length > 0 ? outOfLine : eleven;
    const lowest = Math.min(...pool.map(({ rating }) => rating ?? 0));

    expect(weakSpotLineup.starters).toHaveLength(11);
    expect(eleven.map(({ rating }) => rating)).not.toContain(null);
    expect(first.weakSpot).toEqual({
      position: pool.find(({ rating }) => rating === lowest)?.slot,
      rating: Math.round(lowest),
      reason: outOfLine.length > 0 ? "outOfLine" : "lowest",
    });
  });

  it("proposes something in every entry, within the limit", () => {
    const { first } = loaded();

    for (const entry of MARKET_ENTRIES) {
      expect(first.entries[entry].length, entry).toBeGreaterThan(0);
      expect(first.entries[entry].length, entry).toBeLessThanOrEqual(MAX_PROPOSALS_PER_ENTRY);
    }
  });

  it("proposes nobody of the managed club, and no retired player", async () => {
    const { db, market, saveId } = loaded();
    const ids = proposed().map((proposal) => proposal.id);
    const overview = await market.getMarketOverview(saveId);

    expect(await db.playerSave.count({ where: { saveId, id: { in: ids }, clubSave: { saveId, isManaged: true } } })).toBe(0);
    expect(await db.transfer.count({ where: { saveId, playerSaveId: { in: ids }, type: "RETIREMENT" } })).toBe(0);
    expect(proposed().filter((proposal) => proposal.clubName === overview.clubName)).toEqual([]);
  });

  it("only proposes players who would accept, at a price the budget pays, whatever their wage", async () => {
    const { market, transfers, saveId } = loaded();
    const overview = await market.getMarketOverview(saveId);

    for (const { id: playerSaveId, askingPrice, askedWage } of proposed()) {
      const quote = await transfers.quoteTransfer({ saveId, playerSaveId });

      expect(quote).toMatchObject({ askingPrice, minimumWage: askedWage });
      expect(quote.minimumReputation).toBeLessThanOrEqual(overview.reputation);
      expect(askingPrice).toBeLessThanOrEqual(overview.budget);
    }
  }, 30_000);

  it("proposes players of the AI clubs, and a free agent only at his signing bonus", () => {
    const freeAgents = proposed().filter((proposal) => proposal.clubName === null);

    // A free agent is no longer free (docs/design/simplification.md § 1.3): at a quarter of his value or so, he may be
    // none of the first ones for a club of this level. The equivalence tests propose some, on a small budget.
    expect(freeAgents.length).toBeLessThan(proposed().length);
    for (const proposal of freeAgents) {
      expect(proposal).toMatchObject({ clubColors: null, askingPrice: signingBonus(proposal.marketValue) });
      expect(proposal.askingPrice).toBeGreaterThanOrEqual(SIGNING_BONUS_MIN);
    }
  });

  it("says the squad is not full, and that no entry is wage-bound any more", async () => {
    const { db, market, saveId, first } = loaded();
    const overview = await market.getMarketOverview(saveId);
    const managed = await db.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });

    expect(overview.squadSize).toBe(await db.playerSave.count({ where: { saveId, clubSaveId: managed.id, retired: false } }));
    expect(overview.squadSize).toBeLessThan(SQUAD_LIMIT);
    expect(first.squadFull).toBe(false);
    expect(first.wageBound).toEqual({ needs: false, gems: false, bargains: false, stars: false });
  });

  it("fills identities, clubs and attributes from the save", async () => {
    const { db, market, saveId } = loaded();
    const { currentDate } = await market.getMarketOverview(saveId);
    const rows = await db.playerSave.findMany({
      where: { saveId, id: { in: proposed().map((proposal) => proposal.id) } },
      select: {
        id: true,
        playerKey: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        position: true,
        overall: true,
        potential: true,
        pace: true,
        shooting: true,
        passing: true,
        dribbling: true,
        defending: true,
        physical: true,
        goalkeeping: true,
        clubSave: { select: { club: { select: { slug: true, name: true, primaryColor: true, secondaryColor: true } } } },
      },
    });
    const rowById = new Map(rows.map((row) => [row.id, row]));

    for (const proposal of proposed()) {
      const row = getOrThrow(rowById, proposal.id, "proposed player");
      const age = ageInYears(row.birthDate, currentDate);
      const club = row.clubSave?.club ?? null;

      expect(proposal.firstName).not.toBe("");
      expect(proposal.lastName).not.toBe("");
      expect(proposal).toMatchObject({
        playerKey: row.playerKey,
        firstName: row.firstName,
        lastName: row.lastName,
        age,
        position: row.position,
        overall: row.overall,
        potential: row.potential,
        clubName: club === null ? null : displayClubName(club),
        clubColors: club === null ? null : clubColorsOf(club),
        marketValue: marketValueFor({ age, overall: row.overall, potential: row.potential }),
      });
      expect(proposal.attributes).toEqual({
        pace: row.pace,
        shooting: row.shooting,
        passing: row.passing,
        dribbling: row.dribbling,
        defending: row.defending,
        physical: row.physical,
        goalkeeping: row.goalkeeping,
      });
    }
  });

  it("keeps the screen's shape, nothing more", () => {
    const [proposal] = loaded().first.entries.stars;

    expect(Object.keys(loaded().first).sort()).toEqual(["entries", "squadFull", "wageBound", "weakSpot"]);
    expect(Object.keys(proposal).sort()).toEqual(
      [
        "age",
        "askedWage",
        "askingPrice",
        "attributes",
        "clubColors",
        "clubName",
        "firstName",
        "id",
        "impact",
        "lastName",
        "marketValue",
        "overall",
        "playerKey",
        "position",
        "potential",
        "slot",
        "tag",
      ].sort(),
    );
  });
});
