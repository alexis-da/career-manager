import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SQUAD_LIMIT } from "@/src/engine/balance";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { PlayerCardBody } from "./player-hover-card";
import { SquadSummary } from "./squad-summary";
import { SquadTable } from "./squad-table";

// The sheet's actions call Server Actions, which need a request: none is rendered here, the table being empty.
vi.mock("@/app/saves/[id]/_components/contract-actions", () => ({ SquadPlayerActions: () => null }));

const render = (node: ReactNode, locale: Locale = "fr"): string => renderToStaticMarkup(inLanguage(node, locale));

/** A text without its tags, its spaces as one. */
const textOfMarkup = (markup: string): string =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replace(/\s+/g, " ")
    .trim();

/** The class of the summary's count of players. */
const playersClass = (markup: string): string => /data-testid="squad-summary-players" class="([^"]*)"/.exec(markup)?.[1] ?? "";

describe("the squad's summary", () => {
  it("counts the players against the squad's limit, then the goalkeepers, and no wage bill", () => {
    const markup = render(<SquadSummary players={27} goalkeepers={3} />);

    expect(textOfMarkup(markup)).toBe(`27 joueurs sur ${SQUAD_LIMIT} · 3 gardiens`);
    // The count alone in its element, which the end-to-end tests read.
    expect(markup).toContain('<span data-summary="players">27</span>');
    expect(markup).not.toMatch(/masse salariale|M€/);
    expect(textOfMarkup(render(<SquadSummary players={27} goalkeepers={3} />, "en"))).toBe(`27 players of ${SQUAD_LIMIT} · 3 goalkeepers`);
  });

  it("turns amber once the squad is full, and only then", () => {
    expect(playersClass(render(<SquadSummary players={SQUAD_LIMIT - 1} goalkeepers={3} />))).not.toContain("text-warning");
    expect(playersClass(render(<SquadSummary players={SQUAD_LIMIT} goalkeepers={3} />))).toContain("text-warning");
    expect(playersClass(render(<SquadSummary players={SQUAD_LIMIT + 1} goalkeepers={3} />))).toContain("text-warning");
  });
});

describe("the squad's table", () => {
  const table = (locale?: Locale): string =>
    render(
      <SquadTable
        saveId="save-1"
        header={null}
        players={[]}
        currentDate={new Date(Date.UTC(2026, 6, 1))}
        startYear={2026}
        windowOpen
        nextWindowOpensOn={new Date(Date.UTC(2027, 0, 1))}
      />,
      locale,
    );

  it("has no wage column: its sortable columns, in order", () => {
    const columns = [...table().matchAll(/data-testid="squad-column-([a-z-]+)"/g)].map(([, column]) => column);

    expect(columns).toEqual(["position", "name", "age", "overall", "potential", "form", "fitness", "market-value", "contract-until"]);
    expect(textOfMarkup(table())).not.toContain("Salaire");
    expect(textOfMarkup(table("en"))).not.toContain("Wage");
  });
});

describe("the squad's hover card", () => {
  const PLAYER = {
    playerKey: "olympique-lyonnais#5",
    firstName: "Yann",
    lastName: "Martin",
    age: 28,
    clubColors: null,
    position: "CM",
    overall: 70,
    potential: 72,
    attributes: { pace: 60, shooting: 62, passing: 74, dribbling: 70, defending: 55, physical: 66, goalkeeping: 10 },
    form: 60,
    fitness: 92,
    fitnessAtNextMatch: true,
    contractUntil: new Date(Date.UTC(2027, 5, 30)),
    contractExpiring: true,
  } as const;

  it("gives his contract's end, and no wage", () => {
    const french = textOfMarkup(render(<PlayerCardBody player={PLAYER} />));
    const english = textOfMarkup(render(<PlayerCardBody player={PLAYER} />, "en"));

    expect(french).toContain("30 juin 2027");
    expect(french).not.toMatch(/Salaire|saison/);
    expect(english).toContain("30 June 2027");
    expect(english).not.toMatch(/Wage|season/);
  });
});
