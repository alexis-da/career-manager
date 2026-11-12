import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SaveSummary } from "@/src/db/saves";
import { suggestionPreview, type ClubSuggestion } from "@/src/engine/club-suggestions";
import type { RankingObjective } from "@/src/engine/objectives";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import type { CreatableCompetition } from "../_lib/creation-choices";
import { CreateSaveFormView } from "./create-save-form";
import { SaveCard } from "./save-card";

// The forms alone are rendered here: a Server Action needs a request.
vi.mock("@/app/actions", () => ({ createSaveAction: vi.fn(), creationChoicesAction: vi.fn(), deleteSaveAction: vi.fn() }));

const render = (element: ReactNode, locale?: Locale): string => renderToStaticMarkup(inLanguage(element, locale));

/** The first season's objectives of the clubs below: the top three, a place to finish at or above, going up. */
const TOP: RankingObjective = { variant: "TOP", target: 3, exceed: 1 };
const TENTH: RankingObjective = { variant: "FINISH", target: 10, exceed: 7 };
const PROMOTION: RankingObjective = { variant: "PROMOTION", target: 2, exceed: 1 };

const COMPETITIONS: CreatableCompetition[] = [
  {
    code: "fr.1",
    country: "fr",
    countryName: "France",
    tier: 1,
    clubs: [
      { id: "paris", name: "Paris Saint-Germain FC", rank: 1, objective: TOP },
      { id: "toulouse", name: "Toulouse FC", rank: 10, objective: TENTH },
      { id: "lens", name: "RC Lens", rank: 2, objective: TOP },
    ],
  },
  { code: "fr.2", country: "fr", countryName: "France", tier: 2, clubs: [{ id: "grenoble", name: "Grenoble Foot 38", rank: 4, objective: PROMOTION }] },
];

const SUGGESTIONS: ClubSuggestion[] = [
  { kind: "favourite", clubId: "paris", name: "Paris Saint-Germain FC", tier: 1, objective: TOP, budget: 150_000_000, reputation: 90 },
  { kind: "mid-table", clubId: "toulouse", name: "Toulouse FC", tier: 1, objective: TENTH, budget: 37_100_000, reputation: 71 },
  { kind: "comeback", clubId: "grenoble", name: "Grenoble Foot 38", tier: 2, objective: PROMOTION, budget: 6_300_000, reputation: 56 },
];

/** What the page gives the cards' places before their clubs come. */
const PREVIEWS = SUGGESTIONS.map(suggestionPreview);

/** The markup of a suggestion's card. */
const cardOf = (markup: string, kind: ClubSuggestion["kind"]): string =>
  new RegExp(`data-testid="club-suggestion-${kind}".*?</label>`).exec(markup)?.[0] ?? "";

const SAVE: SaveSummary = {
  id: "save-1",
  name: "Carrière Toulouse FC",
  managerName: "Alexis",
  currentDate: new Date("2026-07-01T00:00:00Z"),
  challengeWeek: null,
  club: { name: "Toulouse FC" },
};

describe("the creation form", () => {
  it("starts on the recommended card, the club and the career's name following it", () => {
    const markup = render(<CreateSaveFormView clubCount={4} previews={PREVIEWS} choices={{ competitions: COMPETITIONS, suggestions: SUGGESTIONS }} />);

    expect(markup).toContain('name="clubId" value="toulouse"');
    expect(markup).toContain('value="Carrière Toulouse FC"');
    expect(cardOf(markup, "mid-table")).toContain('checked=""');
    expect(cardOf(markup, "mid-table")).toContain("border-(--club)");
    expect(cardOf(markup, "favourite")).not.toContain('checked=""');
    expect(cardOf(markup, "comeback")).not.toContain('checked=""');
  });

  it("keeps the cards' places without any club's name until the clubs come, and cannot be sent before", () => {
    const markup = render(<CreateSaveFormView clubCount={198} previews={PREVIEWS} choices={null} />);

    for (const club of ["Paris Saint-Germain FC", "Toulouse FC", "Grenoble Foot 38", "RC Lens"]) {
      expect(markup).not.toContain(club);
    }
    for (const kind of ["favourite", "mid-table", "comeback"] as const) {
      expect(cardOf(markup, kind)).toContain(`data-testid="club-suggestion-${kind}"`);
    }
    expect(cardOf(markup, "favourite")).toContain("Facile · favori");
    expect(cardOf(markup, "mid-table")).toContain("Finir 10e ou mieux");
    expect(cardOf(markup, "comeback")).toContain("Monter en Division 1");
    expect(cardOf(markup, "mid-table")).toContain("border-(--club)");
    expect(markup).toMatch(/<button[^>]*data-testid="create-save"[^>]*>/);
    expect(/<button[^>]*data-testid="create-save"[^>]*>/.exec(markup)?.[0]).toContain('disabled=""');
    expect(markup).toContain('placeholder="Chercher parmi les 198 clubs"');
    expect(markup).toContain("Parcourir les 198 clubs");
    expect(markup).toContain('name="clubId" value=""');
  });

  it("chooses nothing without a suggestion", () => {
    const markup = render(<CreateSaveFormView clubCount={4} previews={PREVIEWS} choices={{ competitions: COMPETITIONS, suggestions: [] }} />);

    expect(markup).toContain('name="clubId" value=""');
    expect(markup).toContain("Choisir un club");
  });

  it("says what the game is in a first visit's h1, its last word in orange, and offers the choice over the cards", () => {
    const french = render(<CreateSaveFormView clubCount={4} previews={PREVIEWS} choices={{ competitions: COMPETITIONS, suggestions: SUGGESTIONS }} />);
    const english = render(<CreateSaveFormView clubCount={4} previews={PREVIEWS} choices={{ competitions: COMPETITIONS, suggestions: SUGGESTIONS }} />, "en");

    expect(french).toMatch(
      /<h1[^>]*>Jeu de carrière de football gratuit, <span class="lg:block">dans ton <span class="text-\(--club\)">navigateur<\/span><\/span><\/h1>/,
    );
    expect(english).toMatch(
      /<h1[^>]*>Free football career game <span class="lg:block">in your <span class="text-\(--club\)">browser<\/span><\/span><\/h1>/,
    );
    expect(french).toMatch(/<h2[^>]*data-testid="create-save-choice"[^>]*>Choisis ton <span class="text-\(--club\)">défi<\/span><\/h2>/);
  });

  it("is titled by the choice it offers, in h2 on two lines, under a returning player's careers", () => {
    const english = render(<CreateSaveFormView clubCount={4} previews={PREVIEWS} choices={{ competitions: COMPETITIONS, suggestions: SUGGESTIONS }} heading="returning" />, "en");

    expect(english).toMatch(/<h2[^>]*>Choose your <br\/><span class="text-\(--club\)">challenge<\/span><\/h2>/);
    expect(english).not.toContain("<h1");
    expect(english).not.toContain('data-testid="create-save-choice"');
  });

  it("puts the manager's name and the button right after the cards, before the search, the list and the options", () => {
    const markup = render(<CreateSaveFormView clubCount={4} previews={PREVIEWS} choices={{ competitions: COMPETITIONS, suggestions: SUGGESTIONS }} />);
    const at = (testId: string) => markup.indexOf(`data-testid="${testId}"`);

    expect(at("club-suggestion-comeback")).toBeLessThan(at("manager-name"));
    expect(at("manager-name")).toBeLessThan(at("create-save"));
    expect(at("create-save")).toBeLessThan(at("club-search"));
    expect(at("club-search")).toBeLessThan(at("club"));
    expect(at("club")).toBeLessThan(at("create-save-options"));
  });

  it("fills the manager's name in from the start, « Coach » in both languages, a field the player types over", () => {
    const managerOf = (markup: string) => /<input[^>]*data-testid="manager-name"[^>]*>/.exec(markup)?.[0] ?? "";
    for (const locale of ["fr", "en"] as const) {
      for (const choices of [null, { competitions: COMPETITIONS, suggestions: SUGGESTIONS }]) {
        const manager = managerOf(render(<CreateSaveFormView clubCount={4} previews={PREVIEWS} choices={choices} />, locale));
        expect(manager).toContain('name="managerName"');
        expect(manager).toContain('value="Coach"');
        expect(manager).not.toMatch(/ (readonly|disabled)=""/i);
      }
    }
  });

  it("counts the clubs it offers in its pitch, its search and its list", () => {
    const markup = render(<CreateSaveFormView clubCount={4} previews={PREVIEWS} choices={{ competitions: COMPETITIONS, suggestions: SUGGESTIONS }} />);

    expect(markup).toContain("4 clubs, deux divisions par pays");
    expect(markup).toContain('placeholder="Chercher parmi les 4 clubs"');
    expect(markup).toContain("Parcourir les 4 clubs");
  });

  it("folds the career's name and the seed under the options", () => {
    const markup = render(<CreateSaveFormView clubCount={4} previews={PREVIEWS} choices={{ competitions: COMPETITIONS, suggestions: SUGGESTIONS }} />);

    expect(markup).toMatch(/<details class="group[^"]*">.*data-testid="save-name".*data-testid="seed".*<\/details>/);
  });

  it("names a card's level, read by screen readers beside its figure, and its budget", () => {
    const card = cardOf(render(<CreateSaveFormView clubCount={4} previews={PREVIEWS} choices={{ competitions: COMPETITIONS, suggestions: SUGGESTIONS }} />), "favourite");

    expect(card).toContain("Facile · favori");
    expect(card).toContain('<span class="sr-only">Réputation 90</span><span aria-hidden="true"');
    expect(card).toContain("Budget 150,0 M€");
  });

  it("calls the third card hard, in the second division, the challenge being the week's", () => {
    const french = cardOf(render(<CreateSaveFormView clubCount={4} previews={PREVIEWS} choices={{ competitions: COMPETITIONS, suggestions: SUGGESTIONS }} />), "comeback");
    const english = cardOf(render(<CreateSaveFormView clubCount={4} previews={PREVIEWS} choices={{ competitions: COMPETITIONS, suggestions: SUGGESTIONS }} />, "en"), "comeback");

    expect(french).toContain("Difficile · Division 2");
    expect(french).not.toContain("Défi");
    expect(english).toContain("Hard · Division 2");
    expect(english).not.toContain("Challenge");
  });

  it("announces on each card the ranking objective its board will set, in the words of the save's screens", () => {
    const choices = { competitions: COMPETITIONS, suggestions: SUGGESTIONS };
    const french = render(<CreateSaveFormView clubCount={4} previews={PREVIEWS} choices={choices} />);
    const english = render(<CreateSaveFormView clubCount={4} previews={PREVIEWS} choices={choices} />, "en");

    const objectiveOf = (markup: string, kind: ClubSuggestion["kind"]) =>
      /data-testid="club-suggestion-objective">([^<]*)</.exec(cardOf(markup, kind))?.[1];

    expect(objectiveOf(french, "favourite")).toBe("Finir dans le top 3");
    expect(objectiveOf(french, "mid-table")).toBe("Finir 10e ou mieux");
    expect(objectiveOf(french, "comeback")).toBe("Monter en Division 1");
    expect(objectiveOf(english, "favourite")).toBe("Finish in the top three");
    expect(objectiveOf(english, "mid-table")).toBe("Finish 10th or higher");
    expect(objectiveOf(english, "comeback")).toBe("Win promotion to Division 1");
    // Read by screen readers as the board's.
    expect(cardOf(french, "mid-table")).toContain('<span class="sr-only">Objectif de la direction : </span>');
    expect(cardOf(english, "mid-table")).toContain('<span class="sr-only">The board&#x27;s objective: </span>');
    for (const markup of [french, english]) {
      expect(markup).not.toMatch(/top 6|the title|le titre/);
    }
  });
});

describe("a career of the home page", () => {
  it("gives its name, club, manager and date, by its initials and no colour of its club", () => {
    const markup = render(<SaveCard save={SAVE} main={false} />);

    expect(markup).toContain('data-save-name="Carrière Toulouse FC"');
    expect(markup).toContain("Toulouse FC");
    expect(markup).toContain("Alexis · 1er juillet 2026");
    expect(markup).toContain(">TO<");
    expect(markup).not.toContain("#123456");
    expect(markup).not.toContain("#654321");
  });

  it("resumes in orange only as the screen's main action", () => {
    const orange = "bg-(--club)";
    const openSave = (markup: string) => /<a[^>]*data-testid="open-save"[^>]*>/.exec(markup)?.[0] ?? "";

    expect(openSave(render(<SaveCard save={SAVE} main />))).toContain(orange);
    expect(openSave(render(<SaveCard save={SAVE} main={false} />))).not.toContain(orange);
  });

  it("names a challenge career from its week, in the player's language, with its mark", () => {
    const challenge: SaveSummary = { ...SAVE, name: "", challengeWeek: 45 };

    expect(render(<SaveCard save={challenge} main={false} />)).toContain("Défi — semaine 45");
    const english = render(<SaveCard save={challenge} main={false} />, "en");
    expect(english).toContain("Challenge — week 45");
    expect(english).toContain(">Challenge<");
  });
});
