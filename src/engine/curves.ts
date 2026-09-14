/** Piecewise-linear curve, as [x, y] points sorted by x. */
export type Curve = readonly (readonly [number, number])[];

/** Value of the curve at x: linear between points, flat before the first point and after the last. */
export function interpolate(curve: Curve, x: number): number {
  const [firstX, firstY] = curve[0];
  if (x <= firstX) {
    return firstY;
  }
  for (let index = 1; index < curve.length; index++) {
    const [x1, y1] = curve[index];
    if (x <= x1) {
      const [x0, y0] = curve[index - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return curve[curve.length - 1][1];
}

export function lerp(from: number, to: number, share: number): number {
  return from + (to - from) * share;
}

/** Strength of a final league rank: 1 for the champion, 0 for the last club, linear in between. */
export function rankStrength(rank: number, clubCount: number): number {
  if (!Number.isInteger(rank) || rank < 1 || rank > clubCount) {
    throw new RangeError(`Rank must be an integer within 1–${clubCount}, got ${rank}`);
  }
  return clubCount === 1 ? 1 : (clubCount - rank) / (clubCount - 1);
}
