import { describe, expect, it } from "vitest";
import type { DecisionView, MatchEventView } from "@/src/db/calendar";
import { testTranslator } from "@/src/i18n/test-intl";
import { decisionEffect, decisionMoment, describeDecision, withDecisions, type MatchLine } from "./decisions";

const t = testTranslator("fr", "decisions");
const tEnglish = testTranslator("en", "decisions");

/** A decision at the 15th minute's boundary about Moussa Diallo, the assistant's unless told otherwise. */
function decision(kind: DecisionView["kind"], option: DecisionView["option"], overrides: Partial<DecisionView> = {}): DecisionView {
  return { sequence: 1, minute: 15, kind, option, assistant: true, playerName: "Moussa Diallo", playerKey: "diallo", ...overrides };
}

/** An event of Moussa Diallo's in regular time, unless told otherwise. */
function event(id: string, minute: number, type: MatchEventView["type"], overrides: Partial<MatchEventView> = {}): MatchEventView {
  return {
    id,
    minute,
    type,
    period: "REGULAR",
    side: "home",
    playerName: "Moussa Diallo",
    playerKey: "diallo",
    playerAge: 24,
    relatedPlayerName: null,
    relatedPlayerKey: null,
    ...overrides,
  };
}

/** Hugo Guérin on for Moussa Diallo, the minute after the 15th minute's boundary. */
const substitution = event("substitution", 16, "SUBSTITUTION", {
  playerName: "Hugo Guérin",
  playerKey: "guerin",
  relatedPlayerName: "Moussa Diallo",
  relatedPlayerKey: "diallo",
});

/** The options that cause nothing at once, with their events. */
const QUIET: readonly (readonly [DecisionView["kind"], DecisionView["option"]])[] = [
  ["FREE_KICK", "COMBINE"],
  ["HOTHEAD", "KEEP"],
  ["SCUFFLE", "CALM"],
  ["KNOCK", "PLAY_ON"],
  ["EXHAUSTED", "KEEP"],
  ["LEADING", "DEFEND"],
  ["LEADING", "ATTACK"],
  ["LEADING", "STEADY"],
  ["CHASING", "ATTACK"],
  ["CHASING", "STEADY"],
];

describe("decisionMoment", () => {
  it("puts a decision the minute after its boundary, in extra time past the 90th", () => {
    expect(decisionMoment({ minute: 15 })).toEqual({ minute: 16, period: "REGULAR" });
    expect(decisionMoment({ minute: 75 })).toEqual({ minute: 76, period: "REGULAR" });
    expect(decisionMoment({ minute: 105 })).toEqual({ minute: 106, period: "EXTRA_TIME" });
  });
});

describe("decisionEffect", () => {
  it("scores a kick when its taker scores the minute after the boundary, and only then", () => {
    const penalty = decision("PENALTY", "TAKER");

    expect(decisionEffect(penalty, [event("goal", 16, "GOAL")])).toEqual({ outcome: "scored" });
    expect(decisionEffect(decision("FREE_KICK", "SHOOT"), [event("goal", 16, "GOAL")])).toEqual({ outcome: "scored" });
    expect(decisionEffect(penalty, [])).toEqual({ outcome: "missed" });
    // A goal of another player, even of the same name, or his own at another minute, is the match's, not the kick's.
    expect(decisionEffect(penalty, [event("goal", 16, "GOAL", { playerKey: "namesake" })])).toEqual({ outcome: "missed" });
    expect(decisionEffect(penalty, [event("goal", 15, "GOAL"), event("later", 17, "GOAL")])).toEqual({ outcome: "missed" });
  });

  it("reads a decision of extra time in extra time's events", () => {
    const penalty = decision("PENALTY", "TAKER", { minute: 105 });

    expect(decisionEffect(penalty, [event("goal", 106, "GOAL", { period: "EXTRA_TIME" })])).toEqual({ outcome: "scored" });
    expect(decisionEffect(penalty, [event("goal", 106, "GOAL")])).toEqual({ outcome: "missed" });
  });

  it("reads the card a protest earned the captain: a yellow, or his second with its red", () => {
    const protest = decision("SCUFFLE", "PROTEST", { assistant: false });

    expect(decisionEffect(protest, [event("yellow", 16, "YELLOW_CARD")])).toEqual({ outcome: "booked" });
    expect(decisionEffect(protest, [event("yellow", 16, "YELLOW_CARD"), event("red", 16, "RED_CARD")])).toEqual({ outcome: "sentOff" });
    expect(decisionEffect(protest, [event("yellow", 16, "YELLOW_CARD", { playerKey: "other" })])).toEqual({ outcome: "noCard" });
    expect(decisionEffect(protest, [])).toEqual({ outcome: "noCard" });
  });

  it("names the player who came on for the one taken off", () => {
    for (const takenOff of [decision("HOTHEAD", "TAKE_OFF"), decision("KNOCK", "TAKE_OFF"), decision("EXHAUSTED", "REPLACE")]) {
      expect(decisionEffect(takenOff, [substitution])).toEqual({ outcome: "substituted", replacement: "Hugo Guérin" });
    }
    // Another player's substitution, or none read yet: who came on is not known.
    const other = { ...substitution, relatedPlayerKey: "other" };
    expect(decisionEffect(decision("KNOCK", "TAKE_OFF"), [other])).toEqual({ outcome: "substituted", replacement: null });
    expect(decisionEffect(decision("KNOCK", "TAKE_OFF"), [])).toEqual({ outcome: "substituted", replacement: null });
  });

  it("has no incident for the other options, whatever the minute after holds", () => {
    const busy = [event("goal", 16, "GOAL"), event("yellow", 16, "YELLOW_CARD"), substitution];
    for (const [kind, option] of QUIET) {
      expect(decisionEffect(decision(kind, option), busy), `${kind} ${option}`).toEqual({ outcome: "none" });
    }
  });
});

describe("describeDecision", () => {
  it("tells a kick and how it went, in French and in English", () => {
    const goal = [event("goal", 16, "GOAL")];
    const penalty = decision("PENALTY", "TAKER");
    const freeKick = decision("FREE_KICK", "SHOOT");

    expect(describeDecision(penalty, goal, t)).toBe("Penalty de Moussa Diallo : but");
    expect(describeDecision(penalty, [], t)).toBe("Penalty de Moussa Diallo : manqué");
    expect(describeDecision(freeKick, goal, t)).toBe("Coup franc de Moussa Diallo : but");
    expect(describeDecision(freeKick, [], t)).toBe("Coup franc de Moussa Diallo : raté");
    expect(describeDecision(decision("FREE_KICK", "COMBINE"), goal, t)).toBe("Coup franc joué en combinaison");

    expect(describeDecision(penalty, goal, tEnglish)).toBe("Penalty by Moussa Diallo: scored");
    expect(describeDecision(penalty, [], tEnglish)).toBe("Penalty by Moussa Diallo: missed");
    expect(describeDecision(freeKick, goal, tEnglish)).toBe("Free kick by Moussa Diallo: goal");
    expect(describeDecision(freeKick, [], tEnglish)).toBe("Free kick by Moussa Diallo: missed");
    expect(describeDecision(decision("FREE_KICK", "COMBINE"), goal, tEnglish)).toBe("Free kick worked short");
  });

  it("says « d’ » before a name starting with a vowel, accent or not, and « de » before an h or a y", () => {
    expect(describeDecision(decision("PENALTY", "TAKER", { playerName: "Ousmane Diallo" }), [], t)).toBe("Penalty d’Ousmane Diallo : manqué");
    expect(describeDecision(decision("FREE_KICK", "SHOOT", { playerName: "Émile Martin" }), [], t)).toBe("Coup franc d’Émile Martin : raté");
    expect(describeDecision(decision("PENALTY", "TAKER", { playerName: "Hakim Benali" }), [], t)).toBe("Penalty de Hakim Benali : manqué");
    expect(describeDecision(decision("PENALTY", "TAKER", { playerName: "Yanis Morel" }), [], t)).toBe("Penalty de Yanis Morel : manqué");
    expect(describeDecision(decision("PENALTY", "TAKER", { playerName: "Ousmane Diallo" }), [], tEnglish)).toBe("Penalty by Ousmane Diallo: missed");
  });

  it("says who went off and who came on, or who stayed on", () => {
    const cases: readonly [DecisionView, string, string][] = [
      [decision("HOTHEAD", "TAKE_OFF"), "Moussa Diallo, averti, sort : Hugo Guérin entre", "Moussa Diallo, on a yellow, comes off: Hugo Guérin on"],
      [decision("HOTHEAD", "KEEP"), "Moussa Diallo, averti, reste sur le terrain", "Moussa Diallo, on a yellow, stays on"],
      [decision("KNOCK", "TAKE_OFF"), "Moussa Diallo, touché, sort : Hugo Guérin entre", "Moussa Diallo, hurt, comes off: Hugo Guérin on"],
      [decision("KNOCK", "PLAY_ON"), "Moussa Diallo, touché, continue", "Moussa Diallo, hurt, plays on"],
      [decision("EXHAUSTED", "REPLACE"), "Moussa Diallo, à bout, sort : Hugo Guérin entre", "Moussa Diallo, exhausted, comes off: Hugo Guérin on"],
      [decision("EXHAUSTED", "KEEP"), "Moussa Diallo, à bout, reste sur le terrain", "Moussa Diallo, exhausted, stays on"],
    ];
    for (const [taken, french, english] of cases) {
      expect(describeDecision(taken, [substitution], t)).toBe(french);
      expect(describeDecision(taken, [substitution], tEnglish)).toBe(english);
    }
  });

  it("speaks of a substitute while the substitution is not among the events read", () => {
    expect(describeDecision(decision("KNOCK", "TAKE_OFF"), [], t)).toBe("Moussa Diallo, touché, sort : un remplaçant entre");
    expect(describeDecision(decision("KNOCK", "TAKE_OFF"), [], tEnglish)).toBe("Moussa Diallo, hurt, comes off: a substitute on");
  });

  it("tells a scuffle: the players calmed, or the protest and the card it earned the captain", () => {
    const protest = decision("SCUFFLE", "PROTEST", { assistant: false });
    const yellow = event("yellow", 16, "YELLOW_CARD");
    const red = event("red", 16, "RED_CARD");

    expect(describeDecision(decision("SCUFFLE", "CALM"), [yellow], t)).toBe("Échauffourée : les joueurs se calment");
    expect(describeDecision(protest, [yellow], t)).toBe("Tu as protesté : Moussa Diallo averti");
    expect(describeDecision(protest, [yellow, red], t)).toBe("Tu as protesté : Moussa Diallo exclu");
    expect(describeDecision(protest, [], t)).toBe("Tu as protesté : pas de carton");

    expect(describeDecision(decision("SCUFFLE", "CALM"), [yellow], tEnglish)).toBe("Scuffle: the players calm down");
    expect(describeDecision(protest, [yellow], tEnglish)).toBe("You protested: Moussa Diallo booked");
    expect(describeDecision(protest, [yellow, red], tEnglish)).toBe("You protested: Moussa Diallo sent off");
    expect(describeDecision(protest, [], tEnglish)).toBe("You protested: no card");
  });

  it("gives the instruction until the end of regular time, leading or not", () => {
    const instruction = (kind: "LEADING" | "CHASING", option: DecisionView["option"]): DecisionView =>
      decision(kind, option, { minute: 75, playerName: null, playerKey: null });
    const cases: readonly [DecisionView, string, string][] = [
      [instruction("LEADING", "DEFEND"), "Consigne jusqu'à la fin : fermer le jeu", "Until full time: shut up shop"],
      [instruction("LEADING", "ATTACK"), "Consigne jusqu'à la fin : chercher le break", "Until full time: go for the killer goal"],
      [instruction("LEADING", "STEADY"), "Consigne jusqu'à la fin : garder l'équilibre", "Until full time: stay balanced"],
      [instruction("CHASING", "ATTACK"), "Consigne jusqu'à la fin : tout pour l'attaque", "Until full time: all-out attack"],
      [instruction("CHASING", "STEADY"), "Consigne jusqu'à la fin : garder l'équilibre", "Until full time: stay balanced"],
      [instruction("CHASING", "DEFEND"), "Consigne jusqu'à la fin : fermer le jeu", "Until full time: shut up shop"],
    ];
    for (const [given, french, english] of cases) {
      expect(describeDecision(given, [], t)).toBe(french);
      expect(describeDecision(given, [], tEnglish)).toBe(english);
    }
  });

  it("names an unknown player rather than nobody", () => {
    const unknown = decision("KNOCK", "PLAY_ON", { playerName: null, playerKey: null });

    expect(describeDecision(unknown, [], t)).toBe("Joueur inconnu, touché, continue");
    expect(describeDecision(unknown, [], tEnglish)).toBe("Unknown player, hurt, plays on");
  });

  it("never makes the manager the one who decided what his assistant may have: only a protest", () => {
    const events = [event("goal", 16, "GOAL"), substitution];
    const taken = [...QUIET, ["PENALTY", "TAKER"], ["FREE_KICK", "SHOOT"], ["HOTHEAD", "TAKE_OFF"], ["KNOCK", "TAKE_OFF"], ["EXHAUSTED", "REPLACE"]] as const;
    for (const [kind, option] of taken) {
      expect(describeDecision(decision(kind, option), events, t), `${kind} ${option}`).not.toMatch(/\btu\b/i);
      // An instruction speaks to the players (« hold your shape »), never of the manager.
      expect(describeDecision(decision(kind, option), events, tEnglish), `${kind} ${option}`).not.toMatch(/^You\b/);
    }
  });
});

/** A match told in a word per line, in order. */
const lineKeys = (lines: MatchLine[]): string[] =>
  lines.map((line) =>
    line.kind === "event"
      ? line.event.id
      : line.kind === "decision"
        ? `decision-${line.decision.sequence}`
        : `instruction-${line.change.instruction}-${line.change.minute}`,
  );

describe("withDecisions, with changes of instruction", () => {
  it("puts a change after the events of its boundary and before those of the minute after, a decision first", () => {
    const events = [event("at-45", 45, "GOAL"), event("at-46", 46, "SUBSTITUTION"), event("at-61", 61, "GOAL")];
    const changes = [
      { minute: 1, period: "REGULAR" as const, instruction: "DEFEND" as const, source: "START" as const },
      { minute: 46, period: "REGULAR" as const, instruction: "ATTACK" as const, source: "MANAGER" as const },
      { minute: 61, period: "REGULAR" as const, instruction: "BALANCED" as const, source: "ASSISTANT" as const },
    ];

    expect(lineKeys(withDecisions(events, [decision("SCUFFLE", "CALM", { sequence: 1, minute: 60 })], changes))).toEqual([
      "instruction-DEFEND-1",
      "at-45",
      "instruction-ATTACK-46",
      "at-46",
      "decision-1",
      "instruction-BALANCED-61",
      "at-61",
    ]);
  });
});

describe("withDecisions", () => {
  it("puts a decision after the events of its boundary and before those of the minute after, which it caused", () => {
    const events = [event("at-15", 15, "YELLOW_CARD"), event("at-16", 16, "GOAL"), event("also-16", 16, "INJURY"), event("at-20", 20, "GOAL")];

    expect(lineKeys(withDecisions(events, [decision("PENALTY", "TAKER")]))).toEqual(["at-15", "decision-1", "at-16", "also-16", "at-20"]);
  });

  it("keeps the events as they are without a decision", () => {
    const events = [event("a", 10, "GOAL"), event("b", 3, "YELLOW_CARD")];

    expect(withDecisions(events, [])).toEqual([
      { kind: "event", event: events[0] },
      { kind: "event", event: events[1] },
    ]);
  });

  it("puts the decisions last when nothing came after them, in the match's order", () => {
    const decisions = [decision("LEADING", "DEFEND", { sequence: 2, minute: 60 }), decision("KNOCK", "PLAY_ON", { sequence: 1, minute: 30 })];

    expect(lineKeys(withDecisions([event("early", 10, "GOAL")], decisions))).toEqual(["early", "decision-1", "decision-2"]);
  });

  it("puts a decision of extra time after regular time's stoppage time, and before a shoot-out", () => {
    const events = [
      event("stoppage", 92, "YELLOW_CARD"),
      event("extra", 100, "GOAL", { period: "EXTRA_TIME" }),
      event("late", 107, "GOAL", { period: "EXTRA_TIME" }),
      event("kick", 1, "SHOOTOUT_GOAL", { period: "SHOOTOUT" }),
    ];

    expect(lineKeys(withDecisions(events, [decision("SCUFFLE", "CALM", { minute: 105 })]))).toEqual(["stoppage", "extra", "decision-1", "late", "kick"]);
    expect(lineKeys(withDecisions(events.slice(0, 2).concat(events[3]), [decision("SCUFFLE", "CALM", { minute: 105 })]))).toEqual([
      "stoppage",
      "extra",
      "decision-1",
      "kick",
    ]);
  });
});
