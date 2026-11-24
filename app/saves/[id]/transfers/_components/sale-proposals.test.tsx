import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MarketSales, SaleRow } from "@/src/db/market-sales";
import type { SaleProposal, SaleProposals } from "@/src/db/sale-proposals";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { MarketSell } from "./market-sell";
import { SaleProposalsSection } from "./sale-proposals";

// The buttons alone are rendered here: a Server Action needs a request, and the router a page.
vi.mock("@/app/saves/[id]/squad/actions", () => ({
  releasePlayerAction: vi.fn(),
  renewContractAction: vi.fn(),
  sellPlayerAction: vi.fn(),
}));
vi.mock("@/app/saves/[id]/transfers/sale-proposal-actions", () => ({
  acceptSaleProposalAction: vi.fn(),
  keepSaleProposalAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const COLORS = { primary: "#000000", secondary: "#ffffff" };

const proposal = (lastName: string, fee: number, figures: { starts: number; minutes: number }): SaleProposal => ({
  id: lastName,
  playerKey: lastName,
  firstName: "Bastien",
  lastName,
  position: "CM",
  overall: 64,
  age: 29,
  marketValue: 3_100_000,
  clubColors: COLORS,
  ...figures,
  offer: { fee, buyerId: "buyer-1", buyerName: "Rhône FC" },
});

const row = (lastName: string, fee: number): SaleRow => ({
  id: lastName,
  playerKey: lastName,
  firstName: "Yann",
  lastName,
  age: 24,
  position: "LW",
  overall: 66,
  marketValue: 4_000_000,
  clubColors: COLORS,
  terms: {
    renewalMinimumWage: 0,
    releaseCost: 0,
    sale: { ok: true, fee, wage: 1_000_000, years: 3, buyerName: "Lys FC" },
    academyUntil: null,
  },
});

const PROPOSALS: SaleProposals = {
  period: "season",
  proposals: [proposal("Petit", 3_400_000, { starts: 1, minutes: 74 }), proposal("Roux", 2_700_000, { starts: 0, minutes: 0 })],
};
// The proposed players are rows of the tab too: the page reads every player out of the eleven.
const SALES: MarketSales = { rows: [row("Petit", 3_400_000), row("Faure", 4_300_000), row("Roux", 2_700_000)], offers: 3 };

/** The tab as the page gives it: the proposals' cards at its head, their players out of its rows. */
const render = (proposals: SaleProposals | undefined, locale: Locale = "fr"): string =>
  renderToStaticMarkup(
    inLanguage(
      <MarketSell
        saveId="save-1"
        sales={SALES}
        windowOpen
        proposals={
          proposals === undefined
            ? undefined
            : { ids: proposals.proposals.map(({ id }) => id), cards: <SaleProposalsSection saveId="save-1" proposals={proposals} /> }
        }
      />,
      locale,
    ),
  );

/** Whether a tag's classes include the solid orange of the screen's main action. */
const solidOrange = (tag: string): boolean => (/class="([^"]*)"/.exec(tag)?.[1] ?? "").split(" ").includes("bg-(--club)");

/** The text of an element, its tags and entities left out. */
const text = (html: string): string => html.replace(/<[^>]+>/g, "").replaceAll("&#x27;", "'").replaceAll("&amp;", "&");

describe("the assistant's proposals on the Sell tab", () => {
  it("shows a card per proposal at the tab's head, why, the offer, and its two gestures", () => {
    const markup = render(PROPOSALS);
    const section = /data-testid="market-sale-proposals"[\s\S]*?<\/section>/.exec(markup)?.[0] ?? "";
    expect(markup.indexOf('data-testid="market-sale-proposals"')).toBeLessThan(markup.indexOf('data-testid="market-sale-offer"'));
    const cards = section.split('data-testid="market-sale-proposal"').slice(1);
    expect(cards).toHaveLength(2);
    expect(text(section)).toContain("Ton adjoint propose");
    expect(text(cards[0])).toContain("Bastien Petit");
    expect(text(cards[0])).toContain("1 titularisation, 74 minutes cette saison · ni titulaire ni remplaçant pour ton adjoint");
    expect(text(cards[0])).toContain("Rhône FC propose 3,4 M€ (vaut 3,1 M€)");
    expect(text(cards[0])).toContain("Vendre · 3,4 M€");
    expect(cards[0]).toContain('data-testid="sale-proposal-keep"');
    expect(text(cards[1])).toContain("Aucun match cette saison");
  });

  it("gives the screen's orange to the first proposal, the best offer's card then outlined", () => {
    const markup = render(PROPOSALS);
    const accepts = [...markup.matchAll(/<button[^>]*data-testid="sale-proposal-accept"[^>]*>/g)].map(([tag]) => tag);
    expect(accepts).toHaveLength(2);
    expect(solidOrange(accepts[0])).toBe(true);
    expect(solidOrange(accepts[1])).toBe(false);
    const sellOf = (html: string): string => /<button[^>]*data-testid="sell-player"[^>]*>/.exec(html)?.[0] ?? "";
    expect(solidOrange(sellOf(markup))).toBe(false);
    // Without proposals, the best offer's sale is the orange again.
    expect(solidOrange(sellOf(render(undefined)))).toBe(true);
  });

  it("leaves the proposed players out of the rows below, the best offer among the others", () => {
    const markup = render(PROPOSALS);
    const rest = markup.slice(markup.indexOf("</section>"));
    expect(rest).toContain('data-player-id="Faure"');
    expect(rest).not.toContain('data-player-id="Petit"');
    expect(rest).not.toContain('data-player-id="Roux"');
  });

  it("says the completed season in a summer window, in both languages", () => {
    const summer: SaleProposals = { ...PROPOSALS, period: "last-season" };
    expect(text(render(summer))).toContain("1 titularisation, 74 minutes la saison dernière");
    const english = text(render(summer, "en"));
    expect(english).toContain("Your assistant suggests");
    expect(english).toContain("1 start, 74 minutes last season · neither a starter nor a substitute for your assistant");
    expect(english).toContain("Rhône FC offers €3.4m (worth €3.1m)");
    expect(english).toContain("Sell · €3.4m");
    expect(english).toContain("No matches last season");
  });

  it("shows nothing without a proposal, nor outside a window", () => {
    expect(render({ period: "season", proposals: [] })).not.toContain("market-sale-proposals");
    expect(render({ period: null, proposals: [] })).not.toContain("market-sale-proposals");
  });
});
