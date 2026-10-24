import { NAME_BANK } from "../../src/engine/names";
import { computeStandings } from "../../src/engine/standings";
import { seasonLabel } from "../../src/engine/world";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { DEFAULT_CLUB_COLORS, readClubColors, type ClubColors } from "./colors";
import { COMPETITIONS, CUP_TIER, CUPS, type SeedCompetition, type SeedCup } from "./competitions";
import {
  extractClubs,
  extractScores,
  fixtureFilePath,
  readFixtureFile,
  SOURCE_SEASON_START_YEAR,
  type SeedClub,
} from "./openfootball";
import { generateFreeAgentPool, generateSquad, type SeedPlayer } from "./players";

export type ClubPlan = SeedClub & {
  initialRank: number; // final rank of the source season within the competition
  colors: ClubColors;
  players: SeedPlayer[];
};

export type CompetitionPlan = {
  competition: SeedCompetition;
  clubs: ClubPlan[];
};

export type SeedSummary = {
  competitions: { code: string; name: string; clubs: number; players: number }[];
  freeAgents: number;
  players: { created: number; updated: number; unchanged: number };
};

type PlayerData = SeedPlayer & { initialClubId: string | null }; // null: the free agent pool

// PostgreSQL does not compare NULLs in the unique (initialClubId, squadSlot): this key keeps the pool unique.
const playerKey = (player: { initialClubId: string | null; squadSlot: number }): string =>
  `${player.initialClubId ?? "free-agents"}#${player.squadSlot}`;

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
  const clubColors = readClubColors();
  const competitionBySlug = new Map<string, string>();

  const plan = COMPETITIONS.map((competition) => {
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
        throw new Error(`Club "${club.slug}" has no played match in ${competition.code}, so no ${seasonLabel(SOURCE_SEASON_START_YEAR)} rank`);
      }
      return {
        ...club,
        initialRank,
        colors: clubColors.get(club.slug) ?? DEFAULT_CLUB_COLORS,
        players: generateSquad({ slug: club.slug, country: competition.country }, NAME_BANK),
      };
    });
    return { competition, clubs };
  });

  const unknownClubs = [...clubColors.keys()].filter((slug) => !competitionBySlug.has(slug));
  if (unknownClubs.length > 0) {
    throw new Error(`club-colors.json names clubs that do not exist: ${unknownClubs.join(", ")}`);
  }
  return plan;
}

export async function seedWorld(
  prisma: PrismaClient,
  plan: CompetitionPlan[] = buildWorldPlan(),
  freeAgents: SeedPlayer[] = generateFreeAgentPool(NAME_BANK),
  cups: readonly SeedCup[] = CUPS,
): Promise<SeedSummary> {
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
      clubs.map(({ slug, name: clubName, initialRank, colors }) => {
        const data = {
          name: clubName,
          country,
          initialRank,
          competitionId,
          primaryColor: colors.primary,
          secondaryColor: colors.secondary,
        };
        return prisma.club.upsert({ where: { slug }, update: data, create: { slug, ...data }, select: { id: true } });
      }),
    );

    clubs.forEach((club, index) => {
      for (const player of club.players) {
        plannedPlayers.push({ ...player, initialClubId: savedClubs[index].id });
      }
    });
    const playerCount = clubs.reduce((count, club) => count + club.players.length, 0);
    competitions.push({ code, name, clubs: clubs.length, players: playerCount });
  }

  for (const { code, name, country } of cups) {
    const data = { name, country, tier: CUP_TIER, kind: "CUP" as const };
    await prisma.competition.upsert({ where: { code }, update: data, create: { code, ...data } });
  }

  for (const player of freeAgents) {
    plannedPlayers.push({ ...player, initialClubId: null });
  }

  // Players: one read, then only the missing or changed rows are written.
  const clubIds = [
    ...new Set(plannedPlayers.flatMap((player) => (player.initialClubId === null ? [] : [player.initialClubId]))),
  ];
  const existing = await prisma.player.findMany({
    where: { OR: [{ initialClubId: { in: clubIds } }, { initialClubId: null }] },
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
      // updateMany: a pool player has no unique key Prisma can address, his initialClubId being null.
      toUpdate.map(({ initialClubId, squadSlot, ...identity }) =>
        prisma.player.updateMany({ where: { initialClubId, squadSlot }, data: identity }),
      ),
    );
  }

  return {
    competitions,
    freeAgents: freeAgents.length,
    players: {
      created: toCreate.length,
      updated: toUpdate.length,
      unchanged: plannedPlayers.length - toCreate.length - toUpdate.length,
    },
  };
}
