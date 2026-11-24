import { describe, expect, it } from "vitest";
import { marketValueFor, signingBonus } from "./economy";
import {
  CLUB_ASKING_PRICE_FLOOR,
  elevenOf,
  entryBound,
  entryRules,
  isEligible,
  isSettled,
  lowestOverallIn,
  MARKET_ENTRIES,
  MAX_PROPOSALS_PER_ENTRY,
  maxClubSaving,
  proposeSignings,
  settlingFloor,
  weakSpotOf,
  type ElevenSlot,
  type MarketBuyer,
  type MarketCandidate,
  type MarketEntry,
  type Proposal,
  type WeakSpot,
} from "./market-proposals";
import { formationPositions } from "./formations";
import { resolveLineup, type LineupCandidate } from "./lineup";
import { POSITIONS, secondaryPositions, type Position } from "./positions";
import { askingPrice, type OfferPlayer } from "./transfer-ai";

const MILLION = 1_000_000;

const BUYER: MarketBuyer = { reputation: 70, budget: 100 * MILLION };

/** A plain striker of 26, fairly priced: he fits no entry but Stars, and Needs when he improves the weak spot. */
const candidate = (playerKey: string, overrides: Partial<MarketCandidate> = {}): MarketCandidate => ({
  playerKey,
  position: "ST",
  age: 26,
  overall: 70,
  potential: 72,
  askingPrice: 10 * MILLION,
  minimumReputation: 50,
  marketValue: 10 * MILLION,
  ...overrides,
});

/** The first player key whose secondary positions at `position` pass the check. */
function keyWhere(position: Position, check: (secondary: readonly Position[]) => boolean): string {
  for (let index = 0; ; index++) {
    const key = `player-${index}`;
    if (check(secondaryPositions(key, position))) {
      return key;
    }
  }
}

/** A player without secondary positions: his rating elsewhere comes from the table of familiarity alone. */
const plainKey = (position: Position): string => keyWhere(position, (secondary) => secondary.length === 0);

const keys = (proposals: readonly Proposal[]): string[] => proposals.map((proposal) => proposal.candidate.playerKey);

const entryKeys = (eleven: readonly ElevenSlot[], candidates: readonly MarketCandidate[], entry: MarketEntry): string[] =>
  keys(proposeSignings(eleven, candidates, BUYER).entries[entry]);

describe("weakSpotOf", () => {
  it("is the starter rated lowest in his slot, rounded", () => {
    expect(
      weakSpotOf([
        { slot: "GK", rating: 75 },
        { slot: "CB", rating: 61.6 },
        { slot: "ST", rating: 70 },
      ]),
    ).toEqual({ position: "CB", rating: 62, reason: "lowest" });
  });

  it("takes the first of the eleven on a tie", () => {
    const eleven: ElevenSlot[] = [
      { slot: "ST", rating: 60 },
      { slot: "CB", rating: 60 },
    ];

    expect(weakSpotOf(eleven)?.position).toBe("ST");
    expect(weakSpotOf([...eleven].reverse())?.position).toBe("CB");
  });

  it("compares the exact ratings: a tie once rounded is not a tie", () => {
    expect(
      weakSpotOf([
        { slot: "CB", rating: 62.4 },
        { slot: "ST", rating: 61.6 },
      ]),
    ).toEqual({ position: "ST", rating: 62, reason: "lowest" });
  });

  it("is null for an empty eleven", () => {
    expect(weakSpotOf([])).toBeNull();
  });

  it("is an empty slot first, rated 0, the first of the eleven among them", () => {
    expect(
      weakSpotOf([
        { slot: "GK", rating: 45 },
        { slot: "CB", rating: 40, outOfLine: true },
        { slot: "ST", rating: null },
        { slot: "LW", rating: null },
      ]),
    ).toEqual({ position: "ST", rating: 0, reason: "empty" });
  });

  it("is then a slot held out of line, the lowest rated of them, before a starter rated lower in his line", () => {
    const eleven: ElevenSlot[] = [
      { slot: "CB", rating: 40, outOfLine: false },
      { slot: "ST", rating: 60.2, outOfLine: true },
      { slot: "LW", rating: 54.6, outOfLine: true },
    ];

    expect(weakSpotOf(eleven)).toEqual({ position: "LW", rating: 55, reason: "outOfLine" });
  });

  it("takes the first of the eleven on a tie between slots held out of line", () => {
    const eleven: ElevenSlot[] = [
      { slot: "RW", rating: 56, outOfLine: true },
      { slot: "LW", rating: 56, outOfLine: true },
    ];

    expect(weakSpotOf(eleven)?.position).toBe("RW");
    expect(weakSpotOf([...eleven].reverse())?.position).toBe("LW");
  });

  it("is null without any starter", () => {
    expect(weakSpotOf([{ slot: "GK", rating: null }])).toBeNull();
  });
});

describe("the eleven of a formation", () => {
  /** The `rank`-th player key at a position with no secondary position: where he plays out of his line is plain. */
  const plainKeyAt = (position: Position, rank: number): string => {
    for (let index = 0, found = -1; ; index++) {
      const key = `${position}-${index}`;
      if (secondaryPositions(key, position).length === 0 && ++found === rank) {
        return key;
      }
    }
  };
  const player = (position: Position, rank = 0, overrides: Partial<LineupCandidate> = {}): LineupCandidate => ({
    id: plainKeyAt(position, rank),
    position,
    overall: 70,
    injured: false,
    ...overrides,
  });
  /** A player rated 70 for each slot of a 4-3-3, at its position. */
  const squad = (): LineupCandidate[] => formationPositions("4-3-3").map((position, index) => player(position, index));
  const elevenFrom = (players: readonly LineupCandidate[]): ElevenSlot[] =>
    elevenOf("4-3-3", resolveLineup("4-3-3", null, players).starters);

  it("has the formation's slots, in its order, each with its starter's rating there", () => {
    expect(elevenFrom(squad())).toEqual(formationPositions("4-3-3").map((slot) => ({ slot, rating: 70, outOfLine: false })));
  });

  it("has no slot without any starter: nothing to compare", () => {
    expect(elevenOf("4-3-3", [])).toEqual([]);
  });

  it("leaves a slot empty when an injury leaves nobody to fill it, the weak spot whatever the others", () => {
    const players = squad();
    players[0] = { ...players[0], injured: true }; // the goalkeeper: an outfield player goes in goal
    const eleven = elevenFrom(players);

    expect(eleven.find(({ slot }) => slot === "GK")).toMatchObject({ outOfLine: true });
    expect(eleven.at(-1)).toEqual({ slot: "LW", rating: null });
    expect(weakSpotOf(eleven)).toEqual({ position: "LW", rating: 0, reason: "empty" });
  });

  it("leaves a slot empty when a suspension leaves nobody to fill it", () => {
    const players = squad().map((candidate) => (candidate.position === "ST" ? { ...candidate, suspended: true } : candidate));

    expect(weakSpotOf(elevenFrom(players))).toEqual({ position: "LW", rating: 0, reason: "empty" });
  });

  it("holds a slot out of line with a player of another line, before a starter rated lower in his line", () => {
    // No forward: midfielders play up front, at 56; the goalkeeper is rated 50, in goal.
    const players = squad().map((candidate, index) =>
      candidate.position === "RW" || candidate.position === "ST" || candidate.position === "LW"
        ? player("CM", index)
        : candidate.position === "GK"
          ? { ...candidate, overall: 50 }
          : candidate,
    );
    const eleven = elevenFrom(players);

    expect(eleven.slice(-3)).toEqual(["RW", "ST", "LW"].map((slot) => ({ slot, rating: 56, outOfLine: true })));
    expect(weakSpotOf(eleven)).toEqual({ position: "RW", rating: 56, reason: "outOfLine" });
  });

  it("does not hold a slot out of line with a player filling in on his line, nor at a secondary position", () => {
    // A centre-back at right back fills in (« Dépanne »); a midfielder at a secondary position up front plays there.
    const forward = keyWhere("CAM", (secondary) => secondary.includes("ST"));
    const players = squad().map((candidate) =>
      candidate.position === "RB"
        ? player("CB", 5)
        : candidate.position === "ST"
          ? { id: forward, position: "CAM" as const, overall: 70, injured: false }
          : candidate,
    );
    const eleven = elevenFrom(players);

    expect(eleven.find(({ slot }) => slot === "RB")).toMatchObject({ outOfLine: false });
    expect(eleven.find(({ slot }) => slot === "ST")).toMatchObject({ outOfLine: false });
    expect(weakSpotOf(eleven)?.reason).toBe("lowest");
  });
});

describe("an empty weak spot", () => {
  const eleven: ElevenSlot[] = [
    { slot: "GK", rating: 70 },
    { slot: "ST", rating: null },
  ];

  it("takes anyone who can play there in Needs, the best there first", () => {
    const candidates = [
      candidate(plainKey("ST"), { overall: 45 }),
      candidate(plainKey("CM"), { position: "CM", overall: 80 }), // 64 up front
      candidate(plainKey("GK"), { position: "GK", overall: 60 }), // 24 up front
    ];
    const { weakSpot, entries } = proposeSignings(eleven, candidates, BUYER);

    expect(weakSpot).toEqual({ position: "ST", rating: 0, reason: "empty" });
    expect(entries.needs.map(({ candidate: { position }, slot, impact }) => ({ position, slot, impact }))).toEqual([
      { position: "CM", slot: "ST", impact: 64 },
      { position: "ST", slot: "ST", impact: 45 },
      { position: "GK", slot: "ST", impact: 24 },
    ]);
  });

  it("places a candidate where he brings the most, an empty slot taking all of his rating there", () => {
    const { entries } = proposeSignings(eleven, [candidate(plainKey("GK"), { position: "GK", overall: 80 })], BUYER);

    // 80 − 70 in goal; 32 up front, where nobody plays.
    expect(entries.stars[0]).toMatchObject({ slot: "ST", impact: 32 });
  });

  it("leaves Bargains no rating to reach", () => {
    const cheap = candidate("cheap", { overall: 40, marketValue: MILLION, askingPrice: MILLION / 2 });

    expect(entryKeys(eleven, [cheap], "bargains")).toEqual(["cheap"]);
  });
});

describe("eligibility", () => {
  // A candidate of all four entries: young, cheap, and better than the weak spot.
  const wanted = candidate("wanted", {
    age: 19,
    overall: 70,
    potential: 80,
    askingPrice: 6 * MILLION,
    minimumReputation: 60,
    marketValue: 10 * MILLION,
  });
  const exactBuyer: MarketBuyer = { reputation: 60, budget: 6 * MILLION };
  const eleven: ElevenSlot[] = [{ slot: "ST", rating: 60 }];

  const entryCounts = (buyer: MarketBuyer): number[] => {
    const { entries } = proposeSignings(eleven, [wanted], buyer);
    return MARKET_ENTRIES.map((entry) => entries[entry].length);
  };

  it("keeps a candidate the buyer reaches exactly, in all four entries", () => {
    expect(entryCounts(exactBuyer)).toEqual([1, 1, 1, 1]);
  });

  it("drops him from all four entries when the club's reputation is too low", () => {
    expect(entryCounts({ ...exactBuyer, reputation: 59 })).toEqual([0, 0, 0, 0]);
  });

  it("drops him from all four entries when the budget is too short", () => {
    expect(entryCounts({ ...exactBuyer, budget: 6 * MILLION - 1 })).toEqual([0, 0, 0, 0]);
  });

  it("weighs nothing but the reputation and the price: no wage, no wage room", () => {
    expect(isEligible(wanted, exactBuyer)).toBe(true);
    expect(Object.keys(exactBuyer).sort()).toEqual(["budget", "reputation"]);
  });
});

describe("a free agent at his signing bonus", () => {
  const eleven: ElevenSlot[] = [
    { slot: "GK", rating: 80 },
    { slot: "ST", rating: 60 },
  ];
  // A free agent of 27 rated 68: his price is his bonus, a quarter of his value or so.
  const value = marketValueFor({ age: 27, overall: 68, potential: 70 });
  const free = candidate("free", { overall: 68, potential: 70, age: 27, marketValue: value, askingPrice: signingBonus(value) });

  it("is proposed when the budget pays his bonus, and not a euro short", () => {
    const bonus = signingBonus(value);

    expect(bonus).toBe(1_560_000);
    expect(keys(proposeSignings(eleven, [free], { ...BUYER, budget: bonus }).entries.needs)).toEqual(["free"]);
    expect(proposeSignings(eleven, [free], { ...BUYER, budget: bonus - 1 }).entries).toEqual({ needs: [], gems: [], bargains: [], stars: [] });
  });

  it("is a bargain, saving three quarters of his value, and comes after a cheaper player of his rating", () => {
    const cheaper = candidate("cheaper", { overall: 68, potential: 70, age: 27, marketValue: value, askingPrice: signingBonus(value) - 10_000 });
    const { entries } = proposeSignings(eleven, [free, cheaper], BUYER);

    expect(keys(entries.bargains)).toEqual(["cheaper", "free"]);
    expect(entries.bargains.find(({ candidate: { playerKey } }) => playerKey === "free")?.tag).toBe("bargain");
    expect(keys(entries.stars)).toEqual(["cheaper", "free"]);
  });
});

describe("slot and impact", () => {
  it("places a candidate where he brings the most, away from the weak spot if need be", () => {
    const eleven: ElevenSlot[] = [
      { slot: "CM", rating: 70 },
      { slot: "ST", rating: 60 },
    ];
    const { entries } = proposeSignings(eleven, [candidate(plainKey("CM"), { position: "CM", overall: 80 })], BUYER);

    expect(entries.stars[0]).toMatchObject({ slot: "CM", impact: 10 }); // 80 − 70, against 64 − 60 up front
  });

  it("stays at the weak spot in Needs, whatever he would bring elsewhere", () => {
    const eleven: ElevenSlot[] = [
      { slot: "CM", rating: 70 },
      { slot: "ST", rating: 60 },
    ];
    const { entries } = proposeSignings(eleven, [candidate(plainKey("CM"), { position: "CM", overall: 80 })], BUYER);

    expect(entries.needs[0]).toMatchObject({ slot: "ST", impact: 4 }); // 80 × 0.8 − 60
  });

  it("may be negative", () => {
    const { entries } = proposeSignings([{ slot: "ST", rating: 60 }], [candidate("worse", { overall: 50 })], BUYER);

    expect(entries.stars[0]).toMatchObject({ slot: "ST", impact: -10 });
    expect(entries.needs).toEqual([]);
  });

  it("takes the first of the eleven on a tie", () => {
    const eleven: ElevenSlot[] = [
      { slot: "RW", rating: 70 },
      { slot: "LW", rating: 70 },
    ];
    const striker = candidate(plainKey("ST"), { overall: 80 }); // 74 on either wing

    expect(proposeSignings(eleven, [striker], BUYER).entries.stars[0]).toMatchObject({ slot: "RW", impact: 4 });
    expect(proposeSignings([...eleven].reverse(), [striker], BUYER).entries.stars[0]).toMatchObject({ slot: "LW", impact: 4 });
  });

  it("is measured against the weakest of two starters at the same position", () => {
    const eleven: ElevenSlot[] = [
      { slot: "CB", rating: 72 },
      { slot: "CB", rating: 65 },
    ];
    const { entries } = proposeSignings(eleven, [candidate("defender", { position: "CB", overall: 70 })], BUYER);

    expect(entries.stars[0]).toMatchObject({ slot: "CB", impact: 5 });
    expect(entries.needs[0]).toMatchObject({ slot: "CB", impact: 5 });
  });

  it("compares rounded ratings", () => {
    const midfielder = candidate(plainKey("CM"), { position: "CM", overall: 76 }); // 60.8 up front
    const { entries } = proposeSignings([{ slot: "ST", rating: 60.4 }], [midfielder], BUYER);

    expect(entries.stars[0].impact).toBe(1);
    expect(entries.needs[0].impact).toBe(1);
  });

  it("counts a secondary position, drawn from the player key", () => {
    const key = keyWhere("CAM", (secondary) => secondary.includes("ST"));
    const { entries } = proposeSignings([{ slot: "ST", rating: 70 }], [candidate(key, { position: "CAM", overall: 80 })], BUYER);

    expect(entries.stars[0]).toMatchObject({ slot: "ST", impact: 8 }); // 77.6, where a plain midfielder is at 64
  });
});

describe("Needs", () => {
  const eleven: ElevenSlot[] = [
    { slot: "GK", rating: 80 },
    { slot: "ST", rating: 60 },
  ];

  it("keeps only those who would improve the weak spot", () => {
    const candidates = [
      candidate("better", { overall: 61 }),
      candidate("same", { overall: 60 }),
      candidate("worse", { overall: 59 }),
    ];

    expect(entryKeys(eleven, candidates, "needs")).toEqual(["better"]);
  });

  it("drops a gain that vanishes once rounded", () => {
    expect(entryKeys([{ slot: "ST", rating: 59.6 }], [candidate("barely", { overall: 60 })], "needs")).toEqual([]);
  });

  it("drops a candidate who would only improve another slot", () => {
    const candidates = [candidate(plainKey("GK"), { position: "GK", overall: 85 })];

    expect(entryKeys(eleven, candidates, "needs")).toEqual([]);
    expect(proposeSignings(eleven, candidates, BUYER).entries.stars[0]).toMatchObject({ slot: "GK", impact: 5 });
  });

  it("sorts by impact, then price, then rating, then player key", () => {
    const candidates = [
      candidate("b-tie", { askingPrice: 5 * MILLION }),
      candidate("a-tie", { askingPrice: 5 * MILLION }),
      // 70 up front like the two strikers above, for the same price, with a higher rating.
      candidate(plainKey("CM"), { position: "CM", overall: 88, askingPrice: 5 * MILLION }),
      candidate("z-cheaper", { askingPrice: 3 * MILLION }),
      candidate("z-biggest-gain", { overall: 72, askingPrice: 20 * MILLION }),
    ];

    expect(entryKeys(eleven, candidates, "needs")).toEqual(["z-biggest-gain", "z-cheaper", plainKey("CM"), "a-tie", "b-tie"]);
  });

  it("tags the first best, then gems, then bargains on price, then the rest", () => {
    const fit = candidate("c-fit", { overall: 68, marketValue: 10 * MILLION, askingPrice: 10 * MILLION });
    const bargain = candidate("c-bargain", { overall: 68, marketValue: 10 * MILLION, askingPrice: 7 * MILLION });
    const gem = candidate("c-gem", { overall: 68, age: 20, potential: 74, askingPrice: 12 * MILLION });
    const gemAtBargainPrice = candidate("c-both", { overall: 68, age: 20, potential: 74, marketValue: 20 * MILLION, askingPrice: 15 * MILLION });
    const first = candidate("c-first", { overall: 75, age: 20, potential: 85 });

    const { entries } = proposeSignings(eleven, [fit, bargain, gem, gemAtBargainPrice, first], BUYER);
    const tags = Object.fromEntries(entries.needs.map((proposal) => [proposal.candidate.playerKey, proposal.tag]));

    expect(tags).toEqual({ "c-first": "best", "c-gem": "gem", "c-both": "gem", "c-bargain": "bargain", "c-fit": "fit" });
  });

  it("does not take a free worthless player for a bargain", () => {
    const candidates = [candidate("first", { overall: 75 }), candidate("worthless", { askingPrice: 0, marketValue: 0 })];

    expect(proposeSignings(eleven, candidates, BUYER).entries.needs.map((proposal) => proposal.tag)).toEqual(["best", "fit"]);
  });
});

describe("Gems", () => {
  const eleven: ElevenSlot[] = [{ slot: "ST", rating: 80 }];

  it("needs youth and room to grow, both inclusive", () => {
    const candidates = [
      candidate("in", { age: 21, overall: 60, potential: 66 }),
      candidate("too-old", { age: 22, overall: 60, potential: 66 }),
      candidate("no-room", { age: 21, overall: 60, potential: 65 }),
    ];

    expect(entryKeys(eleven, candidates, "gems")).toEqual(["in"]);
  });

  it("sorts by potential, then price, then player key, and tags gem", () => {
    const young = { age: 19, overall: 60 };
    const candidates = [
      candidate("b-tie", { ...young, potential: 75, askingPrice: 5 * MILLION }),
      candidate("a-tie", { ...young, potential: 75, askingPrice: 5 * MILLION }),
      candidate("z-cheaper", { ...young, potential: 75, askingPrice: 4 * MILLION }),
      candidate("z-highest", { ...young, potential: 85, askingPrice: 30 * MILLION }),
    ];
    const { gems } = proposeSignings(eleven, candidates, BUYER).entries;

    expect(keys(gems)).toEqual(["z-highest", "z-cheaper", "a-tie", "b-tie"]);
    expect(gems.map((proposal) => proposal.tag)).toEqual(["gem", "gem", "gem", "gem"]);
  });

  it("places a gem where he brings the most, even without improving the eleven", () => {
    const gem = candidate("gem", { age: 19, overall: 60, potential: 75 });

    expect(proposeSignings(eleven, [gem], BUYER).entries.gems[0]).toMatchObject({ slot: "ST", impact: -20 });
  });
});

describe("Bargains", () => {
  const eleven: ElevenSlot[] = [
    { slot: "GK", rating: 80 },
    { slot: "ST", rating: 60.4 }, // the weak spot reads 60
  ];

  it("needs a price of 75 % of the market value at most", () => {
    const candidates = [
      candidate("at-the-limit", { marketValue: 10 * MILLION, askingPrice: 7_500_000 }),
      candidate("just-above", { marketValue: 10 * MILLION, askingPrice: 7_500_001 }),
    ];

    expect(entryKeys(eleven, candidates, "bargains")).toEqual(["at-the-limit"]);
  });

  it("needs a rating within 3 of the weak spot, from below", () => {
    const candidates = [
      candidate("at-the-limit", { overall: 57, askingPrice: MILLION }),
      candidate("just-below", { overall: 56, askingPrice: MILLION }),
    ];

    expect(entryKeys(eleven, candidates, "bargains")).toEqual(["at-the-limit"]);
  });

  it("needs a market value", () => {
    expect(entryKeys(eleven, [candidate("worthless", { askingPrice: 0, marketValue: 0 })], "bargains")).toEqual([]);
  });

  it("has room for a free agent", () => {
    const proposal = proposeSignings(eleven, [candidate("free", { askingPrice: 0 })], BUYER).entries.bargains[0];

    expect(proposal).toMatchObject({ tag: "bargain", slot: "ST", impact: 10 });
    expect(proposal.candidate.askingPrice).toBe(0);
  });

  it("sorts by the money saved, then rating, then player key", () => {
    const candidates = [
      candidate("b-tie", { overall: 62, marketValue: 10 * MILLION, askingPrice: 5 * MILLION }),
      candidate("a-tie", { overall: 62, marketValue: 10 * MILLION, askingPrice: 5 * MILLION }),
      candidate("z-better-rated", { overall: 65, marketValue: 8 * MILLION, askingPrice: 3 * MILLION }),
      candidate("z-most-saved", { overall: 60, marketValue: 40 * MILLION, askingPrice: 20 * MILLION }),
    ];

    expect(entryKeys(eleven, candidates, "bargains")).toEqual(["z-most-saved", "z-better-rated", "a-tie", "b-tie"]);
  });
});

describe("Stars", () => {
  it("takes every eligible candidate, by rating, then price, then player key", () => {
    const eleven: ElevenSlot[] = [{ slot: "ST", rating: 90 }];
    const candidates = [
      candidate("b-tie", { overall: 70 }),
      candidate("a-tie", { overall: 70 }),
      candidate("z-cheaper", { overall: 70, askingPrice: 5 * MILLION }),
      candidate("z-best", { overall: 85, askingPrice: 90 * MILLION }),
      candidate("out-of-reach", { overall: 95, askingPrice: 101 * MILLION }),
    ];
    const { stars } = proposeSignings(eleven, candidates, BUYER).entries;

    expect(keys(stars)).toEqual(["z-best", "z-cheaper", "a-tie", "b-tie"]);
    expect(stars.map((proposal) => proposal.tag)).toEqual(["star", "star", "star", "star"]);
  });
});

describe("proposeSignings", () => {
  const eleven: ElevenSlot[] = [{ slot: "ST", rating: 60 }];

  // Better than the weak spot, gems and bargains all, and in the same order in each entry: the last one first.
  const crowd = Array.from({ length: MAX_PROPOSALS_PER_ENTRY + 2 }, (_, index) =>
    candidate(`player-${String(index).padStart(2, "0")}`, {
      age: 19,
      overall: 61 + index,
      potential: 90 + index,
      marketValue: 10 * MILLION,
      askingPrice: 5 * MILLION - index,
    }),
  );

  it("keeps 10 proposals at most in each entry, the first ones", () => {
    const { entries } = proposeSignings(eleven, crowd, BUYER);
    const best = crowd
      .slice(2)
      .reverse()
      .map((player) => player.playerKey);

    expect(MAX_PROPOSALS_PER_ENTRY).toBe(10);
    for (const entry of MARKET_ENTRIES) {
      expect(keys(entries[entry]), entry).toEqual(best);
    }
  });

  it("gives the same order whatever the order of the candidates", () => {
    const ties = [
      candidate("tie-c", { age: 19, potential: 80, askingPrice: 5 * MILLION }),
      candidate("tie-a", { age: 19, potential: 80, askingPrice: 5 * MILLION }),
      candidate("tie-b", { age: 19, potential: 80, askingPrice: 5 * MILLION }),
    ];
    const candidates = [...ties, ...crowd];

    const forwards = proposeSignings(eleven, candidates, BUYER);
    const backwards = proposeSignings(eleven, [...candidates].reverse(), BUYER);

    expect(backwards).toEqual(forwards);
    expect(proposeSignings(eleven, candidates, BUYER)).toEqual(forwards);
  });

  it("leaves its inputs untouched", () => {
    const candidates = Object.freeze([candidate("b"), candidate("a")]);
    const frozenEleven = Object.freeze([...eleven]);

    expect(() => proposeSignings(frozenEleven, candidates, BUYER)).not.toThrow();
  });

  it("hands back the caller's candidates, with what they carry", () => {
    const player = { ...candidate("carried", { overall: 75 }), id: "row-1" };
    const { entries } = proposeSignings(eleven, [player], BUYER);

    expect(entries.stars[0].candidate).toBe(player);
    expect(entries.needs[0].candidate.id).toBe("row-1");
  });

  it("has no weak spot, no needs and no rating floor with an empty eleven", () => {
    const candidates = [
      candidate("gem", { position: "CM", age: 19, overall: 40, potential: 60, askingPrice: 2 * MILLION }),
      candidate("star", { overall: 75 }),
    ];
    const { weakSpot, entries } = proposeSignings([], candidates, BUYER);

    expect(weakSpot).toBeNull();
    expect(entries.needs).toEqual([]);
    expect(keys(entries.gems)).toEqual(["gem"]);
    expect(keys(entries.bargains)).toEqual(["gem"]);
    expect(keys(entries.stars)).toEqual(["star", "gem"]);
    expect(entries.gems[0]).toMatchObject({ slot: "CM", impact: 0 });
    expect(entries.stars[0]).toMatchObject({ slot: "ST", impact: 0 });
  });

  it("proposes nothing without candidates", () => {
    const { weakSpot, entries } = proposeSignings(eleven, [], BUYER);

    expect(weakSpot).toEqual({ position: "ST", rating: 60, reason: "lowest" });
    expect(entries).toEqual({ needs: [], gems: [], bargains: [], stars: [] });
  });
});

describe("when nobody would improve the weak spot", () => {
  const eleven: ElevenSlot[] = [
    { slot: "GK", rating: 80 },
    { slot: "ST", rating: 60 },
  ];

  it("leaves Needs empty: no « within your means » players at the weak spot any more", () => {
    const cheap = candidate("cheap", { overall: 58 });
    const cheaper = candidate("cheaper", { overall: 55 });
    const { entries } = proposeSignings(eleven, [cheap, cheaper], BUYER);

    expect(entries.needs).toEqual([]);
    expect(keys(entries.stars)).toEqual(["cheap", "cheaper"]);
    expect(entries.stars.map(({ tag }) => tag)).toEqual(["star", "star"]);
  });
});

describe("the bounds of a search in the database", () => {
  const weakSpot: WeakSpot = { position: "CB", rating: 60, reason: "lowest" };
  const rules = entryRules(weakSpot);

  /** Players of the AI clubs of every kind: rating, age, room to grow, seasons left, position. */
  const clubPlayers: MarketCandidate[] = [];
  for (const overall of [1, 15, 30, 40, 45, 50, 55, 57, 60, 61, 63, 66, 70, 74, 78, 82, 86, 90, 95, 99]) {
    for (const age of [16, 18, 20, 21, 22, 24, 27, 30, 33, 36, 40]) {
      for (const potential of new Set([overall, Math.min(99, overall + 4), Math.min(99, overall + 12), 99])) {
        for (const seasonsLeft of [0, 1, 2, 3, 5]) {
          const terms: OfferPlayer = { age, overall, potential, wage: 0, seasonsLeft };
          clubPlayers.push(
            candidate(`club-${clubPlayers.length}`, {
              position: POSITIONS[clubPlayers.length % POSITIONS.length],
              age,
              overall,
              potential,
              askingPrice: askingPrice(terms),
              marketValue: marketValueFor(terms),
            }),
          );
        }
      }
    }
  }

  /** Ten times the same candidate: the tenth of an entry's first ones. */
  const tenOf = (overrides: Partial<MarketCandidate>): MarketCandidate[] =>
    Array.from({ length: MAX_PROPOSALS_PER_ENTRY }, (_, index) => candidate(`tenth-${index}`, overrides));

  it("puts every club's asking price at or above a positive floor", () => {
    expect(CLUB_ASKING_PRICE_FLOOR).toBeGreaterThan(0);
    for (const player of clubPlayers) {
      expect(player.askingPrice, player.playerKey).toBeGreaterThanOrEqual(CLUB_ASKING_PRICE_FLOOR);
    }
  });

  it("never lets a club's player save his buyer more than maxClubSaving at his rating, which only grows", () => {
    for (const player of clubPlayers) {
      expect(player.marketValue - player.askingPrice, player.playerKey).toBeLessThanOrEqual(maxClubSaving(player.overall));
      expect(maxClubSaving(player.overall)).toBeLessThanOrEqual(maxClubSaving(player.overall + 1));
    }
  });

  it("bounds the keys of every club's player an entry takes, from the highest rating (potential for Gems) left", () => {
    // A player whose keys came before the bound would settle an entry whose tenth he is.
    for (const entry of MARKET_ENTRIES) {
      for (const player of clubPlayers.filter(rules[entry].takes)) {
        const highest = entry === "gems" ? player.potential : player.overall;
        const tenth = Array.from({ length: MAX_PROPOSALS_PER_ENTRY }, () => player);

        expect(isSettled(rules[entry], tenth, entryBound(entry, weakSpot, highest)), `${entry} ${player.playerKey}`).toBe(false);
      }
    }
  });

  it("has no one left enter Needs at the weak spot's rating or below, nor Bargains more than 3 below it", () => {
    expect([lowestOverallIn("needs", weakSpot), lowestOverallIn("bargains", weakSpot)]).toEqual([61, 57]);
    expect(entryBound("needs", weakSpot, 60)).toBeNull();
    expect(entryBound("needs", weakSpot, 61)).not.toBeNull();
    expect(entryBound("bargains", weakSpot, 56)).toBeNull();
    expect(entryBound("bargains", weakSpot, 57)).not.toBeNull();
    expect(entryBound("stars", weakSpot, 1)).not.toBeNull();
  });

  it("has no one enter Needs without a weak spot, and anyone rated enter the others", () => {
    expect(lowestOverallIn("needs", null)).toBe(Infinity);
    expect(entryBound("needs", null, 99)).toBeNull();
    expect([lowestOverallIn("gems", null), lowestOverallIn("bargains", null), lowestOverallIn("stars", null)]).toEqual([
      -Infinity,
      -Infinity,
      -Infinity,
    ]);
  });

  it("settles an entry once its tenth comes before every player left, ties included", () => {
    const pricey = tenOf({ overall: 70, askingPrice: MILLION });

    expect(isSettled(rules.stars, pricey, entryBound("stars", weakSpot, 69))).toBe(true);
    // A club's player rated 70 may cost less; the free agents, read first, are none of those left.
    expect(isSettled(rules.stars, pricey, entryBound("stars", weakSpot, 70))).toBe(false);
    expect(isSettled(rules.stars, tenOf({ overall: 70, askingPrice: 0 }), entryBound("stars", weakSpot, 70))).toBe(true);
    // Nine are not ten.
    expect(isSettled(rules.stars, pricey.slice(1), entryBound("stars", weakSpot, 1))).toBe(false);
    // No one left can enter at all.
    expect(isSettled(rules.needs, [], null)).toBe(true);
  });

  it("finds how far a search must read for an entry's first ones to be certain", () => {
    expect(settlingFloor("stars", weakSpot, tenOf({ overall: 70 }).slice(1), 90)).toBeNull();
    expect(settlingFloor("stars", weakSpot, tenOf({ overall: 70, askingPrice: MILLION }), 90)).toBe(70);
    expect(settlingFloor("stars", weakSpot, tenOf({ overall: 70, askingPrice: 0 }), 90)).toBe(71);
    // Ten centre-backs rated 65 at the weak spot, a gain of 5: every player rated 65 or more is read.
    expect(settlingFloor("needs", weakSpot, tenOf({ position: "CB", overall: 65 }), 90)).toBe(65);
    expect(settlingFloor("gems", weakSpot, tenOf({ age: 19, overall: 60, potential: 80 }), Infinity)).toBe(80);
  });
});
