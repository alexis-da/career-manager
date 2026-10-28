import { CHALLENGE_HORIZON_MATCHDAYS } from "../config/challenge";
import { drawChallengeClub } from "../engine/challenge";
import { challengeSeed } from "../lib/challenge-seed";
import { isoWeekBounds, previousIsoWeekKey } from "../lib/iso-week";
import { getOrThrow } from "../lib/maps";
import { prisma } from "./client";

// The weekly challenge in the database: the week's Challenge row, written once by ensureChallenge, from the Monday
// maintenance call (app/api/maintenance/challenge/route.ts) or, failing it, from the first visit of /challenge.

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
