import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// The count of first visits, against DATABASE_URL: days of April 2001, far from any real one, deleted at the end. Skipped
// without DATABASE_URL; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the count of first visits, in the database", () => {
  let db: typeof prismaClient | undefined;
  let visits: typeof import("./visits") | undefined;
  const DAYS = ["2001-04-01", "2001-04-02"];
  const dates = DAYS.map((day) => new Date(`${day}T00:00:00.000Z`));

  const loaded = () => {
    if (db === undefined || visits === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, visits };
  };
  const rowsOf = async (day: string) =>
    (await loaded().db.visitDay.findMany({ where: { day: new Date(`${day}T00:00:00.000Z`) }, orderBy: [{ source: "asc" }, { page: "asc" }] })).map(
      ({ source, page, visits: count }) => `${source} ${page} ${count}`,
    );

  beforeAll(async () => {
    const [{ prisma }, visitsModule] = await Promise.all([import("./client"), import("./visits")]);
    db = prisma;
    visits = visitsModule;
    await prisma.visitDay.deleteMany({ where: { day: { in: dates } } });
  }, 60_000);

  afterAll(async () => {
    await db?.visitDay.deleteMany({ where: { day: { in: dates } } });
    await db?.$disconnect();
  }, 60_000);

  it("adds each visit to its day, source and page: one row each", async () => {
    const { db, visits } = loaded();
    const [day] = DAYS;

    await visits.recordVisit(db, { day, source: "reddit-playmygame", page: "/" });
    await visits.recordVisit(db, { day, source: "reddit-playmygame", page: "/" });
    await visits.recordVisit(db, { day, source: "reddit-playmygame", page: "/fr" });
    await visits.recordVisit(db, { day, source: "direct", page: "/" });

    expect(await rowsOf(day)).toEqual(["direct / 1", "reddit-playmygame / 2", "reddit-playmygame /fr 1"]);
  });

  it("puts a day's new sources past the most it keeps apart in « (other) », its known ones still counted apart", async () => {
    const { db, visits } = loaded();
    const [, day] = DAYS;
    await db.visitDay.createMany({
      data: Array.from({ length: visits.MAX_VISIT_SOURCES_PER_DAY }, (_, index) => ({
        day: new Date(`${day}T00:00:00.000Z`),
        source: `source-${String(index).padStart(3, "0")}`,
        page: "/",
        visits: 1,
      })),
    });

    await visits.recordVisit(db, { day, source: "brand-new", page: "/" });
    await visits.recordVisit(db, { day, source: "another-one", page: "/fr" });
    await visits.recordVisit(db, { day, source: "source-007", page: "/" });

    const rows = await rowsOf(day);
    expect(rows).toContain(`${visits.OTHER_SOURCES} / 1`);
    expect(rows).toContain(`${visits.OTHER_SOURCES} /fr 1`);
    expect(rows).toContain("source-007 / 2");
    expect(rows.some((row) => row.startsWith("brand-new") || row.startsWith("another-one"))).toBe(false);
  });
});
