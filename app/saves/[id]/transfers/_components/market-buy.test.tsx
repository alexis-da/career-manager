import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MarketOverview } from "@/src/db/market";
import type { MarketProposal, MarketProposals } from "@/src/db/market-proposals";
import { SQUAD_LIMIT } from "@/src/engine/balance";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { formatMoney } from "@/src/lib/format";
import { MarketBuy, RecruitDialog, SignedDialog } from "./market-buy";

// The buttons alone are rendered here: a Server Action needs a request.
vi.mock("@/app/saves/[id]/transfers/actions", () => ({ makeTransferOfferAction: vi.fn(), signFreeAgentAction: vi.fn() }));

// A dialog draws into a portal, which a static render never mounts: here its parts are plain elements.
vi.mock("@/src/components/ui/dialog", () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children, "data-testid": testId }: { children?: ReactNode; "data-testid"?: string }) => (
    <div role="dialog" data-testid={testId}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p data-testid="dialog-description">{children}</p>,
  DialogClose: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
}));

/** A left back of an AI club, the best to fill the weak spot. */
const proposal = (rest: Partial<MarketProposal> = {}): MarketProposal => ({
  id: "player-1",
  playerKey: "loire-fc#3",
  firstName: "Yann",
  lastName: "Martin",
  age: 26,
  position: "LB",
  overall: 70,
  potential: 72,
  clubName: "Loire FC",
  clubColors: { primary: "#003399", secondary: "#ffffff" },
  askingPrice: 12_500_000,
  marketValue: 11_000_000,
  attributes: { pace: 74, shooting: 52, passing: 66, dribbling: 64, defending: 71, physical: 68, goalkeeping: 10 },
  slot: "LB",
  impact: 6,
  tag: "best",
  ...rest,
});

/** A free agent: no club, his signing bonus for a price. */
const FREE_AGENT = proposal({ id: "player-2", clubName: null, clubColors: null, askingPrice: 1_260_000, marketValue: 5_030_000, tag: "fit" });

/** On 1 July 2026, the summer window open, 27 players under contract. */
const OVERVIEW: MarketOverview = {
  currentDate: new Date(Date.UTC(2026, 6, 1)),
  windowOpen: true,
  windowClosesOn: new Date(Date.UTC(2026, 7, 31)),
  nextWindowOpensOn: new Date(Date.UTC(2027, 0, 1)),
  clubName: "Rhône FC",
  reputation: 80,
  budget: 37_500_000,
  squadSize: 27,
  freeAgents: 120,
  competitions: [{ code: "fr.1" }],
};

const proposalsOf = (needs: MarketProposal[], squadFull = false): MarketProposals => ({
  weakSpot: { position: "LB", rating: 64, reason: "lowest" },
  entries: { needs, gems: [], bargains: [], stars: [] },
  squadFull,
});

const render = (node: ReactNode, locale: Locale = "fr"): string => renderToStaticMarkup(inLanguage(node, locale));

const buy = (proposals: MarketProposals, overview: MarketOverview = OVERVIEW, locale?: Locale): string =>
  render(<MarketBuy saveId="save-1" proposals={proposals} overview={overview} sideOffer={null} />, locale);

/** The text of the element of a test id, its tags removed. */
const textOf = (markup: string, testId: string): string | null => {
  const match = new RegExp(`data-testid="${testId}"[^>]*>([\\s\\S]*?)</(p|h2|span|div|a)>`).exec(markup);
  return match === null ? null : match[1].replace(/<[^>]+>/g, " ").replaceAll("&#x27;", "'").replace(/\s+/g, " ").trim();
};

/** The text of the full squad's card, which comes before the entries' group. */
const squadFullText = (markup: string): string | null => {
  const start = markup.indexOf('data-testid="market-squad-full"');
  if (start < 0) {
    return null;
  }
  const card = markup.slice(markup.indexOf(">", start) + 1, markup.indexOf('role="group"', start));
  return card.replace(/<[^>]*>?/g, " ").replaceAll("&#x27;", "'").replace(/\s+/g, " ").trim();
};

/** Whether « Recruter » is disabled. */
const recruitDisabled = (markup: string): boolean => /<button[^>]*disabled=""[^>]*data-testid="market-recruit"/.test(markup);

/** The confirmation's rows: each label and its value. */
const rowsOf = (markup: string): [string, string][] =>
  [...markup.matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map(([, label, value]) => [label, value.replaceAll("&#x27;", "'")]);

describe("the buying side", () => {
  it("prices a club's player at his club's price, on the standard contract, without a wage", () => {
    const markup = buy(proposalsOf([proposal()]));

    expect(textOf(markup, "market-price-label")).toBe("Prix suggéré");
    expect(textOf(markup, "market-contract")).toBe("Contrat de 3 saisons");
    expect(textOf(markup, "market-price")).toBe(formatMoney(12_500_000));
    expect(textOf(markup, "market-intro")).toBe("Ton point faible : arrière gauche (note 64). Voici qui le comblerait.");
    expect(markup).not.toMatch(/Salaire|salariale|Dans tes moyens/);
    expect(recruitDisabled(markup)).toBe(false);
  });

  it("prices a free agent at his signing bonus, never « Gratuit »", () => {
    const markup = buy(proposalsOf([FREE_AGENT]));

    expect(textOf(markup, "market-price-label")).toBe("Prime à la signature");
    expect(textOf(markup, "market-price")).toBe(formatMoney(1_260_000));
    expect(markup).not.toContain("Gratuit");
    // His next ones beside him, on a computer: the bonus named over his price too.
    const spotted = buy(proposalsOf([proposal(), FREE_AGENT]));
    expect(spotted.match(/Prime à la signature/g)).toHaveLength(1);
  });

  it("says a full squad signs nobody, above the proposals, which stay readable, « Recruter » disabled", () => {
    const full = { ...OVERVIEW, squadSize: SQUAD_LIMIT };
    const markup = buy(proposalsOf([proposal()], true), full);

    expect(squadFullText(markup)).toBe(
      `Effectif plein ${SQUAD_LIMIT} joueurs sur ${SQUAD_LIMIT} : vends ou libère un joueur avant d'en recruter un autre. Vendre un joueur Ouvrir l'effectif`,
    );
    expect(markup).toMatch(/data-testid="market-squad-full-sell"[^>]*href="\/saves\/save-1\/transfers\?tab=sell"/);
    expect(markup).toMatch(/data-testid="market-squad-full-squad"[^>]*href="\/saves\/save-1\/squad"/);
    expect(markup.indexOf("market-squad-full")).toBeLessThan(markup.indexOf("market-proposal"));
    expect(markup).toContain('data-testid="market-proposal"');
    expect(recruitDisabled(markup)).toBe(true);
    expect(squadFullText(buy(proposalsOf([proposal()])))).toBeNull();
    // With sales the assistant proposes, its sale link leads to them.
    const proposed = render(
      <MarketBuy saveId="save-1" proposals={proposalsOf([proposal()], true)} overview={full} sideOffer={null} proposedSales={2} />,
    );
    expect(squadFullText(proposed)).toContain("Voir les ventes proposées");
    expect(squadFullText(proposed)).not.toContain("Vendre un joueur");
  });

  it("signs nobody while the window is closed either", () => {
    expect(recruitDisabled(buy(proposalsOf([proposal()]), { ...OVERVIEW, windowOpen: false }))).toBe(true);
  });

  it("says when an entry has nobody to propose, and nothing of a wage room", () => {
    const markup = buy(proposalsOf([]));

    expect(textOf(markup, "market-proposals-empty")).toBe("Personne à ta portée n'améliore ce poste pour l'instant.");
    expect(markup).not.toContain("market-wage-limit");
  });

  it("says it all in British English", () => {
    const club = buy(proposalsOf([proposal()]), OVERVIEW, "en");
    const free = buy(proposalsOf([FREE_AGENT]), OVERVIEW, "en");
    const full = buy(proposalsOf([proposal()], true), { ...OVERVIEW, squadSize: SQUAD_LIMIT }, "en");

    expect(textOf(club, "market-price-label")).toBe("Suggested price");
    expect(textOf(club, "market-contract")).toBe("Contract of 3 seasons");
    expect(textOf(free, "market-price-label")).toBe("Signing bonus");
    expect(squadFullText(full)).toBe(
      `Squad full ${SQUAD_LIMIT} players of ${SQUAD_LIMIT}: sell or release a player before signing another. Sell a player Open the squad`,
    );
    expect(club + free).not.toMatch(/Wage|Free</);
  });
});

describe("the confirmation of a signing", () => {
  const confirm = (signed: MarketProposal, locale?: Locale): string =>
    render(<RecruitDialog saveId="save-1" proposal={signed} overview={OVERVIEW} onClose={() => {}} onSigned={() => {}} />, locale);

  it("reads the price, the contract, the budget left and the place he takes, without a wage", () => {
    const markup = confirm(proposal());

    expect(textOf(markup, "dialog-description")).toBe("Le prix le plus bas qu'il accepte, sur la durée standard.");
    expect(rowsOf(markup)).toEqual([
      ["Prix", formatMoney(12_500_000)],
      ["Durée", "3 saisons, jusqu'au 30 juin 2029"],
      ["Budget restant", formatMoney(25_000_000)],
      ["Effectif", `28 sur ${SQUAD_LIMIT}`],
    ]);
  });

  it("names a free agent's price his signing bonus", () => {
    expect(rowsOf(confirm(FREE_AGENT))[0]).toEqual(["Prime à la signature", formatMoney(1_260_000)]);
    expect(rowsOf(confirm(FREE_AGENT))[2]).toEqual(["Budget restant", formatMoney(37_500_000 - 1_260_000)]);
  });

  it("says it in British English", () => {
    expect(rowsOf(confirm(FREE_AGENT, "en"))).toEqual([
      ["Signing bonus", formatMoney(1_260_000, "en")],
      ["Length", "3 seasons, until 30 June 2029"],
      ["Budget left", formatMoney(37_500_000 - 1_260_000, "en")],
      ["Squad", `28 of ${SQUAD_LIMIT}`],
    ]);
    expect(textOf(confirm(proposal(), "en"), "dialog-description")).toBe("The lowest price he accepts, for the standard length.");
  });

  it("tells the contract once signed, without a wage", () => {
    const signed = (locale?: Locale) => render(<SignedDialog proposal={proposal()} overview={OVERVIEW} onClose={() => {}} />, locale);

    expect(signed()).toContain("Contrat de 3 saisons, jusqu&#x27;au 30 juin 2029.");
    expect(signed("en")).toContain("Contract of 3 seasons, until 30 June 2029.");
    expect(signed() + signed("en")).not.toMatch(/par saison|per season/);
  });
});
