import * as z from "zod";
import fallbackNames from "../../prisma/seed/data/club-aliases-fallback.json";

/**
 * The single point where a club's displayed name is decided (CLAUDE.md, « Marque et règles produit »). Every name a
 * player can read — pages, match messages, transfer and refusal texts — goes through displayClubName, called where
 * the database rows become views (src/db), never in a client component: CLUB_NAMES is a server variable.
 *
 * - real (default): the club's name from the world, as OpenFootball spells it;
 * - fictional: a neutral name from prisma/seed/data/club-aliases-fallback.json, keyed by slug: the city or region
 *   and a plain word, never the real club's distinctive word.
 */
export const CLUB_NAME_MODES = ["real", "fictional"] as const;

export type ClubNameMode = (typeof CLUB_NAME_MODES)[number];

/** What naming a club needs: its slug picks the fictional name, its name is the real one. */
export type NamedClub = { slug: string; name: string };

const fallbackSchema = z.record(z.string().min(1), z.string().min(1));

/** Fictional names by club slug, validated when the module loads. */
export const FICTIONAL_CLUB_NAMES: ReadonlyMap<string, string> = new Map(Object.entries(fallbackSchema.parse(fallbackNames)));

/** CLUB_NAMES read as a mode: unset or empty is real; anything else but the two modes is refused. */
export function parseClubNameMode(value: string | undefined): ClubNameMode {
  if (value === undefined || value.trim() === "") {
    return "real";
  }
  const mode = value.trim();
  if (!(CLUB_NAME_MODES as readonly string[]).includes(mode)) {
    throw new Error(`CLUB_NAMES must be one of ${CLUB_NAME_MODES.join(", ")}, got "${value}"`);
  }
  return mode as ClubNameMode;
}

/** Read once, when the server starts: a running server never switches mode. */
const CLUB_NAME_MODE: ClubNameMode = parseClubNameMode(process.env.CLUB_NAMES);

/** A club's name in a given mode. Pure: tests call it with either mode. */
export function clubNameIn(mode: ClubNameMode, club: NamedClub): string {
  if (mode === "real") {
    return club.name;
  }
  const fictional = FICTIONAL_CLUB_NAMES.get(club.slug);
  if (fictional === undefined) {
    // Never fall back on the real name: in fictional mode, it must not be shown.
    throw new Error(`No fictional name for club "${club.slug}" in club-aliases-fallback.json`);
  }
  return fictional;
}

/** A club's short name in a given mode: its own short name if the world has one, else its name. */
export function clubShortNameIn(mode: ClubNameMode, club: NamedClub & { shortName?: string | null }): string {
  return mode === "real" ? (club.shortName ?? club.name) : clubNameIn(mode, club);
}

/** The name a player reads for a club, in the mode the server started with. */
export function displayClubName(club: NamedClub): string {
  return clubNameIn(CLUB_NAME_MODE, club);
}

/** The short name a player reads for a club, in the mode the server started with. */
export function displayClubShortName(club: NamedClub & { shortName?: string | null }): string {
  return clubShortNameIn(CLUB_NAME_MODE, club);
}
