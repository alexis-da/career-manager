/** Level of a competition in its country (Competition.tier): 1 for the first division, 2 for the second. */
export type CompetitionTier = 1 | 2;

/** A Competition.tier read from the database, checked: the balance tables have a row for these tiers only. */
export function competitionTier(tier: number): CompetitionTier {
  if (tier === 1 || tier === 2) {
    return tier;
  }
  throw new RangeError(`Unknown competition tier: ${tier}`);
}
