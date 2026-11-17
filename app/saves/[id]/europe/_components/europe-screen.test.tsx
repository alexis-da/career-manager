import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { competition, knockoutPhase, match, playoffs, table } from "../_lib/test-support";
import { EuropeBracket } from "./europe-bracket";
import { EuropeCard } from "./europe-card";
import { EuropeTable } from "./europe-table";

const render = (node: ReactNode, locale?: Locale): string => renderToStaticMarkup(inLanguage(node, locale));

/** The text of the element of a test id, null without one; the first of its elements when it has others inside. */
const textOf = (markup: string, testId: string): string | null =>
  new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`).exec(markup)?.[1] ?? null;

/** The rows of the league phase's table: each one's rank, whether it is the managed club's, and its zone. */
const tableRows = (markup: string) =>
  [...markup.matchAll(/<tr[^>]*data-testid="europe-table-row"[^>]*>/g)].map(([tag]) => ({
    rank: Number(/data-rank="(\d+)"/.exec(tag)?.[1]),
    managed: tag.includes('data-managed="true"'),
    zone: /data-zone="(\w+)"/.exec(tag)?.[1] ?? null,
  }));

const count = (markup: string, text: string): number => markup.split(text).length - 1;

describe("the European card", () => {
  it("says why a club plays no European competition this year, with nothing else", () => {
    const markup = render(<EuropeCard competition={null} matches={[]} />);
    expect(markup).toContain("Ton club en Europe");
    expect(textOf(markup, "europe-status")).toBe("Pas qualifié cette saison : finis dans les 6 premiers ou gagne la coupe");
    for (const testId of ["europe-status-badge", "europe-progress", "europe-next-match", "europe-prize"]) {
      expect(markup).not.toContain(`data-testid="${testId}"`);
    }
  });

  it("gives a club's league phase: its rank and points, its next match and what a win pays", () => {
    const rows = table(7, 20, 3);
    const markup = render(<EuropeCard competition={competition(rows, false)} matches={[match(rows, 3, 2, 7, 2), match(rows, 4, 7, 2)]} />);
    expect(markup).toContain("Coupe des Lauriers");
    expect(textOf(markup, "europe-status-badge")).toBe("EN LICE");
    expect(textOf(markup, "europe-status")).toBe("Phase de ligue : 7e, 39 pts");
    expect(markup).toContain("4e journée");
    expect(markup).toContain("vs Club 2 · domicile");
    expect(textOf(markup, "europe-prize")).toBe("Prime en jeu : 600 k€ par victoire, 2 M€ pour une place dans les 4 premiers");
  });

  it("sends the first four to the quarter-finals, at home against a play-off's winner", () => {
    const rows = table(2);
    const markup = render(<EuropeCard competition={competition(rows, true, playoffs(rows))} matches={[]} />, "en");
    expect(textOf(markup, "europe-status-badge")).toBe("STILL IN");
    expect(textOf(markup, "europe-status")).toBe("Through to the quarter-finals");
    expect(markup).toContain("Quarter-final");
    expect(markup).toContain("vs the winners of Club 7 v Club 10 · home");
    expect(textOf(markup, "europe-prize")).toBe("Prize at stake: €3m for winning the quarter-final");
    expect([...markup.matchAll(/<li data-state="(\w+)"/g)].map(([, state]) => state)).toEqual([
      "passed",
      "exempt",
      "current",
      "upcoming",
      "upcoming",
    ]);
  });

  it("crowns the winner, with no next match nor prize", () => {
    const rows = table(2);
    const markup = render(<EuropeCard competition={competition(rows, true, knockoutPhase(rows, 2))} matches={[]} />);
    expect(textOf(markup, "europe-status-badge")).toBe("VAINQUEUR");
    expect(textOf(markup, "europe-status")).toBe("Vainqueur");
    expect(markup).not.toContain('data-testid="europe-next-match"');
    expect(markup).not.toContain('data-testid="europe-prize"');
  });
});

describe("the league phase's table", () => {
  it("ranks every club, the first four in the quarter-finals' zone, the next eight in the play-offs', the managed club marked", () => {
    const markup = render(<EuropeTable competition={competition(table(7), true)} />);
    const rows = tableRows(markup);
    expect(rows.map(({ rank }) => rank)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(rows.filter(({ managed }) => managed)).toEqual([{ rank: 7, managed: true, zone: "playoff" }]);
    expect([rows[0].zone, rows[3].zone, rows[4].zone, rows[11].zone, rows[12].zone, rows[19].zone]).toEqual([
      "direct",
      "direct",
      "playoff",
      "playoff",
      null,
      null,
    ]);
    // Each club with its country.
    expect(markup).toContain("Allemagne");
    expect(markup).toContain("Italie");
    expect(markup).toContain('data-testid="europe-legend"');
    expect(markup).toContain("Quarts de finale");
  });
});

describe("the knockout bracket", () => {
  it("has its four rounds still to determine before the end of the league phase", () => {
    const markup = render(<EuropeBracket competition={competition(table(2, 20, 3), false)} />);
    expect([...markup.matchAll(/data-round="(\d+)"/g)].map(([, round]) => Number(round))).toEqual([7, 8, 9, 10]);
    expect(count(markup, "À déterminer")).toBe(4);
    expect(textOf(markup, "europe-neutral")).toBe("Terrain neutre");
  });

  it("shows each tie with its result, the managed club's marked, the final on neutral ground", () => {
    const rows = table(2);
    const markup = render(<EuropeBracket competition={competition(rows, true, knockoutPhase(rows, 2))} />, "en");
    expect(count(markup, 'data-testid="europe-tie"')).toBe(4 + 4 + 2 + 1);
    // The managed club's quarter-final, semi-final and final.
    expect(count(markup, 'data-managed="true"')).toBe(3);
    expect(textOf(markup, "europe-neutral")).toBe("Neutral ground");
    expect(markup).not.toContain("To be decided");
  });
});
