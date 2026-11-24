import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CareerItemView, ShopView } from "@/src/db/shop";
import { SQUAD_LIMIT } from "@/src/engine/balance";
import { ITEM_PRICES, SEASON_LIMITS, type PurchaseRefusal } from "@/src/engine/shop";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { CareerShop } from "./career-shop";

// The buttons alone are rendered here: a Server Action needs a request.
vi.mock("@/app/saves/[id]/rewards/actions", () => ({ buyAction: vi.fn() }));

// The sheet draws into a portal, which a static render never mounts: here its parts are plain elements.
vi.mock("@/src/components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children?: ReactNode }) => (open ? <div>{children}</div> : null),
  SheetContent: ({ children, "data-testid": testId }: { children?: ReactNode; "data-testid"?: string }) => (
    <div role="dialog" data-testid={testId}>
      {children}
    </div>
  ),
  SheetTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
}));

const item = (name: CareerItemView["item"], refusal: PurchaseRefusal | null = null): CareerItemView => ({
  item: name,
  price: ITEM_PRICES[name],
  season: { bought: 0, limit: SEASON_LIMITS[name] },
  career: name === "PROMISING_YOUTH" ? { bought: 0, limit: 3 } : null,
  refusal,
});

/** A career's shop in its first season, 26 players under contract, tokens enough for anything. */
const shopOf = (squadSize: number, youthRefusal: PurchaseRefusal | null = null): ShopView => ({
  challenge: false,
  live: false,
  startYear: 2026,
  tokens: 400,
  shield: false,
  items: [item("FITNESS_CAMP"), item("EXPRESS_CARE", "not_injured"), item("BUDGET_TOP_UP"), item("PROMISING_YOUTH", youthRefusal)],
  budget: 37_500_000,
  topUp: 1_800_000,
  squadSize,
  belowFull: 4,
  care: [],
  youth: [
    { line: "GK", firstName: "Hugo", lastName: "Petit", position: "GK", overall: 63, potential: 90 },
    { line: "DF", firstName: "Léo", lastName: "Faure", position: "CB", overall: 63, potential: 89 },
    { line: "MF", firstName: "Noé", lastName: "Blanc", position: "CM", overall: 63, potential: 91 },
    { line: "FW", firstName: "Enzo", lastName: "Roux", position: "ST", overall: 63, potential: 90 },
  ],
});

const render = (shop: ShopView, locale: Locale = "fr"): string =>
  renderToStaticMarkup(inLanguage(<CareerShop saveId="save-1" shop={shop} opening={{ item: "PROMISING_YOUTH" }} />, locale));

const textOf = (markup: string, testId: string): string | null =>
  (new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`).exec(markup)?.[1] ?? null)?.replaceAll("&#x27;", "'") ?? null;

describe("the promising youth's confirmation", () => {
  it("gives his contract and the place he takes, and no wage", () => {
    const markup = render(shopOf(26));

    expect(markup).toContain('data-testid="purchase-sheet"');
    expect(textOf(markup, "youth-contract")).toBe("Contrat de 3 saisons, ni vente ni libération avant sa fin.");
    expect(textOf(markup, "youth-place")).toBe(`Il prend une place : 27 sur ${SQUAD_LIMIT}.`);
    expect(markup).not.toMatch(/Salaire|salariale|Hors de ta marge|plafond/);
    // Every line can be chosen: no wage budget refuses one.
    expect(markup.match(/data-testid="youth-choice"/g)).toHaveLength(4);
    expect(markup).not.toMatch(/<input[^>]*name="line"[^>]*disabled/);
  });

  it("says it in British English", () => {
    const markup = render(shopOf(26), "en");

    expect(textOf(markup, "youth-contract")).toBe("Contract of 3 seasons, with no sale or release before it ends.");
    expect(textOf(markup, "youth-place")).toBe(`He takes a squad place: 27 of ${SQUAD_LIMIT}.`);
    expect(markup).not.toMatch(/Wage|wage|margin/);
  });

  it("is never opened for a full squad, which the item says it refuses", () => {
    const markup = render(shopOf(SQUAD_LIMIT, "squad_full"));

    expect(markup).not.toContain('data-testid="purchase-sheet"');
    expect(markup).toMatch(/data-item="PROMISING_YOUTH" data-refusal="squad_full"/);
    expect(markup).toContain("Ton effectif compte déjà 30 joueurs : vends ou libère un joueur avant de faire venir un jeune.");
  });
});
