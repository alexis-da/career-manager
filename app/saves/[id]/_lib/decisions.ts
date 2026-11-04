import type { DecisionView, MatchEventView } from "@/src/db/calendar";
import { REGULATION_MINUTES } from "@/src/engine/balance";
import type { MatchEventType } from "@/src/engine/match";
import type { Translator } from "@/src/i18n/translator";

// A decision of the managed club on a choice event is taken at a boundary between two segments; what it does at once is
// in the match's events the minute after, where the engine dates it (applyOption, src/engine/choices.ts): a kick's goal,
// a protest's card, a player's substitution. Its words are messages: decisions.

/** A moment of a match: a minute and its period, as an event has them. */
export type MatchMoment = { minute: number; period: MatchEventView["period"] };

/** Where a decision falls in its match: the minute after its boundary, where its effect is, in extra time past the 90th. */
export function decisionMoment(decision: Pick<DecisionView, "minute">): MatchMoment {
  const minute = decision.minute + 1;
  return { minute, period: minute > REGULATION_MINUTES ? "EXTRA_TIME" : "REGULAR" };
}

/** A line of a match told in order: one of its events, or a decision of the managed club. */
export type MatchLine = { kind: "event"; event: MatchEventView } | { kind: "decision"; decision: DecisionView };

const PERIODS: readonly MatchEventView["period"][] = ["REGULAR", "EXTRA_TIME", "SHOOTOUT"];

/** Whether a moment comes no later than an event: in an earlier period, or in its own at or before its minute. */
function notAfter(moment: MatchMoment, event: MatchEventView): boolean {
  const order = PERIODS.indexOf(moment.period) - PERIODS.indexOf(event.period);
  return order < 0 || (order === 0 && moment.minute <= event.minute);
}

const eventLine = (event: MatchEventView): MatchLine => ({ kind: "event", event });
const decisionLine = (decision: DecisionView): MatchLine => ({ kind: "decision", decision });

/**
 * A match's events, in the order given (the match's), with its decisions among them: each after the events up to its
 * boundary and before those of its moment, which it caused. The events keep their order.
 */
export function withDecisions(events: readonly MatchEventView[], decisions: readonly DecisionView[]): MatchLine[] {
  const placed = decisions
    .toSorted((a, b) => a.sequence - b.sequence)
    .map((decision) => {
      const index = events.findIndex((event) => notAfter(decisionMoment(decision), event));
      return { decision, index: index < 0 ? events.length : index };
    });
  const decisionsAt = (index: number): MatchLine[] =>
    placed.filter((entry) => entry.index === index).map((entry) => decisionLine(entry.decision));
  return [...events.flatMap((event, index) => [...decisionsAt(index), eventLine(event)]), ...decisionsAt(events.length)];
}

/**
 * What a decision did at once: a kick in or not, the card a protest earned the captain if any, the player who came on for
 * the one taken off (null while his substitution is not among the events read). Anything else (a combination, an
 * instruction, a player kept or played on, players calmed) has no incident of its own: none.
 */
export type DecisionEffect =
  | { outcome: "scored" | "missed" }
  | { outcome: "booked" | "sentOff" | "noCard" }
  | { outcome: "substituted"; replacement: string | null }
  | { outcome: "none" };

/** A decision's effect, read in a match's events (all of them, or those shown so far): those of its moment. */
export function decisionEffect(decision: DecisionView, events: readonly MatchEventView[]): DecisionEffect {
  const moment = decisionMoment(decision);
  const then = events.filter((event) => event.minute === moment.minute && event.period === moment.period);
  // The player it is about, by his key: two players of a match may share a name.
  const about = decision.playerKey;
  const his = (type: MatchEventType): boolean => about !== null && then.some((event) => event.type === type && event.playerKey === about);
  switch (decision.option) {
    case "TAKER":
    case "SHOOT":
      return { outcome: his("GOAL") ? "scored" : "missed" };
    case "PROTEST":
      // A second yellow comes with its red, at the same minute.
      return { outcome: !his("YELLOW_CARD") ? "noCard" : his("RED_CARD") ? "sentOff" : "booked" };
    case "TAKE_OFF":
    case "REPLACE": {
      const change = then.find((event) => event.type === "SUBSTITUTION" && about !== null && event.relatedPlayerKey === about);
      return { outcome: "substituted", replacement: change?.playerName ?? null };
    }
    case "COMBINE":
    case "KEEP":
    case "CALM":
    case "PLAY_ON":
    case "DEFEND":
    case "ATTACK":
    case "STEADY":
      return { outcome: "none" };
  }
}

/**
 * Whether a name starts with a vowel, accents aside: French then says « d’ » rather than « de » (« Penalty d’Ousmane
 * Diallo »), English « by » either way. An h or a y keeps « de »: right for every y of the game's first names (« de
 * Yanis ») and most of its h (« de Hakim », « de Harry »), not for a silent one (« de Hugo »).
 */
const startsWithVowel = (name: string): boolean => /^[aeiou]/i.test(name.normalize("NFD"));

/**
 * A decision in a sentence, with what it did (decisionEffect): « Penalty de Diallo : but ». True whoever took it, the
 * manager or his assistant (a simulated match, a skipped pause): only a protest, which the assistant never makes, says
 * « tu ». An instruction holds until the end of regular time.
 */
export function describeDecision(decision: DecisionView, events: readonly MatchEventView[], t: Translator<"decisions">): string {
  const player = decision.playerName ?? t("unknownPlayer");
  const effect = decisionEffect(decision, events);
  const scored = effect.outcome === "scored";
  const taker = (): string => t(startsWithVowel(player) ? "taker.beforeVowel" : "taker.beforeConsonant", { player });
  const takenOff = (): { player: string; replacement: string } => ({
    player,
    replacement: (effect.outcome === "substituted" ? effect.replacement : null) ?? t("substitute"),
  });
  switch (decision.kind) {
    case "PENALTY":
      return t(scored ? "penalty.scored" : "penalty.missed", { taker: taker() });
    case "FREE_KICK":
      if (decision.option === "COMBINE") {
        return t("freeKick.combined");
      }
      return t(scored ? "freeKick.scored" : "freeKick.missed", { taker: taker() });
    case "HOTHEAD":
      return decision.option === "TAKE_OFF" ? t("hothead.off", takenOff()) : t("hothead.kept", { player });
    case "SCUFFLE":
      if (decision.option !== "PROTEST") {
        return t("scuffle.calm");
      }
      return effect.outcome === "booked" || effect.outcome === "sentOff"
        ? t(`scuffle.${effect.outcome}`, { player })
        : t("scuffle.noCard");
    case "KNOCK":
      return decision.option === "TAKE_OFF" ? t("knock.off", takenOff()) : t("knock.playOn", { player });
    case "EXHAUSTED":
      return decision.option === "REPLACE" ? t("exhausted.off", takenOff()) : t("exhausted.kept", { player });
    case "LEADING":
      return t(decision.option === "DEFEND" ? "leading.DEFEND" : decision.option === "ATTACK" ? "leading.ATTACK" : "leading.STEADY");
    case "CHASING":
      return t(decision.option === "ATTACK" ? "chasing.ATTACK" : decision.option === "DEFEND" ? "chasing.DEFEND" : "chasing.STEADY");
  }
}
