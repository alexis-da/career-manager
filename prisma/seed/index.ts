import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { seedWorld } from "./seed";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
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
