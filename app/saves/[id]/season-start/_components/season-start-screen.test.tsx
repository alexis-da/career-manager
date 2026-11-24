import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ClubDotation, ClubFinances } from "@/src/db/club";
import type { ContractMovesView } from "@/src/db/contracts";
import type { ClosedObjectivesView, ObjectiveView, SeasonObjectivesView } from "@/src/db/objectives";
import type { ObjectiveKind } from "@/src/engine/objectives";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { SeasonAssistant } from "./season-assistant";
import { SeasonBudgetDetail, SeasonGrant } from "./season-budget";
import { SeasonObjectives } from "./season-objectives";

// The form is drawn without its Server Action, which reads the database, nor the App Router its refusals refresh.
vi.mock("../../actions", () => ({ chooseObjectiveAction: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const render = (screen: ReactNode, locale?: Locale): string => renderToStaticMarkup(inLanguage(screen, locale));

/** The markup of the element of a test id (and of a data-objective, when given), up to its closing tag. */
function elementOf(markup: string, testId: string, tag = "div"): string {
  const found = new RegExp(`<${tag}[^>]*data-testid="${testId}"[\\s\\S]*?</${tag}>`).exec(markup)?.[0];
  if (found === undefined) {
    throw new Error(`No ${testId} in the markup`);
  }
  return found;
}

/** The visible text of some markup, its tags dropped and its apostrophes as React escapes them read back. */
const textOf = (markup: string): string =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** The markup of a list item of last season's objectives, by its kind. */
const lastObjectiveOf = (markup: string, kind: ObjectiveKind): string =>
  new RegExp(`<li[^>]*data-objective="${kind}"[\\s\\S]*?</li>`).exec(markup)?.[0] ?? "";

// What the screen reads of the dotation and the finances: no wage, which it never shows (docs/design/simplification.md § 6.9).
const DOTATION = {
  startYear: 2027,
  reputation: 78,
  reputationRank: 3,
  clubCount: 18,
  dotation: 42_000_000,
  coefficient: 110,
  objectivesAmount: 4_200_000,
  carryOver: 6_000_000,
  budget: 52_200_000,
  first: false,
} as ClubDotation;

const FINANCES = { budget: 52_200_000, dotation: DOTATION } as ClubFinances;

const LAST_SEASON: ClosedObjectivesView["objectives"] = [
  { kind: "RANKING", variant: "FINISH", target: 5, exceed: 2, outcome: "ACHIEVED", byAssistant: false },
  { kind: "YOUTH", variant: null, target: 15, exceed: null, outcome: "MISSED", byAssistant: true },
];

describe("the board's grant", () => {
  it("gives the season's budget in large, its amount in euros beside it", () => {
    const markup = render(<SeasonGrant finances={FINANCES} />);
    expect(markup).toMatch(/data-testid="season-start-budget" data-amount="52200000"[^>]*>52,2 M€</);
    expect(textOf(markup)).toBe("La direction t'accorde 52,2 M€ Ton budget transferts pour la saison 2027-28.");
    expect(textOf(render(<SeasonGrant finances={FINANCES} />, "en"))).toBe(
      "The board gives you €52.2m Your transfer budget for the 2027-28 season.",
    );
  });

  it("shows the club's budget in a save from before the dotations", () => {
    const markup = render(<SeasonGrant finances={{ ...FINANCES, budget: 31_500_000, dotation: null }} />);
    expect(markup).toMatch(/data-amount="31500000"[^>]*>31,5 M€</);
    expect(textOf(markup)).toBe("Ton budget transferts 31,5 M€ La direction fixera ta dotation au début de la saison prochaine.");
  });
});

describe("the dotation's detail", () => {
  it("adds the board's funding, the objectives' bonus and the carry-over, each in euros in data-amount", () => {
    const markup = render(<SeasonBudgetDetail dotation={DOTATION} lastObjectives={LAST_SEASON} />);

    const dotation = elementOf(markup, "season-start-dotation");
    expect(dotation).toContain('data-amount="42000000"');
    expect(textOf(dotation)).toBe("Dotation de la direction Rang de réputation : 3e sur 18 de ta division 42 M€");

    const bonus = elementOf(markup, "season-start-objectives-bonus");
    expect(bonus).toContain('data-amount="4200000"');
    expect(bonus).toContain('data-coefficient="110"');
    expect(textOf(bonus)).toMatch(/^Objectifs de la saison passée Bonus : × 1,10 \+4,2 M€ Classement /);
    expect(bonus).toContain("text-win");

    const carryOver = elementOf(markup, "season-start-carry-over");
    expect(carryOver).toContain('data-amount="6000000"');
    expect(textOf(carryOver)).toBe("Report La moitié de ton budget non dépensé 6 M€");
    expect(textOf(elementOf(markup, "season-start-total"))).toBe("Budget de la saison 52,2 M€");
    expect(markup).not.toContain("season-start-first");
  });

  it("names last season's objectives, their outcomes and what each added to the coefficient", () => {
    const markup = render(<SeasonBudgetDetail dotation={DOTATION} lastObjectives={LAST_SEASON} />);
    expect(markup).toContain('aria-label="Objectifs de la saison 2026-27"');
    const ranking = lastObjectiveOf(markup, "RANKING");
    expect(ranking).toContain('data-outcome="ACHIEVED"');
    expect(ranking).toContain('data-contribution="10"');
    expect(ranking).toContain("text-win");
    expect(textOf(ranking)).toBe("Classement Atteint · +0,10 Finir 5e ou mieux");
    const youth = lastObjectiveOf(markup, "YOUTH");
    expect(youth).toContain('data-contribution="0"');
    expect(youth).toContain("text-loss");
    expect(textOf(youth)).toBe("Jeunesse Manqué · 0,00 Titulariser 15 fois en championnat un joueur de 21 ans ou moins Choisi par l'adjoint");
  });

  it("says a malus in English, and nothing at all at a coefficient of 1", () => {
    const malus = render(
      <SeasonBudgetDetail dotation={{ ...DOTATION, coefficient: 85, objectivesAmount: -6_300_000, budget: 41_700_000 }} lastObjectives={[]} />,
      "en",
    );
    expect(textOf(elementOf(malus, "season-start-objectives-bonus"))).toBe("Last season's objectives Penalty: × 0.85 -€6.3m");
    expect(malus).not.toContain("data-objective");

    const neutral = render(<SeasonBudgetDetail dotation={{ ...DOTATION, coefficient: 100, objectivesAmount: 0 }} lastObjectives={[]} />);
    expect(textOf(elementOf(neutral, "season-start-objectives-bonus"))).toBe("Objectifs de la saison passée Ni bonus ni malus : × 1,00 —");
  });

  it("gives the first season of a save its starting budget alone", () => {
    const markup = render(
      <SeasonBudgetDetail dotation={{ ...DOTATION, startYear: 2026, coefficient: 100, objectivesAmount: 0, carryOver: 0, first: true }} lastObjectives={[]} />,
    );
    const start = elementOf(markup, "season-start-first");
    expect(start).toContain('data-amount="52200000"');
    expect(textOf(start)).toBe("Budget de départ Ta première saison au club : ni report ni objectifs 52,2 M€");
    for (const testId of ["season-start-dotation", "season-start-objectives-bonus", "season-start-carry-over", "season-start-total"]) {
      expect(markup).not.toContain(testId);
    }
  });
});

/** A turn's moves as the screen reads them: renewals, departures, signings, young players and the squad left. */
const MOVES: ContractMovesView = {
  byAssistant: true,
  renewed: [
    { name: "M. Diallo", until: new Date(Date.UTC(2030, 5, 30)) },
    { name: "A. Koné", until: new Date(Date.UTC(2029, 5, 30)) },
  ],
  left: [{ name: "J. Moreau" }, { name: "L. Petit" }],
  signed: [{ name: "L. Blanc", position: "GK", bonus: 900_000 }],
  youths: 2,
  squad: 25,
  limit: 30,
};

describe("the assistant's close season", () => {
  it("tells what the turn did: the contracts renewed with their end, the players gone, the signings and their bonuses, the squad", () => {
    const markup = render(<SeasonAssistant moves={MOVES} />);

    expect(markup).toContain('data-testid="season-start-assistant"');
    expect(markup).toContain('data-by-assistant="true"');
    expect(markup).toMatch(/<h2 [^>]*id="season-start-assistant-title"[^>]*>Ton adjoint à l&#x27;intersaison<\/h2>/);
    const line = (testId: string) => elementOf(markup, testId, "li");
    expect(line("season-start-renewed")).toContain('data-count="2"');
    expect(textOf(line("season-start-renewed"))).toBe("Prolongés : M. Diallo (2030), A. Koné (2029)");
    expect(textOf(line("season-start-left"))).toBe("Partis libres : J. Moreau, L. Petit");
    expect(textOf(line("season-start-signed"))).toBe("Signé : L. Blanc, gardien (900 k€)");
    expect(textOf(line("season-start-youths"))).toBe("Venus de l'académie : 2 jeunes");
    expect(line("season-start-squad")).toContain('data-count="25"');
    expect(textOf(line("season-start-squad"))).toBe("Effectif : 25 joueurs sur 30");
    expect(markup).not.toContain("season-start-no-contracts");
  });

  it("says when no contract ended, leaves out what did not happen, and speaks British English", () => {
    const quiet = render(<SeasonAssistant moves={{ ...MOVES, byAssistant: false, renewed: [], left: [], signed: [], youths: 0, squad: 30 }} />);
    expect(textOf(quiet)).toBe("Ton adjoint à l'intersaison Aucun contrat ne finissait le 30 juin. Effectif : 30 joueurs sur 30");
    expect(quiet).toContain('data-by-assistant="false"');
    for (const testId of ["season-start-renewed", "season-start-left", "season-start-signed", "season-start-youths"]) {
      expect(quiet).not.toContain(testId);
    }

    const one = render(
      <SeasonAssistant moves={{ ...MOVES, renewed: MOVES.renewed.slice(0, 1), left: MOVES.left.slice(0, 1), youths: 1, squad: 21 }} />,
    );
    expect(textOf(elementOf(one, "season-start-renewed", "li"))).toBe("Prolongé : M. Diallo (2030)");
    expect(textOf(elementOf(one, "season-start-left", "li"))).toBe("Parti libre : J. Moreau");
    expect(textOf(elementOf(one, "season-start-youths", "li"))).toBe("Venus de l'académie : 1 jeune");

    expect(textOf(render(<SeasonAssistant moves={MOVES} />, "en"))).toBe(
      "Your assistant over the summer Contracts extended: M. Diallo (2030), A. Koné (2029) 2 players left on a free: J. Moreau, L. Petit " +
        "Free agent signed: L. Blanc, goalkeeper (€900k) From the academy: 2 youngsters Squad: 25 players out of 30",
    );
  });
});

const objective = (kind: ObjectiveKind, overrides: Partial<ObjectiveView> = {}): ObjectiveView => ({
  kind,
  imposed: kind === "RANKING" || kind === "CUP",
  chosen: false,
  byAssistant: false,
  variant: kind === "RANKING" ? "FINISH" : null,
  target: kind === "RANKING" ? 5 : kind === "CUP" ? 4 : 15,
  exceed: kind === "RANKING" ? 2 : kind === "CUP" ? 6 : null,
  status: "ON_TRACK",
  current: null,
  ...overrides,
});

const view = (objectives: ObjectiveView[], choiceOpen: boolean): SeasonObjectivesView => ({
  startYear: 2027,
  objectives,
  choiceOpen,
  confidence: 50,
  early: true,
  over: false,
});

const OPEN = view([objective("RANKING"), objective("YOUTH"), objective("ENTERTAINMENT", { target: 58 }), objective("FINANCES", { target: 0 })], true);

/** The radio card of a proposal. */
const proposalOf = (markup: string, kind: ObjectiveKind): string =>
  new RegExp(`<label[^>]*data-objective="${kind}"[\\s\\S]*?</label>`).exec(markup)?.[0] ?? "";

describe("the season's objectives", () => {
  it("shows the imposed ones with what exceeds them, and the three proposals to choose from, the assistant's checked", () => {
    const markup = render(<SeasonObjectives saveId="save-1" view={OPEN} />);

    expect(textOf(elementOf(markup, "objective-imposed", "li"))).toBe("Classement Finir 5e ou mieux Dépassé en finissant 2e ou mieux");
    expect(markup.match(/data-testid="objective-choice"/g)).toHaveLength(3);
    expect(markup.match(/data-assistant="true"/g)).toHaveLength(1);
    const youth = proposalOf(markup, "YOUTH");
    expect(youth).toContain('data-assistant="true"');
    expect(youth).toContain('checked=""');
    expect(textOf(youth)).toBe("Jeunesse Choix de l'adjoint Titulariser 15 fois en championnat un joueur de 21 ans ou moins");
    expect(proposalOf(markup, "ENTERTAINMENT")).not.toContain("checked");
    expect(textOf(proposalOf(markup, "ENTERTAINMENT"))).toBe("Spectacle Marquer au moins 58 buts en championnat");

    expect(textOf(markup)).toContain("Sans choix avant ton premier match, ton adjoint choisira Jeunesse.");
    expect(textOf(markup)).toContain(
      "Atteint, il ajoute 0,10 au coefficient de ta prochaine dotation. Ton choix est définitif : il ne se change plus.",
    );
    expect(textOf(elementOf(markup, "objective-validate", "button"))).toBe("Valider mon objectif");
    expect(markup).not.toContain("objective-chosen");
  });

  it("leaves the assistant the first proposal when Jeunesse is not one, with the cup imposed beside the ranking", () => {
    const markup = render(
      <SeasonObjectives
        saveId="save-1"
        view={view([objective("RANKING"), objective("CUP"), objective("ENTERTAINMENT"), objective("SOLIDITY"), objective("FINANCES")], true)}
      />,
    );
    expect(markup.match(/data-testid="objective-imposed"/g)).toHaveLength(2);
    expect(markup).toContain("Atteindre les quarts de finale");
    expect(proposalOf(markup, "ENTERTAINMENT")).toContain('data-assistant="true"');
    expect(markup).toContain("ton adjoint choisira Spectacle.");
  });

  it("locks the objective once chosen, saying who chose it, without the choice", () => {
    const mine = render(<SeasonObjectives saveId="save-1" view={view([objective("RANKING"), objective("SOLIDITY", { chosen: true, target: 38 })], false)} />);
    const chosen = elementOf(mine, "objective-chosen", "li");
    expect(chosen).toContain('data-objective="SOLIDITY"');
    expect(textOf(chosen)).toBe("Solidité Ton choix Encaisser au plus 38 buts en championnat Il ne se change plus.");
    expect(mine).not.toContain("objective-choice");
    expect(mine).not.toContain("objective-validate");

    const assistant = render(
      <SeasonObjectives saveId="save-1" view={view([objective("RANKING"), objective("YOUTH", { chosen: true, byAssistant: true })], false)} />,
      "en",
    );
    expect(textOf(elementOf(assistant, "objective-chosen", "li"))).toBe(
      "Youth Chosen by your assistant Start a player aged 21 or under 15 times in the league It can't be changed.",
    );
  });

  it("says when the choice is closed, and when a season has no objectives", () => {
    const closed = render(<SeasonObjectives saveId="save-1" view={{ ...OPEN, choiceOpen: false }} />);
    expect(closed).toContain('data-testid="objective-closed"');
    expect(closed.match(/data-testid="objective-proposed"/g)).toHaveLength(3);
    expect(closed).not.toContain("objective-validate");

    const none = render(<SeasonObjectives saveId="save-1" view={null} />);
    expect(textOf(none)).toBe(
      "Objectifs de la saison Pas d'objectifs cette saison : la direction les fixera à partir de la saison prochaine.",
    );
    expect(none).not.toContain("objective-");
  });
});
