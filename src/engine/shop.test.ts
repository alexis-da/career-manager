import { describe, expect, it } from "vitest";
import {
  BUDGET_TOP_UP_MIN,
  ITEM_PRICES,
  SEASON_LIMITS,
  budgetTopUp,
  careUntil,
  daysLeft,
  itemsLeft,
  youthPositionIn,
} from "./shop";
import type { Position } from "./positions";

const day = (date: string) => new Date(`${date}T00:00:00.000Z`);

describe("the shop's items", () => {
  it("cost and limit as the design says", () => {
    expect(ITEM_PRICES).toEqual({ FITNESS_CAMP: 40, EXPRESS_CARE: 60, BUDGET_TOP_UP: 200, PROMISING_YOUTH: 350, STREAK_SHIELD: 50 });
    expect(SEASON_LIMITS).toEqual({ FITNESS_CAMP: 5, EXPRESS_CARE: 3, BUDGET_TOP_UP: 1, PROMISING_YOUTH: 1 });
    expect(itemsLeft("PROMISING_YOUTH", 0, 2)).toEqual({ season: 1, career: 1 });
    expect(itemsLeft("PROMISING_YOUTH", 1, 3)).toEqual({ season: 0, career: 0 });
    expect(itemsLeft("FITNESS_CAMP", 2, 9)).toEqual({ season: 3, career: null });
  });

  it("tops a budget up by 5 % of its dotation, never under 100 000 €", () => {
    expect(budgetTopUp(37_100_000)).toBe(1_900_000);
    expect(budgetTopUp(150_000_000)).toBe(7_500_000);
    expect(budgetTopUp(1_000_000)).toBe(BUDGET_TOP_UP_MIN);
  });

  it("halves an injury's days left, rounded up, from four days left", () => {
    expect(daysLeft(day("2026-09-20"), day("2026-09-01"))).toBe(19);
    expect(careUntil(day("2026-09-20"), day("2026-09-01"))).toEqual(day("2026-09-11"));
    expect(careUntil(day("2026-09-05"), day("2026-09-01"))).toEqual(day("2026-09-03"));
    expect(careUntil(day("2026-09-04"), day("2026-09-01"))).toBeNull();
    expect(careUntil(null, day("2026-09-01"))).toBeNull();
  });

  it("places a promising youth in his line where the squad is shortest", () => {
    const squad: Position[] = ["GK", "GK", "RB", "RB", "CB", "CB", "CB", "CB", "LB", "CDM", "CDM", "CM", "CM", "CAM", "CAM", "RW", "RW", "LW", "LW", "ST"];
    expect(youthPositionIn("GK", squad)).toBe("GK");
    expect(youthPositionIn("DF", squad)).toBe("LB");
    expect(youthPositionIn("MF", squad)).toBe("CM");
    expect(youthPositionIn("FW", squad)).toBe("ST");
  });
});
