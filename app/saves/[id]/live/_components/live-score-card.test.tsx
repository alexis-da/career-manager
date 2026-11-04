import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FixtureWithEvents, TeamView } from "@/src/db/calendar";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import type { ShownInstruction } from "../_lib/live-instruction";
import { LiveScoreCard } from "./live-score-card";

const team = (name: string, isManaged: boolean): TeamView => ({
  clubSaveId: name,
  name,
  isManaged,
  colors: { primary: "#000000", secondary: "#ffffff" },
});

const MATCH: FixtureWithEvents = {
  id: "fixture",
  round: 1,
  cup: false,
  scheduledAt: new Date("2026-08-15T00:00:00Z"),
  competitionCode: "fr.1",
  home: team("Lyon", true),
  away: team("Nice", false),
  played: false,
  homeGoals: null,
  awayGoals: null,
  homeHalfTimeGoals: null,
  awayHalfTimeGoals: null,
  decidedBy: null,
  homePenalties: null,
  awayPenalties: null,
  events: [],
  decisions: [],
};

/** The card at the 62nd minute, its controls left out. */
const render = (instruction: ShownInstruction | null, locale: Locale = "fr"): string =>
  renderToStaticMarkup(
    inLanguage(
      <LiveScoreCard
        caption="France — Division 1 · Journée 1"
        dashboardHref="/saves/save-1"
        match={MATCH}
        homeGoals={1}
        awayGoals={0}
        minute={62}
        progress={68}
        status={{ label: "En direct", value: "En direct", running: true }}
        result={null}
        instruction={instruction}
      >
        <div data-testid="live-controls" />
      </LiveScoreCard>,
      locale,
    ),
  );

/** The instruction's line in the card's markup. */
const lineOf = (markup: string): string => markup.match(/<p[^>]*data-testid="live-instruction"[^>]*>.*?<\/p>/)?.[0] ?? "";

/** What the player reads: the markup's text, its tags gone, its characters unescaped and its no-break spaces plain. */
const textOf = (markup: string): string =>
  markup
    .replace(/<[^>]*>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/ /g, " ");

const attribute = (markup: string, name: string): string | undefined =>
  markup.match(new RegExp(`${name}="([^"]*)"`))?.[1]?.replace(/&#x27;/g, "'").replace(/ /g, " ");

describe("the instruction on the score card", () => {
  it("says the club's instruction and who set it: its start, its assistant, the player, a tactical call", () => {
    const cases: [ShownInstruction, string][] = [
      [{ instruction: "BALANCED", source: "START" }, "Consigne : Équilibré · de départ"],
      [{ instruction: "ATTACK", source: "ASSISTANT" }, "Consigne : Attaquer · de l'adjoint"],
      [{ instruction: "ATTACK", source: "MANAGER" }, "Consigne : Attaquer · la tienne"],
      [{ instruction: "DEFEND", source: "EVENT" }, "Consigne : Fermer · réaction tactique"],
    ];
    for (const [instruction, text] of cases) {
      const line = lineOf(render(instruction));
      expect(textOf(line)).toBe(text);
      expect(attribute(line, "data-instruction")).toBe(instruction.instruction);
      expect(attribute(line, "data-instruction-source")).toBe(instruction.source);
    }
  });

  it("is a status a screen reader hears change, named in a sentence", () => {
    const line = lineOf(render({ instruction: "DEFEND", source: "EVENT" }));
    expect(attribute(line, "role")).toBe("status");
    expect(attribute(line, "aria-label")).toBe("Consigne en cours : Fermer, donnée par une réaction tactique");
    expect(attribute(lineOf(render({ instruction: "BALANCED", source: "START" })), "aria-label")).toBe(
      "Consigne en cours : Équilibré, ta consigne de départ",
    );
    expect(attribute(lineOf(render({ instruction: "ATTACK", source: "MANAGER" })), "aria-label")).toBe("Consigne en cours : Attaquer, donnée par toi");
  });

  it("speaks British English", () => {
    const cases: [ShownInstruction, string, string][] = [
      [{ instruction: "BALANCED", source: "START" }, "Instruction: Balanced · starting", "Current instruction: Balanced, your starting one"],
      [{ instruction: "ATTACK", source: "ASSISTANT" }, "Instruction: Attack · assistant's", "Current instruction: Attack, given by your assistant"],
      [{ instruction: "ATTACK", source: "MANAGER" }, "Instruction: Attack · yours", "Current instruction: Attack, given by you"],
      [{ instruction: "DEFEND", source: "EVENT" }, "Instruction: Sit back · tactical call", "Current instruction: Sit back, given by a tactical call"],
    ];
    for (const [instruction, text, label] of cases) {
      const line = lineOf(render(instruction, "en"));
      expect(textOf(line)).toBe(text);
      expect(attribute(line, "aria-label")).toBe(label);
    }
  });

  it("is outlined on the blue, never orange: the screen's orange is its controls'", () => {
    const line = lineOf(render({ instruction: "ATTACK", source: "MANAGER" }));
    expect(line).not.toContain("--club");
    expect(line).not.toMatch(/\bbg-/);
  });

  it("leaves the card as it was without one: a match over, or read again once over", () => {
    const markup = render(null);
    expect(markup).not.toContain("live-instruction");
    expect(markup).toContain('data-testid="live-score"');
  });
});
