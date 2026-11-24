import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import { SQUAD_LIMIT } from "./balance";
import { marketValueFor, wageFor } from "./economy";
import {
  askingPrice,
  biddingOrder,
  evaluateOffer,
  minimumWage,
  resaleCap,
  saleBids,
  walkSaleBids,
  type BidderClub,
  type ClubArrival,
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
  it("is accepted at the asking price, the player joining for his 10 % raise", () => {
    const target = player();
    const evaluation = evaluateOffer(target, SELLER, BUYER, askingPrice(target));

    expect(evaluation).toMatchObject({ accepted: true, clubAccepts: true, playerAccepts: true, refusals: [] });
    expect(evaluation.minimumWage).toBe(3_300_000);
  });

  it("is refused by the club below the asking price", () => {
    const target = player();
    const evaluation = evaluateOffer(target, SELLER, BUYER, askingPrice(target) - 1);

    expect(evaluation).toMatchObject({ accepted: false, clubAccepts: false, playerAccepts: true, refusals: ["fee_too_low"] });
  });

  it("is refused by the player for a club far below his current club or his level, never for a wage", () => {
    const target = player();
    const stepDown = evaluateOffer(target, SELLER, { reputation: 69 }, askingPrice(target));
    const star = player({ overall: 90, potential: 90 });
    const tooSmall = evaluateOffer(star, { reputation: 60 }, { reputation: 74 }, askingPrice(star));

    expect(stepDown.refusals).toEqual(["club_reputation_too_low"]);
    expect(evaluateOffer(target, SELLER, { reputation: 70 }, askingPrice(target)).accepted).toBe(true);
    expect(tooSmall.refusals).toEqual(["club_reputation_too_low"]);
    // An offer carries the wage the player asks: an underpaid or an overpaid player alike accepts it.
    for (const wage of [0, 1, 50_000_000]) {
      expect(evaluateOffer(player({ wage }), SELLER, BUYER, askingPrice(player({ wage }))).accepted).toBe(true);
    }
  });

  it("lets a free agent sign without a fee for 90 % of his market wage, rounded up to the thousand", () => {
    const freeAgent = player({ seasonsLeft: 0, wage: 0 });
    const floor = minimumWage(freeAgent, null);

    expect(floor % 1_000).toBe(0);
    expect(floor).toBeGreaterThanOrEqual(wageFor(freeAgent) * 0.9);
    expect(floor).toBeLessThan(wageFor(freeAgent) * 0.9 + 1_000);
    expect(evaluateOffer(freeAgent, null, BUYER, 0)).toMatchObject({ accepted: true, askingPrice: 0, minimumWage: floor });
  });
});

describe("saleBids", () => {
  const bidders: BidderClub[] = [
    { slug: "rich", reputation: 88, budget: 500_000_000, squadSize: 25 },
    { slug: "second", reputation: 84, budget: 500_000_000, squadSize: 29 },
    { slug: "third", reputation: 82, budget: 500_000_000, squadSize: 20 },
    { slug: "broke", reputation: 86, budget: 1_000_000, squadSize: 25 },
    { slug: "full", reputation: 87, budget: 500_000_000, squadSize: SQUAD_LIMIT },
    { slug: "too-small", reputation: 60, budget: 500_000_000, squadSize: 25 },
  ];

  it("only lets clubs the player would join, under 30 players and able to pay, bid, best fee first, at his minimum wage", () => {
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
    { slug: "rich", reputation: 88, budget: 500_000_000, squadSize: 25 },
    { slug: "full", reputation: 87, budget: 500_000_000, squadSize: SQUAD_LIMIT },
    { slug: "broke", reputation: 86, budget: 1_000_000, squadSize: 25 },
    { slug: "second", reputation: 84, budget: 500_000_000, squadSize: 29 },
    { slug: "third", reputation: 82, budget: 500_000_000, squadSize: 20 },
    { slug: "too-small", reputation: 60, budget: 500_000_000, squadSize: 25 },
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

  it("lowers the fees above a cap to it, with the same clubs, wages and contracts, the most reputed first", () => {
    const free = walkSaleBids(player(), SELLER, ordered, false, makeRng("sale"));
    const cap = Math.min(...free.bids.map((bid) => bid.fee)) - 10_000;
    const capped = walkSaleBids(player(), SELLER, ordered, false, makeRng("sale"), cap);

    // Every bid was above the cap: all offer it, best first by reputation (rich, second, third).
    expect(capped).toEqual({
      done: true,
      bids: ["rich", "second", "third"].map((slug) => ({ ...free.bids.find((bid) => bid.clubSlug === slug), fee: cap })),
    });
    expect(walkSaleBids(player(), SELLER, ordered, false, makeRng("sale"), Number.MAX_SAFE_INTEGER)).toEqual(free);
  });

  it("passes a club at 30 players over without a draw, whatever its budget and reputation; one at 29 bids", () => {
    const withoutFull = ordered.filter((club) => club.slug !== "full");
    const walked = walkSaleBids(player(), SELLER, ordered, false, makeRng("sale"));

    // The clubs after it draw what they would without it in the list: no wage room counts, only the squad.
    expect(walked).toEqual(walkSaleBids(player(), SELLER, withoutFull, false, makeRng("sale")));
    expect(walked.bids.map((bid) => bid.clubSlug)).not.toContain("full");
    expect(walked.bids.map((bid) => bid.clubSlug)).toContain("second");
    // Above 30 too: a squad from before the limit bids for nobody.
    const crowded = ordered.map((club) => (club.slug === "full" ? { ...club, squadSize: SQUAD_LIMIT + 4 } : club));
    expect(walkSaleBids(player(), SELLER, crowded, false, makeRng("sale"))).toEqual(walked);
    // The same club with a place left draws, and takes the rich club's next draws.
    const roomy = ordered.map((club) => (club.slug === "full" ? { ...club, squadSize: SQUAD_LIMIT - 1 } : club));
    expect(walkSaleBids(player(), SELLER, roomy, false, makeRng("sale")).bids.map((bid) => bid.clubSlug)).toContain("full");
  });
});

describe("resaleCap", () => {
  const utc = (day: string) => new Date(`${day}T00:00:00Z`);
  const bought = (day: string, fee: number): ClubArrival => ({ date: utc(day), type: "TRANSFER", fee });
  const signedFree = (day: string): ClubArrival => ({ date: utc(day), type: "FREE", fee: 0 });
  const value = marketValueFor(player());

  it("caps the offers for a player bought at 110 % of his fee, rounded down to the euro, for a year", () => {
    expect(resaleCap([bought("2026-07-01", 3_000_000)], player(), utc("2027-01-12"))).toEqual({ kind: "purchase", fee: 3_300_000 });
    expect(resaleCap([bought("2026-07-01", 1_234_567)], player(), utc("2027-01-12"))?.fee).toBe(1_358_023);
  });

  it("caps the offers for a player signed free at half his market value on the day", () => {
    expect(resaleCap([signedFree("2026-08-31")], player(), utc("2027-01-12"))).toEqual({ kind: "free", fee: Math.floor(value / 2) });
  });

  it("holds up to the day before the same day a year later", () => {
    const arrival = [bought("2026-08-31", 3_000_000)];

    expect(resaleCap(arrival, player(), utc("2027-08-30"))).not.toBeNull();
    expect(resaleCap(arrival, player(), utc("2027-08-31"))).toBeNull();
    expect(resaleCap([], player(), utc("2027-01-12"))).toBeNull();
  });

  it("reads the last arrival only, and the lower cap of two on that day", () => {
    const releasedThenSignedFree = [bought("2026-07-01", 30_000_000), signedFree("2027-01-05")];
    const boughtBack = [signedFree("2026-07-01"), bought("2027-01-05", 100_000)];
    const sameDay = [bought("2027-01-05", 30_000_000), signedFree("2027-01-05")];

    expect(resaleCap(releasedThenSignedFree, player(), utc("2027-01-12"))).toEqual({ kind: "free", fee: Math.floor(value / 2) });
    expect(resaleCap(boughtBack, player(), utc("2027-01-12"))).toEqual({ kind: "purchase", fee: 110_000 });
    expect(resaleCap(sameDay, player(), utc("2027-01-12"))).toEqual({ kind: "free", fee: Math.floor(value / 2) });
  });
});
