import type { PausePhase } from "@/src/engine/live";
import type { Translator } from "@/src/i18n/translator";
import { getOrThrow } from "@/src/lib/maps";
import { substitutionsMade, type HalfTimeRules, type HalfTimeState, type SuggestedChange } from "./half-time-moves";

/** What a pause looks like to the assistant, with the manager's changes so far. */
export type MatchSituation = {
  phase: PausePhase;
  goalDifference: number; // from the managed club's point of view
  state: HalfTimeState;
  rules: HalfTimeRules;
  suggestion: SuggestedChange | null;
  booked: readonly string[]; // players with a yellow card, on the pitch or not
  hurt: readonly string[]; // players playing on after a knock
  players: ReadonlyMap<string, { lastName: string }>;
};

/** A sentence of the assistant's, by what it is about. */
export type AdviceLine = { topic: "injured" | "sentOff" | "score" | "change" | "booked" | "hurt"; text: string };

const scoreTopic = ({ phase, goalDifference }: MatchSituation) => {
  if (phase === "REGULATION_END") {
    return "extraTime";
  }
  return goalDifference > 0 ? "leading" : goalDifference < 0 ? "behind" : "level";
};

/** The suggested change and its reason, what weighs most in it (suggestChange), or why there is none. */
function changeLine(
  { state, suggestion, players }: MatchSituation,
  substitutionsLeft: number,
  t: Translator<"halfTime">,
): string {
  if (suggestion !== null) {
    const incoming = getOrThrow(players, suggestion.in, "player");
    const outgoing = getOrThrow(players, suggestion.out, "player");
    return t(`advice.change.${suggestion.reason}`, { in: incoming.lastName, out: outgoing.lastName });
  }
  if (substitutionsLeft <= 0) {
    return t("advice.change.noSubstitutionLeft");
  }
  if (state.bench.length === 0) {
    return t("noSubstitutes");
  }
  // A player who came on at this break is never weighed: the bench may hold better, only not for the others.
  return t(state.substitutions.length > 0 ? "advice.change.noOther" : "advice.change.noBetter");
}

/**
 * What the assistant says at a pause, in order: the injured, a side short of players, the score, the suggested change
 * or why there is none, the players on a yellow card, those playing on hurt. Nothing but what is true of the match: he counts the players the
 * choice sent at the restart leaves on the pitch, and at the end of regulation time, where resuming without a change
 * brings nobody on, he does not promise a substitute.
 */
export function coachAdvice(situation: MatchSituation, t: Translator<"halfTime">): AdviceLine[] {
  const { phase, state, rules, booked, hurt, players } = situation;
  const names = (keys: readonly string[]): string =>
    keys.map((key) => getOrThrow(players, key, "player").lastName).join(", ");

  const onPitch = state.starters.filter((key): key is string => key !== null);
  const injured = onPitch.filter((key) => rules.injured.has(key));
  const substitutionsLeft = rules.maxSubstitutions - substitutionsMade(state, rules);
  // An injured player nobody can replace leaves his slot empty (halfTimeChoice).
  const unreplaced = Math.max(0, injured.length - Math.min(substitutionsLeft, state.bench.length));
  const atRestart = onPitch.length - unreplaced;

  const lines: AdviceLine[] = [];
  if (injured.length > 0) {
    const named = { count: injured.length, names: names(injured) };
    lines.push({
      topic: "injured",
      text:
        unreplaced > 0
          ? t("advice.injuredUnreplaced", { ...named, players: atRestart })
          : phase === "REGULATION_END"
            ? t("advice.injuredOff", named)
            : t("injured", named),
    });
  }
  // Said with the injured otherwise.
  if (rules.sentOffSlots.size > 0 && unreplaced === 0) {
    lines.push({ topic: "sentOff", text: t("advice.playersLeft", { players: atRestart }) });
  }
  lines.push({ topic: "score", text: t(`advice.score.${scoreTopic(situation)}`) });
  lines.push({ topic: "change", text: changeLine(situation, substitutionsLeft, t) });

  const bookedOnPitch = onPitch.filter((key) => booked.includes(key) && !rules.injured.has(key));
  if (bookedOnPitch.length > 0) {
    lines.push({
      topic: "booked",
      text: t("advice.booked", { count: bookedOnPitch.length, names: names(bookedOnPitch), players: atRestart - 1 }),
    });
  }
  const hurtOnPitch = onPitch.filter((key) => hurt.includes(key));
  if (hurtOnPitch.length > 0) {
    lines.push({ topic: "hurt", text: t("advice.hurt", { count: hurtOnPitch.length, names: names(hurtOnPitch) }) });
  }
  return lines;
}
