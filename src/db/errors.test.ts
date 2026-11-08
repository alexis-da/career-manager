import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// The game's errors in the database (ErrorDay): an error provoked here goes through the server's hook
// (onRequestError, instrumentation.ts) and the browsers' route (POST /api/client-errors), then shows in /admin's
// section (getErrorsSection); grouped, capped, purged. Real time: the table's days are the database's clock. Each run's
// messages carry a word of its own, its rows deleted at the end. Skipped without DATABASE_URL; modules are imported
// lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the game's errors", () => {
  let db: typeof prismaClient | undefined;
  // Real time, not simulation code: a word of letters, which the cleaning of a message keeps.
  const run = Array.from({ length: 10 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
  const runtime = process.env.NEXT_RUNTIME;

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  beforeAll(async () => {
    ({ prisma: db } = await import("./client"));
    // The hook records on the Node runtime only, as a Next server says it runs.
    process.env.NEXT_RUNTIME = "nodejs";
  });

  afterAll(async () => {
    process.env.NEXT_RUNTIME = runtime;
    if (db !== undefined) {
      await db.$executeRaw`DELETE FROM "ErrorDay" WHERE "message" LIKE ${`%${run}%`} OR "fingerprint" LIKE ${`test-${run}-%`}`;
      await db.$disconnect();
    }
  });

  const groupOf = async (word: string) => {
    const { getErrorsSection } = await import("./errors");
    // Not simulation code: the section is about real days.
    const section = await getErrorsSection(database(), new Date());
    return { section, group: section.groups.find((group) => group.message.includes(word)) };
  };

  it("records an error the server meets, by its route and cleaned message, and shows it in /admin", async () => {
    const { onRequestError } = await import("../../instrumentation");
    const error = Object.assign(new Error(`Boom ${run} for alexis@example.com on save cmw4ubb6p0000usi84bksfc49`), { digest: "2718281828" });
    const request = { path: "/saves/cmw4ubb6p0000usi84bksfc49/live?rejouer=1", method: "GET", headers: { cookie: "lw_uid=secret" } };
    const context = {
      routerKind: "App Router" as const,
      routePath: "/saves/[id]/live",
      routeType: "render" as const,
      renderSource: "react-server-components" as const,
      revalidateReason: undefined,
      renderType: "dynamic" as const,
    };

    await onRequestError(error, request, context);
    await onRequestError(error, request, context);
    const { section, group } = await groupOf(`Boom ${run}`);

    expect(group).toMatchObject({
      source: "SERVER",
      kind: "render",
      route: "/saves/[id]/live",
      message: `Error: Boom ${run} for [email] on save [id]`,
      digest: "2718281828",
      lastDay: 2,
      lastWeek: 2,
      other: false,
    });
    expect(section.lastDay.server).toBeGreaterThanOrEqual(2);
    // Nothing of the request is kept: neither its address nor its cookie.
    const kept = await database().$queryRaw<{ row: string }[]>`
      SELECT row_to_json(e)::text AS row FROM "ErrorDay" e WHERE "message" LIKE ${`%${run}%`}`;
    expect(kept.map(({ row }) => row).join()).not.toMatch(/secret|cmw4ubb6p0000usi84bksfc49|example\.com|rejouer/);
  });

  it("never records what Next throws on purpose: a redirect, a page not found", async () => {
    const { recordServerError } = await import("./errors");
    for (const digest of ["NEXT_REDIRECT;replace;/fr;307;", "NEXT_HTTP_ERROR_FALLBACK;404"]) {
      await recordServerError(Object.assign(new Error(`Control ${run}`), { digest }), { routePath: "/", routeType: "render" });
    }

    expect((await groupOf(`Control ${run}`)).group).toBeUndefined();
  });

  it("records a browser's report through its route, and only a small and well-formed one", async () => {
    const { POST } = await import("../../app/api/client-errors/route");
    const post = (body: string, headers: Record<string, string> = {}) =>
      POST(new Request("http://localhost/api/client-errors", { method: "POST", body, headers: { "content-type": "application/json", ...headers } }));
    const report = { kind: "error", message: `TypeError: Bang ${run}`, route: "/saves/cmw4ubb6p0000usi84bksfc49/lineup" };

    expect((await post(JSON.stringify(report))).status).toBe(204);
    // Refused without a word: too big, malformed, of another kind, from another site.
    expect((await post(JSON.stringify({ ...report, message: `Big ${run} ${"x".repeat(3000)}` }))).status).toBe(204);
    expect((await post(`{"kind":"error","message":"Broken ${run}"`)).status).toBe(204);
    expect((await post(JSON.stringify({ ...report, kind: "warning", message: `Kind ${run}` }))).status).toBe(204);
    expect((await post(JSON.stringify({ ...report, message: `Foreign ${run}` }), { origin: "https://elsewhere.example" })).status).toBe(204);

    const { group } = await groupOf(`Bang ${run}`);
    expect(group).toMatchObject({ source: "CLIENT", kind: "error", route: "/saves/[id]/lineup", lastWeek: 1 });
    for (const word of ["Big", "Broken", "Kind", "Foreign"]) {
      expect((await groupOf(`${word} ${run}`)).group, word).toBeUndefined();
    }
  });

  it("counts a source's new errors past the day's cap in its « other » group", async () => {
    const { MAX_ERROR_GROUPS_PER_DAY, OTHER_ERRORS, recordError } = await import("./errors");
    const db = database();
    const [{ groups }] = await db.$queryRaw<{ groups: bigint }[]>`
      SELECT count(*) AS groups FROM "ErrorDay" WHERE "day" = (now() AT TIME ZONE 'UTC')::date AND "source" = 'CLIENT'`;
    // The day's groups of the browsers, up to the cap.
    const missing = Math.max(0, MAX_ERROR_GROUPS_PER_DAY - Number(groups));
    await db.$executeRaw`
      INSERT INTO "ErrorDay" ("day", "fingerprint", "source", "kind", "route", "message", "count", "lastSeenAt")
      SELECT (now() AT TIME ZONE 'UTC')::date, ${`test-${run}-`} || n, 'CLIENT', 'error', '/', ${`Filler ${run}`}, 1, now() AT TIME ZONE 'UTC'
      FROM generate_series(1, ${missing}::int) AS n`;
    const before = await db.$queryRaw<{ count: number }[]>`
      SELECT "count" FROM "ErrorDay" WHERE "day" = (now() AT TIME ZONE 'UTC')::date AND "fingerprint" = ${`${OTHER_ERRORS}:CLIENT`}`;

    await recordError(db, { source: "CLIENT", kind: "error", route: "/", message: `Overflow ${run}` });
    const other = await db.$queryRaw<{ count: number; message: string }[]>`
      SELECT "count", "message" FROM "ErrorDay"
      WHERE "day" = (now() AT TIME ZONE 'UTC')::date AND "fingerprint" = ${`${OTHER_ERRORS}:CLIENT`}`;

    expect(other).toHaveLength(1);
    expect(other[0].count).toBe((before[0]?.count ?? 0) + 1);
    expect(other[0].message).toBe(`Overflow ${run}`);
    // The server's errors have their own cap.
    await recordError(db, { source: "SERVER", kind: "route", route: "/api/x", message: `Server ${run}` });
    expect((await groupOf(`Server ${run}`)).group).toMatchObject({ source: "SERVER", other: false });
    await db.$executeRaw`DELETE FROM "ErrorDay" WHERE "fingerprint" = ${`${OTHER_ERRORS}:CLIENT`} AND "message" = ${`Overflow ${run}`}`;
  });

  it("deletes at the daily maintenance the days older than thirty", async () => {
    const { purgeOldErrors } = await import("./errors");
    const db = database();
    for (const age of [31, 29]) {
      await db.$executeRaw`
        INSERT INTO "ErrorDay" ("day", "fingerprint", "source", "kind", "route", "message", "count", "lastSeenAt")
        VALUES ((now() AT TIME ZONE 'UTC')::date - ${age}::int, ${`test-${run}-age-${age}`}, 'SERVER', 'render', '/',
                ${`Old ${run}`}, 1, now() AT TIME ZONE 'UTC')`;
    }

    expect(await purgeOldErrors(db)).toBeGreaterThanOrEqual(1);
    const left = await db.$queryRaw<{ fingerprint: string }[]>`
      SELECT "fingerprint" FROM "ErrorDay" WHERE "fingerprint" LIKE ${`test-${run}-age-%`}`;
    expect(left.map((row) => row.fingerprint)).toEqual([`test-${run}-age-29`]);
  });
});
