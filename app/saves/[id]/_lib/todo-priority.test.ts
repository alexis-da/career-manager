import { describe, expect, it } from "vitest";
import { byPriority, TODO_PRIORITY, TODOS_SHOWN, type TodoId } from "./todo-priority";

/** A line as the list makes it: its id, and what it says. */
const line = (id: TodoId) => ({ id, title: `The ${id} line` });

const ranked = (...ids: TodoId[]) => byPriority(ids.map((id) => line(id))).map(({ id }) => id);

describe("the priority of the dashboard's to-do lines", () => {
  it("ranks the eighteen lines, a team that cannot line up first, what only informs last", () => {
    expect(TODO_PRIORITY).toEqual([
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
    ]);
    expect(new Set(TODO_PRIORITY).size).toBe(TODO_PRIORITY.length);
    expect(TODOS_SHOWN).toBe(3);
  });

  it("sorts the lines by it, whatever the order they were found in, and leaves them as they are", () => {
    const found = [line("weak-spot"), line("coach-ended"), line("injured"), line("goalkeepers"), line("sale-proposals"), line("coach-offer")];
    const before = [...found];

    expect(byPriority(found).map(({ id }) => id)).toEqual(["goalkeepers", "coach-offer", "sale-proposals", "injured", "weak-spot", "coach-ended"]);
    // Their contents with them, the list given untouched.
    expect(byPriority(found)[0]).toBe(found[3]);
    expect(found).toEqual(before);
  });

  it("puts a missing goalkeeper before the weak spot, the starters out before the proposed sales, the call-ups before the bookings", () => {
    expect(ranked("weak-spot", "goalkeepers")).toEqual(["goalkeepers", "weak-spot"]);
    expect(ranked("sale-proposals", "suspended-starters", "injured-starters")).toEqual(["injured-starters", "suspended-starters", "sale-proposals"]);
    expect(ranked("booking-risks", "coach-call-up", "international-callups", "international-returns")).toEqual([
      "international-returns",
      "international-callups",
      "coach-call-up",
      "booking-risks",
    ]);
    expect(ranked("coach-ended", "europe-booking-risks", "tired-starters")).toEqual(["tired-starters", "europe-booking-risks", "coach-ended"]);
    expect(ranked()).toEqual([]);
  });

  it("puts a starter the assistant means to let go right after a federation's offer, where every expiring contract stands", () => {
    expect(ranked("sale-proposals", "important-contracts", "coach-offer", "goalkeepers")).toEqual([
      "goalkeepers",
      "coach-offer",
      "important-contracts",
      "sale-proposals",
    ]);
    expect(ranked("small-squad", "expiring-contracts", "important-contracts")).toEqual([
      "important-contracts",
      "expiring-contracts",
      "small-squad",
    ]);
    expect(TODO_PRIORITY.indexOf("important-contracts")).toBe(TODO_PRIORITY.indexOf("coach-offer") + 1);
  });

  it("puts the proposed sales after the contracts, then a full squad, before a thin one (docs/design/simplification.md § 4.1)", () => {
    expect(ranked("small-squad", "squad-full", "sale-proposals", "expiring-contracts")).toEqual([
      "expiring-contracts",
      "sale-proposals",
      "squad-full",
      "small-squad",
    ]);
  });
});
