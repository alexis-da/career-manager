import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MarketSales, SaleRow } from "@/src/db/market-sales";
import type { SaleQuote } from "@/src/db/transfers";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { MarketSell, SaleOfferCard } from "./market-sell";

// The buttons alone are rendered here: a Server Action needs a request.
vi.mock("@/app/saves/[id]/squad/actions", () => ({
  releasePlayerAction: vi.fn(),
  renewContractAction: vi.fn(),
  sellPlayerAction: vi.fn(),
}));

const offer = (fee: number, resaleCap?: "purchase" | "free"): SaleQuote => ({
  ok: true,
  fee,
  wage: 1_000_000,
  years: 3,
  buyerName: "Rhône FC",
  ...(resaleCap === undefined ? {} : { resaleCap }),
});

const row = (lastName: string, sale: SaleQuote): SaleRow => ({
  id: lastName,
  playerKey: lastName,
  firstName: "Yann",
  lastName,
  age: 24,
  position: "CM",
  overall: 65,
  marketValue: 10_000_000,
  clubColors: { primary: "#000000", secondary: "#ffffff" },
  terms: { renewalMinimumWage: 0, releaseCost: 0, sale },
});

const salesOf = (...rows: SaleRow[]): MarketSales => ({ rows, offers: rows.filter((sale) => sale.terms.sale.ok).length });

/** The capped offers' sentences, in the order of the page, with the row each is in. */
const capNotes = (markup: string): { player: string | null; text: string }[] =>
  [...markup.matchAll(/data-testid="market-sale-resale-cap"[^>]*>([^<]*)</g)].map((match) => {
    const before = markup.slice(0, match.index);
    return {
      player: [...before.matchAll(/data-player-id="([^"]+)"/g)].at(-1)?.[1] ?? null,
      text: match[1].replaceAll("&#x27;", "'"),
    };
  });

const render = (sales: MarketSales, locale: Locale = "fr"): string =>
  renderToStaticMarkup(inLanguage(<MarketSell saveId="save-1" sales={sales} windowOpen />, locale));

describe("the Sell tab", () => {
  const sales = salesOf(
    row("Martin", offer(19_910_000, "purchase")),
    row("Petit", offer(4_000_000)),
    row("Roux", offer(1_750_000, "free")),
    row("Blanc", { ok: false, reason: "no_offer" }),
  );

  it("says why the offers for a player who joined less than a year ago are capped, and only for him", () => {
    expect(capNotes(render(sales))).toEqual([
      {
        player: "Martin",
        text: "Arrivé il y a moins d'un an : les clubs ne paieront pas beaucoup plus que ton prix d'achat.",
      },
      { player: "Roux", text: "Arrivé libre il y a moins d'un an : les clubs ne paieront pas plus de la moitié de sa valeur." },
    ]);
  });

  it("says it in English too", () => {
    expect(capNotes(render(sales, "en")).map(({ text }) => text)).toEqual([
      "Joined less than a year ago: clubs won't pay much more than you paid for him.",
      "Joined on a free less than a year ago: clubs won't pay more than half his value.",
    ]);
  });

  it("says it on the offer beside the proposals of « Acheter »", () => {
    const side = renderToStaticMarkup(inLanguage(<SaleOfferCard saveId="save-1" row={sales.rows[0]} variant="side" />));
    const uncapped = renderToStaticMarkup(inLanguage(<SaleOfferCard saveId="save-1" row={sales.rows[1]} variant="side" />));

    expect(capNotes(side).map(({ text }) => text)).toEqual([
      "Arrivé il y a moins d'un an : les clubs ne paieront pas beaucoup plus que ton prix d'achat.",
    ]);
    expect(capNotes(uncapped)).toEqual([]);
  });
});
