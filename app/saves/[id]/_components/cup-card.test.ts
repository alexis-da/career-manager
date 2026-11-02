import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, MIN_ACCENT_CONTRAST } from "@/src/lib/color";

const STYLES = readFileSync("app/globals.css", "utf8");

/** A colour of the game's palette, as the style sheet sets it. */
function token(name: string): string {
  const value = new RegExp(`--${name}: (#[0-9a-f]{6});`).exec(STYLES)?.[1];
  if (value === undefined) {
    throw new Error(`No colour --${name} in the style sheet`);
  }
  return value;
}

describe("the cup card's rounds", () => {
  it("shows the round lost clearly enough on the card's bright blue", () => {
    expect(contrastRatio(token("loss-on-blue"), token("primary"))).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST);
  });
});
