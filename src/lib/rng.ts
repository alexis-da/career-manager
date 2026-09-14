import seedrandom from "seedrandom";

/** Seeded uniform generator in [0, 1): the only source of randomness allowed in the engine and the seed. */
export type Rng = () => number;

export const makeRng = (seed: string): Rng => seedrandom(seed);

/** Integer in [min, max], both inclusive. */
export function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) {
    throw new RangeError("Cannot pick from an empty list");
  }
  return items[Math.floor(rng() * items.length)];
}

/** New array holding the items in a seeded random order (Fisher–Yates). */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(rng() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

/** Index drawn with a probability proportional to its weight. */
export function weightedIndex(rng: Rng, weights: readonly number[]): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) {
    throw new RangeError("Weights must have a positive sum");
  }
  let remaining = rng() * total;
  for (let index = 0; index < weights.length; index++) {
    remaining -= weights[index];
    if (remaining < 0) {
      return index;
    }
  }
  return weights.length - 1; // only reached through floating-point rounding
}

/**
 * Count drawn from a Poisson distribution of mean lambda (Knuth's multiplication method), for small
 * means such as goals or cards in a match.
 */
export function poisson(rng: Rng, lambda: number): number {
  if (!(lambda >= 0)) {
    throw new RangeError(`Poisson mean must be non-negative, got ${lambda}`);
  }
  const threshold = Math.exp(-lambda);
  let count = 0;
  let product = rng();
  while (product > threshold) {
    count++;
    product *= rng();
  }
  return count;
}

/**
 * Bell-shaped value in [-1, 1]: the mean of three uniform draws. Built from basic arithmetic only
 * (no Math.log or Math.cos) so a replay is bit-for-bit identical on any JavaScript engine.
 */
export function centeredSpread(rng: Rng): number {
  return ((rng() + rng() + rng()) / 3) * 2 - 1;
}
