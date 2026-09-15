import { describe, expect, it } from "vitest";
import { BLACK, contrastRatio, contrastText, ensureContrast, MIN_ACCENT_CONTRAST, relativeLuminance, WHITE } from "./color";

const DARK_BACKGROUND = "#0A0A0A";
const LIGHT_BACKGROUND = "#FAFAFA";

describe("relativeLuminance and contrastRatio", () => {
  it("follow WCAG: black is 0, white is 1, black on white is 21:1", () => {
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance(WHITE)).toBe(1);
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
  });

  it("rejects anything but #RRGGBB", () => {
    expect(() => relativeLuminance("red")).toThrow(RangeError);
    expect(() => relativeLuminance("#FFF")).toThrow(RangeError);
  });
});

describe("contrastText", () => {
  it("writes black on light colors and white on dark ones", () => {
    expect(contrastText(WHITE)).toBe(BLACK);
    expect(contrastText("#FDE100")).toBe(BLACK); // yellow
    expect(contrastText("#6CABDD")).toBe(BLACK); // sky blue
    expect(contrastText(BLACK)).toBe(WHITE);
    expect(contrastText("#14387F")).toBe(WHITE); // dark blue
    expect(contrastText("#C8102E")).toBe(WHITE); // red
  });

  it("always reaches at least 4.5:1", () => {
    for (let value = 0; value <= 0xffffff; value += 0x0f0f0f) {
      const color = `#${value.toString(16).padStart(6, "0")}`;
      expect(contrastRatio(color, contrastText(color))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("ensureContrast", () => {
  it("keeps an accent that already contrasts enough", () => {
    expect(ensureContrast("#FDE100", DARK_BACKGROUND)).toBe("#FDE100");
    expect(ensureContrast("#14387f", LIGHT_BACKGROUND)).toBe("#14387F");
  });

  it("lightens a dark accent on a dark background and darkens a light one on a light background", () => {
    const lightened = ensureContrast("#14387F", DARK_BACKGROUND);
    const darkened = ensureContrast("#FDE100", LIGHT_BACKGROUND);

    expect(relativeLuminance(lightened)).toBeGreaterThan(relativeLuminance("#14387F"));
    expect(relativeLuminance(darkened)).toBeLessThan(relativeLuminance("#FDE100"));
    expect(contrastRatio(lightened, DARK_BACKGROUND)).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST);
    expect(contrastRatio(darkened, LIGHT_BACKGROUND)).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST);
  });

  it("reaches 3:1 for any accent on dark and light backgrounds, as a #RRGGBB color", () => {
    for (const background of [DARK_BACKGROUND, LIGHT_BACKGROUND, "#262626"]) {
      for (let value = 0; value <= 0xffffff; value += 0x070707) {
        const accent = `#${value.toString(16).padStart(6, "0")}`;
        const result = ensureContrast(accent, background);
        expect(result).toMatch(/^#[0-9A-F]{6}$/);
        expect(contrastRatio(result, background)).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST);
      }
    }
  });
});
