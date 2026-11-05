import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ClosedObjectivesView } from "@/src/db/objectives";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { SeasonObjectivesPanel } from "./season-objectives-panel";

const render = (objectives: ClosedObjectivesView, locale?: Locale): string =>
  renderToStaticMarkup(inLanguage(<SeasonObjectivesPanel objectives={objectives} />, locale));

/** The texts of some markup, element by element: « Classement|Finir 8e ou mieux|Dépassé ». */
const textsOf = (markup: string): string =>
  markup
    .replace(/<[^>]+>/g, "|")
    .replace(/\|+/g, "|")
    .replace(/^\||\|$/g, "")
    .replaceAll("&#x27;", "'");

/** Each objective's line: its kind and outcome, its texts, and the classes of its pill. */
function linesOf(markup: string): { kind?: string; outcome?: string; texts: string; pill: string }[] {
  return [...markup.matchAll(/<li data-objective="(\w+)" data-outcome="(\w+)"[^>]*>(.*?)<\/li>/g)].map(
    ([, kind, outcome, inner = ""]) => ({
      kind,
      outcome,
      texts: textsOf(inner),
      pill: /<span class="([^"]*)"/.exec(inner)?.[1] ?? "",
    }),
  );
}

/** A season's three objectives once it is over: the ranking exceeded, the cup missed, the one the assistant chose achieved. */
const CLOSED: ClosedObjectivesView = {
  objectives: [
    { kind: "RANKING", variant: "FINISH", target: 8, exceed: 5, outcome: "EXCEEDED", byAssistant: false },
    { kind: "CUP", variant: null, target: 4, exceed: 6, outcome: "MISSED", byAssistant: false },
    { kind: "YOUTH", variant: null, target: 15, exceed: null, outcome: "ACHIEVED", byAssistant: true },
  ],
  met: 2,
  total: 3,
};

describe("the objectives on a season's page", () => {
  it("counts the ones met, then gives each one, what it asked and its outcome in the result colours", () => {
    const markup = render(CLOSED);

    expect(markup).toContain('data-testid="season-objectives" data-met="2" data-total="3"');
    expect(markup).toMatch(/<h2 [^>]*id="season-objectives-title"[^>]*>Objectifs : 2\/3<\/h2>/);
    expect(linesOf(markup)).toEqual([
      { kind: "RANKING", outcome: "EXCEEDED", texts: "Classement|Finir 8e ou mieux|Dépassé", pill: expect.stringContaining("bg-win/15 text-win") },
      { kind: "CUP", outcome: "MISSED", texts: "Coupe|Atteindre les quarts de finale|Manqué", pill: expect.stringContaining("bg-loss/15 text-loss") },
      {
        kind: "YOUTH",
        outcome: "ACHIEVED",
        texts: "Jeunesse|Titulariser 15 fois en championnat un joueur de 21 ans ou moins|Choisi par l'adjoint|Atteint",
        pill: expect.stringContaining("bg-win/15 text-win"),
      },
    ]);
    // The assistant's mark on the one it chose, and on it only.
    expect(markup.match(/data-testid="season-objective-assistant"/g)).toHaveLength(1);
  });

  it("says it in English, a choice of the player's left unmarked", () => {
    const markup = render(
      {
        objectives: [
          { kind: "RANKING", variant: "SURVIVAL", target: 17, exceed: 14, outcome: "ACHIEVED", byAssistant: false },
          { kind: "SOLIDITY", variant: null, target: 40, exceed: null, outcome: "MISSED", byAssistant: false },
        ],
        met: 1,
        total: 2,
      },
      "en",
    );

    expect(markup).toContain('data-met="1" data-total="2"');
    expect(markup).toMatch(/>Objectives: 1\/2<\/h2>/);
    expect(linesOf(markup).map(({ texts }) => texts)).toEqual(["League|Stay up|Achieved", "Solidity|Concede at most 40 league goals|Missed"]);
    expect(markup).not.toContain("season-objective-assistant");
  });
});
