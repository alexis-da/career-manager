export const WHITE = "#FFFFFF";
export const BLACK = "#000000";

/** A club's traditional colors, #RRGGBB, as stored on Club. */
export type ClubColors = { primary: string; secondary: string };

export function clubColorsOf(club: { primaryColor: string; secondaryColor: string }): ClubColors {
  return { primary: club.primaryColor, secondary: club.secondaryColor };
}

/** Contrast ratio an accent must reach on its background: WCAG's minimum for large text and UI parts. */
export const MIN_ACCENT_CONTRAST = 3;

const MIX_STEPS = 20;
const HEX_COLOR = /^#([0-9A-Fa-f]{6})$/;

type Rgb = { r: number; g: number; b: number };

function parseHex(hex: string): Rgb {
  const match = HEX_COLOR.exec(hex);
  if (match === null) {
    throw new RangeError(`Expected a #RRGGBB color, got "${hex}"`);
  }
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** WCAG relative luminance, from 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const { r, g, b } = parseHex(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Text color readable on a background: white or black, whichever contrasts more. */
export function contrastText(background: string): typeof WHITE | typeof BLACK {
  return contrastRatio(background, WHITE) >= contrastRatio(background, BLACK) ? WHITE : BLACK;
}

function mix(from: string, to: string, share: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  return toHex({ r: a.r + (b.r - a.r) * share, g: a.g + (b.g - a.g) * share, b: a.b + (b.b - a.b) * share });
}

/**
 * The accent itself when it reaches `minRatio` on the background; otherwise the accent lightened (on a dark
 * background) or darkened (on a light one) step by step until it does.
 */
export function ensureContrast(accent: string, background: string, minRatio: number = MIN_ACCENT_CONTRAST): string {
  const start = toHex(parseHex(accent));
  if (contrastRatio(start, background) >= minRatio) {
    return start;
  }
  const target = contrastText(background);
  for (let step = 1; step <= MIX_STEPS; step++) {
    const candidate = mix(start, target, step / MIX_STEPS);
    if (contrastRatio(candidate, background) >= minRatio) {
      return candidate;
    }
  }
  return target;
}

/** Contrast a club color must reach as it is to serve as an accent: a darker one, lightened to 3:1, fades into grey. */
export const MIN_CLUB_COLOR_CONTRAST = 2;

/**
 * The club's colors usable as accents on a background, the most contrasting first (measured before any lightening),
 * each then brought to `minRatio` by ensureContrast; `fallback` alone when neither reaches MIN_CLUB_COLOR_CONTRAST.
 */
export function clubAccentsOn(
  colors: ClubColors,
  background: string,
  fallback: string,
  minRatio: number = MIN_ACCENT_CONTRAST,
): [string, ...string[]] {
  const [first, ...rest] = [colors.primary, colors.secondary]
    .map((color) => ({ color, ratio: contrastRatio(color, background) }))
    .filter(({ ratio }) => ratio >= MIN_CLUB_COLOR_CONTRAST)
    .sort((a, b) => b.ratio - a.ratio) // stable: the primary color first on a tie
    .map(({ color }) => ensureContrast(color, background, minRatio));
  return first === undefined ? [fallback] : [first, ...rest];
}
