import { describe, expect, it } from "vitest";
import type { Position } from "./positions";
import { DEFAULT_FORMATION } from "./lineup";
import { saleProposals, SALE_PROPOSALS_SHOWN, type SaleCandidate } from "./sale-proposals";

const DATE = new Date(Date.UTC(2027, 0, 12));
const MATCHES = 24; // official matches of the club in the period: 10 % of its minutes is 216

/** A player of the club who played every match, unless told otherwise; no offer unless given one. */
const player = (id: string, position: Position, overall: number, overrides: Partial<SaleCandidate> = {}): SaleCandidate => ({
  id,
  position,
  overall,
  injured: false,
  age: 27,
  potential: overall,
  starts: MATCHES,
  minutes: MATCHES * 90,
  atClubWholePeriod: true,
  academyLocked: false,
  keptUntil: null,
  offer: null,
  ...overrides,
});

/** A squad of 25: 3 goalkeepers and 22 outfield players, the best rated 80, every one playing. */
function squad(): SaleCandidate[] {
  const outfield: Position[] = ["RB", "CB", "CB", "LB", "CDM", "CM", "CM", "CAM", "RW", "LW", "ST"];
  return [
    player("gk1", "GK", 78),
    player("gk2", "GK", 70),
    player("gk3", "GK", 62),
    ...outfield.map((position, index) => player(`a${index}`, position, 80 - index)),
    ...outfield.map((position, index) => player(`b${index}`, position, 66 - index)),
  ];
}

/** The squad with some players changed: those who never play, offers, keeps… */
const withPlayers = (changes: Record<string, Partial<SaleCandidate>>): SaleCandidate[] =>
  squad().map((candidate) => ({ ...candidate, ...(changes[candidate.id] ?? {}) }));

const NEVER_PLAYS = { starts: 0, minutes: 40 } satisfies Partial<SaleCandidate>;
const offer = (fee: number) => ({ offer: { fee, buyerId: "buyer" } });

const proposed = (players: SaleCandidate[], clubMatches = MATCHES) =>
  saleProposals({ date: DATE, clubMatches, formation: DEFAULT_FORMATION, squad: players }).map(({ id }) => id);

describe("the sales the assistant proposes", () => {
  it("proposes a player who never plays, whom the assistant does not need, when a club makes an offer", () => {
    // b10 is the squad's last outfield player: out of the assistant's eleven and bench.
    expect(proposed(withPlayers({ b10: { ...NEVER_PLAYS, ...offer(1_200_000) } }))).toEqual(["b10"]);
  });

  it("needs ten official matches of the club to judge: a career's first summer proposes nothing", () => {
    expect(proposed(withPlayers({ b10: { ...NEVER_PLAYS, ...offer(1_200_000) } }), 9)).toEqual([]);
  });

  it("leaves out a player who plays: over two starts, or over a tenth of the club's minutes", () => {
    const players = withPlayers({
      b9: { starts: 3, minutes: 100, ...offer(1_000_000) },
      b10: { starts: 1, minutes: 217, ...offer(1_000_000) },
      b8: { starts: 2, minutes: 216, ...offer(1_000_000) },
    });
    expect(proposed(players)).toEqual(["b8"]);
  });

  it("never proposes one the assistant would field or keep on his bench with the whole squad available", () => {
    // a10 is in the eleven, b0 among the seven on the bench: neither is proposed, however little they played.
    const players = withPlayers({ a10: { ...NEVER_PLAYS, ...offer(5_000_000) }, b0: { ...NEVER_PLAYS, ...offer(4_000_000) } });
    expect(proposed(players)).toEqual([]);
    // An injured starter is still needed: the assistant fields him once fit.
    expect(proposed(withPlayers({ a0: { ...NEVER_PLAYS, injured: true, ...offer(9_000_000) } }))).toEqual([]);
  });

  it("keeps the three best goalkeepers, prospects, the shop's promising youth and those the player kept", () => {
    const players = [
      ...withPlayers({
        gk3: { ...NEVER_PLAYS, ...offer(600_000) },
        b10: { ...NEVER_PLAYS, age: 20, potential: 80, ...offer(900_000) },
        b9: { ...NEVER_PLAYS, academyLocked: true, ...offer(800_000) },
        b8: { ...NEVER_PLAYS, keptUntil: new Date(Date.UTC(2027, 0, 31)), ...offer(700_000) },
        b7: { ...NEVER_PLAYS, keptUntil: new Date(Date.UTC(2026, 7, 31)), ...offer(500_000) },
        // A young player under the club's level is no prospect.
        b6: { ...NEVER_PLAYS, age: 20, potential: 60, ...offer(400_000) },
      }),
      // A fourth goalkeeper is no longer kept.
      player("gk4", "GK", 55, { ...NEVER_PLAYS, ...offer(300_000) }),
    ];
    // b7's keep, from last summer, is over.
    expect(proposed(players)).toEqual(["b7", "b6", "gk4"]);
  });

  it("asks for an offer and for a whole period at the club", () => {
    const players = withPlayers({ b10: NEVER_PLAYS, b9: { ...NEVER_PLAYS, atClubWholePeriod: false, ...offer(2_000_000) } });
    expect(proposed(players)).toEqual([]);
  });

  it("proposes the best offers first, a few at a time, never under 22 players nor 2 goalkeepers", () => {
    const fees = [1_000_000, 3_000_000, 2_000_000, 4_000_000];
    const never = Object.fromEntries(["b7", "b8", "b9", "b10"].map((id, index) => [id, { ...NEVER_PLAYS, ...offer(fees[index]) }]));
    expect(proposed(withPlayers(never))).toEqual(["b10", "b8", "b9"].slice(0, SALE_PROPOSALS_SHOWN));
    // 23 players: one sale leaves 22, a second would leave 21.
    const short = withPlayers(never).filter(({ id }) => id !== "b5" && id !== "b6");
    expect(proposed(short)).toEqual(["b10"]);
  });
});
