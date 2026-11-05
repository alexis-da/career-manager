import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FORMATION_NAMES, type FormationName } from "@/src/engine/formations";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { FormationChoices } from "./formation-picker";

/** Every formation ranked in the order of FORMATION_NAMES, a hundredth of a point apart: the 3-4-3 first. */
const RANKED = FORMATION_NAMES.map((formation, index) => ({ formation, points: 1.6 - index / 100 }));

const render = (formation: FormationName = "4-3-3", locale: Locale = "fr"): string =>
  renderToStaticMarkup(inLanguage(<FormationChoices formation={formation} ranked={RANKED} onPick={vi.fn()} />, locale));

/** What the player reads: the markup's text, its tags gone, its no-break spaces plain. */
const textOf = (markup: string): string => markup.replace(/<[^>]*>/g, "").replace(/&#x27;/g, "'").replace(/ /g, " ");

/** The buttons of a list, by their test id, each its markup. */
const rowsOf = (markup: string, testId: string): string[] =>
  markup.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>.*?</button>`, "g")) ?? [];

const attribute = (markup: string, name: string): string | undefined => markup.match(new RegExp(`${name}="([^"]*)"`))?.[1];

describe("the choice of a formation", () => {
  it("sets first the three best for the squad, ranked, with the points each expects a match", () => {
    const best = rowsOf(render(), "formation-best");
    expect(best.map((row) => attribute(row, "data-formation"))).toEqual(["3-4-3", "4-3-3-attacking", "3-4-2-1"]);
    expect(best.map((row) => attribute(row, "data-rank"))).toEqual(["1", "2", "3"]);
    expect(textOf(best[0])).toContain("3-4-3");
    expect(textOf(best[0])).toContain("1er");
    expect(textOf(best[0])).toContain("1,60 pt/match");
    expect(textOf(best[1])).toContain("4-3-3 offensif");
    expect(textOf(render())).toContain("Les 3 meilleurs pour ton effectif");
  });

  it("then lists every formation once, by family: four defenders, three, five", () => {
    const markup = render();
    expect([...markup.matchAll(/<section[^>]*data-family="(\d)"/g)].map((match) => match[1])).toEqual(["4", "3", "5"]);
    const rows = rowsOf(markup, "formation-choice").map((row) => attribute(row, "data-formation"));
    expect([...rows].sort()).toEqual([...FORMATION_NAMES].sort());
    expect(rows.slice(0, 11).every((name) => name?.startsWith("4-"))).toBe(true);
    expect(rows.slice(11, 15).every((name) => name?.startsWith("3-"))).toBe(true);
    expect(rows.slice(15)).toEqual(["5-3-2", "5-4-1"]);
    for (const family of ["4 défenseurs", "3 défenseurs", "5 défenseurs"]) {
      expect(textOf(markup)).toContain(family);
    }
    // One of the best keeps its rank in its family.
    expect(attribute(rowsOf(markup, "formation-choice").find((row) => row.includes('data-formation="3-4-3"')) ?? "", "data-rank")).toBe("1");
  });

  it("marks the current formation by its label, and gives each its profile", () => {
    const markup = render("4-4-2");
    const current = rowsOf(markup, "formation-choice").filter((row) => row.includes('aria-current="true"'));
    expect(current.map((row) => attribute(row, "data-formation"))).toEqual(["4-4-2"]);
    expect(textOf(current[0])).toContain("4-4-2 à plat");
    expect(textOf(current[0])).toContain("Actuel");
    expect(textOf(current[0])).toContain("Attaque 0 % · défense 0 %");
    const fiveFourOne = rowsOf(markup, "formation-choice").find((row) => row.includes('data-formation="5-4-1"')) ?? "";
    expect(textOf(fiveFourOne)).toContain("Attaque −6 % · défense +6 %");
  });

  it("speaks British English", () => {
    const text = textOf(render("4-3-3", "en"));
    for (const words of ["The 3 best for your squad", "1st", "1.60 pts/match", "4-3-3 attacking", "4-3-3 holding", "Back four", "Back five", "Attack +5% · defence −5%", "Current"]) {
      expect(text).toContain(words);
    }
  });
});
