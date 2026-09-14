import { computeStandings, type StandingRow } from "../engine/standings";
import { prisma } from "./client";

export type ClubStandingRow = StandingRow & { clubName: string };

/**
 * League table of a season from its played fixtures, clubs keyed by slug. A club without any played
 * fixture does not appear yet.
 */
export async function getStandings(saveId: string, seasonId: string): Promise<ClubStandingRow[]> {
  const fixtures = await prisma.fixture.findMany({
    where: { saveId, seasonId, played: true },
    select: {
      id: true,
      homeGoals: true,
      awayGoals: true,
      homeClubSave: { select: { club: { select: { slug: true, name: true } } } },
      awayClubSave: { select: { club: { select: { slug: true, name: true } } } },
    },
  });

  const clubNames = new Map<string, string>();
  const scores = fixtures.map(({ id, homeGoals, awayGoals, homeClubSave, awayClubSave }) => {
    if (homeGoals === null || awayGoals === null) {
      throw new Error(`Fixture ${id} is played but has no score`);
    }
    clubNames.set(homeClubSave.club.slug, homeClubSave.club.name);
    clubNames.set(awayClubSave.club.slug, awayClubSave.club.name);
    return { home: homeClubSave.club.slug, away: awayClubSave.club.slug, homeGoals, awayGoals };
  });

  return computeStandings(scores).map((row) => ({ ...row, clubName: clubNames.get(row.club) ?? row.club }));
}
