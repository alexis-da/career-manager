import { describe, expect, it } from "vitest";
import type { TransferRefusal } from "@/src/db/transfers";
import type { OfferRefusal } from "@/src/engine/transfer-ai";
import type { Locale } from "@/src/i18n/locale";
import { testTranslator } from "@/src/i18n/test-intl";
import { refusalMessage, type RefusalContext } from "./refusal-message";

const REASONS: TransferRefusal[] = [
  "window_closed",
  "not_available",
  "insufficient_budget",
  "wage_budget_exceeded",
  "club_refused",
  "player_refused",
  "no_offer",
];

/** The refusal as a player reads it in a language, French unless told otherwise. */
const message = (
  reason: TransferRefusal,
  refusals: OfferRefusal[] = [],
  context: RefusalContext = {},
  locale: Locale = "fr",
): string => refusalMessage(reason, testTranslator(locale, "refusals"), locale, refusals, context);

describe("refusalMessage", () => {
  it("gives a distinct explanation for every refusal reason, in both languages", () => {
    for (const locale of ["fr", "en"] as const) {
      const messages = REASONS.map((reason) => message(reason, [], {}, locale));

      expect(new Set(messages).size).toBe(REASONS.length);
      expect(messages.every((text) => text.length > 20)).toBe(true);
    }
  });

  it("explains a closed window with its dates, or with the next opening when known", () => {
    expect(message("window_closed")).toContain("1er juillet au 31 août");
    expect(message("window_closed", [], { nextWindowOpensOn: new Date(Date.UTC(2025, 0, 1)) })).toBe(
      "Mercato fermé : la prochaine fenêtre ouvre le 1er janvier 2025.",
    );
    expect(message("window_closed", [], { nextWindowOpensOn: new Date(Date.UTC(2025, 0, 1)) }, "en")).toBe(
      "Transfer window closed: the next window opens on 1 January 2025.",
    );
  });

  it("tells what the player asks, or that the club's reputation is the problem", () => {
    expect(message("player_refused", ["wage_too_low"], { minimumWage: 2_400_000 })).toBe(
      "Le joueur refuse : il demande au moins 2,4 M€ par saison.",
    );
    expect(message("player_refused", ["wage_too_low"], { minimumWage: 2_400_000 }, "en")).toBe(
      "The player refuses: he wants at least €2.4m per season.",
    );
    expect(message("player_refused", ["club_reputation_too_low"])).toContain("réputation");
    expect(message("player_refused", ["club_reputation_too_low"], {}, "en")).toContain("reputation");
  });

  it("gives the amounts of a refusal for budget, wages or price", () => {
    expect(message("insufficient_budget", [], { fee: 120_000_000, budget: 45_000_000 })).toBe(
      "Budget insuffisant : l'indemnité de 120 M€ dépasse ton budget transferts de 45 M€.",
    );
    expect(message("insufficient_budget", [], { fee: 120_000_000, budget: 45_000_000 }, "en")).toBe(
      "Insufficient budget: the fee of €120m exceeds your transfer budget of €45m.",
    );
    expect(message("wage_budget_exceeded", [], { wage: 3_000_000, wageRoom: -500_000 })).toBe(
      "Masse salariale dépassée : 3 M€ par saison, pour une marge restante de 0 €.",
    );
    expect(message("club_refused", ["fee_too_low"], { clubName: "FC Barcelona", askingPrice: 18_500_000 })).toBe(
      "FC Barcelona refuse : il demande au moins 18,5 M€.",
    );
    expect(message("club_refused", ["fee_too_low"], { clubName: "FC Barcelona", askingPrice: 18_500_000 }, "en")).toBe(
      "FC Barcelona refuses: they want at least €18.5m.",
    );
  });

  it("names the selling club in general terms when it is not known", () => {
    expect(message("club_refused")).toBe("Le club vendeur refuse : l'indemnité proposée est inférieure à son prix.");
    expect(message("club_refused", [], {}, "en")).toBe("The selling club refuses: the fee offered is below their price.");
  });

  it("tells a player who left the squad from one who left the market", () => {
    expect(message("not_available")).toContain("effectif");
    expect(message("not_available", [], { target: "market" })).toContain("plus disponible");
    expect(message("not_available", [], {}, "en")).toContain("squad");
    expect(message("not_available", [], { target: "market" }, "en")).toContain("no longer available");
  });
});
