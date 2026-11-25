import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PlayerProfile } from "@/src/db/players";
import { inLanguage } from "@/src/i18n/test-intl";
import { contractEndKey, PlayerSheet } from "./player-sheet";

// The sheet's end-of-contract choice, drawn without its Server Action, under the address of a save.
vi.mock("@/app/saves/[id]/squad/actions", () => ({
  releasePlayerAction: vi.fn(),
  renewContractAction: vi.fn(),
  sellPlayerAction: vi.fn(),
  setContractChoiceAction: vi.fn(),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useParams: () => ({ id: "save-1" }),
  useRouter: () => ({ refresh: vi.fn() }),
}));

type Contract = Partial<Pick<PlayerProfile, "contractExpiring" | "contractChoice" | "contractIntention" | "assistantIntention">>;

/** A player whose contract ends with the season (30 June 2027), at the managed club or at an AI club. */
const profile = (managed: boolean, contract: Contract = {}): PlayerProfile => ({
  id: "player-1",
  playerKey: "olympique-lyonnais#5",
  firstName: "Yann",
  lastName: "Martin",
  nationality: "France",
  birthDate: new Date(Date.UTC(1998, 2, 1)),
  age: 28,
  position: "CM",
  clubName: managed ? "Rhône FC" : "Loire FC",
  clubColors: null,
  overall: 70,
  potential: 72,
  form: 50,
  fitness: 100,
  fitnessAtNextMatch: false,
  discipline: null,
  marketValue: 6_000_000,
  wage: 1_200_000,
  contractUntil: new Date(Date.UTC(2027, 5, 30)),
  injuredUntil: null,
  contractExpiring: true,
  managed,
  // The managed club's: its assistant would let him go; an AI club's: nothing of the kind.
  contractChoice: null,
  contractIntention: managed ? "leave" : null,
  assistantIntention: managed ? "leave" : null,
  arrivedThisSeason: false,
  progression: { last: null, outlook: null, history: [] },
  attributes: { pace: 70, shooting: 70, passing: 70, dribbling: 70, defending: 70, physical: 70, goalkeeping: 1 },
  seasonStats: { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 },
  transfers: [],
  international: { caps: 0, goals: 0, calledFor: null, injuredWith: null, titles: [] },
  ...contract,
});

const render = (managed: boolean, locale: "fr" | "en" = "fr", contract: Contract = {}): string =>
  renderToStaticMarkup(
    inLanguage(<PlayerSheet profile={profile(managed, contract)} startYear={2026} footer={null} onClose={() => undefined} />, locale),
  );

/** What the sheet says the season's turn will do with the contract. */
const leavingOf = (markup: string): string | null =>
  /data-testid="player-leaving-free"[^>]*>([^<]*)</.exec(markup)?.[1]?.replaceAll("&#x27;", "'") ?? null;

describe("PlayerSheet", () => {
  it("shows no wage: the contract's end and the market value only", () => {
    for (const managed of [true, false]) {
      const contract = /data-testid="player-sheet-contract"[\s\S]*?<\/dl>/.exec(render(managed))?.[0] ?? "";
      expect(contract).toContain("Fin de contrat");
      expect(contract).toContain("Valeur marchande");
      expect(contract).not.toContain("Salaire");
      expect(contract).not.toContain("/ an");
      expect(render(managed, "en")).not.toContain("Wage");
    }
  });

  it("tells what the turn will do with a managed club's contract ending with the season: the assistant's rule, or his player's choice", () => {
    expect(leavingOf(render(true))).toBe("Ton adjoint le laissera partir libre en fin de saison.");
    expect(leavingOf(render(true, "fr", { contractIntention: "renew", assistantIntention: "renew" }))).toBe(
      "Ton adjoint le prolongera en fin de saison.",
    );
    expect(leavingOf(render(true, "fr", { contractChoice: "RENEW", contractIntention: "renew" }))).toBe("Il sera prolongé en fin de saison.");
    expect(leavingOf(render(true, "fr", { contractChoice: "LEAVE" }))).toBe("Sans prolongation, il partira libre en fin de saison.");
    // Its player keeps the contracts: without his choice, he leaves free.
    expect(leavingOf(render(true, "fr", { assistantIntention: null }))).toBe("Sans prolongation, il partira libre en fin de saison.");
    expect(leavingOf(render(true, "en"))).toBe("Your assistant will let him go on a free at the end of the season.");
    expect(leavingOf(render(true, "en", { assistantIntention: null }))).toBe(
      "Without an extension, he will leave on a free at the end of the season.",
    );
    // A renewal to come is no warning.
    expect(render(true, "fr", { contractIntention: "renew", assistantIntention: "renew" })).toMatch(
      /data-testid="player-leaving-free" data-intention="renew" class="text-xs text-muted-foreground"/,
    );
  });

  it("asks what to do at the end of the contract, on the sheet of a managed club's player whose contract ends this season", () => {
    const markup = render(true);
    expect(markup).toContain('data-testid="player-contract-choice"');
    expect(markup).toContain("Ton adjoint décide : il le laissera partir");
    expect(render(true, "fr", { contractExpiring: false })).not.toContain("player-contract-choice");
  });

  it("never says so of an AI club's player, whose club decides his contract", () => {
    const html = render(false);
    expect(html).not.toContain("player-leaving-free");
    expect(html).not.toContain("partira libre");
    expect(html).not.toContain("player-contract-choice");
    // His contract's end is still shown.
    expect(html).toContain('data-testid="player-sheet-contract"');
  });

  it("names the sheet's sentence after the choice first, the assistant's intention then", () => {
    expect(contractEndKey({ contractChoice: "RENEW", assistantIntention: "leave" })).toBe("renew");
    expect(contractEndKey({ contractChoice: "LEAVE", assistantIntention: "renew" })).toBe("leave");
    expect(contractEndKey({ contractChoice: null, assistantIntention: "renew" })).toBe("assistantRenew");
    expect(contractEndKey({ contractChoice: null, assistantIntention: "leave" })).toBe("assistantLeave");
    expect(contractEndKey({ contractChoice: null, assistantIntention: null })).toBe("leave");
  });
});
