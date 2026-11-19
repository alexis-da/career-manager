import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CoachOffer } from "@/src/db/national-view";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { CoachOfferCard } from "./coach-offer-card";

// The card is drawn without its Server Actions, which read the database, nor the App Router they lead on with.
vi.mock("@/app/saves/[id]/nation/actions", () => ({ acceptCoachOfferAction: vi.fn(), declineCoachOfferAction: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

/** Portugal, 4th of the 14, offering its post for a Hemispheres cycle: the semi-finals as objective. */
const OFFER: CoachOffer = {
  code: "POR",
  rank: 4,
  tournament: "int.world",
  tournamentYear: 2030,
  objective: 2,
  nextBreak: { from: new Date(Date.UTC(2028, 8, 1)), to: new Date(Date.UTC(2028, 8, 5)) },
};

const render = (offer: CoachOffer, locale?: Locale): string =>
  renderToStaticMarkup(inLanguage(<CoachOfferCard saveId="save-1" offer={offer} />, locale));

/** The text of the element of a test id, its tags dropped and its apostrophes as React escapes them read back. */
function textOf(markup: string, testId: string, tag = "p"): string {
  const found = new RegExp(`<${tag}[^>]*data-testid="${testId}"[^>]*>([\\s\\S]*?)</${tag}>`).exec(markup)?.[1];
  if (found === undefined) {
    throw new Error(`No ${testId} in the markup`);
  }
  return found
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .trim();
}

describe("a federation's offer on the season's start screen", () => {
  it("says who offers its post, the objective, that the club stays his, then its two answers, none in orange", () => {
    const markup = render(OFFER);

    expect(markup).toMatch(/data-testid="coach-offer" data-nation="POR"/);
    expect(textOf(markup, "coach-offer-proposal")).toBe("La fédération du Portugal te propose son poste de sélectionneur.");
    expect(textOf(markup, "coach-offer-objective")).toBe(
      "Objectif : se qualifier pour la Coupe des Hémisphères 2030, puis atteindre les demi-finales",
    );
    expect(markup).toContain("Tu gardes ton club : la sélection joue pendant les trêves et en juin.");
    expect(textOf(markup, "coach-offer-view", "button")).toBe("Voir l'offre");
    expect(textOf(markup, "coach-offer-decline", "button")).toBe("Pas maintenant");
    // The screen's orange stays « Valider mon objectif »: the sheet's « Accepter le poste » is shut until it opens.
    expect(markup).not.toContain("bg-(--club)");
    expect(markup).not.toContain("coach-offer-sheet");
  });

  it("words each objective, and a nation without a tournament this cycle", () => {
    const objective = (offer: Partial<CoachOffer>) => textOf(render({ ...OFFER, ...offer }), "coach-offer-objective");

    expect(objective({ code: "FRA", tournament: "int.eu", tournamentYear: 2028, objective: 1 })).toBe(
      "Objectif : se qualifier pour la Coupe du Vieux Continent 2028",
    );
    expect(objective({ objective: 3 })).toBe("Objectif : se qualifier pour la Coupe des Hémisphères 2030, puis atteindre la finale");
    expect(objective({ code: "MAR", tournament: "int.eu", tournamentYear: 2028, objective: null })).toBe(
      "Pas de tournoi pour le Maroc ce cycle : prépare le suivant",
    );
  });

  it("speaks British English", () => {
    const markup = render({ ...OFFER, code: "NED" }, "en");

    expect(textOf(markup, "coach-offer-proposal")).toBe("The federation of the Netherlands offers you the job of national coach.");
    expect(textOf(markup, "coach-offer-objective")).toBe("Objective: qualify for the Hemispheres Cup 2030, then reach the semi-finals");
    expect(markup).toContain("You keep your club: the national team plays during the breaks and in June.");
    expect(textOf(markup, "coach-offer-view", "button")).toBe("See the offer");
    expect(textOf(markup, "coach-offer-decline", "button")).toBe("Not now");
  });
});
