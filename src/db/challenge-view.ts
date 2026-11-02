import { MAX_CHALLENGE_SAVES_PER_WEEK } from "../config/challenge";
import { challengeSavesPurgedAt, rankAmong, rankChallengeEntries, rankingName } from "../engine/challenge";
import { displayClubName } from "../engine/club-name";
import { competitionTier, type CompetitionTier } from "../engine/tiers";
import { competitionCountry, type Country } from "../i18n/countries";
import { isoWeekNumber, previousIsoWeekKey } from "../lib/iso-week";
import type { ChallengeSummary } from "./challenge";
import { prisma } from "./client";

// What the weekly challenge's screens show: the public page /challenge, its tab in a save and a challenge save's
// banner. The rankings read the entries of all of a challenge's saves by challengeId, the one read across saves
// (CLAUDE.md): scores and first names, never a save's content. The club's name goes through displayClubName here, never
// in a component.

/** The user of the request, if any: an anonymous player sees their own entry, outside the public ranking. */
export type ChallengeViewer = { id: string; kind: "ANONYMOUS" | "REGISTERED" } | null;

export type ChallengeRankingRow = {
  rank: number | null; // null: the viewer's own entry outside the public ranking, an anonymous player's (« Toi »)
  name: string | null; // the Google account's first name; null without one (« Anonyme »), and on the viewer's own line
  points: number;
  goalDiff: number;
  goalsFor: number;
  isViewer: boolean;
};

type SubmittedEntry = {
  id: string;
  userId: string;
  userKind: "ANONYMOUS" | "REGISTERED";
  userName: string | null;
  points: number;
  goalDiff: number;
  goalsFor: number;
  submittedAt: Date;
};

/** A challenge's entries submitted before its end: those a ranking may show. */
async function entriesInTime(challenge: { id: string; endsAt: Date }): Promise<SubmittedEntry[]> {
  const rows = await prisma.challengeEntry.findMany({
    where: { challengeId: challenge.id, submittedAt: { lt: challenge.endsAt } },
    select: {
      id: true,
      userId: true,
      points: true,
      goalDiff: true,
      goalsFor: true,
      submittedAt: true,
      user: { select: { kind: true, name: true } },
    },
  });
  return rows.flatMap(({ points, goalDiff, goalsFor, submittedAt, user, ...entry }) =>
    points === null || goalDiff === null || goalsFor === null || submittedAt === null
      ? []
      : [{ ...entry, userKind: user.kind, userName: user.name, points, goalDiff, goalsFor, submittedAt }],
  );
}

/** The entries a public ranking ranks: Google accounts' only, an anonymous player's waits for their sign-in. */
const ranked = (entries: readonly SubmittedEntry[]) => rankChallengeEntries(entries.filter((entry) => entry.userKind === "REGISTERED"));

/**
 * A challenge's public ranking: the Google accounts' entries submitted in time, first names only. An anonymous viewer
 * with an entry sees it too, where it would stand, without a rank: signing in puts it in the ranking.
 */
function rankingOf(entries: readonly SubmittedEntry[], viewer: ChallengeViewer): ChallengeRankingRow[] {
  const ranking = ranked(entries);
  const rows: ChallengeRankingRow[] = ranking.map(({ rank, userName, userId, points, goalDiff, goalsFor }) => ({
    rank,
    name: rankingName(userName),
    points,
    goalDiff,
    goalsFor,
    isViewer: userId === viewer?.id,
  }));
  const own = entries.find((entry) => entry.userKind === "ANONYMOUS" && entry.userId === viewer?.id);
  if (own === undefined) {
    return rows;
  }
  const at = rankAmong(own, ranking) - 1;
  const ownRow = { rank: null, name: null, points: own.points, goalDiff: own.goalDiff, goalsFor: own.goalsFor, isViewer: true };
  return [...rows.slice(0, at), ownRow, ...rows.slice(at)];
}

export type ChallengePageView = {
  weekKey: string;
  weekNumber: number;
  horizon: number;
  endsAt: Date;
  savesPurgedAt: Date;
  // The club and its competition, by country and division: the page names it in the player's language.
  club: { name: string; competition: { country: Country; tier: CompetitionTier } | null; primaryColor: string };
  full: boolean; // the week has its MAX_CHALLENGE_SAVES_PER_WEEK saves
  own: { saveId: string | null; matchdaysPlayed: number; submitted: boolean } | null; // the viewer's entry this week
  ranking: ChallengeRankingRow[];
  previous: { weekNumber: number; ranking: ChallengeRankingRow[] } | null; // last week's, when it had a challenge
};

/**
 * The page /challenge of a week: its club (the source season's, where every challenge save starts), whether it is
 * full, the viewer's entry, its ranking and the previous week's.
 */
export async function getChallengePage(challenge: ChallengeSummary, viewer: ChallengeViewer): Promise<ChallengePageView> {
  const [club, saves, own, entries, previous] = await Promise.all([
    prisma.club.findUniqueOrThrow({
      where: { id: challenge.clubId },
      select: { slug: true, name: true, primaryColor: true, competition: { select: { code: true, tier: true } } },
    }),
    prisma.save.count({ where: { challengeId: challenge.id } }),
    viewer === null
      ? null
      : prisma.challengeEntry.findUnique({
          where: { challengeId_userId: { challengeId: challenge.id, userId: viewer.id } },
          select: { saveId: true, matchdaysPlayed: true, submittedAt: true },
        }),
    entriesInTime(challenge),
    prisma.challenge.findUnique({
      where: { weekKey: previousIsoWeekKey(challenge.weekKey) },
      select: { id: true, weekKey: true, endsAt: true },
    }),
  ]);
  const previousEntries = previous === null ? null : await entriesInTime(previous);

  return {
    weekKey: challenge.weekKey,
    weekNumber: isoWeekNumber(challenge.weekKey),
    horizon: challenge.horizonMatchdays,
    endsAt: challenge.endsAt,
    savesPurgedAt: challengeSavesPurgedAt(challenge.endsAt),
    club: {
      name: displayClubName(club),
      competition:
        club.competition === null
          ? null
          : { country: competitionCountry(club.competition.code), tier: competitionTier(club.competition.tier) },
      primaryColor: club.primaryColor,
    },
    full: saves >= MAX_CHALLENGE_SAVES_PER_WEEK,
    own: own === null ? null : { saveId: own.saveId, matchdaysPlayed: own.matchdaysPlayed, submitted: own.submittedAt !== null },
    ranking: rankingOf(entries, viewer),
    previous:
      previous === null || previousEntries === null
        ? null
        : { weekNumber: isoWeekNumber(previous.weekKey), ranking: rankingOf(previousEntries, viewer) },
  };
}

export type ChallengeBannerView = {
  weekNumber: number;
  horizon: number;
  savesPurgedAt: Date;
  status:
    | { kind: "playing"; matchdaysPlayed: number }
    | { kind: "submitted"; points: number; goalDiff: number; goalsFor: number; rank: number; inRanking: boolean }
    | { kind: "too-late" } // the challenge ended before the save's score: it does not count
    | { kind: "not-counted" }; // no entry: its player already had one that week when they signed in
};

/**
 * A challenge save's banner, or null for an ordinary save: its club's matchday out of the horizon, then its score and
 * provisional rank (among the ranking's entries, the save's own counted in, even an anonymous player's), or why it does
 * not count; and when the purge deletes it. `now` is real time, the caller's: a challenge over without the save's score
 * no longer waits for it.
 */
export async function getChallengeBanner(saveId: string, now: Date): Promise<ChallengeBannerView | null> {
  const { challenge, challengeEntry: entry } = await prisma.save.findUniqueOrThrow({
    where: { id: saveId },
    select: {
      challenge: { select: { id: true, weekKey: true, endsAt: true, horizonMatchdays: true } },
      challengeEntry: {
        select: { id: true, matchdaysPlayed: true, points: true, goalDiff: true, goalsFor: true, submittedAt: true, user: { select: { kind: true } } },
      },
    },
  });
  if (challenge === null) {
    return null;
  }
  const banner = {
    weekNumber: isoWeekNumber(challenge.weekKey),
    horizon: challenge.horizonMatchdays,
    savesPurgedAt: challengeSavesPurgedAt(challenge.endsAt),
  };
  if (entry === null) {
    return { ...banner, status: { kind: "not-counted" } };
  }
  const { points, goalDiff, goalsFor, submittedAt } = entry;
  if (points === null || goalDiff === null || goalsFor === null || submittedAt === null) {
    return { ...banner, status: now < challenge.endsAt ? { kind: "playing", matchdaysPlayed: entry.matchdaysPlayed } : { kind: "too-late" } };
  }
  if (submittedAt >= challenge.endsAt) {
    return { ...banner, status: { kind: "too-late" } };
  }
  const rank = rankAmong({ id: entry.id, points, goalDiff, goalsFor, submittedAt }, ranked(await entriesInTime(challenge)));
  return { ...banner, status: { kind: "submitted", points, goalDiff, goalsFor, rank, inRanking: entry.user.kind === "REGISTERED" } };
}
