/**
 * The lines of the dashboard's « À faire », the most important first (docs/design/simplification.md § 4.1): a team that
 * cannot line up, then what the manager must answer, the squad's size, the matches and breaks ahead, the bookings, the
 * injured, and last what only informs: where to look on the market, a mission's end, a squad with nothing to report. The
 * list shows them in this order, whatever the order they are found in.
 */
export const TODO_PRIORITY = [
  "goalkeepers",
  "injured-starters",
  "suspended-starters",
  "coach-offer",
  "expiring-contracts",
  "offers",
  "small-squad",
  "tired-starters",
  "international-returns",
  "international-callups",
  "coach-call-up",
  "booking-risks",
  "europe-booking-risks",
  "injured",
  "weak-spot",
  "coach-ended",
  "full-squad",
] as const;

/** A line of « À faire », by its id: its data-testid is « alert-{id} ». */
export type TodoId = (typeof TODO_PRIORITY)[number];

/** The lines the list shows at once; the others wait behind « Voir tout ». */
export const TODOS_SHOWN = 3;

/** Lines in the order of their priority, the most important first. The lines given are left as they are. */
export function byPriority<T extends { readonly id: TodoId }>(todos: readonly T[]): T[] {
  return [...todos].sort((a, b) => TODO_PRIORITY.indexOf(a.id) - TODO_PRIORITY.indexOf(b.id));
}
