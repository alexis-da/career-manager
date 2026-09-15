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

  it("explains a closed window with its dates", () => {
    expect(refusalMessage("window_closed")).toContain("1er juillet au 31 août");
  });

  it("tells what the player asks, or that the club's reputation is the problem", () => {
    expect(refusalMessage("player_refused", ["wage_too_low"], 2_400_000)).toBe(
      "Le joueur refuse : il demande au moins 2,4 M€ par saison.",
    );
    expect(refusalMessage("player_refused", ["club_reputation_too_low"])).toContain("réputation");
  });
});
