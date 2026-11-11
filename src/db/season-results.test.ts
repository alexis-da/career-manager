import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { prisma as prismaClient } from "./client";

// The viewer the mocked requireOwnedSave checks the save against: the card's route runs without a request here.
const viewer = vi.hoisted(() => ({ current: null as { id: string } | null }));

vi.mock("../auth/current-user", async () => {
  const { loadOwnedSave } = await import("./access");
  return { requireOwnedSave: (saveId: string) => loadOwnedSave(saveId, viewer.current) };
});

// Nor Next's data cache, which keeps the drawn cards across requests on a real server: each call draws here.
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  unstable_cache: <T extends (...args: never[]) => unknown>(draw: T): T => draw,
}));

// Nor its language: the card's words in French.
vi.mock("next-intl/server", async () => {
  const { testTranslator } = await import("../i18n/test-intl");
  return {
    getTranslations: async (namespace: "positions" | "world" | "seasons" | "seasonCard") => testTranslator("fr", namespace),
    getLocale: async () => "fr" as const,
  };
});

// The palmarès of the demo save, against DATABASE_URL: its first season, completed before SeasonResult existed or
// rebuilt here, and its card. Skipped without DATABASE_URL; modules are imported lazily because the client throws
// without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("season results of the demo save", () => {
  let db: typeof prismaClient | undefined;
  let results: typeof import("./season-results") | undefined;
  let route: typeof import("../../app/saves/[id]/seasons/[seasonId]/card/route") | undefined;
  let saveId = "";
  let seasonId = "";
  let owner = "";
  // Real time, not simulation code: a unique id keeps parallel runs apart.
  const otherUser = `test-season-results-other-${Date.now()}`;

  const loaded = () => {
    if (db === undefined || results === undefined || route === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, results, route };
  };

  /** What Next's notFound() throws: the route answers 404. */
  const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

  beforeAll(async () => {
    const [{ prisma }, support, resultsModule, routeModule] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./season-results"),
      import("../../app/saves/[id]/seasons/[seasonId]/card/route"),
    ]);
    db = prisma;
    results = resultsModule;
    route = routeModule;
    saveId = await support.ensureDemoSave();
    owner = support.DEMO_USER_ID;
    await support.ensureDemoUser(otherUser);
    const season = await prisma.season.findFirstOrThrow({
      where: { saveId, completed: true, startYear: support.DEMO_START_YEAR - 1, competition: { code: "fr.1" } },
      select: { id: true },
    });
    seasonId = season.id;
  }, 900_000);

  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: otherUser } });
    await db?.$disconnect();
  });

  it("rebuilds the result of a season completed without one, once", async () => {
    const { db, results } = loaded();
    // As a save from before SeasonResult: the demo save's first season without its row.
    await db.seasonResult.deleteMany({ where: { saveId } });

    const first = await results.getSeasonResults(saveId);
    const rows = await db.seasonResult.findMany({ where: { saveId }, select: { id: true, createdAt: true } });
    const second = await results.getSeasonResults(saveId);

    expect(first.seasons.map((season) => season.seasonId)).toEqual([seasonId]);
    expect(first.seasons[0]).toMatchObject({ startYear: 2026, played: 34, competitionCode: "fr.1" });
    expect(first.seasons[0].bestPlayer).not.toBeNull();
    expect(rows).toHaveLength(1);
    expect(await db.seasonResult.findMany({ where: { saveId }, select: { id: true, createdAt: true } })).toEqual(rows);
    expect(second).toEqual(first);
  });

  // 15 s: the first card drawn loads the fonts and the image engine, more than the default 5 s on a busy machine. An
  // address with its language always gives the same image: the browser keeps it a year, privately; without it, the
  // card follows the player's language, asked again each time.
  it.each([
    ["landscape", "?lang=fr&v=1", { width: 1200, height: 630 }, "private, max-age=31536000, immutable"],
    ["square", "?lang=fr&v=1&format=square", { width: 1080, height: 1080 }, "private, max-age=31536000, immutable"],
    ["landscape", "", { width: 1200, height: 630 }, "private, no-cache"],
  ] as const)("draws the %s card as a PNG for the save's owner (%s)", async (_format, query, size, cacheControl) => {
    const { route } = loaded();
    viewer.current = { id: owner };
    const response = await route.GET(new Request(`http://localhost/saves/${saveId}/seasons/${seasonId}/card${query}`), {
      params: Promise.resolve({ id: saveId, seasonId }),
    });
    const bytes = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe(cacheControl);
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }).toEqual(size);
  }, 15_000);

  it("answers 404 to another player, and to nobody", async () => {
    const { route } = loaded();
    const request = () =>
      route.GET(new Request(`http://localhost/saves/${saveId}/seasons/${seasonId}/card`), {
        params: Promise.resolve({ id: saveId, seasonId }),
      });

    viewer.current = { id: otherUser };
    await expect(request()).rejects.toMatchObject(NOT_FOUND);
    viewer.current = null;
    await expect(request()).rejects.toMatchObject(NOT_FOUND);
  });
});
