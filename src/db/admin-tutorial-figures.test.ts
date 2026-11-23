import { describe, expect, it } from "vitest";
import { DROPOUT_DAYS, REFERENCE_DAYS, RETURN_COHORTS, returnsOf, stepsOf } from "./admin-tutorial";

// The assembling of /admin's tutorial figures (src/db/admin-tutorial.ts), without a database: each row of the returns
// over the days whose return day is over, as the Retention section counts them; each step of the tutorial in the
// scenario's order, the first day's then the following days'. The queries are tested in the database (admin-tutorial.test.ts).

const none = { part: 0, whole: 0 };

describe("the tutorial's figures", () => {
  it("counts a dropout after 7 days unseen, and the reference over the 14 days before the release (cahier § 4)", () => {
    expect(DROPOUT_DAYS).toBe(7);
    expect(REFERENCE_DAYS).toBe(14);
    expect(RETURN_COHORTS).toEqual(["day1Done", "skippedDay1", "noFirstMatch", "reference"]);
  });

  it("counts every day's players, but their returns only once the return day is over, in the table's order", () => {
    const returns = returnsOf(
      [
        // Today is the 20th: the 12th's next day and seventh day are over, the 18th's next day only, the 19th's neither.
        { day: "2026-11-19", cohort: "day1Done", players: 5, day1: 0, day7: 0 },
        { day: "2026-11-12", cohort: "day1Done", players: 4, day1: 2, day7: 1 },
        { day: "2026-11-18", cohort: "day1Done", players: 3, day1: 1, day7: 0 },
        { day: "2026-11-05", cohort: "reference", players: 10, day1: 3, day7: 2 },
        // A row the table does not have.
        { day: "2026-11-12", cohort: "someone", players: 9, day1: 9, day7: 9 },
      ],
      "2026-11-20",
    );

    expect(returns).toEqual([
      { cohort: "day1Done", players: 12, day1: { part: 3, whole: 7 }, day7: { part: 1, whole: 4 } },
      { cohort: "skippedDay1", players: 0, day1: none, day7: none },
      { cohort: "noFirstMatch", players: 0, day1: none, day7: none },
      { cohort: "reference", players: 10, day1: { part: 3, whole: 10 }, day7: { part: 2, whole: 10 } },
    ]);
  });

  it("knows a return day across the end of a month", () => {
    const [, , noFirstMatch] = returnsOf([{ day: "2026-10-31", cohort: "noFirstMatch", players: 2, day1: 1, day7: 0 }], "2026-11-02");

    // The 1st of November is over on the 2nd; the 7th is not.
    expect(noFirstMatch).toEqual({ cohort: "noFirstMatch", players: 2, day1: { part: 1, whole: 2 }, day7: none });
    expect(returnsOf([{ day: "2026-10-31", cohort: "noFirstMatch", players: 2, day1: 1, day7: 0 }], "2026-11-01")[2].day1).toEqual(none);
  });

  it("lists the tutorial's steps in the scenario's order, 0 where a query had none, a step it does not know left out", () => {
    const steps = stepsOf(
      [
        { step: "half-time", shown: 4, done: 3, passed: 1, adapted: 0 },
        { step: "welcome", shown: 9, done: 6, passed: 1, adapted: 2 },
        { step: "cup", shown: 3, done: 2, passed: 0, adapted: 1 },
        // The farewell is no step of its own: said once, it says nothing of the tutorial.
        { step: "farewell", shown: 7, done: 7, passed: 0, adapted: 0 },
        { step: "someday", shown: 7, done: 7, passed: 0, adapted: 0 },
      ],
      [{ step: "welcome", tutorials: 2 }],
      [
        { step: "speed", tutorials: 1 },
        { step: "someday", tutorials: 5 },
      ],
    );

    expect(steps).toEqual([
      { step: "welcome", shown: 9, done: 6, passed: 1, adapted: 2, skipped: 2, lastShown: 0 },
      { step: "speed", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 1 },
      { step: "choice", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "half-time", shown: 4, done: 3, passed: 1, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "full-time", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "missions", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "market", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "objectives", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "lineup", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "squad", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "simulate", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "break", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "europe", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "cup", shown: 3, done: 2, passed: 0, adapted: 1, skipped: 0, lastShown: 0 },
      { step: "fitness", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
      { step: "judged", shown: 0, done: 0, passed: 0, adapted: 0, skipped: 0, lastShown: 0 },
    ]);
  });
});
