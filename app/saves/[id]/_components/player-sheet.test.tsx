import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlayerProfile } from "@/src/db/players";
import { inLanguage } from "@/src/i18n/test-intl";
import { PlayerSheet } from "./player-sheet";

/** A player whose contract ends with the season (30 June 2027), at the managed club or at an AI club. */
const profile = (managed: boolean): PlayerProfile => ({
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
  arrivedThisSeason: false,
  attributes: { pace: 70, shooting: 70, passing: 70, dribbling: 70, defending: 70, physical: 70, goalkeeping: 1 },
  seasonStats: { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 },
  transfers: [],
  international: { caps: 0, goals: 0, calledFor: null, injuredWith: null, titles: [] },
});

const render = (managed: boolean, locale: "fr" | "en" = "fr"): string =>
  renderToStaticMarkup(
    inLanguage(<PlayerSheet profile={profile(managed)} startYear={2026} footer={null} onClose={() => undefined} />, locale),
  );

describe("PlayerSheet", () => {
  it("tells that a managed club's player leaves on a free without an extension", () => {
    const html = render(true);
    expect(html).toContain('data-testid="player-leaving-free"');
    expect(html).toContain("Sans prolongation, il partira libre en fin de saison.");
    expect(render(true, "en")).toContain("Without an extension, he will leave on a free at the end of the season.");
  });

  it("never says so of an AI club's player, whose club decides his contract", () => {
    const html = render(false);
    expect(html).not.toContain("player-leaving-free");
    expect(html).not.toContain("partira libre");
    // His contract's end is still shown.
    expect(html).toContain('data-testid="player-sheet-contract"');
  });
});
