import { formationPositions, type FormationName } from "@/src/engine/formations";
import { changeFormation, type LineupCandidate } from "@/src/engine/lineup";
import { ratingAt, type Position } from "@/src/engine/positions";
import type { Translator } from "@/src/i18n/translator";

/** The gain of level, in points, from which the assistant suggests a substitution. */
const MIN_SUGGESTED_GAIN = 1;

/** The managed club's changes being made at a pause, half-time first of all, hence the name. */
export type HalfTimeState = {
  formation: FormationName;
  starters: (string | null)[]; // player key per slot
  bench: string[]; // substitutes who can still come on
  off: string[]; // players taken off at this pause: they cannot come back
  substitutions: { in: string; out: string }[];
};

/**
 * What the pause cannot change: who is injured, which slots are a sent-off player's, the substitutions made, how many the
 * match allows by the end of this pause (one more from the end of regulation time, before extra time), and whether one
 * may be made here at all: during play, only in a window.
 */
export type HalfTimeRules = {
  injured: ReadonlySet<string>;
  sentOffSlots: ReadonlySet<number>;
  substitutionsBefore: number;
  maxSubstitutions: number;
  canSubstitute: boolean;
};

export type Move = { ok: true; state: HalfTimeState } | { ok: false; message: string };

export const substitutionsMade = (state: HalfTimeState, rules: HalfTimeRules): number =>
  rules.substitutionsBefore + state.substitutions.length;

/**
 * A substitute dropped on a slot: its player goes off for good and the substitute comes on. On a player who came on
 * at this pause, the substitute takes his place and he goes back to the bench, the substitution still counting once.
 * Refused during play without a window.
 */
export function substitute(
  state: HalfTimeState,
  rules: HalfTimeRules,
  slot: number,
  incoming: string,
  t: Translator<"halfTime">,
): Move {
  if (!rules.canSubstitute) {
    return { ok: false, message: t("refusals.noWindow") };
  }
  if (rules.sentOffSlots.has(slot)) {
    return { ok: false, message: t("refusals.sentOffSlot") };
  }
  const outgoing = state.starters[slot];
  if (outgoing === null || outgoing === undefined || !state.bench.includes(incoming)) {
    return { ok: false, message: t("refusals.substituteForPlayer") };
  }
  const starters = [...state.starters];
  starters[slot] = incoming;
  const bench = state.bench.filter((key) => key !== incoming);

  const earlier = state.substitutions.find((substitution) => substitution.in === outgoing);
  if (earlier !== undefined) {
    return {
      ok: true,
      state: {
        ...state,
        starters,
        bench: [outgoing, ...bench],
        substitutions: state.substitutions.map((substitution) =>
          substitution === earlier ? { ...substitution, in: incoming } : substitution,
        ),
      },
    };
  }
  if (substitutionsMade(state, rules) >= rules.maxSubstitutions) {
    return { ok: false, message: t("refusals.noSubstitutionLeft", { max: rules.maxSubstitutions }) };
  }
  return {
    ok: true,
    state: {
      ...state,
      starters,
      bench,
      off: [...state.off, outgoing],
      substitutions: [...state.substitutions, { in: incoming, out: outgoing }],
    },
  };
}

/**
 * Undoes a substitution of this pause: the player going off takes back the place of the one coming on, wherever a
 * move or a formation has put him, and the one coming on goes back to the bench.
 */
export function cancelSubstitution(state: HalfTimeState, change: { in: string; out: string }): HalfTimeState {
  if (!state.substitutions.some((substitution) => substitution.in === change.in && substitution.out === change.out)) {
    return state;
  }
  return {
    ...state,
    starters: state.starters.map((key) => (key === change.in ? change.out : key)),
    bench: [change.in, ...state.bench],
    off: state.off.filter((key) => key !== change.out),
    substitutions: state.substitutions.filter((substitution) => substitution.out !== change.out),
  };
}

/**
 * What the assistant needs to know of a player on top of his rating: his fitness at the restart, its factor (fresh at
 * kick-off, worn since), and the engine's condition, his form (morale stays neutral) times that factor.
 */
type RatedCandidate = LineupCandidate & { condition: number; fitness: number; fitnessFactor: number };

/** A player's level in a position, as the engine plays him there. */
const levelAt = (player: RatedCandidate, position: Position): number => ratingAt(player, position) * player.condition;

/**
 * Why the assistant suggests a change: the player going off is injured, or what weighs most in the gain, the incoming
 * player's rating in the slot (level), his form, or his freshness (fitness).
 */
export type ChangeReason = "injured" | "level" | "form" | "fitness";

/** The substitution the assistant suggests. */
export type SuggestedChange = {
  slot: number;
  position: Position; // the slot's, in the current formation
  out: string;
  in: string;
  reason: ChangeReason;
  gain: number; // of level in the position
};

/**
 * What weighs most in the gain of a change. A level is the rating in the slot, times the form's part of the condition,
 * times the fitness's: the factor that grows most from the outgoing player to the incoming one is the reason. Ties go to
 * the level, then the form: the freshness only when it outweighs both.
 */
function mainReason(incoming: RatedCandidate, outgoing: RatedCandidate, position: Position): Exclude<ChangeReason, "injured"> {
  const formOf = (player: RatedCandidate): number => player.condition / player.fitnessFactor;
  const factors: [Exclude<ChangeReason, "injured">, number][] = [
    ["level", ratingAt(incoming, position) / ratingAt(outgoing, position)],
    ["form", formOf(incoming) / formOf(outgoing)],
    ["fitness", incoming.fitnessFactor / outgoing.fitnessFactor],
  ];
  return factors.reduce((best, factor) => (factor[1] > best[1] ? factor : best))[0];
}

const isInjury = (change: SuggestedChange): boolean => change.reason === "injured";

/** Whether a change comes before another: an injured player first, then the larger gain, then the player's key. */
const comesBefore = (a: SuggestedChange, b: SuggestedChange): boolean => {
  if (isInjury(a) !== isInjury(b)) {
    return isInjury(a);
  }
  return a.gain === b.gain ? a.out < b.out : a.gain > b.gain;
};

/**
 * The substitution the assistant suggests, or null: none left, none allowed at this pause, nobody on the bench, or nobody
 * worth it. Each player on the pitch is weighed against the best substitute in his slot, but for a sent-off player's slot
 * and a player who came on at this pause, the manager's own choice. An injured player goes first, whatever the gain; otherwise the largest
 * gain, from MIN_SUGGESTED_GAIN, with what weighs most in it (mainReason). Ties go to the smaller key, so the input's
 * order changes nothing.
 */
export function suggestChange(
  state: HalfTimeState,
  rules: HalfTimeRules,
  players: readonly RatedCandidate[],
): SuggestedChange | null {
  const byKey = new Map(players.map((player) => [player.id, player]));
  const bench = state.bench.flatMap((key) => byKey.get(key) ?? []);
  if (bench.length === 0 || !rules.canSubstitute || substitutionsMade(state, rules) >= rules.maxSubstitutions) {
    return null;
  }
  const positions = formationPositions(state.formation);
  const cameOn = new Set(state.substitutions.map((substitution) => substitution.in));
  let best: SuggestedChange | null = null;
  for (const [slot, key] of state.starters.entries()) {
    const outgoing = key === null ? undefined : byKey.get(key);
    if (outgoing === undefined || rules.sentOffSlots.has(slot) || cameOn.has(outgoing.id)) {
      continue;
    }
    const position = positions[slot];
    const incoming = bench.reduce((current, candidate) => {
      const gap = levelAt(candidate, position) - levelAt(current, position);
      return gap > 0 || (gap === 0 && candidate.id < current.id) ? candidate : current;
    });
    const change: SuggestedChange = {
      slot,
      position,
      out: outgoing.id,
      in: incoming.id,
      reason: rules.injured.has(outgoing.id) ? "injured" : mainReason(incoming, outgoing, position),
      gain: levelAt(incoming, position) - levelAt(outgoing, position),
    };
    if ((isInjury(change) || change.gain >= MIN_SUGGESTED_GAIN) && (best === null || comesBefore(change, best))) {
      best = change;
    }
  }
  return best;
}

/** Two slots exchange their players: a free repositioning. A sent-off player's slot stays empty. */
export function swapSlots(state: HalfTimeState, rules: HalfTimeRules, a: number, b: number, t: Translator<"halfTime">): Move {
  if (rules.sentOffSlots.has(a) || rules.sentOffSlots.has(b)) {
    return { ok: false, message: t("refusals.sentOffSlot") };
  }
  if (a === b) {
    return { ok: true, state };
  }
  const starters = [...state.starters];
  [starters[a], starters[b]] = [starters[b], starters[a]];
  return { ok: true, state: { ...state, starters } };
}

/**
 * Switches formation as the lineup page does (same position, then same line, then automatic), among the players on
 * the pitch only. A player the switch leaves out, or puts in a sent-off player's slot, takes the first empty slot.
 */
export function switchFormation<P extends LineupCandidate>(
  state: HalfTimeState,
  rules: HalfTimeRules,
  to: FormationName,
  players: readonly P[],
): HalfTimeState {
  if (to === state.formation) {
    return state;
  }
  const onPitch = new Set(state.starters.filter((key): key is string => key !== null));
  const squad = players.filter((player) => onPitch.has(player.id));
  const starters = changeFormation(state.formation, to, state.starters, squad);
  const homeless = [...onPitch].filter((key) => !starters.includes(key));
  for (const slot of rules.sentOffSlots) {
    const key = starters[slot];
    if (key !== null) {
      homeless.push(key);
      starters[slot] = null;
    }
  }
  for (const key of homeless) {
    const free = starters.findIndex((current, slot) => current === null && !rules.sentOffSlots.has(slot));
    if (free !== -1) {
      starters[free] = key;
    }
  }
  return { ...state, formation: to, starters };
}

/** The changes playLiveStepAction receives. */
export type HalfTimeSubmission = {
  formation: FormationName;
  lineup: { slot: number; playerKey: string }[];
  substitutions: { in: string; out: string }[];
};

/**
 * The changes to send: an injured player still in his slot is replaced, as the engine does on its own, by the
 * substitute rated best in the slot while substitutions remain and one may be made here; otherwise his slot is left empty.
 */
export function halfTimeChoice<P extends LineupCandidate>(
  state: HalfTimeState,
  rules: HalfTimeRules,
  players: readonly P[],
): HalfTimeSubmission {
  const byKey = new Map(players.map((player) => [player.id, player]));
  const positions = formationPositions(state.formation);
  const starters = [...state.starters];
  const bench = [...state.bench];
  const substitutions = [...state.substitutions];
  starters.forEach((key, slot) => {
    if (key === null || !rules.injured.has(key)) {
      return;
    }
    let best: P | undefined;
    for (const candidate of bench.flatMap((benchKey) => byKey.get(benchKey) ?? [])) {
      const gap = best === undefined ? 1 : ratingAt(candidate, positions[slot]) - ratingAt(best, positions[slot]);
      if (gap > 0 || (gap === 0 && best !== undefined && candidate.id < best.id)) {
        best = candidate;
      }
    }
    if (best === undefined || !rules.canSubstitute || rules.substitutionsBefore + substitutions.length >= rules.maxSubstitutions) {
      starters[slot] = null;
      return;
    }
    const incoming = best.id;
    bench.splice(bench.indexOf(incoming), 1);
    substitutions.push({ in: incoming, out: key });
    starters[slot] = incoming;
  });
  return {
    formation: state.formation,
    lineup: starters.flatMap((playerKey, slot) =>
      playerKey === null || rules.sentOffSlots.has(slot) ? [] : [{ slot, playerKey }],
    ),
    substitutions,
  };
}
