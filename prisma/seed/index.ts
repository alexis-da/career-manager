import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { COMPETITIONS, type SeedCompetition } from "./competitions";
import { extractClubs, fixtureFilePath, readFixtureFile, type SeedClub } from "./openfootball";

type SeedPlan = {
  competition: SeedCompetition;
  clubs: SeedClub[];
}[];

// Reads and validates every file before touching the database, so a bad file never leaves a partial seed.
function buildPlan(): SeedPlan {
  const competitionBySlug = new Map<string, string>();

  return COMPETITIONS.map((competition) => {
    const clubs = extractClubs(readFixtureFile(fixtureFilePath(competition.code)));
    for (const club of clubs) {
      const other = competitionBySlug.get(club.slug);
      if (other !== undefined) {
        throw new Error(`Club "${club.slug}" appears in both ${other} and ${competition.code}`);
      }
      competitionBySlug.set(club.slug, competition.code);
    }
    return { competition, clubs };
  });
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const plan = buildPlan();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    for (const { competition, clubs } of plan) {
      const { code, name, country, tier } = competition;
      const { id: competitionId } = await prisma.competition.upsert({
        where: { code },
        update: { name, country, tier },
        create: { code, name, country, tier },
      });

      // Upsert keeps the seed re-runnable; optional metadata (city, stadium…) is left untouched.
      await prisma.$transaction(
        clubs.map((club) =>
          prisma.club.upsert({
            where: { slug: club.slug },
            update: { name: club.name, country, competitionId },
            create: { slug: club.slug, name: club.name, country, competitionId },
          }),
        ),
      );

      console.log(`${code} — ${name}: ${clubs.length} clubs`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
