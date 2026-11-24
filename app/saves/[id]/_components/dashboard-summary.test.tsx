import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Dashboard } from "@/src/db/dashboard";
import { SQUAD_LIMIT } from "@/src/engine/balance";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { DashboardPills, DashboardTiles } from "./dashboard-summary";

/** What the pills and the tiles read of the dashboard. */
type Summary = Pick<Dashboard, "club" | "currentDate" | "position" | "managedForm">;

/** A club of 26 players on 1 July 2026, the summer window open, before its first match. */
const DASHBOARD: Summary = {
  currentDate: new Date(Date.UTC(2026, 6, 1)),
  club: { name: "Rhône FC", budget: 37_500_000, players: 26, goalkeepers: 3, averageAge: 25.4 },
  position: null,
  managedForm: [],
};

const withPlayers = (players: number): Summary => ({ ...DASHBOARD, club: { ...DASHBOARD.club, players } });

const render = (node: ReactNode, locale: Locale = "fr"): string => renderToStaticMarkup(inLanguage(node, locale));

/** The squad tile's figure: the count and what follows it, and its class. */
function squadFigure(markup: string): { text: string; className: string } {
  const tile = /data-testid="dashboard-squad"[\s\S]*?<p class="([^"]*)">([\s\S]*?)<\/p>/.exec(markup);
  return { className: tile?.[1] ?? "", text: (tile?.[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() };
}

describe("the dashboard's pills", () => {
  it("give the budget and the transfer window, and no wages: the budget is the only limit", () => {
    const markup = render(<DashboardPills dashboard={DASHBOARD} />);

    expect(markup).toContain('data-testid="dashboard-budget"');
    expect(markup).toContain("Budget 37,5 M€");
    expect(markup).toContain("Mercato ouvert jusqu&#x27;au 31 août");
    expect(markup).not.toContain("dashboard-payroll");
    expect(markup).not.toContain('data-summary="payroll"');
    expect(markup).not.toMatch(/Salaires|Wages/);
  });
});

describe("the dashboard's squad tile", () => {
  it("counts the players against the squad's limit, in both languages", () => {
    expect(squadFigure(render(<DashboardTiles dashboard={DASHBOARD} />)).text).toBe(`26 joueurs sur ${SQUAD_LIMIT}`);
    expect(squadFigure(render(<DashboardTiles dashboard={DASHBOARD} />, "en")).text).toBe(`26 players of ${SQUAD_LIMIT}`);
  });

  it("turns amber once the squad is full, and only then", () => {
    expect(squadFigure(render(<DashboardTiles dashboard={withPlayers(SQUAD_LIMIT - 1)} />)).className).not.toContain("text-warning");
    const full = squadFigure(render(<DashboardTiles dashboard={withPlayers(SQUAD_LIMIT)} />));

    expect(full.text).toBe(`${SQUAD_LIMIT} joueurs sur ${SQUAD_LIMIT}`);
    expect(full.className).toContain("text-warning");
    // A career from before the limit may have more: amber too.
    expect(squadFigure(render(<DashboardTiles dashboard={withPlayers(SQUAD_LIMIT + 2)} />)).className).toContain("text-warning");
  });

  it("keeps its goalkeepers and average age under the count", () => {
    const markup = render(<DashboardTiles dashboard={DASHBOARD} />);

    expect(markup).toContain("3 gardiens");
    expect(markup).toContain("Âge moyen 25,4");
  });
});
