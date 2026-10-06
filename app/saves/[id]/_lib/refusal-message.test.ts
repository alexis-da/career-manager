import { describe, expect, it } from "vitest";
import type { TransferRefusal } from "@/src/db/transfers";
import { refusalMessage } from "./refusal-message";

const REASONS: TransferRefusal[] = [
  "window_closed",
  "not_available",
  "insufficient_budget",
  "wage_budget_exceeded",
  "club_refused",
  "player_refused",
  "no_offer",
];

describe("refusalMessage", () => {
  it("gives a distinct explanation for every refusal reason", () => {
    const messages = REASONS.map((reason) => refusalMessage(reason));

    expect(new Set(messages).size).toBe(REASONS.length);
    expect(messages.every((message) => message.length > 20)).toBe(true);
  });

  it("explains a closed window with its dates, or with the next opening when known", () => {
    expect(refusalMessage("window_closed")).toContain("1er juillet au 31 août");
    expect(refusalMessage("window_closed", [], { nextWindowOpensOn: new Date(Date.UTC(2025, 0, 1)) })).toBe(
      "Mercato fermé : la prochaine fenêtre ouvre le 1er janvier 2025.",
    );
  });

  it("tells what the player asks, or that the club's reputation is the problem", () => {
    expect(refusalMessage("player_refused", ["wage_too_low"], { minimumWage: 2_400_000 })).toBe(
      "Le joueur refuse : il demande au moins 2,4 M€ par saison.",
    );
    expect(refusalMessage("player_refused", ["club_reputation_too_low"])).toContain("réputation");
  });

  it("gives the amounts of a refusal for budget, wages or price", () => {
    expect(refusalMessage("insufficient_budget", [], { fee: 120_000_000, budget: 45_000_000 })).toBe(
      "Budget insuffisant : l'indemnité de 120 M€ dépasse votre budget transferts de 45 M€.",
    );
    expect(refusalMessage("wage_budget_exceeded", [], { wage: 3_000_000, wageRoom: -500_000 })).toBe(
      "Masse salariale dépassée : 3 M€ par saison, pour une marge restante de 0 €.",
    );
    expect(refusalMessage("club_refused", ["fee_too_low"], { clubName: "FC Barcelona", askingPrice: 18_500_000 })).toBe(
      "FC Barcelona refuse : il demande au moins 18,5 M€.",
    );
  });

  it("tells a player who left the squad from one who left the market", () => {
    expect(refusalMessage("not_available")).toContain("effectif");
    expect(refusalMessage("not_available", [], { target: "market" })).toContain("plus disponible");
  });
});
