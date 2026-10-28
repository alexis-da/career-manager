import { PrismaClient } from "../generated/prisma/client";
import { assertLocalDatabase, pgConnection } from "./database-url";
import { SequentialPrismaPg } from "./pg-adapter";

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  // From the workstation, the local PostgreSQL only (dev server, tests, scripts); Vercel reaches Neon.
  assertLocalDatabase(connectionString, "DATABASE_URL");
  return new PrismaClient({ adapter: new SequentialPrismaPg(pgConnection(connectionString)) });
}

// One client per process, kept across hot reloads in development so connections are not exhausted.
const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
