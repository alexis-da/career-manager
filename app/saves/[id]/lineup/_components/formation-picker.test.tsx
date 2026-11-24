import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FORMATION_NAMES, formationFamily, type FormationName } from "@/src/engine/formations";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { BEST_FORMATIONS, FormationChoices } from "./formation-picker";

type Ranked = { formation: FormationName; points: number }[];

/** Formations ranked in an order, a hundredth of a point apart from 1.60. */
const rankedIn = (order: readonly FormationName[]): Ranked => order.map((formation, index) => ({ formation, points: 1.6 - index / 100 }));

/** Every formation ranked in the order of FORMATION_NAMES: the 3-4-3, the 4-3-3 offensif and the 3-4-2-1 recommended. */
const RANKED = rankedIn(FORMATION_NAMES);

const RECOMMENDED = ["3-4-3", "4-3-3-attacking", "3-4-2-1"];

/** How many the button unfolds: every formation but the recommended. */
const OTHERS = FORMATION_NAMES.length - BEST_FORMATIONS;

const render = (formation: FormationName = "4-3-3", locale: Locale = "fr", ranked: Ranked = RANKED): string =>
  renderToStaticMarkup(inLanguage(<FormationChoices formation={formation} ranked={ranked} onPick={vi.fn()} />, locale));

/** What the player reads: the markup's text, its tags gone, its no-break spaces plain. */
const textOf = (markup: string): string => markup.replace(/<[^>]*>/g, "").replace(/&#x27;/g, "'").replace(/ /g, " ");

/** The buttons of a list, by their test id, each its markup. */
const rowsOf = (markup: string, testId: string): string[] =>
  markup.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>.*?</button>`, "g")) ?? [];

const attribute = (markup: string, name: string): string | undefined => markup.match(new RegExp(`${name}="([^"]*)"`))?.[1];

/** The formations of the buttons of a list, in their order. */
const formationsOf = (markup: string, testId: string): (string | undefined)[] =>
  rowsOf(markup, testId).map((row) => attribute(row, "data-formation"));

/** The families of a part of the sheet, in their order. */
const familiesOf = (markup: string): string[] => [...markup.matchAll(/<section[^>]*data-family="(\d)"/g)].map((match) => match[1]);

/**
 * The sheet at its button: what it shows at once, the button, and the list the button unfolds, which ends the sheet, its
 * opening tag first.
 */
function folded(markup: string): { shown: string; button: string; unfolded: string } {
  const [button = ""] = rowsOf(markup, "formation-show-all");
  const id = attribute(button, "aria-controls") ?? "";
  const at = markup.indexOf(` id="${id}"`);
  if (button === "" || id === "" || at < 0) {
    throw new Error("The sheet has no folded list");
  }
  const start = markup.lastIndexOf("<", at);
  return { shown: markup.slice(0, start), button, unfolded: markup.slice(start) };
}

describe("the choice of a formation", () => {
  it("sets first the three recommended for the squad, ranked, with the points each expects a match", () => {
    const markup = render();
    const best = rowsOf(markup, "formation-best");

    expect(markup.match(/<button[^>]*data-testid="([^"]*)"/)?.[1]).toBe("formation-best");
    expect(best.map((row) => attribute(row, "data-formation"))).toEqual(RECOMMENDED);
    expect(best.map((row) => attribute(row, "data-rank"))).toEqual(["1", "2", "3"]);
    expect(textOf(best[0])).toContain("3-4-3");
    expect(textOf(best[0])).toContain("1er");
    expect(textOf(best[0])).toContain("1,60 pt/match");
    expect(textOf(best[1])).toContain("4-3-3 offensif");
    expect(textOf(markup)).toContain("Les 3 conseillés pour ton effectif");
    expect(rowsOf(folded(markup).shown, "formation-best")).toHaveLength(BEST_FORMATIONS);
  });

  it("folds the fourteen others behind a button, by family: four defenders, three, five, the recommended left out", () => {
    const { shown, button, unfolded } = folded(render());

    expect(textOf(button)).toBe(`Voir tous les dispositifs · ${OTHERS}`);
    expect(OTHERS).toBe(14);
    expect(attribute(button, "aria-expanded")).toBe("false");
    // In the page folded, under the button, and nothing of it before.
    expect(unfolded).toMatch(/^<div [^>]*hidden=""/);
    expect(rowsOf(shown, "formation-choice")).toHaveLength(0);
    expect(shown.indexOf('data-testid="formation-show-all"')).toBeGreaterThan(shown.lastIndexOf('data-testid="formation-best"'));

    expect(familiesOf(unfolded)).toEqual(["4", "3", "5"]);
    const others = formationsOf(unfolded, "formation-choice");
    expect(others).toHaveLength(OTHERS);
    expect(others.filter((name) => RECOMMENDED.includes(name ?? ""))).toEqual([]);
    expect(others.slice(0, 10).every((name) => name?.startsWith("4-"))).toBe(true);
    expect(others.slice(10, 12)).toEqual(["3-4-1-2", "3-5-2"]);
    expect(others.slice(12)).toEqual(["5-3-2", "5-4-1"]);
    // Their rank is among the three: none in the families.
    expect(rowsOf(unfolded, "formation-choice").filter((row) => row.includes("data-rank"))).toEqual([]);
    for (const family of ["4 défenseurs", "3 défenseurs", "5 défenseurs"]) {
      expect(textOf(unfolded)).toContain(family);
    }
  });

  it("lists every formation once when the current one is recommended, marked in its place", () => {
    const markup = render("4-3-3-attacking");

    expect(rowsOf(markup, "formation-current")).toEqual([]);
    expect([...formationsOf(markup, "formation-best"), ...formationsOf(markup, "formation-choice")].sort()).toEqual(
      [...FORMATION_NAMES].sort(),
    );
    const current = rowsOf(markup, "formation-best").filter((row) => row.includes('aria-current="true"'));
    expect(current.map((row) => attribute(row, "data-formation"))).toEqual(["4-3-3-attacking"]);
    expect(textOf(current[0])).toContain("2e");
    expect(textOf(current[0])).toContain("Actuel");
    expect(markup.match(/aria-current="true"/g)).toHaveLength(1);
  });

  it("gives the current formation its own row under the three when it is not one of them, and keeps it in its family", () => {
    const { shown, unfolded } = folded(render("4-4-2"));
    const own = rowsOf(shown, "formation-current");

    expect(own.map((row) => attribute(row, "data-formation"))).toEqual(["4-4-2"]);
    expect(own[0]).toContain('aria-current="true"');
    expect(attribute(own[0], "data-rank")).toBeUndefined();
    expect(textOf(own[0])).toContain("4-4-2 à plat");
    expect(textOf(own[0])).toContain("Actuel");
    expect(textOf(own[0])).toContain("Attaque 0 % · défense 0 %");
    // Right under the three, above the button.
    const at = shown.indexOf('data-testid="formation-current"');
    expect(at).toBeGreaterThan(shown.lastIndexOf('data-testid="formation-best"'));
    expect(at).toBeLessThan(shown.indexOf('data-testid="formation-show-all"'));

    // In its family too, marked the same; each of the others with its profile.
    const marked = rowsOf(unfolded, "formation-choice").filter((row) => row.includes('aria-current="true"'));
    expect(marked.map((row) => attribute(row, "data-formation"))).toEqual(["4-4-2"]);
    expect(formationsOf(unfolded, "formation-choice")).toHaveLength(OTHERS);
    const fiveFourOne = rowsOf(unfolded, "formation-choice").find((row) => row.includes('data-formation="5-4-1"')) ?? "";
    expect(textOf(fiveFourOne)).toContain("Attaque −6 % · défense +6 %");
  });

  it("leaves out a family all of whose formations are recommended", () => {
    const fiveFirst = rankedIn(["5-3-2", "5-4-1", ...FORMATION_NAMES.filter((name) => formationFamily(name) !== 5)]);
    const { unfolded } = folded(render("4-3-3", "fr", fiveFirst));

    expect(familiesOf(unfolded)).toEqual(["4", "3"]);
    expect(formationsOf(unfolded, "formation-choice")).toHaveLength(OTHERS);
  });

  it("speaks British English", () => {
    const markup = render("4-3-3", "en");
    const text = textOf(markup);

    for (const words of ["The 3 recommended for your squad", "1st", "1.60 pts/match", "4-3-3 attacking", "4-3-3 holding", "Back four", "Back five", "Attack +5% · defence −5%", "Current"]) {
      expect(text).toContain(words);
    }
    expect(textOf(folded(markup).button)).toBe(`See all formations · ${OTHERS}`);
  });
});
