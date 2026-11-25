import { describe, expect, it } from "vitest";
import { testTranslator } from "@/src/i18n/test-intl";
import { FORMATION_TARGET, lineupBubbleOf } from "./tutorial-step";

describe("the tutorial's step of the line-up", () => {
  it("rings the formation while the assistant makes the eleven, its sheet opened its move, nothing to save after it", () => {
    expect(lineupBubbleOf(true, true, -1)).toEqual({ text: "lineupAssistant", target: FORMATION_TARGET, doneOn: FORMATION_TARGET });
    // His way, the weak spot is not the step's: the formation all the same.
    expect(lineupBubbleOf(true, true, 4)?.target).toBe('[data-testid="lineup-formation"]');
  });

  it("rings the weak spot's slot while the player makes it, a slot touched its move: every gesture is saved at once", () => {
    expect(lineupBubbleOf(true, false, 4)).toEqual({
      text: "lineup",
      target: '[data-testid="pitch-slot"][data-slot-index="4"]',
      doneOn: '[data-testid="pitch-slot"]',
    });
    expect(lineupBubbleOf(true, false, -1)).toBeNull();
  });

  it("shows nothing when the step is not due", () => {
    expect(lineupBubbleOf(false, true, -1)).toBeNull();
    expect(lineupBubbleOf(false, false, 2)).toBeNull();
  });

  it("says what the assistant does in 140 characters at most, by the gesture of the screen, in both languages", () => {
    const fr = testTranslator("fr", "tutorial.steps");
    const en = testTranslator("en", "tutorial.steps");

    expect(fr("lineupAssistant", { touch: "touch" })).toBe(
      "Je fais ton onze avant chaque match. Toi, choisis le dispositif ; touche un joueur si tu veux le faire toi-même.",
    );
    expect(fr("lineupAssistant", { touch: "click" })).toContain("; clique sur un joueur");
    expect(en("lineupAssistant", { touch: "touch" })).toBe(
      "I make your eleven before every match. You pick the formation; tap a player if you'd rather make it yourself.",
    );
    expect(en("lineupAssistant", { touch: "click" })).toContain("click a player");
    for (const t of [fr, en]) {
      for (const touch of ["touch", "click"] as const) {
        expect(t("lineupAssistant", { touch }).length).toBeLessThanOrEqual(140);
      }
    }
  });
});
