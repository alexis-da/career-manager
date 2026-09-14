import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as z from "zod";
import type { MatchScore } from "../../src/engine/standings";
import { CLUB_ALIASES } from "./aliases";

// 2024-25 fixture files, downloaded once from openfootball/football.json (CC0).
const DATA_DIR = new URL("./data/", import.meta.url);

const goalsSchema = z.tuple([z.number().int(), z.number().int()]);

const matchSchema = z.object({
  round: z.string(),
  date: z.string(),
  time: z.string().optional(),
  team1: z.string().min(1),
  team2: z.string().min(1),
  // Absent (or without "ft") for a match not played yet.
  score: z.object({ ht: goalsSchema.optional(), ft: goalsSchema.optional() }).optional(),
  status: z.string().optional(),
});

const fixtureFileSchema = z.object({
  name: z.string(),
  matches: z.array(matchSchema).min(1),
});

export type FixtureFile = z.infer<typeof fixtureFileSchema>;

export type SeedClub = {
  slug: string;
  name: string;
};

export type ClubAliases = Readonly<Record<string, string>>;

export function fixtureFilePath(code: string): string {
  return fileURLToPath(new URL(`${code}.json`, DATA_DIR));
}

export function parseFixtureFile(raw: unknown, source: string): FixtureFile {
  const result = fixtureFileSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid OpenFootball file ${source}:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function readFixtureFile(path: string): FixtureFile {
  return parseFixtureFile(JSON.parse(readFileSync(path, "utf8")), path);
}

/** Trims and collapses whitespace. Accents and casing are kept: this is the display name. */
export function normalizeClubName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function resolveClubName(raw: string, aliases: ClubAliases = CLUB_ALIASES): string {
  const name = normalizeClubName(raw);
  return aliases[name] ?? name;
}

/** Stable ASCII slug: "Borussia Mönchengladbach" → "borussia-monchengladbach". */
export function slugify(name: string): string {
  return name
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Distinct clubs of a fixture file, sorted by slug so the output never depends on match order. */
export function extractClubs(file: FixtureFile, aliases: ClubAliases = CLUB_ALIASES): SeedClub[] {
  const namesBySlug = new Map<string, string>();

  for (const match of file.matches) {
    for (const team of [match.team1, match.team2]) {
      const name = resolveClubName(team, aliases);
      const slug = slugify(name);
      if (slug === "") {
        throw new Error(`Club name "${team}" produces an empty slug`);
      }
      const existing = namesBySlug.get(slug);
      if (existing !== undefined && existing !== name) {
        throw new Error(`Slug "${slug}" is shared by "${existing}" and "${name}": add an alias`);
      }
      namesBySlug.set(slug, name);
    }
  }

  return [...namesBySlug]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** Full-time scores of the played matches, clubs keyed by slug. Matches without a full-time score are skipped. */
export function extractScores(file: FixtureFile, aliases: ClubAliases = CLUB_ALIASES): MatchScore[] {
  return file.matches.flatMap((match) => {
    const fullTime = match.score?.ft;
    if (fullTime === undefined) {
      return [];
    }
    return [
      {
        home: slugify(resolveClubName(match.team1, aliases)),
        away: slugify(resolveClubName(match.team2, aliases)),
        homeGoals: fullTime[0],
        awayGoals: fullTime[1],
      },
    ];
  });
}
