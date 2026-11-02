import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChallengePageView, ChallengeRankingRow } from "@/src/db/challenge-view";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { OwnChallengeCard } from "./own-challenge-card";

// The form's own button, without its Server Action, which reads the database: what the card asks of it is enough here.
vi.mock("@/app/challenge/_components/play-challenge-form", () => ({
  PlayChallengeForm: ({ weekKey, variant }: { weekKey: string; variant?: string }) => (
    <button data-testid="challenge-play" data-week={weekKey} data-variant={variant} />
  ),
}));

const ranked = (rank: number, points: number, isViewer: boolean): ChallengeRankingRow => ({
  rank,
  name: "Camille",
  points,
  goalDiff: 4,
  goalsFor: 12,
  isViewer,
});

const OUTSIDE_RANKING: ChallengeRankingRow = { ...ranked(1, 14, true), rank: null, name: null };

const VIEW: ChallengePageView = {
  weekKey: "2026-W45",
  weekNumber: 45,
  horizon: 10,
  endsAt: new Date("2026-11-09T00:00:00Z"),
  savesPurgedAt: new Date("2026-11-10T00:00:00Z"),
  club: { name: "Picardie SC", competition: null, primaryColor: "#000000" },
  full: false,
  own: null,
  ranking: [],
  previous: null,
};

const PLAYING = { saveId: "save-1", matchdaysPlayed: 7, submitted: false };
const SUBMITTED = { saveId: "save-1", matchdaysPlayed: 10, submitted: true };

const render = (view: Partial<ChallengePageView>, locale: Locale = "fr") =>
  renderToStaticMarkup(inLanguage(<OwnChallengeCard view={{ ...VIEW, ...view }} />, locale));

const ACTIONS = ["challenge-resume", "challenge-play", "challenge-played", "challenge-full"];

/** The actions and reasons a card shows: one of each case, never two. */
const shown = (markup: string) => ACTIONS.filter((testId) => markup.includes(`data-testid="${testId}"`));

describe("the card « Ta partie »", () => {
  it("shows a save in progress with its matchdays on a bar, and no score", () => {
    const markup = render({ own: PLAYING, ranking: [ranked(1, 19, false)] });
    expect(markup).toContain("Journée 7 / 10");
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="7"');
    expect(markup).toContain('aria-valuemax="10"');
    expect(markup).toContain("width:70%");
    expect(markup).toContain('href="/saves/save-1"');
    expect(markup).toContain("Reprendre ma partie");
    expect(markup).not.toContain("challenge-own-score");
    expect(markup).not.toContain("Score enregistré");
    expect(shown(markup)).toEqual(["challenge-resume"]);
  });

  it("shows a submitted save's score and rank on a full bar, then the way back to it", () => {
    const markup = render({ own: SUBMITTED, ranking: [ranked(1, 19, false), ranked(2, 16, false), ranked(3, 14, true)] });
    expect(markup).toContain("Journée 10 / 10");
    expect(markup).toContain("width:100%");
    expect(markup).toContain("14 pts · 3e");
    expect(markup).toContain("Score enregistré");
    expect(shown(markup)).toEqual(["challenge-resume"]);
  });

  it("gives a first place and a single point their own forms, in both languages", () => {
    expect(render({ own: SUBMITTED, ranking: [ranked(1, 1, true)] })).toContain("1 pt · 1er");
    const english = render({ own: SUBMITTED, ranking: [ranked(3, 14, true)] }, "en");
    expect(english).toContain("14 pts · 3rd");
    expect(english).toContain("Matchday 10 / 10");
    expect(english).toContain("Score recorded");
    expect(english).toContain("Resume my career");
  });

  it("gives an anonymous player points without a rank", () => {
    const markup = render({ own: SUBMITTED, ranking: [ranked(1, 19, false), OUTSIDE_RANKING] });
    expect(markup).toMatch(/data-testid="challenge-own-score"[^>]*>14 pts</);
    expect(markup).toContain("Score enregistré");
  });

  it("says the challenge is played to a player without their save, with no way to start again", () => {
    const markup = render({ own: { ...SUBMITTED, saveId: null } });
    expect(markup).toContain("Tu as déjà joué le défi de cette semaine.");
    expect(markup).not.toContain('role="progressbar"');
    expect(shown(markup)).toEqual(["challenge-played"]);
  });

  it("says the week is full, without a button", () => {
    const markup = render({ full: true });
    expect(markup).toContain("Défi complet cette semaine, reviens lundi");
    expect(shown(markup)).toEqual(["challenge-full"]);
  });

  it("offers the challenge in the screen's orange, with the day its save is deleted", () => {
    const markup = render({});
    expect(markup).toContain('data-week="2026-W45"');
    expect(markup).toContain('data-variant="club"');
    expect(markup).toContain("Partie de défi supprimée le mardi 10/11");
    expect(markup).not.toContain("challenge-own-progress");
    expect(shown(markup)).toEqual(["challenge-play"]);
  });
});
