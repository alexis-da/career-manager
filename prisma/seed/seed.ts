import { computeStandings } from "../../src/engine/standings";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { COMPETITIONS, type SeedCompetition } from "./competitions";
import { extractClubs, extractScores, fixtureFilePath, readFixtureFile, type SeedClub } from "./openfootball";
import { generateSquad, readNameBank, type SeedPlayer } from "./players";

export type ClubPlan = SeedClub & {
  initialRank: number; // final 2024-25 rank within the competition
  players: SeedPlayer[];
};

export type CompetitionPlan = {
  competition: SeedCompetition;
  clubs: ClubPlan[];
};

export type SeedSummary = {
  competitions: { code: string; name: string; clubs: number; players: number }[];
  players: { created: number; updated: number; unchanged: number };
};

type PlayerData = SeedPlayer & { initialClubId: string };

const playerKey = (player: { initialClubId: string; squadSlot: number }): string =>
  `${player.initialClubId}#${player.squadSlot}`;

function samePlayer(a: PlayerData, b: PlayerData): boolean {
  return (
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.birthDate.getTime() === b.birthDate.getTime() &&
    a.nationality === b.nationality &&
    a.position === b.position
  );
}

// Reads and validates every file, ranks every club and generates every squad before touching the
// database, so a bad file never leaves a partial seed.
export function buildWorldPlan(): CompetitionPlan[] {
  const names = readNameBank();
  const competitionBySlug = new Map<string, string>();

  return COMPETITIONS.map((competition) => {
    const file = readFixtureFile(fixtureFilePath(competition.code));
    const rankBySlug = new Map(computeStandings(extractScores(file)).map((row) => [row.club, row.rank]));

    const clubs = extractClubs(file).map((club) => {
      const other = competitionBySlug.get(club.slug);
      if (other !== undefined) {
        throw new Error(`Club "${club.slug}" appears in both ${other} and ${competition.code}`);
      }
      competitionBySlug.set(club.slug, competition.code);

      const initialRank = rankBySlug.get(club.slug);
      if (initialRank === undefined) {
        throw new Error(`Club "${club.slug}" has no played match in ${competition.code}, so no 2024-25 rank`);
      }
      return {
        ...club,
        initialRank,
        players: generateSquad({ slug: club.slug, country: competition.country }, names),
      };
    });
    return { competition, clubs };
  });
}

export async function seedWorld(prisma: PrismaClient, plan: CompetitionPlan[] = buildWorldPlan()): Promise<SeedSummary> {
  const competitions: SeedSummary["competitions"] = [];
  const plannedPlayers: PlayerData[] = [];

  for (const { competition, clubs } of plan) {
    const { code, name, country, tier } = competition;
    const { id: competitionId } = await prisma.competition.upsert({
      where: { code },
      update: { name, country, tier },
      create: { code, name, country, tier },
    });

    // Upsert keeps the seed re-runnable; optional metadata (city, stadium…) is left untouched.
    const savedClubs = await prisma.$transaction(
      clubs.map(({ slug, name: clubName, initialRank }) =>
        prisma.club.upsert({
          where: { slug },
          update: { name: clubName, country, initialRank, competitionId },
          create: { slug, name: clubName, country, initialRank, competitionId },
          select: { id: true },
        }),
      ),
    );

    clubs.forEach((club, index) => {
      for (const player of club.players) {
        plannedPlayers.push({ ...player, initialClubId: savedClubs[index].id });
      }
    });
    const playerCount = clubs.reduce((count, club) => count + club.players.length, 0);
    competitions.push({ code, name, clubs: clubs.length, players: playerCount });
  }

  // Players: one read, then only the missing or changed rows are written.
  const existing = await prisma.player.findMany({
    where: { initialClubId: { in: [...new Set(plannedPlayers.map((player) => player.initialClubId))] } },
    select: {
      initialClubId: true,
      squadSlot: true,
      firstName: true,
      lastName: true,
      birthDate: true,
      nationality: true,
      position: true,
    },
  });
  const existingByKey = new Map<string, PlayerData>(existing.map((player) => [playerKey(player), player]));

  const toCreate: PlayerData[] = [];
  const toUpdate: PlayerData[] = [];
  for (const planned of plannedPlayers) {
    const current = existingByKey.get(playerKey(planned));
    if (current === undefined) {
      toCreate.push(planned);
    } else if (!samePlayer(current, planned)) {
      toUpdate.push(planned);
    }
  }

  if (toCreate.length > 0) {
    await prisma.player.createMany({ data: toCreate });
  }
  if (toUpdate.length > 0) {
    await prisma.$transaction(
      toUpdate.map(({ initialClubId, squadSlot, ...identity }) =>
        prisma.player.update({
          where: { initialClubId_squadSlot: { initialClubId, squadSlot } },
          data: identity,
        }),
      ),
    );
  }

  return {
    competitions,
    players: {
      created: toCreate.length,
      updated: toUpdate.length,
      unchanged: plannedPlayers.length - toCreate.length - toUpdate.length,
    },
  };
}
