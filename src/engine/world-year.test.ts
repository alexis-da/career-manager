import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const SKIPPED_DIRECTORIES = new Set(["generated", "data", "__snapshots__", "node_modules"]);

/** Source files of the game and of the seed, tests excluded: tests may pin dates, the code may not. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Lines of code holding a year literal, comments left out: « src/engine/world.ts: export const … ». */
function yearLiterals(): string[] {
  const files = ["src", "app", join("prisma", "seed")].flatMap((directory) => sourceFiles(join(ROOT, directory)));
  return files.flatMap((file) =>
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.replace(/\/\/.*$/, "").trim())
      .filter((code) => !/^(\*|\/\*)/.test(code) && /\b20\d{2}\b/.test(code))
      .map((code) => `${file.slice(ROOT.length + 1).replaceAll("\\", "/")}: ${code}`),
  ).sort();
}

describe("the game's year", () => {
  it("is set in one place, WORLD_START_YEAR; the only other year is the season of the OpenFootball files", () => {
    expect(yearLiterals()).toEqual([
      "prisma/seed/openfootball.ts: export const SOURCE_SEASON_START_YEAR = 2024;",
      "src/engine/world.ts: export const WORLD_START_YEAR = 2026;",
    ]);
  });
});
