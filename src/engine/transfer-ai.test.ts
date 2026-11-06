import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import { WAGE_SALE_MIN_FEE_SHARE } from "./balance";
import { marketValueFor, wageFor } from "./economy";
import {
  askingPrice,
  biddingOrder,
  evaluateOffer,
  evaluateRenewal,
  minimumWage,
  planWageSales,
  saleBids,
  walkSaleBids,
  type BidderClub,
  type OfferPlayer,
  type WageSalePlayer,
} from "./transfer-ai";

const player = (overrides: Partial<OfferPlayer> = {}): OfferPlayer => ({
  age: 26,
  overall: 75,
  potential: 78,
  wage: 3_000_000,
  seasonsLeft: 3,
  ...overrides,
});

const SELLER = { reputation: 80 };
const BUYER = { reputation: 85 };

describe("askingPrice", () => {
  it("rises with the seasons left on the contract, around the market value", () => {
    const prices = [1, 2, 3, 4].map((seasonsLeft) => askingPrice(player({ seasonsLeft })));

    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(prices[0]).toBeLessThan(marketValueFor(player()));
    expect(prices[3]).toBeGreaterThan(marketValueFor(player()));
  });
});

describe("evaluateOffer", () => {
  it("is accepted at the asking price with a 10 % raise", () => {
    const target = player();
    const evaluation = evaluateOffer(target, SELLER, BUYER, askingPrice(target), 3_300_000);

    expect(evaluation).toMatchObject({ accepted: true, clubAccepts: true, playerAccepts: true, refusals: [] });
    expect(evaluation.minimumWage).toBe(3_300_000);
  });

  it("is refused by the club below the asking price", () => {
    const target = player();
    const evaluation = evaluateOffer(target, SELLER, BUYER, askingPrice(target) - 1, 3_300_000);

    expect(evaluation).toMatchObject({ accepted: false, clubAccepts: false, playerAccepts: true, refusals: ["fee_too_low"] });
  });

  it("is refused by the player without a 10 % raise", () => {
    const target = player();
    const evaluation = evaluateOffer(target, SELLER, BUYER, askingPrice(target), 3_299_999);

    expect(evaluation).toMatchObject({ accepted: false, clubAccepts: true, playerAccepts: false, refusals: ["wage_too_low"] });
  });

  it("is refused by the player for a club far below his current club or his level", () => {
    const target = player();
    const stepDown = evaluateOffer(target, SELLER, { reputation: 69 }, askingPrice(target), 3_300_000);
    const star = player({ overall: 90, potential: 90 });
    const tooSmall = evaluateOffer(star, { reputation: 60 }, { reputation: 74 }, askingPrice(star), 3_300_000);

    expect(stepDown.refusals).toEqual(["club_reputation_too_low"]);
    expect(evaluateOffer(target, SELLER, { reputation: 70 }, askingPrice(target), 3_300_000).accepted).toBe(true);
    expect(tooSmall.refusals).toEqual(["club_reputation_too_low"]);
  });

  it("lets a free agent sign without a fee for 90 % of his market wage, rounded up to the thousand", () => {
    const freeAgent = player({ seasonsLeft: 0, wage: 0 });
    const floor = minimumWage(freeAgent, null);

    expect(floor % 1_000).toBe(0);
    expect(floor).toBeGreaterThanOrEqual(wageFor(freeAgent) * 0.9);
    expect(floor).toBeLessThan(wageFor(freeAgent) * 0.9 + 1_000);
    expect(evaluateOffer(freeAgent, null, BUYER, 0, floor)).toMatchObject({ accepted: true, askingPrice: 0 });
    expect(evaluateOffer(freeAgent, null, BUYER, 0, floor - 1).refusals).toEqual(["wage_too_low"]);
  });
});

describe("evaluateRenewal", () => {
  it("asks for the higher of the current wage and the market wage", () => {
    const underpaid = player({ wage: 100_000 });
    const overpaid = player({ wage: 50_000_000 });

    expect(evaluateRenewal(underpaid, wageFor(underpaid))).toEqual({ accepted: true, minimumWage: wageFor(underpaid) });
    expect(evaluateRenewal(underpaid, wageFor(underpaid) - 1).accepted).toBe(false);
    expect(evaluateRenewal(overpaid, 50_000_000).accepted).toBe(true);
    expect(evaluateRenewal(overpaid, wageFor(overpaid)).accepted).toBe(false);
  });
});

describe("saleBids", () => {
  const bidders: BidderClub[] = [
    { slug: "rich", reputation: 88, budget: 500_000_000, wageRoom: 100_000_000 },
    { slug: "second", reputation: 84, budget: 500_000_000, wageRoom: 100_000_000 },
    { slug: "third", reputation: 82, budget: 500_000_000, wageRoom: 100_000_000 },
    { slug: "broke", reputation: 86, budget: 1_000_000, wageRoom: 100_000_000 },
    { slug: "no-wage-room", reputation: 87, budget: 500_000_000, wageRoom: 0 },
    { slug: "too-small", reputation: 60, budget: 500_000_000, wageRoom: 100_000_000 },
  ];

  it("only lets clubs the player would join and that can pay bid, best fee first, at his minimum wage", () => {
    const bids = saleBids(player(), SELLER, bidders, makeRng("sale"));

    expect(bids.map((bid) => bid.clubSlug).sort()).toEqual(["rich", "second", "third"]);
    expect(bids.map((bid) => bid.fee)).toEqual([...bids.map((bid) => bid.fee)].sort((a, b) => b - a));
    for (const bid of bids) {
      expect(bid.wage).toBe(3_300_000);
      expect(bid.years).toBeGreaterThanOrEqual(1);
      expect(bid.fee).toBeGreaterThanOrEqual(marketValueFor(player()) * 0.8 - 10_000);
      expect(bid.fee).toBeLessThanOrEqual(marketValueFor(player()) * 1.2 + 10_000);
    }
  });

  it("is deterministic and does not depend on the order of the clubs", () => {
    expect(saleBids(player(), SELLER, [...bidders].reverse(), makeRng("sale"))).toEqual(
      saleBids(player(), SELLER, bidders, makeRng("sale")),
    );
  });

  it("returns no bid when nobody can afford the player", () => {
    const poorClubs = bidders.map((club) => ({ ...club, budget: 1 }));

    expect(saleBids(player(), SELLER, poorClubs, makeRng("sale"))).toEqual([]);
  });
});

describe("walkSaleBids", () => {
  const ordered: BidderClub[] = [
    { slug: "rich", reputation: 88, budget: 500_000_000, wageRoom: 100_000_000 },
    { slug: "no-wage-room", reputation: 87, budget: 500_000_000, wageRoom: 0 },
    { slug: "broke", reputation: 86, budget: 1_000_000, wageRoom: 100_000_000 },
    { slug: "second", reputation: 84, budget: 500_000_000, wageRoom: 100_000_000 },
    { slug: "third", reputation: 82, budget: 500_000_000, wageRoom: 100_000_000 },
    { slug: "too-small", reputation: 60, budget: 500_000_000, wageRoom: 100_000_000 },
  ];
  /** A walk over the first `read` clubs, others left to read. */
  const walk = (clubs: BidderClub[], read: number) => walkSaleBids(player(), SELLER, clubs.slice(0, read), true, makeRng("sale"));

  it("needs every club down to the first the player would not join, then bids as saleBids", () => {
    // Three bids: the walk reads on to "too-small", under the 70 the player asks, and stops there with clubs left.
    expect([...ordered].reverse().sort(biddingOrder)).toEqual(ordered);
    for (let read = 0; read < ordered.length; read++) {
      expect(walk(ordered, read).done).toBe(false);
    }
    expect(walk(ordered, ordered.length)).toEqual({ bids: saleBids(player(), SELLER, ordered, makeRng("sale")), done: true });
  });

  it("is done at its fifth bid, without the clubs after", () => {
    const rich = Array.from({ length: 7 }, (_, index) => ({ ...ordered[0], slug: `rich-${index}`, reputation: 90 - index }));

    expect(walk(rich, 4)).toMatchObject({ done: false, bids: { length: 4 } });
    expect(walk(rich, 5)).toEqual({ bids: saleBids(player(), SELLER, rich, makeRng("sale")), done: true });
  });
});

describe("planWageSales", () => {
  /** A squad of 22: two stars paid 12 M€ and 9 M€, a goalkeeper paid 8 M€, and 19 players paid 1 M€ (2 goalkeepers). */
  const squad = (): WageSalePlayer[] => [
    { ...player({ overall: 80, potential: 80, wage: 12_000_000 }), id: "star", goalkeeper: false },
    { ...player({ overall: 78, potential: 79, wage: 9_000_000 }), id: "second", goalkeeper: false },
    { ...player({ overall: 77, potential: 77, wage: 8_000_000 }), id: "keeper", goalkeeper: true },
    ...Array.from({ length: 19 }, (_, index) => ({
      ...player({ overall: 62, potential: 64, wage: 1_000_000 }),
      id: `squad-${String(index).padStart(2, "0")}`,
      goalkeeper: index < 2,
    })),
  ];
  const payroll = (players: WageSalePlayer[]) => players.reduce((sum, member) => sum + member.wage, 0); // 48 M€
  const RICH: BidderClub = { slug: "rich", reputation: 90, budget: 500_000_000, wageRoom: 100_000_000 };
  const rngFor = (id: string) => makeRng(`wage-sales-test:${id}`);

  it("sells nothing for a club within its wage budget", () => {
    expect(planWageSales({ reputation: 60, wageBudget: 50_000_000 }, squad(), [RICH], rngFor)).toEqual([]);
  });

  it("sells the best-paid players first, and stops once the payroll is back within the budget", () => {
    // 48 M€ for a 30 M€ budget: the 12 M€ star and the 9 M€ second go, 27 M€ left.
    const sales = planWageSales({ reputation: 60, wageBudget: 30_000_000 }, squad(), [RICH], rngFor);
    const sold = new Set(sales.map((sale) => sale.playerId));

    expect(sales.map((sale) => sale.playerId)).toEqual(["star", "second"]);
    expect(payroll(squad().filter((member) => !sold.has(member.id)))).toBeLessThanOrEqual(30_000_000);
    for (const sale of sales) {
      const sold = squad().find((member) => member.id === sale.playerId);
      expect(sale.clubSlug).toBe("rich");
      expect(sale.fee).toBeGreaterThanOrEqual(WAGE_SALE_MIN_FEE_SHARE * marketValueFor(sold ?? player()));
    }
  });

  it("never sells under 80 % of the value: a player nobody can afford stays, and the next best paid is tried", () => {
    const star = squad()[0];
    // Enough budget for the second (value at 78) but not for 80 % of the star's value.
    const tight: BidderClub = { ...RICH, slug: "tight", budget: Math.floor(WAGE_SALE_MIN_FEE_SHARE * marketValueFor(star)) - 1 };
    const sales = planWageSales({ reputation: 60, wageBudget: 40_000_000 }, squad(), [tight], rngFor);

    expect(sales.map((sale) => sale.playerId)).not.toContain("star");
    expect(sales.map((sale) => sale.playerId)[0]).toBe("second");
  });

  it("keeps twenty players at least, even still over the budget", () => {
    // 1 M€ budget: impossible to reach; the sales stop at 20 players.
    const sales = planWageSales({ reputation: 60, wageBudget: 1_000_000 }, squad(), [RICH], rngFor);

    expect(sales.map((sale) => sale.playerId)).toEqual(["star", "second"]);
  });

  it("never sells one of the last two goalkeepers, even the best paid", () => {
    // Two goalkeepers only, paid most: they stay, the best-paid outfield players go.
    const keepers: WageSalePlayer[] = [
      { ...player({ overall: 79, potential: 79, wage: 15_000_000 }), id: "keeper-a", goalkeeper: true },
      { ...player({ overall: 76, potential: 76, wage: 14_000_000 }), id: "keeper-b", goalkeeper: true },
      ...squad().filter((member) => !member.goalkeeper),
    ];
    const sales = planWageSales({ reputation: 60, wageBudget: 40_000_000 }, keepers, [RICH], rngFor);

    expect(sales.map((sale) => sale.playerId)).not.toContain("keeper-a");
    expect(sales.map((sale) => sale.playerId)).not.toContain("keeper-b");
    expect(sales.map((sale) => sale.playerId)[0]).toBe("star");
  });
});
