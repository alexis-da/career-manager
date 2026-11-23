import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isLocalDatabase } from "./database-url";

// Nothing run from the workstation or from GitHub's tests may reach Neon, which holds production alone and is reached
// by Vercel only (CLAUDE.md, « Bases de données »). Two guarantees, kept by this file: every database connection the
// code opens checks its URL first (assertLocalDatabase, src/db/database-url.ts, refusing any host but localhost outside
// Vercel unless ALLOW_REMOTE_DB=1); and the test workflows (.github/workflows/ci.yml, weekly.yml) read no secret, give
// only local databases and never lift the guard.

const SOURCE_ROOTS = ["app", "src", "e2e", "scripts", "prisma"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);
const SKIPPED_FOLDERS = ["node_modules", "generated"];
/** pg's clients and pools, Prisma's client and adapters: what opens a connection. */
const OPENS_A_CONNECTION = /\bnew (Client|Pool|PrismaClient|PrismaPg|SequentialPrismaPg)\(/;
const THIS_FILE = path.join("src", "db", "connection-guard.test.ts");

function sourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .map((file) => path.join(root, file))
    .filter((file) => SOURCE_EXTENSIONS.has(path.extname(file)))
    .filter((file) => !file.split(path.sep).some((folder) => SKIPPED_FOLDERS.includes(folder)));
}

/** The workflows that run the tests, and the steps they share. */
const TEST_WORKFLOWS = [
  ".github/workflows/ci.yml",
  ".github/workflows/weekly.yml",
  ".github/actions/prepare/action.yml",
  ".github/actions/test-database/action.yml",
  ".github/actions/playwright/action.yml",
];

/** Every source file of the repository read, twice for those that open a connection: more than 5 s while the suite runs. */
const READING_MS = 30_000;

describe("the connections to the database", () => {
  it("check their URL against localhost in every file that opens one", () => {
    const opening = SOURCE_ROOTS.flatMap(sourceFiles).filter(
      (file) => file !== THIS_FILE && OPENS_A_CONNECTION.test(readFileSync(file, "utf8")),
    );
    const unguarded = opening.filter((file) => !readFileSync(file, "utf8").includes("assertLocalDatabase("));

    // The app's client, the seed, the end-to-end tests' helpers, the tests' locks and their own clients.
    expect(opening.length).toBeGreaterThanOrEqual(7);
    expect(unguarded).toEqual([]);
  }, READING_MS);

  it("are local in the test workflows, which read no secret and never lift the guard", () => {
    for (const workflow of TEST_WORKFLOWS) {
      // What runs, without the comments that explain the guard.
      const text = readFileSync(workflow, "utf8").replace(/(^|\s)#.*$/gm, "$1");
      const urls = text.match(/postgres(?:ql)?:\/\/[^\s"']+/g) ?? [];

      expect(text, workflow).not.toMatch(/\bsecrets\./);
      expect(text, workflow).not.toMatch(/ALLOW_REMOTE_DB|VERCEL/);
      expect(urls.filter((url) => !isLocalDatabase(url)), workflow).toEqual([]);
    }
    // ci.yml and weekly.yml each give the three URLs of their jobs.
    const workflowUrls = TEST_WORKFLOWS.slice(0, 2).flatMap(
      (workflow) => readFileSync(workflow, "utf8").match(/postgresql:\/\/[^\s"']+/g) ?? [],
    );
    expect(workflowUrls).toHaveLength(6);
  });
});
