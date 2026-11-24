import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PlayerProfile } from "@/src/db/players";
import type { SaleQuote } from "@/src/db/transfers";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage, testTranslator } from "@/src/i18n/test-intl";
import { ContractChoiceField, releaseDescription, renewalDescription, saleDescription, SquadPlayerActions } from "./contract-actions";

// The buttons alone are rendered here: a Server Action needs a request.
vi.mock("@/app/saves/[id]/squad/actions", () => ({
  releasePlayerAction: vi.fn(),
  renewContractAction: vi.fn(),
  sellPlayerAction: vi.fn(),
  setContractChoiceAction: vi.fn(),
}));

// The save of the address the sheet opens under (/saves/[id]), none outside the App Router; a refusal reads the page again.
const route: { params: { id: string } | null } = { params: { id: "save-1" } };
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useParams: () => route.params,
  useRouter: () => ({ refresh: vi.fn() }),
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
        terms={{ renewalMinimumWage: 1_000_000, releaseCost: 0, sale, academyUntil: null }}
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

  it("extends a contract now, the length alone to choose, and sells or releases without a word of wages", () => {
    expect(textOf(render(offer()), "renew-contract")).toBe("Prolonger maintenant");
    expect(textOf(render(offer(), "en"), "renew-contract")).toBe("Extend now");
    expect(render(offer())).not.toContain("renewal-wage");

    const t = testTranslator("fr", "contract");
    const tEn = testTranslator("en", "contract");
    expect(renewalDescription(PLAYER, t, "fr")).toBe("Contrat actuel : jusqu'au 30 juin 2029.");
    expect(renewalDescription({ contractUntil: null }, t, "fr")).toBe("Contrat actuel : aucun.");
    expect(renewalDescription(PLAYER, tEn, "en")).toBe("Current contract: until 30 June 2029.");

    expect(releaseDescription({ releaseCost: 1_200_000 }, t, "fr")).toBe(
      "Il deviendra joueur libre. Coût : 1,2 M€, la moitié de ce qui lui reste dû sur son contrat.",
    );
    expect(releaseDescription({ releaseCost: 1_200_000 }, tEn, "en")).toBe(
      "He will become a free agent. Cost: €1.2m, half of what he is still owed on his contract.",
    );

    expect(saleDescription(offer(), t, testTranslator("fr", "refusals"), "fr")).toBe("Meilleure offre : Rhône FC propose 19,9 M€.");
    expect(saleDescription(offer(), tEn, testTranslator("en", "refusals"), "en")).toBe("Best offer: Rhône FC offers €19.9m.");
    expect(saleDescription({ ok: false, reason: "no_offer" }, t, testTranslator("fr", "refusals"), "fr")).not.toContain("€");
  });
});

/** The end-of-contract choice of a player whose contract ends with the season. */
const renderChoice = (player: Partial<Pick<PlayerProfile, "contractChoice" | "assistantIntention">>, locale: Locale = "fr"): string =>
  renderToStaticMarkup(
    inLanguage(
      <ContractChoiceField player={{ id: "player-1", firstName: "Yann", lastName: "Martin", contractChoice: null, assistantIntention: "renew", ...player }} />,
      locale,
    ),
  );

/** Each option of the choice, by its test id: its words, and whether it is checked. */
const optionsOf = (markup: string) =>
  Object.fromEntries(
    [...markup.matchAll(/<label data-testid="(contract-choice-[a-z]+)"[^>]*>(.*?)<\/label>/g)].map(([, testId, body]) => [
      testId,
      { text: body.replace(/<[^>]+>/g, "").replaceAll("&#x27;", "'"), checked: /<input[^>]*checked=""/.test(body) },
    ]),
  );

describe("the end-of-contract choice", () => {
  it("leaves it to the assistant by default, saying what he will do, then lets the player renew or let go", () => {
    const markup = renderChoice({});
    expect(markup).toContain('data-testid="player-contract-choice"');
    expect(markup).toContain('data-choice="ASSISTANT"');
    expect(markup).toContain("À la fin de son contrat :");
    expect(optionsOf(markup)).toEqual({
      "contract-choice-assistant": { text: "Ton adjoint décide : il le prolongera", checked: true },
      "contract-choice-renew": { text: "Le prolonger", checked: false },
      "contract-choice-leave": { text: "Le laisser partir", checked: false },
    });
    expect(optionsOf(renderChoice({ assistantIntention: "leave" }))["contract-choice-assistant"].text).toBe(
      "Ton adjoint décide : il le laissera partir",
    );
    // Radio buttons of the browser's own, a thumb high on a phone, without a drawing.
    expect(markup.match(/type="radio"/g)).toHaveLength(3);
    expect(markup).toContain("max-sm:min-h-11");
    expect(markup).not.toContain("<svg");
  });

  it("checks the player's own choice, and reads the default as a free departure while he keeps the contracts", () => {
    const renewed = optionsOf(renderChoice({ contractChoice: "RENEW", assistantIntention: "leave" }));
    expect(renewed["contract-choice-renew"].checked).toBe(true);
    expect(renewed["contract-choice-assistant"].checked).toBe(false);

    const own = renderChoice({ contractChoice: "LEAVE", assistantIntention: null });
    expect(own).toContain('data-choice="LEAVE"');
    expect(optionsOf(own)["contract-choice-assistant"]).toEqual({ text: "Partir libre (par défaut)", checked: false });
    expect(optionsOf(own)["contract-choice-leave"].checked).toBe(true);

    expect(optionsOf(renderChoice({}, "en"))).toEqual({
      "contract-choice-assistant": { text: "Your assistant decides: he will extend him", checked: true },
      "contract-choice-renew": { text: "Extend him", checked: false },
      "contract-choice-leave": { text: "Let him go", checked: false },
    });
    expect(optionsOf(renderChoice({ assistantIntention: null }, "en"))["contract-choice-assistant"].text).toBe("Leave on a free (default)");
  });

  it("shows nothing outside a save's address", () => {
    route.params = null;
    try {
      expect(renderChoice({})).toBe("");
    } finally {
      route.params = { id: "save-1" };
    }
  });
});
