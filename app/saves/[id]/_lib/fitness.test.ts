import { describe, expect, it } from "vitest";
import { FULL_FITNESS, INJURY_RISK_FITNESS, ROTATION_FITNESS } from "@/src/engine/balance";
import { fitnessBarClass, fitnessFigure, fitnessLevel, fitnessTextClass, fitnessWidth } from "./fitness";

describe("a player's fitness on the screens", () => {
  it("shows a whole figure within 0–100, whatever a match has left of it", () => {
    expect(fitnessFigure(85)).toBe(85);
    // A goalkeeper at the break: 100 − 3 × 1.5.
    expect(fitnessFigure(95.5)).toBe(96);
    expect(fitnessFigure(-3)).toBe(0);
    expect(fitnessFigure(FULL_FITNESS + 1)).toBe(FULL_FITNESS);
  });

  it("reads tired where an AI club rests a player, and at risk where his injury risk grows", () => {
    expect(fitnessLevel(FULL_FITNESS)).toBe("fresh");
    expect(fitnessLevel(90)).toBe("fresh");
    expect(fitnessLevel(89)).toBe("fine");
    expect(fitnessLevel(ROTATION_FITNESS)).toBe("fine");
    expect(fitnessLevel(ROTATION_FITNESS - 1)).toBe("tired");
    expect(fitnessLevel(INJURY_RISK_FITNESS)).toBe("tired");
    expect(fitnessLevel(INJURY_RISK_FITNESS - 1)).toBe("exhausted");
    expect(fitnessLevel(0)).toBe("exhausted");
  });

  it("judges the figure it shows: a fitness rounded up to 75 is not tired", () => {
    expect(fitnessLevel(74.5)).toBe("fine");
    expect(fitnessLevel(74.4)).toBe("tired");
  });

  it("colours the bar green when fresh, neutral, amber when tired, red at risk", () => {
    expect(fitnessBarClass(100)).toBe("bg-win");
    expect(fitnessBarClass(85)).toBe("bg-foreground/60");
    expect(fitnessBarClass(72)).toBe("bg-warning");
    expect(fitnessBarClass(60)).toBe("bg-loss");
  });

  it("warns in the figure only when tired or at risk, with the lighter red on the bright blue", () => {
    expect(fitnessTextClass(100)).toBe("");
    expect(fitnessTextClass(80)).toBe("");
    expect(fitnessTextClass(72)).toBe("text-warning");
    expect(fitnessTextClass(72, true)).toBe("text-warning");
    expect(fitnessTextClass(60)).toBe("text-loss");
    expect(fitnessTextClass(60, true)).toBe("text-loss-on-blue");
  });

  it("fills the bar with the figure's share", () => {
    expect(fitnessWidth(100)).toBe("100%");
    expect(fitnessWidth(70)).toBe("70%");
    expect(fitnessWidth(95.5)).toBe("96%");
  });
});
