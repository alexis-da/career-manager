import { describe, expect, it } from "vitest";
import { isPayrollHigh } from "./payroll";

describe("isPayrollHigh", () => {
  it("warns from 90 % of the wage budget, and above it", () => {
    expect(isPayrollHigh(89, 100)).toBe(false);
    expect(isPayrollHigh(90, 100)).toBe(true);
    expect(isPayrollHigh(120, 100)).toBe(true);
  });

  it("has nothing to say without a wage budget", () => {
    expect(isPayrollHigh(0, 0)).toBe(false);
    expect(isPayrollHigh(10, 0)).toBe(false);
  });
});
