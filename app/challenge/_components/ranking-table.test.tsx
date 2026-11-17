import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChallengeRankingRow } from "@/src/db/challenge-view";
import { inLanguage } from "@/src/i18n/test-intl";
import { RankingTable } from "./ranking-table";

const line = (rank: number | null, name: string | null, isViewer = false): ChallengeRankingRow => ({
  rank,
  name,
  title: null,
  points: 14,
  goalDiff: 4,
  goalsFor: 12,
  isViewer,
});

const render = (rows: ChallengeRankingRow[]) =>
  renderToStaticMarkup(inLanguage(<RankingTable rows={rows} label="Classement de la semaine 45" empty="Personne" />));

/** A row's markup, by its data-ranking-row. */
function rowOf(markup: string, key: string | number): string {
  const row = markup.split("<tr").find((part) => part.includes(`data-ranking-row="${key}"`));
  if (row === undefined) {
    throw new Error(`No row ${key}`);
  }
  return row;
}

/** A row's cells, tags left out. */
const cells = (row: string) => [...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(([, content]) => content.replace(/<[^>]+>/g, ""));

/** The classes a row sets on itself. */
const classes = (row: string) => /class="([^"]*)"/.exec(row)?.[1].split(" ") ?? [];

describe("a week's ranking", () => {
  it("stays a table of five columns, named", () => {
    const markup = render([line(1, "Camille")]);
    expect(markup).toContain('<table data-slot="table"');
    expect(markup).toContain('aria-label="Classement de la semaine 45"');
    expect(markup.match(/<th /g)).toHaveLength(5);
    expect(cells(rowOf(markup, 1))).toEqual(["1", "Camille", "14", "+4", "12"]);
  });

  it("puts the viewer's line on the blue, and only theirs", () => {
    const markup = render([line(1, "Camille"), line(2, "Yanis", true)]);
    expect(classes(rowOf(markup, 2))).toContain("*:bg-primary");
    expect(classes(rowOf(markup, 1))).not.toContain("*:bg-primary");
    expect(classes(rowOf(markup, 1))).toContain("*:bg-card");
  });

  it("marks the ranks in the second accent, which the blue would swallow on the viewer's line", () => {
    const markup = render([line(1, "Camille"), line(2, "Yanis", true)]);
    expect(rowOf(markup, 1)).toContain("text-highlight");
    expect(rowOf(markup, 2)).not.toContain("text-highlight");
  });

  it("leaves an anonymous viewer's line greyed, without a rank nor the blue, with what puts it in", () => {
    const row = rowOf(render([line(1, "Camille"), line(null, null, true)]), "own");
    expect(classes(row)).toEqual(expect.arrayContaining(["text-muted-foreground", "italic", "*:bg-card"]));
    expect(classes(row)).not.toContain("*:bg-primary");
    expect(cells(row)[0]).toBe("—");
    expect(cells(row)[1]).toBe("ToiConnecte-toi pour apparaître au classement");
  });

  it("names a player without a first name « Anonyme »", () => {
    expect(cells(rowOf(render([line(1, null)]), 1))[1]).toBe("Anonyme");
  });

  it("says so when nobody has finished, without a table", () => {
    const markup = render([]);
    expect(markup).toContain("Personne");
    expect(markup).not.toContain("<table");
  });
});
