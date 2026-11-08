import { displayClubName } from "../engine/club-name";
import { leagueRankingObjective, type RankingObjective } from "../engine/objectives";
import { creationReputationRanks } from "../engine/reputation";
import { competitionTier, type CompetitionTier } from "../engine/tiers";
import { DEFAULT_WORLD_VERSION, worldTiers, type WorldVersion } from "../engine/world-version";
import { competitionCountry, type Country } from "../i18n/countries";
import { getOrThrow } from "../lib/maps";
import { prisma } from "./client";

export type ClubOption = {
  id: string;
  name: string;
  rank: number; // in the source season, within its competition: what the suggestions read
  // The ranking objective of a save's first season with this club, as its creation sets it (firstSeasonDotation, then
  // openSeasonObjectives): what the creation form's cards announce.
  objective: RankingObjective;
};

export type CompetitionClubs = {
  code: string;
  country: Country; // named in the player's language by the screens
  tier: CompetitionTier;
  clubs: ClubOption[];
};

/**
 * Clubs a save of a world can be created with, grouped by competition: by code, so by country then by division, the
 * clubs in alphabetical order of the names shown, each with the ranking objective a save's first season with it would
 * have: leagueRankingObjective at its creation reputation rank (creationReputationRanks), the functions the creation
 * uses. Reference tables only. Slugs never leave: they carry the real names.
 */
export async function listClubsByCompetition(worldVersion: WorldVersion = DEFAULT_WORLD_VERSION): Promise<CompetitionClubs[]> {
  const competitions = await prisma.competition.findMany({
    where: { kind: "LEAGUE", tier: { in: worldTiers(worldVersion) } },
    orderBy: { code: "asc" },
    select: { code: true, tier: true, clubs: { select: { id: true, slug: true, name: true, initialRank: true } } },
  });
  return competitions.map((competition) => {
    const tier = competitionTier(competition.tier);
    const league = { code: competition.code, tier, clubCount: competition.clubs.length };
    const ranks = creationReputationRanks(
      competition.clubs.map((club) => ({ key: club.id, initialRank: club.initialRank, slug: club.slug })),
      tier,
    );
    return {
      code: competition.code,
      country: competitionCountry(competition.code),
      tier,
      clubs: competition.clubs
        .map((club) => ({
          id: club.id,
          name: displayClubName(club),
          rank: club.initialRank,
          objective: leagueRankingObjective(league, getOrThrow(ranks, club.id, "creation reputation rank"), worldVersion),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    };
  });
}
