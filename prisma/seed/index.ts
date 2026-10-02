import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { seedWorld } from "./seed";

// Seeds the database of DIRECT_URL, the direct connection used by migrations: any database can be seeded with
// `DIRECT_URL=… npm run db:seed` (a variable already set wins over .env).
async function main(): Promise<void> {
  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error("DIRECT_URL is not set: the seed writes to the database of the direct connection");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const summary = await seedWorld(prisma);
    for (const competition of summary.competitions) {
      console.log(`${competition.code} — ${competition.name}: ${competition.clubs} clubs, ${competition.players} players`);
    }
    console.log(`free agent pool: ${summary.freeAgents} players`);
    const { created, updated, unchanged } = summary.players;
    console.log(`players: ${created} created, ${updated} updated, ${unchanged} unchanged`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
