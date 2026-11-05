import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ObjectiveView, SeasonObjectivesView } from "@/src/db/objectives";
import type { ObjectiveKind } from "@/src/engine/objectives";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { ClubObjectives } from "./club-objectives";

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

/** Some matches on: the player chose Spectacle, the league at risk. */
const UNDER_WAY: SeasonObjectivesView = {
  startYear: 2026,
  objectives: [
    objective("RANKING", { status: "AT_RISK", current: 9 }),
    objective("CUP", { current: 3 }),
    objective("ENTERTAINMENT", { chosen: true, current: 21 }),
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
  confidence: 75,
  over: true,
};

const render = (view: SeasonObjectivesView, locale?: Locale): string =>
  renderToStaticMarkup(inLanguage(<ClubObjectives saveId="save" view={view} />, locale));

/** A piece of markup as it reads: its texts one after the other. */
const textOf = (markup: string): string =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replace(/\s+/g, " ")
    .trim();

/** The objectives in detail, in order: kind, status, and what they say. */
const objectivesOf = (markup: string) =>
  [...markup.matchAll(/<li data-objective="([^"]+)"[^>]*>(.*?)<\/li>/g)].map(([, kind, body]) => ({
    kind,
    status: /data-status="([^"]+)"/.exec(body)?.[1] ?? null,
    text: textOf(body),
  }));

/** The block of a test id, whole: its element up to the first closing tag of its kind that ends it. */
const blockOf = (markup: string, testId: string): string => {
  const start = markup.indexOf(`data-testid="${testId}"`);
  if (start === -1) {
    return "";
  }
  const open = markup.lastIndexOf("<", start);
  const tag = /^<(\w+)/.exec(markup.slice(open))?.[1] ?? "div";
  // Count the nested elements of the same tag to find the one that closes it.
  let depth = 0;
  const pattern = new RegExp(`<(/?)${tag}\\b[^>]*>`, "g");
  pattern.lastIndex = open;
  for (let match = pattern.exec(markup); match !== null; match = pattern.exec(markup)) {
    depth += match[1] === "/" ? -1 : 1;
    if (depth === 0) {
      return markup.slice(open, pattern.lastIndex);
    }
  }
  return markup.slice(open);
};

describe("the president's objectives on the Club screen", () => {
  it("details the imposed objectives: who set them, what they ask and what exceeds it, where they stand", () => {
    const markup = render(OPEN);

    // The dashboard's card leads straight to it.
    expect(markup).toMatch(/^<section [^>]*id="objectifs" aria-labelledby="club-objectives-title" data-testid="club-objectives"/);
    expect(markup).toMatch(/<h2 [^>]*id="club-objectives-title"[^>]*>Objectifs du président<\/h2>/);
    expect(markup).toContain(">Saison 2026-27</p>");
    expect(objectivesOf(markup)).toEqual([
      {
        kind: "RANKING",
        status: "ON_TRACK",
        text: "Classement · Imposé par la direction En bonne voie Finir 8e ou mieux Dépassé en finissant 5e ou mieux",
      },
      {
        kind: "CUP",
        status: "ON_TRACK",
        text: "Coupe · Imposé par la direction En bonne voie Atteindre les huitièmes de finale Dépassé en atteignant les demi-finales",
      },
    ]);
    expect(markup).not.toContain('data-testid="objective-current"');
    expect(markup).not.toContain('data-testid="club-objectives-met"');
  });

  it("lists the three proposals while the choice is open, the assistant's pick, and the way to the choice", () => {
    const markup = render(OPEN);
    const proposals = blockOf(markup, "club-objectives-proposals");

    expect([...proposals.matchAll(/<li data-proposal="([^"]+)"[^>]*>(.*?)<\/li>/g)].map(([, kind, body]) => [kind, textOf(body)])).toEqual([
      ["YOUTH", "Jeunesse · Titulariser 15 fois en championnat un joueur de 21 ans ou moins"],
      ["ENTERTAINMENT", "Spectacle · Marquer au moins 55 buts en championnat"],
      ["SOLIDITY", "Solidité · Encaisser au plus 36 buts en championnat"],
    ]);
    expect(textOf(proposals)).toContain(
      "Objectif au choix Choisis-en un avant ton premier match de la saison. Sans choix, l'adjoint prendra Jeunesse.",
    );
    expect(blockOf(markup, "club-objectives-choose")).toMatch(/href="\/saves\/save\/season-start"[^>]*>Choisir mon objectif<\/a>$/);

    // Without Jeunesse among them, the assistant takes the first one proposed.
    const withoutYouth = render({ ...OPEN, objectives: [objective("RANKING"), objective("ENTERTAINMENT"), objective("SOLIDITY"), objective("FINANCES")] });
    expect(textOf(blockOf(withoutYouth, "club-objectives-proposals"))).toContain("Sans choix, l'adjoint prendra Spectacle.");
  });

  it("names the chosen objective by who chose it, and has nothing more to choose", () => {
    const player = render(UNDER_WAY);
    const assistant = render(OVER);

    expect(objectivesOf(player)).toEqual([
      { kind: "RANKING", status: "AT_RISK", text: "Classement · Imposé par la direction En danger Finir 8e ou mieux Dépassé en finissant 5e ou mieux 9e actuellement" },
      {
        kind: "CUP",
        status: "ON_TRACK",
        text: "Coupe · Imposé par la direction En bonne voie Atteindre les huitièmes de finale Dépassé en atteignant les demi-finales Huitièmes de finale",
      },
      { kind: "ENTERTAINMENT", status: "ON_TRACK", text: "Spectacle · Ton choix En bonne voie Marquer au moins 55 buts en championnat 21 buts marqués" },
    ]);
    expect(player).not.toContain('data-testid="club-objectives-proposals"');
    expect(player).not.toContain('data-testid="club-objectives-choose"');
    expect(objectivesOf(assistant)[2].text).toBe("Solidité · Choisi par l'adjoint Manqué Encaisser au plus 36 buts en championnat 41 buts encaissés");
  });

  it("gives the outcomes once the season is over, those met counted against the next budget", () => {
    const markup = render(OVER);

    expect(textOf(blockOf(markup, "club-objectives-met"))).toBe(
      "Saison terminée : 2 objectifs atteints sur 3 Ce bilan fixe le bonus ou le malus du budget de la saison prochaine.",
    );
    expect(objectivesOf(markup).map(({ status }) => status)).toEqual(["ACHIEVED", "EXCEEDED", "MISSED"]);
    expect(objectivesOf(markup)[0].text).toContain("7e à la fin");
  });

  it("shows the president's confidence as a gauge of 0 to 99, with its words, and that nobody is ever sacked", () => {
    const confidence = blockOf(render(OPEN), "club-confidence");

    expect(confidence).toContain('data-confidence="57"');
    expect(confidence).toMatch(/role="meter" aria-label="Confiance du président" aria-valuemin="0" aria-valuemax="99" aria-valuenow="57"/);
    expect(confidence).toContain('aria-valuetext="57 · Il attend des résultats"');
    expect(confidence).toMatch(/<div class="[^"]*bg-info[^"]*" style="width:58%"><\/div>/);
    expect(textOf(confidence)).toBe(
      "Confiance du président 57 Il attend des résultats Elle suit tes objectifs, match après match. " +
        "La direction ne renvoie jamais son entraîneur : un échec réduit seulement le budget suivant.",
    );
  });

  it("colours the confidence by its level: trust in green, worry in red", () => {
    const trust = blockOf(render(OVER), "club-confidence");
    const worry = blockOf(render({ ...UNDER_WAY, confidence: 30 }), "club-confidence");

    expect(trust).toMatch(/class="[^"]*text-win[^"]*">Il te fait confiance</);
    expect(trust).toContain("width:76%");
    expect(worry).toMatch(/class="[^"]*text-loss[^"]*">Il s&#x27;inquiète</);
    expect(worry).toMatch(/bg-loss[^"]*" style="width:30%"/);
  });

  it("adds no action of its own but the way to the choice, never in the screen's full orange", () => {
    for (const view of [OPEN, UNDER_WAY, OVER]) {
      const markup = render(view);
      expect(markup).not.toContain("<button");
      expect(markup).not.toContain("bg-(--club)");
      expect(markup.match(/<a\b/g) ?? []).toHaveLength(view.choiceOpen ? 1 : 0);
    }
  });

  it("says it all in British English", () => {
    const open = render(OPEN, "en");
    const over = render(OVER, "en");

    expect(open).toMatch(/>Chairman&#x27;s objectives<\/h2>/);
    expect(open).toContain(">2026-27 season</p>");
    expect(objectivesOf(open)[0].text).toBe("League · Set by the board On track Finish 8th or higher Exceeded by finishing 5th or higher");
    expect(textOf(blockOf(open, "club-objectives-proposals"))).toBe(
      "Optional objective Choose one before your first match of the season. If you don't, your assistant will take Youth. " +
        "Youth · Start a player aged 21 or under 15 times in the league Entertainment · Score at least 55 league goals " +
        "Solidity · Concede at most 36 league goals Choose my objective",
    );
    expect(textOf(blockOf(open, "club-confidence"))).toBe(
      "Chairman's confidence 57 Expects results It follows your objectives, match by match. " +
        "The board never sacks its manager: a failure only cuts the next budget.",
    );
    expect(textOf(blockOf(over, "club-objectives-met"))).toBe("Season over: 2 of 3 objectives met This record sets the bonus or penalty on next season's budget.");
    expect(objectivesOf(over)[2].text).toBe("Solidity · Chosen by your assistant Missed Concede at most 36 league goals 41 goals conceded");
    expect(objectivesOf(render(UNDER_WAY, "en"))[2].text).toContain("Entertainment · Your choice");
  });
});
