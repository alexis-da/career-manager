import { formationPositions, type FormationName } from "@/src/engine/formations";
import { changeFormation, type LineupCandidate } from "@/src/engine/lineup";
import { ratingAt } from "@/src/engine/positions";
import type { Translator } from "@/src/i18n/translator";

/** The managed club's changes being made at half-time. */
export type HalfTimeState = {
  formation: FormationName;
  starters: (string | null)[]; // player key per slot
  bench: string[]; // substitutes who can still come on
  off: string[]; // players taken off at half-time: they cannot come back
  substitutions: { in: string; out: string }[];
};

/**
 * What the break cannot change: who is injured, which slots are a sent-off player's, the substitutions made, and how
 * many the match allows by the end of this break (one more at the end of regulation time, before extra time).
 */
export type HalfTimeRules = {
  injured: ReadonlySet<string>;
  sentOffSlots: ReadonlySet<number>;
  substitutionsBefore: number;
  maxSubstitutions: number;
};

export type Move = { ok: true; state: HalfTimeState } | { ok: false; message: string };

export const substitutionsMade = (state: HalfTimeState, rules: HalfTimeRules): number =>
  rules.substitutionsBefore + state.substitutions.length;

/**
 * A substitute dropped on a slot: its player goes off for good and the substitute comes on. On a player who came on
 * at this break, the substitute takes his place and he goes back to the bench, the substitution still counting once.
 */
export function substitute(
  state: HalfTimeState,
  rules: HalfTimeRules,
  slot: number,
  incoming: string,
  t: Translator<"halfTime">,
): Move {
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

/** The half-time choice resumeMatch receives. */
export type HalfTimeSubmission = {
  formation: FormationName;
  lineup: { slot: number; playerKey: string }[];
  substitutions: { in: string; out: string }[];
};

/**
 * The choice to send: an injured player still in his slot is replaced, as the engine does on its own, by the
 * substitute rated best in the slot while substitutions remain; otherwise his slot is left empty.
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
    if (best === undefined || rules.substitutionsBefore + substitutions.length >= rules.maxSubstitutions) {
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
