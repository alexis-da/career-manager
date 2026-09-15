import { readFileSync } from "node:fs";
import * as z from "zod";

export type ClubColors = {
  primary: string; // #RRGGBB
  secondary: string; // #RRGGBB
};

/** Neutral grey for a club without traditional colors in club-colors.json; same as the schema defaults. */
export const DEFAULT_CLUB_COLORS: ClubColors = { primary: "#737373", secondary: "#D4D4D4" };

const CLUB_COLORS_FILE = new URL("./data/club-colors.json", import.meta.url);

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Expected a #RRGGBB color");

const clubColorsSchema = z.record(
  z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Expected a club slug"),
  z.strictObject({ primary: hexColor, secondary: hexColor }),
);

/** Traditional colors keyed by club slug, validated with Zod. No logo, no licensed mark: colors only. */
export function readClubColors(): ReadonlyMap<string, ClubColors> {
  const result = clubColorsSchema.safeParse(JSON.parse(readFileSync(CLUB_COLORS_FILE, "utf8")));
  if (!result.success) {
    throw new Error(`Invalid club-colors.json:\n${z.prettifyError(result.error)}`);
  }
  return new Map(Object.entries(result.data));
}
