import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ClubPlayerRow, FreeAgentRow, MarketOverview, Paginated } from "@/src/db/market";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { formatMoney } from "@/src/lib/format";
import { ClubPlayersTable, FreeAgentsTable } from "./market-tables";

// The buttons alone are rendered here: a Server Action needs a request.
vi.mock("@/app/saves/[id]/transfers/actions", () => ({ makeTransferOfferAction: vi.fn(), signFreeAgentAction: vi.fn() }));

// A dialog draws into a portal, which a static render never mounts: here its parts are plain elements, its content
// shown even closed, to be read.
vi.mock("@/src/components/ui/dialog", () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children, "data-testid": testId }: { children?: ReactNode; "data-testid"?: string }) => (
    <button type="button" data-testid={testId}>
      {children}
    </button>
  ),
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

/** On 1 July 2026, the summer window open. */
const OVERVIEW: MarketOverview = {
  currentDate: new Date(Date.UTC(2026, 6, 1)),
  windowOpen: true,
  windowClosesOn: new Date(Date.UTC(2026, 7, 31)),
  nextWindowOpensOn: new Date(Date.UTC(2027, 0, 1)),
  clubName: "Rhône FC",
  reputation: 80,
  budget: 37_500_000,
  squadSize: 27,
  freeAgents: 1,
  competitions: [{ code: "fr.1" }],
};

const page = <T,>(rows: T[]): Paginated<T> => ({ rows, total: rows.length, page: 1, pageCount: 1 });

const FREE_AGENT: FreeAgentRow = {
  id: "player-1",
  playerKey: "free#1",
  firstName: "Yann",
  lastName: "Martin",
  nationality: "France",
  position: "LB",
  age: 26,
  overall: 70,
  potential: 72,
  signingBonus: 1_260_000,
  minimumReputation: 55,
  formerClubName: "Loire FC",
};

const CLUB_PLAYER: ClubPlayerRow = {
  id: "player-2",
  playerKey: "loire-fc#9",
  firstName: "Karim",
  lastName: "Roux",
  nationality: "France",
  clubName: "Loire FC",
  clubColors: { primary: "#003399", secondary: "#ffffff" },
  position: "ST",
  age: 27,
  overall: 74,
  potential: 76,
  askingPrice: 12_500_000,
  minimumReputation: 60,
  contractUntil: new Date(Date.UTC(2028, 5, 30)),
};

const render = (node: ReactNode, locale: Locale = "fr"): string => renderToStaticMarkup(inLanguage(node, locale));

const freeAgents = (locale?: Locale): string =>
  render(<FreeAgentsTable saveId="save-1" values={{}} list={page([FREE_AGENT])} overview={OVERVIEW} />, locale);

const clubPlayers = (locale?: Locale): string =>
  render(
    <ClubPlayersTable
      saveId="save-1"
      values={{}}
      filters={{ sort: "overall", dir: "desc", page: 1 }}
      list={page([CLUB_PLAYER])}
      overview={OVERVIEW}
    />,
    locale,
  );

/** The table's column heads, their tags removed. */
const headsOf = (markup: string): string[] =>
  [...(/<thead[\s\S]*?<\/thead>/.exec(markup)?.[0] ?? "").matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(([, head]) =>
    head.replace(/<[^>]+>/g, "").trim(),
  );

const descriptionOf = (markup: string): string =>
  (/data-testid="dialog-description">([^<]*)</.exec(markup)?.[1] ?? "").replaceAll("&#x27;", "'");

describe("the free agents of the advanced market", () => {
  it("list each one's signing bonus where his wage was", () => {
    const markup = freeAgents();

    expect(headsOf(markup)).toContain("Prime");
    expect(markup).toContain('data-bonus="1260000"');
    expect(markup).toContain(`>${formatMoney(1_260_000)}<`);
    expect(markup).not.toContain("data-asked-wage");
    expect(markup).not.toMatch(/Salaire|salariale/);
    expect(headsOf(freeAgents("en"))).toContain("Bonus");
  });

  it("sign one for his bonus, off the budget, the contract's length alone to choose", () => {
    const markup = freeAgents();

    expect(descriptionOf(markup)).toBe(
      `Joueur libre : pas d'indemnité de transfert, une prime à la signature de ${formatMoney(1_260_000)}, payée sur ton budget.`,
    );
    expect(markup).toContain('data-testid="contract-length"');
    expect(markup).not.toContain('id="signing-wage-');
    expect(descriptionOf(freeAgents("en"))).toBe(
      `Free agent: no transfer fee, a signing bonus of ${formatMoney(1_260_000, "en")}, paid from your budget.`,
    );
  });
});

describe("the AI clubs' players of the advanced market", () => {
  it("have no wage column", () => {
    expect(headsOf(clubPlayers())).not.toContain("Salaire demandé");
    expect(clubPlayers()).not.toMatch(/Salaire|salariale/);
    expect(clubPlayers("en")).not.toMatch(/Wage|wage/);
  });

  it("are offered for with a fee and a length, no wage", () => {
    const markup = clubPlayers();

    expect(descriptionOf(markup)).toBe(`Loire FC demande ${formatMoney(12_500_000)}.`);
    expect(markup).toContain('id="offer-fee-player-2"');
    expect(markup).not.toContain('id="offer-wage-');
    expect(markup).toContain('data-testid="contract-length"');
    expect(descriptionOf(clubPlayers("en"))).toBe(`Loire FC asks ${formatMoney(12_500_000, "en")}.`);
  });
});
