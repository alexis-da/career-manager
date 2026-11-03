import { readAuthSecret } from "../auth/identity";
import { CHALLENGE_HORIZON_MATCHDAYS } from "../config/challenge";
import { challengeScore, drawChallengeClub } from "../engine/challenge";
import { WORLD_START_YEAR } from "../engine/world";
import type { Prisma } from "../generated/prisma/client";
import { challengeSeed } from "../lib/challenge-seed";
import { isoWeekBounds, isoWeekKey, previousIsoWeekKey } from "../lib/iso-week";
import { getOrThrow } from "../lib/maps";
import { prisma } from "./client";

// The weekly challenge in the database: the week's Challenge row, written once by ensureChallenge, from the Monday
// maintenance call (app/api/maintenance/challenge/route.ts) or, failing it, from the first visit of /challenge; and the
// score of a challenge save's entry (recordChallengeScore), in the transactions that play its club's matches.

/** A challenge as the rest of the game sees it: never its seed, which only the creation of its saves reads. */
export type ChallengeSummary = {
  id: string;
  weekKey: string;
  clubId: string;
  horizonMatchdays: number;
  startsAt: Date;
  endsAt: Date;
};

const CHALLENGE_SELECT = { id: true, weekKey: true, clubId: true, horizonMatchdays: true, startsAt: true, endsAt: true } as const;

/**
 * The challenge of a week, created when missing: its seed from the week and the server secret (challengeSeed), its club
 * drawn among the clubs a challenge may give, the previous week's left out, CHALLENGE_HORIZON_MATCHDAYS. Idempotent:
 * INSERT … ON CONFLICT DO NOTHING on the week, then a read, so that concurrent calls (the workflow and a visit) write
 * one row and all get it. created: whether this call wrote it. Reference tables are only read.
 */
export async function ensureChallenge(weekKey: string, secret: string): Promise<ChallengeSummary & { created: boolean }> {
  const existing = await prisma.challenge.findUnique({ where: { weekKey }, select: CHALLENGE_SELECT });
  if (existing !== null) {
    return { ...existing, created: false };
  }

  const { startsAt, endsAt } = isoWeekBounds(weekKey);
  const seed = challengeSeed(secret, weekKey);
  const [clubs, previous] = await Promise.all([
    prisma.club.findMany({
      where: { competition: { kind: "LEAGUE" } },
      select: { id: true, slug: true, initialRank: true, competition: { select: { tier: true } } },
    }),
    prisma.challenge.findUnique({ where: { weekKey: previousIsoWeekKey(weekKey) }, select: { club: { select: { slug: true } } } }),
  ]);
  const slug = drawChallengeClub(
    clubs.flatMap(({ slug, initialRank, competition }) => (competition === null ? [] : [{ slug, tier: competition.tier, rank: initialRank }])),
    previous?.club.slug ?? null,
    seed,
  );
  const clubId = getOrThrow(new Map(clubs.map((club) => [club.slug, club.id])), slug, "club");

  const { count } = await prisma.challenge.createMany({
    data: [{ weekKey, seed, clubId, horizonMatchdays: CHALLENGE_HORIZON_MATCHDAYS, startsAt, endsAt }],
    skipDuplicates: true,
  });
  const challenge = await prisma.challenge.findUniqueOrThrow({ where: { weekKey }, select: CHALLENGE_SELECT });
  return { ...challenge, created: count === 1 };
}

/**
 * The challenge of the real week at `now`, created when missing, its seed under AUTH_SECRET: what the Monday route,
 * the page /challenge and its action all ask for. `now` is real time, the caller's.
 */
export function ensureCurrentChallenge(now: Date): Promise<ChallengeSummary & { created: boolean }> {
  return ensureChallenge(isoWeekKey(now), readAuthSecret(process.env.AUTH_SECRET));
}

/** Whether a challenge is open at `now`, real time: from its Monday 00:00 UTC to the next one's, excluded. */
export function isChallengeOpen(challenge: Pick<ChallengeSummary, "startsAt" | "endsAt">, now: Date): boolean {
  return challenge.startsAt <= now && now < challenge.endsAt;
}

/**
 * Brings a challenge save's entry up to date, in the transaction that has just finished a match of its club: the league
 * matchdays its club has played so far, then, once it has played the challenge's first horizonMatchdays, the score
 * (challengeScore) and the submission's real time, written once. Later matches never change it. Nothing for an ordinary
 * save (challengeId null), for a challenge save without an entry (that of a player who already had one when they
 * signed in), nor for a submitted entry. Called by playNextMatchday and advanceLiveMatch, after recordFinishedMatches:
 * the save's date reaches the match's day while the managed club's match may still wait at half-time.
 */
export async function recordChallengeScore(tx: Prisma.TransactionClient, saveId: string, challengeId: string | null): Promise<void> {
  if (challengeId === null) {
    return;
  }
  const entry = await tx.challengeEntry.findUnique({
    where: { saveId },
    select: { id: true, matchdaysPlayed: true, submittedAt: true, challenge: { select: { horizonMatchdays: true } } },
  });
  if (entry === null || entry.submittedAt !== null) {
    return;
  }
  const horizon = entry.challenge.horizonMatchdays;
  const managed = await tx.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
  // The first season's league: a challenge save starts on WORLD_START_DATE, as every save.
  const fixtures = await tx.fixture.findMany({
    where: {
      saveId,
      played: true,
      round: { lte: horizon },
      season: { startYear: WORLD_START_YEAR, competition: { kind: "LEAGUE" } },
      OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }],
    },
    select: { id: true, round: true, homeClubSaveId: true, homeGoals: true, awayGoals: true },
  });
  const score = challengeScore(
    fixtures.map(({ id, round, homeClubSaveId, homeGoals, awayGoals }) => {
      if (homeGoals === null || awayGoals === null) {
        throw new Error(`Played fixture ${id} has no score`);
      }
      const home = homeClubSaveId === managed.id;
      return { round, goalsFor: home ? homeGoals : awayGoals, goalsAgainst: home ? awayGoals : homeGoals };
    }),
    horizon,
  );

  if (score.matchdaysPlayed < horizon) {
    if (score.matchdaysPlayed !== entry.matchdaysPlayed) {
      await tx.challengeEntry.update({ where: { id: entry.id }, data: { matchdaysPlayed: score.matchdaysPlayed } });
    }
    return;
  }
  // Not simulation code: the submission's real time, from the database's clock rather than new Date(), in UTC as every
  // DateTime column (a timestamp without time zone would otherwise take the session's zone). Once: the condition on
  // submittedAt holds against a concurrent call too.
  await tx.$executeRaw`
    UPDATE "ChallengeEntry"
    SET "matchdaysPlayed" = ${score.matchdaysPlayed}, "points" = ${score.points}, "goalDiff" = ${score.goalDiff},
        "goalsFor" = ${score.goalsFor}, "submittedAt" = now() AT TIME ZONE 'UTC'
    WHERE "id" = ${entry.id} AND "submittedAt" IS NULL`;
}
