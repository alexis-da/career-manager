import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PlayerProfile } from "@/src/db/players";
import type { SaleQuote } from "@/src/db/transfers";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { SquadPlayerActions } from "./contract-actions";

// The buttons alone are rendered here: a Server Action needs a request.
vi.mock("@/app/saves/[id]/squad/actions", () => ({
  releasePlayerAction: vi.fn(),
  renewContractAction: vi.fn(),
  sellPlayerAction: vi.fn(),
}));

/** What the actions read of a player's profile: the rest is the sheet's. */
const PLAYER = { id: "player-1", firstName: "Yann", lastName: "Martin", contractUntil: new Date(Date.UTC(2029, 5, 30)) } as PlayerProfile;

const offer = (resaleCap?: "purchase" | "free"): SaleQuote => ({
  ok: true,
  fee: 19_910_000,
  wage: 1_000_000,
  years: 3,
  buyerName: "Rhône FC",
  ...(resaleCap === undefined ? {} : { resaleCap }),
});

/** The foot of the sheet of a player of the managed club in the winter window. */
const render = (sale: SaleQuote, locale: Locale = "fr"): string =>
  renderToStaticMarkup(
    inLanguage(
      <SquadPlayerActions
        saveId="save-1"
        player={PLAYER}
        terms={{ renewalMinimumWage: 1_000_000, releaseCost: 0, sale }}
        currentDate={new Date(Date.UTC(2027, 0, 12))}
        windowOpen
        nextWindowOpensOn={new Date(Date.UTC(2027, 6, 1))}
      />,
      locale,
    ),
  );

const textOf = (markup: string, testId: string): string | null =>
  new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`).exec(markup)?.[1]?.replaceAll("&#x27;", "'") ?? null;

describe("the foot of the sheet of a player of the managed club", () => {
  it("says why no club pays much more for a player who joined less than a year ago, in both languages", () => {
    expect(textOf(render(offer("purchase")), "player-resale-cap")).toBe(
      "Arrivé il y a moins d'un an : les clubs ne paieront pas beaucoup plus que ton prix d'achat.",
    );
    expect(textOf(render(offer("free"), "en"), "player-resale-cap")).toBe(
      "Joined on a free less than a year ago: clubs won't pay more than half his value.",
    );
  });

  it("says nothing of it for another player, nor where no club bids", () => {
    const noOffer = render({ ok: false, reason: "no_offer" });

    expect(textOf(render(offer()), "player-resale-cap")).toBeNull();
    expect(textOf(noOffer, "player-resale-cap")).toBeNull();
    expect(textOf(noOffer, "player-sale-refusal")).not.toBeNull();
  });
});
