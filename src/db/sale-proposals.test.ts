import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formationPositions, isFormationName } from "../engine/formations";
import { selectLineup } from "../engine/lineup";
import { SALE_PROPOSALS_SHOWN } from "../engine/sale-proposals";
import type { prisma as prismaClient } from "./client";
import type * as SaleProposalsModule from "./sale-proposals";
import type * as TransfersModule from "./transfers";

const SEED = "sale-proposals-test";
const MANAGED_SLUG = "liverpool-fc";
const WINTER = new Date(Date.UTC(2027, 0, 12));
const SUMMER = new Date(Date.UTC(2027, 6, 15));
const OUTSIDE = new Date(Date.UTC(2027, 1, 10));
const PLAYED = 12; // the club's matches played: 10 % of its minutes is 108

// The sales the assistant proposes (docs/design/simplification.md § 5.1), against DATABASE_URL on a throwaway save
// managing Liverpool: twelve of its league matches marked played, every player of its squad given his starts and minutes
// in them, then read in a winter window, outside a window, in a summer window, and from the season's archive. Skipped
// without DATABASE_URL. Modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the sales the assistant proposes", () => {
  let db: typeof prismaClient | undefined;
  let api: typeof SaleProposalsModule | undefined;
  let transfers: typeof TransfersModule | undefined;
  let saveId = "";
  let club = { id: "", clubId: "", formation: "" };
  let leagueSeasonId = "";

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };
  const proposals = (): typeof SaleProposalsModule => {
    if (api === undefined) {
      throw new Error("Sale proposals module not loaded");
    }
    return api;
  };
  const sales = (): typeof TransfersModule => {
    if (transfers === undefined) {
      throw new Error("Transfers module not loaded");
    }
    return transfers;
  };

  const setDate = (currentDate: Date) => database().save.update({ where: { id: saveId }, data: { currentDate } });
  const proposedIds = async (): Promise<string[]> => (await proposals().getSaleProposals(saveId)).proposals.map(({ id }) => id);
  const setFigures = (playerSaveId: string, figures: { starts: number; minutes: number }) =>
    database().playerSeasonStats.update({
      where: { saveId_seasonId_playerSaveId: { saveId, seasonId: leagueSeasonId, playerSaveId } },
      data: { ...figures, appearances: figures.minutes > 0 ? 1 : 0 },
    });
  /** The club's league matches in date order, the first `count` of them played 1-0, the others not. */
  const playMatches = async (count: number): Promise<void> => {
    const fixtures = await database().fixture.findMany({
      where: { saveId, seasonId: leagueSeasonId, OR: [{ homeClubSaveId: club.id }, { awayClubSaveId: club.id }] },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const played = fixtures.slice(0, count).map(({ id }) => id);
    await database().fixture.updateMany({
      where: { saveId, id: { in: played } },
      data: { played: true, status: "PLAYED", homeGoals: 1, awayGoals: 0, homeHalfTimeGoals: 0, awayHalfTimeGoals: 0 },
    });
    await database().fixture.updateMany({
      where: { saveId, id: { in: fixtures.map(({ id }) => id).filter((id) => !played.includes(id)) } },
      data: { played: false, status: "SCHEDULED", homeGoals: null, awayGoals: null, homeHalfTimeGoals: null, awayHalfTimeGoals: null },
    });
  };

  beforeAll(async () => {
    const [{ prisma }, { createSave }, saleProposalsModule, transfersModule, { createTestOwner }] = await Promise.all([
      import("./client"),
      import("./saves"),
      import("./sale-proposals"),
      import("./transfers"),
      import("./test-support"),
    ]);
    db = prisma;
    api = saleProposalsModule;
    transfers = transfersModule;
    const { id: clubId } = await prisma.club.findUniqueOrThrow({ where: { slug: MANAGED_SLUG }, select: { id: true } });
    saveId = (
      await createSave({ name: "Test ventes proposées", managerName: "Test", clubId, seed: SEED, ownerId: await createTestOwner(), worldVersion: 1 })
    ).id;
    club = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, clubId: true, formation: true } });
    const { competitionId } = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { competitionId: true } });
    ({ id: leagueSeasonId } = await prisma.season.findFirstOrThrow({ where: { saveId, competitionId, startYear: 2026 }, select: { id: true } }));
    await playMatches(PLAYED);
    // Nobody played: the rule picks among those the assistant does not need, the figures are changed one player at a time.
    const players = await prisma.playerSave.findMany({ where: { saveId, clubSaveId: club.id }, select: { id: true } });
    await prisma.playerSeasonStats.deleteMany({ where: { saveId, seasonId: leagueSeasonId } });
    await prisma.playerSeasonStats.createMany({
      data: players.map(({ id }) => ({ saveId, seasonId: leagueSeasonId, playerSaveId: id, appearances: 0, starts: 0, minutes: 0 })),
    });
    await setDate(WINTER);
  }, 300_000);

  afterAll(async () => {
    await db?.save.deleteMany({ where: { id: saveId } });
    await db?.$disconnect();
  }, 120_000);

  it("proposes in a winter window those the assistant does not need, the best offer first, each at today's offer", async () => {
    const { period, proposals: proposed } = await proposals().getSaleProposals(saveId);
    expect(period).toBe("season");
    expect(proposed.length).toBeGreaterThan(0);
    expect(proposed.length).toBeLessThanOrEqual(SALE_PROPOSALS_SHOWN);
    const fees = proposed.map(({ offer }) => offer.fee);
    expect(fees).toEqual([...fees].sort((a, b) => b - a));

    const { terms, buyers } = await sales().quoteSquadWithBuyers(saveId);
    const squad = await database().playerSave.findMany({
      where: { saveId, clubSaveId: club.id },
      select: { playerKey: true, position: true, overall: true },
    });
    if (!isFormationName(club.formation)) {
      throw new Error(`Unknown formation ${club.formation}`);
    }
    const fielded = selectLineup(
      squad.map((player) => ({ id: player.playerKey, position: player.position, overall: player.overall, injured: false })),
      formationPositions(club.formation),
    );
    const needed = new Set([...fielded.starters.map(({ player }) => player.id), ...fielded.bench.map(({ id }) => id)]);
    for (const proposal of proposed) {
      expect(needed.has(proposal.playerKey)).toBe(false);
      expect(proposal).toMatchObject({ starts: 0, minutes: 0 });
      const sale = terms.get(proposal.id)?.sale;
      expect(sale?.ok && { fee: sale.fee, buyerName: sale.buyerName }).toEqual({ fee: proposal.offer.fee, buyerName: proposal.offer.buyerName });
      expect(buyers.get(proposal.id)).toBe(proposal.offer.buyerId);
    }
  });

  it("leaves out a player with three starts, or more than a tenth of the club's minutes", async () => {
    const [first] = await proposedIds();
    await setFigures(first, { starts: 3, minutes: 0 });
    expect(await proposedIds()).not.toContain(first);
    // Twelve matches: 108 minutes are a tenth of the club's.
    await setFigures(first, { starts: 2, minutes: 108 });
    expect(await proposedIds()).toContain(first);
    await setFigures(first, { starts: 2, minutes: 109 });
    expect(await proposedIds()).not.toContain(first);
    await setFigures(first, { starts: 0, minutes: 0 });
    expect(await proposedIds()).toContain(first);
  });

  it("proposes nothing over fewer than ten matches of the club, nor outside a window", async () => {
    await playMatches(9);
    expect(await proposals().getSaleProposals(saveId)).toEqual({ period: "season", proposals: [] });
    await playMatches(PLAYED);

    await setDate(OUTSIDE);
    expect(await proposals().getSaleProposals(saveId)).toEqual({ period: null, proposals: [] });
    const [player] = await database().playerSave.findMany({ where: { saveId, clubSaveId: club.id }, take: 1, select: { id: true } });
    expect(await proposals().keepSaleProposal(saveId, player.id)).toBeNull();
    await setDate(WINTER);
  });

  it("keeps a player out of the proposals until the window closes, « Garder »", async () => {
    const [first] = await proposedIds();
    const { lastName } = await database().playerSave.findUniqueOrThrow({ where: { id: first }, select: { lastName: true } });
    expect(await proposals().keepSaleProposal(saveId, first)).toBe(lastName);
    const { saleKeptUntil } = await database().playerSave.findUniqueOrThrow({ where: { id: first }, select: { saleKeptUntil: true } });
    expect(saleKeptUntil).toEqual(new Date(Date.UTC(2027, 0, 31)));
    expect(await proposedIds()).not.toContain(first);
    // The next window proposes him again.
    await setDate(SUMMER);
    const summer = await proposals().getSaleProposals(saveId);
    expect(summer.period).toBe("last-season");
    expect(summer.proposals.length).toBeGreaterThan(0);
    await database().playerSave.update({ where: { id: first }, data: { saleKeptUntil: null } });
    await setDate(WINTER);
  });

  it("weighs the completed season in a summer window, without a player who joined the club after its first day", async () => {
    await setDate(SUMMER);
    const [first] = await proposedIds();
    expect(first).toBeDefined();
    // Joined on 10 July 2026, more than a year ago: no resale cap, but figures of the period that are not all the club's.
    const arrival = await database().transfer.create({
      data: { saveId, playerSaveId: first, fromClubId: null, toClubId: club.clubId, fee: 0, type: "FREE", date: new Date(Date.UTC(2026, 6, 10)) },
    });
    expect(await proposedIds()).not.toContain(first);
    await database().transfer.delete({ where: { id: arrival.id } });
    expect(await proposedIds()).toContain(first);
    await setDate(WINTER);
  });

  it("reads a completed season from its archive, never its rows", async () => {
    await setDate(SUMMER);
    const before = await proposals().getSaleProposals(saveId);
    await database().season.updateMany({ where: { saveId, startYear: 2026 }, data: { completed: true } });
    const { runArchivePass } = await import("./season-archiving");
    const pass = await runArchivePass(database(), { mode: "archive", saveIds: [saveId] });
    expect(pass).toMatchObject({ mismatches: 0 });
    expect(await database().seasonArchive.count({ where: { saveId, seasonId: leagueSeasonId } })).toBe(1);
    // The rows, which the archive keeps, now say that everyone played every match: nothing would be proposed from them.
    await database().playerSeasonStats.updateMany({ where: { saveId, seasonId: leagueSeasonId }, data: { starts: PLAYED, minutes: PLAYED * 90 } });
    expect(await proposals().getSaleProposals(saveId)).toEqual(before);
  });

  it("sells a proposed player at the offer his card shows, and nothing at another", async () => {
    const [proposal] = (await proposals().getSaleProposals(saveId)).proposals;
    const { budget } = await database().clubSave.findUniqueOrThrow({ where: { id: club.id }, select: { budget: true } });
    const changed = await sales().sellPlayer({
      saveId,
      playerSaveId: proposal.id,
      expected: { fee: proposal.offer.fee + 1, buyerId: proposal.offer.buyerId },
    });
    expect(changed).toEqual({
      ok: false,
      reason: "offer_changed",
      refusals: [],
      changedOffer: { fee: proposal.offer.fee, buyerName: proposal.offer.buyerName },
    });
    const other = await database().clubSave.findFirstOrThrow({ where: { saveId, isManaged: false, id: { not: proposal.offer.buyerId } }, select: { id: true } });
    expect(
      await sales().sellPlayer({ saveId, playerSaveId: proposal.id, expected: { fee: proposal.offer.fee, buyerId: other.id } }),
    ).toMatchObject({ ok: false, reason: "offer_changed" });
    expect((await database().clubSave.findUniqueOrThrow({ where: { id: club.id }, select: { budget: true } })).budget).toBe(budget);

    const sold = await proposals().acceptSaleProposal({ saveId, playerSaveId: proposal.id, fee: proposal.offer.fee, buyerId: proposal.offer.buyerId });
    expect(sold).toEqual({ ok: true, fee: proposal.offer.fee, player: proposal.lastName, club: proposal.offer.buyerName });
    const { clubSaveId } = await database().playerSave.findUniqueOrThrow({ where: { id: proposal.id }, select: { clubSaveId: true } });
    expect(clubSaveId).toBe(proposal.offer.buyerId);
    expect(await proposedIds()).not.toContain(proposal.id);
  });
});
