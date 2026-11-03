import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Dashboard } from "@/src/db/dashboard";
import type { LineupPlayer, ManagedLineup } from "@/src/db/lineup";
import type { MarketSales, SaleRow } from "@/src/db/market-sales";
import type { SaleQuote } from "@/src/db/transfers";
import type { Position } from "@/src/engine/positions";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { DashboardTodo } from "./dashboard-todo";

const SAVE = "/saves/save-1";

type Club = { players?: number; goalkeepers?: number };

/** What the list reads of a dashboard, a full squad by default: the rest is the other cards'. */
const dashboardWith = ({ players = 22, goalkeepers = 3 }: Club, rest: Partial<Pick<Dashboard, "injured" | "expiringContracts">> = {}) =>
  ({ club: { players, goalkeepers }, injured: [], expiringContracts: [], ...rest }) as Dashboard;

const starter = (lastName: string, position: Position, overall: number): LineupPlayer => ({
  id: lastName,
  position,
  overall,
  injured: false,
  firstName: "Jean",
  lastName,
  age: 25,
  injuredUntil: null,
  fitness: 100,
});

/** An eleven, each starter at his position. */
const lineupOf = (starters: LineupPlayer[], injuredStarters: LineupPlayer[] = []): ManagedLineup => ({
  formation: "4-3-3",
  lineup: { starters: starters.map((player, index) => ({ player, slot: player.position, index })), bench: [] },
  injuredStarters,
});

const NO_ELEVEN = lineupOf([]);

const offer = (buyerName: string, fee: number): SaleQuote => ({ ok: true, fee, wage: 100_000, years: 3, buyerName });

const NO_OFFER: SaleQuote = { ok: false, reason: "no_offer" };

const saleRow = (lastName: string, sale: SaleQuote): SaleRow => ({
  id: lastName,
  playerKey: lastName,
  firstName: "Yann",
  lastName,
  age: 24,
  position: "CM",
  overall: 65,
  marketValue: 1_000_000,
  clubColors: { primary: "#000000", secondary: "#ffffff" },
  terms: { renewalMinimumWage: 0, releaseCost: 0, sale },
});

const salesOf = (...rows: SaleRow[]): MarketSales => ({ rows, offers: rows.filter((row) => row.terms.sale.ok).length });

type Props = { dashboard: Dashboard; lineup: ManagedLineup; sales?: MarketSales | null };

const render = ({ dashboard, lineup, sales = null }: Props, locale: Locale = "fr"): string =>
  renderToStaticMarkup(inLanguage(<DashboardTodo saveId="save-1" dashboard={dashboard} lineup={lineup} sales={sales} />, locale));

/** The lines of the list, in order: id, link and text, title and detail one after the other. */
const lines = (markup: string) =>
  [...markup.matchAll(/<li data-testid="alert-([^"]+)">(.*?)<\/li>/g)].map(([, id, body]) => ({
    id,
    href: /href="([^"]+)"/.exec(body)?.[1] ?? null,
    text: body
      .replace(/<svg.*?<\/svg>/g, "")
      .replace(/<\/span><span/g, "</span> <span")
      .replace(/<[^>]+>/g, "")
      .replaceAll("&#x27;", "'")
      .trim(),
  }));

const idsOf = (markup: string) => lines(markup).map(({ id }) => id);

describe("the dashboard's to-do list", () => {
  it("lists everything to do in its order, each line a link to where it gets done", () => {
    const hurt = starter("Morel", "CB", 70);
    const markup = render({
      dashboard: dashboardWith(
        { players: 17, goalkeepers: 1 },
        {
          injured: [
            { name: "J. Morel", until: new Date(Date.UTC(2026, 10, 20)) },
            { name: "K. Roux", until: new Date(Date.UTC(2026, 10, 12)) },
            { name: "L. Petit", until: new Date(Date.UTC(2026, 11, 1)) },
          ],
          expiringContracts: ["A. Faure", "B. Girard", "C. Henry", "D. Ibert", "E. Jolly"],
        },
      ),
      lineup: lineupOf([starter("Blanc", "GK", 72), starter("Noir", "LB", 58), starter("Vert", "ST", 75)], [hurt]),
      sales: salesOf(saleRow("Lemoine", offer("Rhône FC", 1_250_000)), saleRow("Colin", offer("Alsace Racing", 800_000)), saleRow("Vidal", NO_OFFER)),
    });

    expect(markup).toContain('data-testid="dashboard-alerts"');
    expect(markup).toContain("À faire");
    expect(lines(markup)).toEqual([
      {
        id: "injured-starters",
        href: `${SAVE}/lineup`,
        text: "Un titulaire est blessé J. Morel : remplacement automatique au prochain match.",
      },
      { id: "injured", href: `${SAVE}/squad`, text: "2 blessés K. Roux, retour 12 nov. ; L. Petit, retour 1er déc." },
      { id: "offers", href: `${SAVE}/transfers?tab=sell`, text: "Rhône FC propose 1,3 M€ pour Yann Lemoine 2 offres pour tes remplaçants" },
      { id: "weak-spot", href: `${SAVE}/transfers`, text: "Ton point faible : arrière gauche Note 58 · voir le marché" },
      { id: "expiring-contracts", href: `${SAVE}/squad`, text: "5 contrats expirent le 30 juin A. Faure, B. Girard, C. Henry et 2 autres" },
      { id: "goalkeepers", href: `${SAVE}/squad`, text: "Un seul gardien sous contrat 2 gardiens sont nécessaires pour faire tourner l'équipe." },
      { id: "small-squad", href: `${SAVE}/squad`, text: "Effectif réduit 17 joueurs sous contrat, 18 au minimum." },
    ]);
    expect(markup.match(/data-testid="alert-action"/g)).toHaveLength(7);
  });

  it("colours each tile by its line's severity, and never cuts a text", () => {
    const markup = render({
      dashboard: dashboardWith({ goalkeepers: 0 }, { expiringContracts: ["A. Faure"] }),
      lineup: lineupOf([starter("Noir", "LB", 58)]),
    });
    const tiles = [...markup.matchAll(/<span aria-hidden="true" class="grid size-9 [^"]*rounded-md ([^"]+)"><svg/g)].map(([, classes]) => classes);

    expect(idsOf(markup)).toEqual(["weak-spot", "expiring-contracts", "goalkeepers"]);
    expect(tiles).toEqual(["bg-secondary", "bg-warning/15 text-warning", "bg-loss/15 text-loss"]);
    expect(markup).not.toContain("truncate");
  });

  it("says a full squad has nothing to report, on a line that leads nowhere", () => {
    const markup = render({ dashboard: dashboardWith({}), lineup: NO_ELEVEN });

    expect(lines(markup)).toEqual([
      { id: "full-squad", href: null, text: "Effectif complet 22 joueurs, 3 gardiens — rien à signaler" },
    ]);
    expect(markup).not.toContain("alert-action");
    expect(markup).not.toContain("lucide-chevron-right");
  });

  it("tells no goalkeeper from one, and a thin squad with enough goalkeepers from a full one", () => {
    const { text } = lines(render({ dashboard: dashboardWith({ goalkeepers: 0 }), lineup: NO_ELEVEN }))[0];
    expect(text).toContain("Aucun gardien sous contrat");

    expect(idsOf(render({ dashboard: dashboardWith({ players: 17, goalkeepers: 2 }), lineup: NO_ELEVEN }))).toEqual(["small-squad"]);
    expect(idsOf(render({ dashboard: dashboardWith({ players: 18, goalkeepers: 2 }), lineup: NO_ELEVEN }))).toEqual(["full-squad"]);
  });

  it("leaves the injured starters to their own line, one name off for each: a substitute may share it", () => {
    const until = new Date(Date.UTC(2026, 10, 20));
    const hurt = starter("Martin", "CB", 70);
    const dashboard = dashboardWith(
      {},
      {
        injured: [
          { name: "J. Martin", until },
          { name: "J. Martin", until },
        ],
      },
    );

    const both = lines(render({ dashboard, lineup: lineupOf([], [hurt]) }));
    expect(both.map(({ id }) => id)).toEqual(["injured-starters", "injured", "full-squad"]);
    expect(both[1].text).toBe("1 blessé J. Martin, retour 20 nov.");

    // Injured today, back for the next match: no longer among the saved starters who miss it, still injured.
    expect(idsOf(render({ dashboard, lineup: NO_ELEVEN }))).toEqual(["injured", "full-squad"]);

    const alone = dashboardWith({}, { injured: [{ name: "J. Martin", until }] });
    expect(idsOf(render({ dashboard: alone, lineup: lineupOf([], [hurt]) }))).toEqual(["injured-starters", "full-squad"]);
  });

  it("shows the first row with an offer, and nothing without one or out of a window", () => {
    const sales = salesOf(saleRow("Vidal", NO_OFFER), saleRow("Lemoine", offer("Rhône FC", 850_000)));
    const dashboard = dashboardWith({});

    expect(lines(render({ dashboard, lineup: NO_ELEVEN, sales }))[0].text).toBe(
      "Rhône FC propose 850 k€ pour Yann Lemoine 1 offre pour tes remplaçants",
    );
    expect(idsOf(render({ dashboard, lineup: NO_ELEVEN, sales: salesOf(saleRow("Vidal", NO_OFFER)) }))).toEqual(["full-squad"]);
    expect(idsOf(render({ dashboard, lineup: NO_ELEVEN, sales: null }))).toEqual(["full-squad"]);
  });

  it("speaks British English", () => {
    const until = new Date(Date.UTC(2026, 10, 12));
    const hurt = starter("Morel", "CB", 70);
    const markup = render(
      {
        dashboard: dashboardWith(
          { players: 17, goalkeepers: 0 },
          { injured: [{ name: "J. Morel", until }, { name: "K. Roux", until }], expiringContracts: ["A. Faure"] },
        ),
        lineup: lineupOf([starter("Noir", "LB", 58)], [hurt]),
        sales: salesOf(saleRow("Lemoine", offer("Rhône FC", 77_200_000)), saleRow("Colin", offer("Alsace Racing", 800_000))),
      },
      "en",
    );

    expect(markup).toContain("To do");
    expect(lines(markup).map(({ text }) => text)).toEqual([
      "A starter is injured J. Morel: replaced automatically in the next match.",
      "1 injured K. Roux, back 12 Nov",
      "Rhône FC offers €77.2m for Yann Lemoine 2 offers for your substitutes",
      "Your weak spot: left back Rated 58 · see the market",
      "1 contract expires on 30 June A. Faure",
      "No goalkeeper under contract 2 goalkeepers are needed to keep the team going.",
      "Thin squad 17 players under contract, 18 minimum.",
    ]);
    expect(lines(render({ dashboard: dashboardWith({}), lineup: NO_ELEVEN }, "en"))[0].text).toBe(
      "Full squad 22 players, 3 goalkeepers — nothing to report",
    );
  });
});
