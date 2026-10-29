export type ResultKind = "W" | "D" | "L";

// A result's letter (V, N, D; W, D, L in English) and name are messages: results.letter and results.label.

/** Fixed colors of a result, whatever the managed club. */
export const RESULT_CLASSES: Record<ResultKind, string> = {
  W: "bg-win/15 text-win",
  D: "bg-draw/15 text-draw",
  L: "bg-loss/15 text-loss",
};

/** Result of a played match for one of its clubs. */
export function resultFor(homeGoals: number, awayGoals: number, atHome: boolean): ResultKind {
  const [scored, conceded] = atHome ? [homeGoals, awayGoals] : [awayGoals, homeGoals];
  return scored > conceded ? "W" : scored < conceded ? "L" : "D";
}
