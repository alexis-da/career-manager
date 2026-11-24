import { PROSPECT_MAX_AGE, SQUAD_STANDARD_SIZE } from "./balance";
import { selectLineup, type Formation, type LineupCandidate } from "./lineup";
import { seasonStartDate, seasonStartYear, transferWindowAt } from "./world";

// The sales the assistant proposes in a transfer window (docs/design/simplification.md § 5.1): the players of the managed
// club who never play, whom he does not need and a club would buy, a few at a time. Pure: the caller reads the squad, the
// reference period's figures and the offers.

/** At most this many starts in the reference period: a player who never plays. */
export const SALE_PROPOSAL_MAX_STARTS = 2;
/** At most this share of the club's minutes in the reference period (its official matches × 90). */
export const SALE_PROPOSAL_MINUTES_SHARE = 0.1;
/** A reference period of fewer official matches of the club tells nothing: no proposal (a career's first summer). */
export const SALE_PROPOSAL_MIN_CLUB_MATCHES = 10;
/** The squad never goes under this many players through the proposals. */
export const SALE_PROPOSAL_SQUAD_FLOOR = 22;
/** The club's best goalkeepers kept out of the proposals, and the goalkeepers it never goes under. */
export const SALE_PROPOSAL_GOALKEEPERS_KEPT = 3;
export const SALE_PROPOSAL_MIN_GOALKEEPERS = 2;
/** The proposals shown at once, the best offers first. */
export const SALE_PROPOSALS_SHOWN = 3;

/**
 * The reference period of a window's proposals: in a winter window, the season in progress; in a summer window, the
 * season completed before it, the new one having barely begun. `start` is its first day: a player who joined the club
 * after it has no figures of the club's for the whole period.
 */
export type SaleProposalPeriod = { startYear: number; start: Date; inProgress: boolean };

/** The reference period of the proposals on a date, or null outside a transfer window: nothing is proposed then. */
export function saleProposalPeriod(date: Date): SaleProposalPeriod | null {
  const window = transferWindowAt(date);
  if (window === null) {
    return null;
  }
  const startYear = window === "winter" ? seasonStartYear(date) : seasonStartYear(date) - 1;
  return { startYear, start: seasonStartDate(startYear), inProgress: window === "winter" };
}

/** A player of the managed club as the proposals weigh him. */
export type SaleCandidate = LineupCandidate & {
  age: number; // whole years at the window's date
  potential: number;
  starts: number; // official starts of the club's in the reference period
  minutes: number; // official minutes of the club's in the reference period
  atClubWholePeriod: boolean; // no arrival at the club since the period began: its figures are the club's
  academyLocked: boolean; // a promising youth of the shop on his first contract: never sold
  keptUntil: Date | null; // « Garder »: not proposed before this date
  offer: { fee: number; buyerId: string } | null; // the best AI offer for him today, or none
};

export type SaleProposalsInput<P extends SaleCandidate> = {
  date: Date; // the save's date, inside a window
  clubMatches: number; // official matches the club played in the reference period
  formation: Formation; // the club's, where the assistant's eleven is picked
  squad: readonly P[]; // every player under contract at the club
};

/** The club's level: the mean rating of its best players, the bar of a prospect (the AI clubs' squadStandard). */
function standardOf(squad: readonly SaleCandidate[]): number {
  const best = [...squad].sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id)).slice(0, SQUAD_STANDARD_SIZE);
  return best.length === 0 ? 0 : best.reduce((sum, player) => sum + player.overall, 0) / best.length;
}

/**
 * The players the assistant proposes to sell, the best offer first, at most SALE_PROPOSALS_SHOWN. Each one:
 * 1. never plays: at most SALE_PROPOSAL_MAX_STARTS starts and SALE_PROPOSAL_MINUTES_SHARE of the club's minutes over a
 *    reference period of SALE_PROPOSAL_MIN_CLUB_MATCHES official matches at least;
 * 2. was at the club the whole period;
 * 3. is neither in the eleven nor on the bench the assistant would field with the whole squad available, fresh;
 * 4. is neither one of the club's best goalkeepers, nor a prospect (aged PROSPECT_MAX_AGE or less, his potential at the
 *    club's level), nor a promising youth on his first contract, nor kept by the player until a later date;
 * 5. has an offer;
 * 6. leaves the squad SALE_PROPOSAL_SQUAD_FLOOR players and SALE_PROPOSAL_MIN_GOALKEEPERS goalkeepers at least, the
 *    proposals counted in their order.
 */
export function saleProposals<P extends SaleCandidate>({ date, clubMatches, formation, squad }: SaleProposalsInput<P>): P[] {
  if (clubMatches < SALE_PROPOSAL_MIN_CLUB_MATCHES) {
    return [];
  }
  const minutesCap = SALE_PROPOSAL_MINUTES_SHARE * clubMatches * 90;
  // The assistant's eleven and bench with the whole squad available and fresh: those he needs.
  const everyone = squad.map((player) => ({ ...player, injured: false, suspended: false }));
  const fielded = selectLineup(everyone, formation);
  const needed = new Set([...fielded.starters.map(({ player }) => player.id), ...fielded.bench.map((player) => player.id)]);
  const keptGoalkeepers = new Set(
    squad
      .filter((player) => player.position === "GK")
      .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id))
      .slice(0, SALE_PROPOSAL_GOALKEEPERS_KEPT)
      .map((player) => player.id),
  );
  const standard = standardOf(squad);

  const candidates = squad
    .filter(
      (player) =>
        player.starts <= SALE_PROPOSAL_MAX_STARTS &&
        player.minutes <= minutesCap &&
        player.atClubWholePeriod &&
        !needed.has(player.id) &&
        !keptGoalkeepers.has(player.id) &&
        !(player.age <= PROSPECT_MAX_AGE && player.potential >= standard) &&
        !player.academyLocked &&
        (player.keptUntil === null || player.keptUntil < date) &&
        player.offer !== null,
    )
    .sort((a, b) => (b.offer?.fee ?? 0) - (a.offer?.fee ?? 0) || a.id.localeCompare(b.id));

  const proposed: P[] = [];
  let players = squad.length;
  let goalkeepers = squad.filter((player) => player.position === "GK").length;
  for (const player of candidates) {
    if (proposed.length === SALE_PROPOSALS_SHOWN) {
      break;
    }
    const goalkeeper = player.position === "GK";
    if (players - 1 < SALE_PROPOSAL_SQUAD_FLOOR || (goalkeeper && goalkeepers - 1 < SALE_PROPOSAL_MIN_GOALKEEPERS)) {
      continue;
    }
    proposed.push(player);
    players -= 1;
    goalkeepers -= goalkeeper ? 1 : 0;
  }
  return proposed;
}
