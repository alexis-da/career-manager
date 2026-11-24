import { describe, expect, it } from "vitest";
import { byPriority, TODO_PRIORITY, TODOS_SHOWN, type TodoId } from "./todo-priority";

/** A line as the list makes it: its id, and what it says. */
const line = (id: TodoId) => ({ id, title: `The ${id} line` });

describe("the priority of the dashboard's to-do lines", () => {
  it("ranks the seventeen lines, a team that cannot line up first, what only informs last", () => {
    expect(TODO_PRIORITY).toEqual([
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
    ]);
    expect(new Set(TODO_PRIORITY).size).toBe(TODO_PRIORITY.length);
    expect(TODOS_SHOWN).toBe(3);
  });

  it("sorts the lines by it, whatever the order they were found in, and leaves them as they are", () => {
    const found = [line("weak-spot"), line("full-squad"), line("injured"), line("goalkeepers"), line("offers"), line("coach-offer")];
    const before = [...found];

    expect(byPriority(found).map(({ id }) => id)).toEqual(["goalkeepers", "coach-offer", "offers", "injured", "weak-spot", "full-squad"]);
    // Their contents with them, the list given untouched.
    expect(byPriority(found)[0]).toBe(found[3]);
    expect(found).toEqual(before);
  });

  it("puts a missing goalkeeper before the weak spot, the starters out before the offers, the call-ups before the bookings", () => {
    const ranked = (...ids: TodoId[]) => byPriority(ids.map((id) => line(id))).map(({ id }) => id);

    expect(ranked("weak-spot", "goalkeepers")).toEqual(["goalkeepers", "weak-spot"]);
    expect(ranked("offers", "suspended-starters", "injured-starters")).toEqual(["injured-starters", "suspended-starters", "offers"]);
    expect(ranked("booking-risks", "coach-call-up", "international-callups", "international-returns")).toEqual([
      "international-returns",
      "international-callups",
      "coach-call-up",
      "booking-risks",
    ]);
    expect(ranked("full-squad", "coach-ended", "europe-booking-risks", "tired-starters")).toEqual([
      "tired-starters",
      "europe-booking-risks",
      "coach-ended",
      "full-squad",
    ]);
    expect(ranked()).toEqual([]);
  });
});
