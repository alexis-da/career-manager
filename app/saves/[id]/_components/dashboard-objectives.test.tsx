import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ObjectiveView, SeasonObjectivesView } from "@/src/db/objectives";
import type { ObjectiveKind, ObjectiveProgress } from "@/src/engine/objectives";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage, testTranslator } from "@/src/i18n/test-intl";
import { DashboardObjectives, ObjectiveStatusPill, proposalNames } from "./dashboard-objectives";

/** What each objective asks in these tests: finish 8th or higher (5th exceeds it), reach the round of 16 (the semi-finals)… */
const ASKED: Record<ObjectiveKind, Pick<ObjectiveView, "variant" | "target" | "exceed">> = {
  RANKING: { variant: "FINISH", target: 8, exceed: 5 },
  CUP: { variant: null, target: 3, exceed: 5 },
  YOUTH: { variant: null, target: 15, exceed: null },
  ENTERTAINMENT: { variant: null, target: 55, exceed: null },
  SOLIDITY: { variant: null, target: 36, exceed: null },
  FINANCES: { variant: null, target: 0, exceed: null },
};

/** An objective as getSeasonObjectives gives it: imposed for the ranking and the cup, on track, nothing known yet. */
const objective = (kind: ObjectiveKind, rest: Partial<ObjectiveView> = {}): ObjectiveView => ({
  kind,
  imposed: kind === "RANKING" || kind === "CUP",
  chosen: false,
  byAssistant: false,
  ...ASKED[kind],
  status: "ON_TRACK",
  current: null,
  ...rest,
});

/** A new season of a save with its cup: the two imposed, three proposed, none chosen before the first match. */
const OPEN: SeasonObjectivesView = {
  startYear: 2026,
  objectives: [objective("RANKING"), objective("CUP"), objective("YOUTH"), objective("ENTERTAINMENT"), objective("SOLIDITY")],
  choiceOpen: true,
  confidence: 57,
  over: false,
};

/** Some matches on: the player chose Jeunesse, the league at risk. */
const UNDER_WAY: SeasonObjectivesView = {
  startYear: 2026,
  objectives: [
    objective("RANKING", { status: "AT_RISK", current: 9 }),
    objective("CUP", { current: 3 }),
    objective("YOUTH", { chosen: true, current: 4 }),
  ],
  choiceOpen: false,
  confidence: 47,
  over: false,
};

/** Every match played: two objectives met of three, the assistant's Solidité missed. */
const OVER: SeasonObjectivesView = {
  startYear: 2026,
  objectives: [
    objective("RANKING", { status: "ACHIEVED", current: 7 }),
    objective("CUP", { status: "EXCEEDED", current: 7 }),
    objective("SOLIDITY", { chosen: true, byAssistant: true, status: "MISSED", current: 41 }),
  ],
  choiceOpen: false,
  confidence: 71,
  over: true,
};

const render = (view: SeasonObjectivesView, locale?: Locale): string =>
  renderToStaticMarkup(inLanguage(<DashboardObjectives saveId="save-1" view={view} />, locale));

/** A piece of markup as it reads: its texts one after the other. */
const textOf = (markup: string): string =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replace(/\s+/g, " ")
    .trim();

/** The objectives' cells, in order: kind, status, and what they say. */
const cellsOf = (markup: string) =>
  [...markup.matchAll(/<li data-objective="([^"]+)"[^>]*>(.*?)<\/li>/g)].map(([, kind, body]) => ({
    kind,
    status: /data-status="([^"]+)"/.exec(body)?.[1] ?? null,
    text: textOf(body),
  }));

/** The element of a test id, whole, or null without one. */
const elementOf = (markup: string, testId: string, tag: string): string | null =>
  new RegExp(`<${tag} [^>]*data-testid="${testId}"[^>]*>.*?</${tag}>`).exec(markup)?.[0] ?? null;

describe("the dashboard's objectives", () => {
  it("shows the imposed objectives on track, and the optional one's place leading to the choice while it is open", () => {
    const markup = render(OPEN);

    expect(markup).toContain('data-testid="dashboard-objectives"');
    expect(markup).toContain('<h2 id="dashboard-objectives-title" class="font-heading text-xl leading-tight">Objectifs</h2>');
    expect(cellsOf(markup)).toEqual([
      { kind: "RANKING", status: "ON_TRACK", text: "Classement En bonne voie Finir 8e ou mieux" },
      { kind: "CUP", status: "ON_TRACK", text: "Coupe En bonne voie Atteindre les huitièmes de finale" },
    ]);
    // Nothing to judge them on before the first match.
    expect(markup).not.toContain('data-testid="objective-current"');

    const choose = elementOf(markup, "dashboard-objectives-choose", "a") ?? "";
    expect(choose).toContain('href="/saves/save-1/season-start"');
    expect(textOf(choose)).toBe("Objectif au choix Choisis ton objectif de la saison Jeunesse, Spectacle ou Solidité");
    expect(markup).not.toContain('data-testid="dashboard-objectives-met"');
  });

  it("gives the president's confidence in one line, and leads to the detail on the Club screen", () => {
    const markup = render(OPEN);
    const confidence = elementOf(markup, "dashboard-confidence", "dl") ?? "";

    expect(confidence).toContain('data-confidence="57"');
    expect(confidence).toMatch(/<dt[^>]*>Confiance du président<\/dt>/);
    expect(confidence).toMatch(/<dd class="[^"]*text-info[^"]*">57 · Il attend des résultats<\/dd>/);
    expect(elementOf(markup, "dashboard-objectives-detail", "a")).toMatch(/href="\/saves\/save-1\/club#objectifs"[^>]*>Voir le détail<\/a>/);
  });

  it("never takes the screen's full orange, the hero's", () => {
    for (const view of [OPEN, UNDER_WAY, OVER]) {
      const markup = render(view);
      expect(markup).not.toContain("bg-(--club)");
      expect(markup).not.toContain("<button");
    }
  });

  it("follows the chosen objective once the choice is made, with the figure each is judged on", () => {
    const markup = render(UNDER_WAY);

    expect(cellsOf(markup)).toEqual([
      { kind: "RANKING", status: "AT_RISK", text: "Classement En danger Finir 8e ou mieux 9e actuellement" },
      { kind: "CUP", status: "ON_TRACK", text: "Coupe En bonne voie Atteindre les huitièmes de finale Huitièmes de finale" },
      {
        kind: "YOUTH",
        status: "ON_TRACK",
        text: "Jeunesse En bonne voie Titulariser 15 fois en championnat un joueur de 21 ans ou moins 4 titularisations au mieux",
      },
    ]);
    expect(markup).not.toContain('data-testid="dashboard-objectives-choose"');
    expect(elementOf(markup, "dashboard-confidence", "dl")).toContain(">47 · Il attend des résultats</dd>");
  });

  it("gives the outcomes once the season is over, and counts those met", () => {
    const markup = render(OVER);

    expect(textOf(elementOf(markup, "dashboard-objectives-met", "p") ?? "")).toBe("Saison terminée : 2 objectifs atteints sur 3");
    expect(cellsOf(markup)).toEqual([
      { kind: "RANKING", status: "ACHIEVED", text: "Classement Atteint Finir 8e ou mieux 7e à la fin" },
      { kind: "CUP", status: "EXCEEDED", text: "Coupe Dépassé Atteindre les huitièmes de finale Vainqueur de la coupe" },
      { kind: "SOLIDITY", status: "MISSED", text: "Solidité Manqué Encaisser au plus 36 buts en championnat 41 buts encaissés" },
    ]);
    expect(elementOf(markup, "dashboard-confidence", "dl")).toMatch(/<dd class="[^"]*text-win[^"]*">71 · Il te fait confiance<\/dd>/);

    const met = testTranslator("fr", "dashboard.objectives");
    expect(met("met", { met: 0, total: 2 })).toBe("Saison terminée : 0 objectif atteint sur 2");
    expect(met("met", { met: 1, total: 2 })).toBe("Saison terminée : 1 objectif atteint sur 2");
  });

  it("has no cup without one, and colours a worried president red", () => {
    const markup = render({
      ...OPEN,
      objectives: [objective("RANKING"), objective("YOUTH"), objective("SOLIDITY"), objective("FINANCES")],
      confidence: 30,
    });

    expect(cellsOf(markup).map(({ kind }) => kind)).toEqual(["RANKING"]);
    expect(textOf(elementOf(markup, "dashboard-objectives-choose", "a") ?? "")).toContain("Jeunesse, Solidité ou Bonne gestion");
    expect(elementOf(markup, "dashboard-confidence", "dl")).toMatch(/<dd class="[^"]*text-loss[^"]*">30 · Il s&#x27;inquiète<\/dd>/);
  });

  it("says it all in British English", () => {
    const open = render(OPEN, "en");
    const over = render(OVER, "en");

    expect(open).toContain(">Objectives</h2>");
    expect(cellsOf(open)).toEqual([
      { kind: "RANKING", status: "ON_TRACK", text: "League On track Finish 8th or higher" },
      { kind: "CUP", status: "ON_TRACK", text: "Cup On track Reach the round of 16" },
    ]);
    expect(textOf(elementOf(open, "dashboard-objectives-choose", "a") ?? "")).toBe(
      "Optional objective Choose your objective for the season Youth, Entertainment or Solidity",
    );
    expect(elementOf(open, "dashboard-confidence", "dl")).toMatch(/>Chairman&#x27;s confidence<\/dt>.*>57 · Expects results<\/dd>/);
    expect(elementOf(open, "dashboard-objectives-detail", "a")).toContain(">See details</a>");

    expect(textOf(elementOf(over, "dashboard-objectives-met", "p") ?? "")).toBe("Season over: 2 of 3 objectives met");
    expect(cellsOf(over).map(({ text }) => text)).toEqual([
      "League Achieved Finish 8th or higher Finished 7th",
      "Cup Exceeded Reach the round of 16 Cup winners",
      "Solidity Missed Concede at most 36 league goals 41 goals conceded",
    ]);
    expect(testTranslator("en", "dashboard.objectives")("met", { met: 1, total: 1 })).toBe("Season over: 1 of 1 objective met");
  });
});

describe("an objective's status pill", () => {
  it("names each status in its result colour", () => {
    const pill = (status: ObjectiveProgress, locale?: Locale) => renderToStaticMarkup(inLanguage(<ObjectiveStatusPill status={status} />, locale));
    const STATUSES: [ObjectiveProgress, string, string][] = [
      ["ON_TRACK", "En bonne voie", "bg-info/15 text-info"],
      ["AT_RISK", "En danger", "bg-warning/15 text-warning"],
      ["ACHIEVED", "Atteint", "bg-win/15 text-win"],
      ["EXCEEDED", "Dépassé", "bg-win/15 text-win"],
      ["MISSED", "Manqué", "bg-loss/15 text-loss"],
    ];

    for (const [status, label, tone] of STATUSES) {
      const markup = pill(status);
      expect(markup).toMatch(new RegExp(`^<span data-testid="objective-status" data-status="${status}" class="[^"]*rounded-full[^"]*">${label}</span>$`));
      expect(markup).toContain(tone);
    }
    expect(pill("AT_RISK", "en")).toContain(">At risk</span>");
  });
});

describe("proposalNames", () => {
  it("names the proposals as a choice, in each language's way", () => {
    const proposals = [objective("YOUTH"), objective("ENTERTAINMENT"), objective("FINANCES")];

    expect(proposalNames(proposals, testTranslator("fr", "objectives"), "fr")).toBe("Jeunesse, Spectacle ou Bonne gestion");
    expect(proposalNames(proposals, testTranslator("en", "objectives"), "en")).toBe("Youth, Entertainment or Good management");
    expect(proposalNames(proposals.slice(1), testTranslator("fr", "objectives"), "fr")).toBe("Spectacle ou Bonne gestion");
  });
});
