/**
 * The lines of the dashboard's « À faire », the most important first (docs/design/simplification.md § 4.1): a team that
 * cannot line up, then what the manager must answer (a federation's offer, the contracts ending on 30 June: the starters
 * his assistant means to let go, or every one when he keeps the contracts; the sales his assistant proposes), the squad's
 * size, the matches and breaks ahead, the bookings, the injured, and last what only informs: where to look on the market,
 * a mission's end. The list shows them in this order, whatever the order they are found in; without any, it says there
 * is nothing to do (`alert-none`).
 */
export const TODO_PRIORITY = [
  "goalkeepers",
  "injured-starters",
  "suspended-starters",
  "coach-offer",
  "important-contracts",
  "expiring-contracts",
  "sale-proposals",
  "squad-full",
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
] as const;

/** A line of « À faire », by its id: its data-testid is « alert-{id} ». */
export type TodoId = (typeof TODO_PRIORITY)[number];

/** The lines the list shows at once; the others wait behind « Voir tout ». */
export const TODOS_SHOWN = 3;

/** Lines in the order of their priority, the most important first. The lines given are left as they are. */
export function byPriority<T extends { readonly id: TodoId }>(todos: readonly T[]): T[] {
  return [...todos].sort((a, b) => TODO_PRIORITY.indexOf(a.id) - TODO_PRIORITY.indexOf(b.id));
}
