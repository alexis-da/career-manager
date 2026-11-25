import type { PlayerProgression, ProgressionPoint } from "@/src/db/progression-view";
import { GROWTH_BY_MINUTES } from "@/src/engine/balance";

// A player's progression as the squad and the sheet draw it (docs/design/effectif-adjoint.md § 3.2). Pure.

/** The squad's « Jeunes » view: the players this old or younger, at the age the screens show. */
export const YOUNG_MAX_AGE = 21;

/** League minutes from which a season's growth is whole (GROWTH_BY_MINUTES's last point): the gauge's full mark. */
export const FULL_GROWTH_MINUTES = GROWTH_BY_MINUTES[GROWTH_BY_MINUTES.length - 1][0];

/** A change with its sign, as the squad and the sheet write it: « +4 », « −1 » with a true minus, « 0 ». */
export function signedChange(change: number): string {
  if (change > 0) {
    return `+${change}`;
  }
  return change < 0 ? `−${Math.abs(change)}` : "0";
}

export const isYoung = (player: { age: number }): boolean => player.age <= YOUNG_MAX_AGE;

/** The summer to come as a squad's row says it: a growth of a point at least, at his rhythm; null otherwise. */
export function shownExpected(progression: PlayerProgression): number | null {
  const expected = progression.outlook?.growth?.expected ?? null;
  return expected !== null && expected > 0 ? expected : null;
}

/** The share of the league minutes' gauge, full at FULL_GROWTH_MINUTES. */
export function minutesShare(minutes: number): number {
  return Math.min(1, Math.max(0, minutes / FULL_GROWTH_MINUTES));
}

/**
 * The curve's frame, in the SVG's units: its width and height, and the plot's margins inside them, room for a season's
 * label centred under the first and the last point, and for a rating above the highest.
 */
export const CURVE_BOX = { width: 320, height: 120, left: 26, right: 26, top: 24, bottom: 30 } as const;

/** Rating points the curve spans at least, so that a point gained is not a cliff. */
const CURVE_MIN_SPAN = 8;

export type CurveMark = { x: number; y: number; value: number };

export type CurveLayout = {
  ratings: (CurveMark & { startYear: number })[];
  potentials: CurveMark[]; // the seasons whose potential is known, in order
  labelled: number[]; // the indexes of the points whose season is written under them: all up to four, else the ends
};

/**
 * Where the curve's points fall: one column per season, evenly spread, the oldest on the left; the ratings and the known
 * potentials on one scale, from a little under the lowest to a little over the highest.
 */
export function curveLayout(points: readonly ProgressionPoint[]): CurveLayout {
  const { width, height, left, right, top, bottom } = CURVE_BOX;
  const values = points.flatMap((point) => (point.potential === null ? [point.overall] : [point.overall, point.potential]));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(CURVE_MIN_SPAN, high - low + 2);
  const floor = (low + high) / 2 - span / 2;
  const xOf = (index: number): number =>
    points.length === 1 ? width / 2 : left + (index * (width - left - right)) / (points.length - 1);
  const yOf = (value: number): number => height - bottom - ((value - floor) / span) * (height - top - bottom);
  return {
    ratings: points.map((point, index) => ({ x: xOf(index), y: yOf(point.overall), value: point.overall, startYear: point.startYear })),
    potentials: points.flatMap((point, index) =>
      point.potential === null ? [] : [{ x: xOf(index), y: yOf(point.potential), value: point.potential }],
    ),
    labelled: points.length <= 4 ? points.map((_, index) => index) : [0, points.length - 1],
  };
}
