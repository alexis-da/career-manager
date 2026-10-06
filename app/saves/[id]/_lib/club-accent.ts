import type { CSSProperties } from "react";
import { contrastText, ensureContrast } from "@/src/lib/color";

/** The theme's --background in hex: the surface the club accent must stand out on. */
const BACKGROUND = "#0B0D10";

/**
 * The club accent as CSS variables: --club marks the club name, the main button, active tabs, the club's row in
 * tables and attribute bars; --club-fg is the text on it. Set by the save layout, and again on anything portaled
 * out of it (a hover card), which would not inherit them.
 */
export function clubAccentStyle(primaryColor: string): CSSProperties {
  const club = ensureContrast(primaryColor, BACKGROUND);
  return { "--club": club, "--club-fg": contrastText(club) } as CSSProperties;
}
