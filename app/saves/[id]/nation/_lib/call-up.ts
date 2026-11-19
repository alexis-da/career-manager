import type { CallUpCandidate, CallUpEditor } from "@/src/db/national-view";
import { CALL_UP_BY_GROUP, CALL_UP_SIZE } from "@/src/engine/balance";
import { POSITION_GROUPS, positionGroup, type PositionGroup } from "@/src/engine/positions";

// The national coach's list of 23 as its sheet edits it (docs/design/selections.md § 5.2, 9.7): the list it opens on,
// the candidates it shows, its lines, and why it cannot be saved yet. Pure.

/**
 * The players of each line the sheet shows beyond those of the lists and of his club, best first: a big nation has
 * hundreds of players in our clubs, none of whom he would call past the first few.
 */
export const NOT_CALLED_PER_LINE = 12;

type Lists = Pick<CallUpEditor, "chosen" | "assistant" | "candidates">;

/**
 * The list the sheet opens on: his own, else his assistant's; without a player who can no longer come (injured on the
 * first date, or gone from his nation's candidates), whom he replaces himself.
 */
export function initialSelection(editor: Lists): string[] {
  const available = new Set(editor.candidates.filter((candidate) => !candidate.injured).map((candidate) => candidate.key));
  return (editor.chosen ?? editor.assistant).filter((key) => available.has(key));
}

/**
 * The candidates the sheet shows, best first as the editor has them: every player of his list and of his assistant's,
 * every player of his own club, then the NOT_CALLED_PER_LINE best others of each line.
 */
export function shownCandidates(editor: Lists, perLine: number = NOT_CALLED_PER_LINE): CallUpCandidate[] {
  const listed = new Set([...(editor.chosen ?? []), ...editor.assistant]);
  const others = new Map<PositionGroup, number>();
  return editor.candidates.filter((candidate) => {
    if (listed.has(candidate.key) || candidate.ownClub) {
      return true;
    }
    const line = positionGroup(candidate.position);
    const shown = others.get(line) ?? 0;
    if (shown >= perLine) {
      return false;
    }
    others.set(line, shown + 1);
    return true;
  });
}

/** Whether a candidate is on the list: selected, and able to come (an injured player never is). */
const isCalled = (candidate: CallUpCandidate, selected: ReadonlySet<string>): boolean => selected.has(candidate.key) && !candidate.injured;

/** The players on the list, in the candidates' order. */
export const calledOf = (candidates: readonly CallUpCandidate[], selected: ReadonlySet<string>): CallUpCandidate[] =>
  candidates.filter((candidate) => isCalled(candidate, selected));

/** The keys of the list, in the candidates' order: what « Enregistrer la liste » sends. */
export const selectedKeys = (candidates: readonly CallUpCandidate[], selected: ReadonlySet<string>): string[] =>
  calledOf(candidates, selected).map((candidate) => candidate.key);

/** The goalkeepers on the list. */
export const goalkeepersOf = (candidates: readonly CallUpCandidate[], selected: ReadonlySet<string>): number =>
  calledOf(candidates, selected).filter((candidate) => positionGroup(candidate.position) === "GK").length;

/** A line of the sheet: its players on the list, best first, then the others. */
export type CallUpLine = { line: PositionGroup; called: CallUpCandidate[]; others: CallUpCandidate[] };

/** The sheet's lines, from the goal outwards: goalkeepers, defenders, midfielders, forwards. */
export function callUpLines(candidates: readonly CallUpCandidate[], selected: ReadonlySet<string>): CallUpLine[] {
  return POSITION_GROUPS.map((line) => {
    const ofLine = candidates.filter((candidate) => positionGroup(candidate.position) === line);
    return {
      line,
      called: ofLine.filter((candidate) => isCalled(candidate, selected)),
      others: ofLine.filter((candidate) => !isCalled(candidate, selected)),
    };
  });
}

/** Why a list cannot be saved yet, as the server would refuse it: not CALL_UP_SIZE players, or too few goalkeepers. */
export type CallUpIssue = { kind: "count"; count: number } | { kind: "goalkeepers"; count: number };

/** The issue of a list, null when it can be saved: the count first, then the goalkeepers. */
export function callUpIssue(candidates: readonly CallUpCandidate[], selected: ReadonlySet<string>): CallUpIssue | null {
  const count = calledOf(candidates, selected).length;
  if (count !== CALL_UP_SIZE) {
    return { kind: "count", count };
  }
  const goalkeepers = goalkeepersOf(candidates, selected);
  return goalkeepers < CALL_UP_BY_GROUP.GK ? { kind: "goalkeepers", count: goalkeepers } : null;
}
