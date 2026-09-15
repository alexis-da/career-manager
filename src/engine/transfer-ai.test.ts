import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import { marketValueFor, wageFor } from "./economy";
import {
  askingPrice,
  evaluateOffer,
  evaluateRenewal,
  minimumWage,
  saleBids,
  type BidderClub,
  type OfferPlayer,
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
