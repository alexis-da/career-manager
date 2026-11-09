import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../generated/prisma/client";
import { assertLocalDatabase, pgConnection } from "./database-url";
import { SequentialPrismaPg } from "./pg-adapter";

// One query at a time on a pg connection, against DATABASE_URL: the tests' guard (src/db/test-pg-guard.ts) fails a
// query sent on a busy connection, and SequentialPrismaPg keeps a transaction's queries from ever doing so. Read only:
// the demo save's fixtures. Skipped without DATABASE_URL; modules are imported lazily because the client throws
// without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("one query at a time on a pg connection", () => {
  const url = process.env.DATABASE_URL ?? "";
  const clients: PrismaClient[] = [];
  let saveId = "";

  beforeAll(async () => {
    assertLocalDatabase(url, "DATABASE_URL");
    const { ensureDemoSave } = await import("./test-support");
    saveId = await ensureDemoSave();
  }, 180_000);

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.$disconnect()));
  });

  const clientWith = (adapter: PrismaPg): PrismaClient => {
    const client = new PrismaClient({ adapter });
    clients.push(client);
    return client;
  };

  /** A select with three relations, which Prisma's engine loads with queries of their own, started together. */
  const readMatches = (client: PrismaClient) =>
    client.$transaction((tx) =>
      tx.fixture.findMany({
        where: { saveId },
        orderBy: { id: "asc" },
        take: 5,
        select: {
          id: true,
          season: { select: { startYear: true } },
          homeClubSave: { select: { club: { select: { slug: true } } } },
          awayClubSave: { select: { club: { select: { slug: true } } } },
        },
      }),
    );

  it("fails a query sent while its connection is still busy", async () => {
    const client = new Client(pgConnection(url));
    await client.connect();
    try {
      const first = client.query("SELECT pg_sleep(0.05)");
      await expect(Promise.resolve().then(() => client.query("SELECT 1"))).rejects.toThrow(/still busy with another one/);
      await first;
    } finally {
      await client.end();
    }
  });

  it("runs a transaction's relation loads one after the other, with the same rows", async () => {
    await expect(readMatches(clientWith(new PrismaPg(pgConnection(url))))).rejects.toThrow(/still busy with another one/);

    const matches = await readMatches(clientWith(new SequentialPrismaPg(pgConnection(url))));

    expect(matches).toHaveLength(5);
    expect(matches.every(({ season, homeClubSave, awayClubSave }) => season.startYear > 0 && homeClubSave.club.slug !== awayClubSave.club.slug)).toBe(true);
  });
});
