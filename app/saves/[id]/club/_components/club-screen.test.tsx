import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/src/auth/current-user";
import type { ChallengePageView, ChallengeRankingRow } from "@/src/db/challenge-view";
import type { SeasonResultView } from "@/src/db/season-results";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage, testTranslator } from "@/src/i18n/test-intl";
import { ClubChallenge } from "./club-challenge";
import { ClubFinancesCard } from "./club-finances";
import { ClubHonours } from "./club-honours";
import { ClubSettings } from "./club-settings";

// The buttons alone are rendered here: a Server Action needs a request.
vi.mock("@/app/actions", () => ({ setLanguageAction: vi.fn(), signInWithGoogleAction: vi.fn(), signOutAction: vi.fn() }));

const render = (card: ReactNode, locale?: Locale): string => renderToStaticMarkup(inLanguage(card, locale));

/** The text of the element of a test id, null without one; the first of its elements when it has others inside. */
const textOf = (markup: string, testId: string): string | null =>
  new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`).exec(markup)?.[1] ?? null;

describe("the Club screen's head", () => {
  it("counts the manager's seasons in both languages", () => {
    const manager = (locale: Locale, season: number) => testTranslator(locale, "club")("manager", { manager: "Alexis", season });

    expect([1, 2, 3].map((season) => manager("fr", season))).toEqual([
      "Manager : Alexis · 1re saison",
      "Manager : Alexis · 2e saison",
      "Manager : Alexis · 3e saison",
    ]);
    expect([1, 2, 3, 11].map((season) => manager("en", season))).toEqual([
      "Manager: Alexis · 1st season",
      "Manager: Alexis · 2nd season",
      "Manager: Alexis · 3rd season",
      "Manager: Alexis · 11th season",
    ]);
  });
});

describe("the finances", () => {
  const WITHIN = { budget: 24_500_000, wageBudget: 70_000_000, payroll: 61_000_000, wageRoom: 9_000_000 };
  const ABOVE = { budget: 2_000_000, wageBudget: 40_000_000, payroll: 41_500_000, wageRoom: -1_500_000 };

  it("gives the budget, the payroll against the wage budget and what it leaves", () => {
    const markup = render(<ClubFinancesCard finances={WITHIN} />);

    expect(textOf(markup, "club-budget")).toBe("24,5 M€");
    expect(textOf(markup, "club-payroll")).toBe("61,0 / 70,0 M€");
    expect(textOf(markup, "club-wage-room")).toBe("9 M€ de marge");
    expect(markup).toContain('aria-valuenow="87"');
    expect(markup).toContain("width:87%");
    expect(markup).not.toContain("text-warning");
    expect(textOf(render(<ClubFinancesCard finances={WITHIN} />, "en"), "club-wage-room")).toBe("€9m wage room");
  });

  it("fills the bar above the wage budget, and tells the overrun in place of the room", () => {
    const markup = render(<ClubFinancesCard finances={ABOVE} />);

    expect(textOf(markup, "club-wage-room")).toBe("1,5 M€ de dépassement");
    expect(markup).toContain('aria-valuenow="100"');
    expect(markup).toContain("width:100%");
    expect(markup.match(/text-warning/g)).toHaveLength(2);
  });

  it("warns of a payroll near the wage budget as the dashboard does, the room staying what it is", () => {
    const markup = render(<ClubFinancesCard finances={{ budget: 0, wageBudget: 70_000_000, payroll: 64_000_000, wageRoom: 6_000_000 }} />);

    expect(markup.match(/text-warning/g)).toHaveLength(1);
    expect(textOf(markup, "club-wage-room")).toBe("6 M€ de marge");
  });

  it("shows an empty bar without a wage budget or a payroll", () => {
    expect(render(<ClubFinancesCard finances={{ budget: 0, wageBudget: 0, payroll: 0, wageRoom: 0 }} />)).toContain('aria-valuenow="0"');
  });
});

describe("the week's challenge", () => {
  const row = (rank: number | null, name: string | null, points: number, isViewer = false): ChallengeRankingRow => ({
    rank,
    name,
    points,
    goalDiff: 0,
    goalsFor: 0,
    isViewer,
  });

  const view = (own: ChallengePageView["own"], ranking: ChallengeRankingRow[] = []): ChallengePageView => ({
    weekKey: "2026-W45",
    weekNumber: 45,
    horizon: 10,
    endsAt: new Date("2026-11-09T00:00:00Z"),
    savesPurgedAt: new Date("2026-11-10T00:00:00Z"),
    club: { name: "Stade Test", competition: null, primaryColor: "#000000" },
    full: false,
    own,
    ranking,
    previous: null,
  });

  const card = (challenge: ChallengePageView, locale?: Locale): string => render(<ClubChallenge saveId="save" view={challenge} />, locale);

  it("gives the club of the week and its matchdays before the player has played", () => {
    expect(textOf(card(view(null)), "club-challenge-status")).toBe("Stade Test · 10 journées");
    expect(textOf(card(view(null), "en"), "club-challenge-status")).toBe("Stade Test · 10 matchdays");
  });

  it("gives the matchday of a challenge under way, and nothing more to play once its save is gone", () => {
    const playing = { saveId: "challenge-save", matchdaysPlayed: 7, submitted: false };

    expect(textOf(card(view(playing)), "club-challenge-status")).toBe("Journée 7 / 10");
    expect(textOf(card(view({ ...playing, saveId: null })), "club-challenge-status")).toBe("Tu as déjà joué le défi de cette semaine.");
  });

  it("gives the score and the rank once recorded, an anonymous player's without a rank", () => {
    const own = { saveId: "challenge-save", matchdaysPlayed: 10, submitted: true };
    const ranked = view(own, [row(1, "Ada", 24), row(2, "Alexis", 21, true)]);
    const anonymous = view(own, [row(1, "Ada", 24), row(null, null, 21, true)]);

    expect(textOf(card(ranked), "club-challenge-status")).toBe("21 points · 2e provisoire");
    expect(textOf(card(ranked, "en"), "club-challenge-status")).toBe("21 points · 2nd so far");
    expect(textOf(card(anonymous), "club-challenge-status")).toBe("21 points");
  });

  it("has no ranking without an entry, and leads to the challenge, the screen's one full orange action", () => {
    const markup = card(view(null));

    expect(markup).not.toContain('data-testid="club-challenge-ranking"');
    expect(textOf(markup, "club-challenge-link")).toBe("Voir le défi");
    expect(markup).toContain('href="/saves/save/challenge"');
    expect(markup.match(/bg-\(--club\)/g)).toHaveLength(1);
  });

  it("shows the three first lines of the ranking, then the player's further down, for a computer only", () => {
    const ranking = [row(1, "Ada", 24), row(2, null, 22), row(3, "Grace", 21), row(4, "Linus", 20), row(5, "Alexis", 19, true)];
    const markup = card(view({ saveId: "challenge-save", matchdaysPlayed: 10, submitted: true }, ranking));
    const lines = /data-testid="club-challenge-ranking"[^>]*>(.*?)<\/ul>/.exec(markup)?.[1] ?? "";

    expect(markup).toMatch(/data-testid="club-challenge-ranking"[^>]*class="[^"]*max-lg:hidden/);
    expect([...lines.matchAll(/<li.*?<\/li>/g)].map(([line]) => line.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())).toEqual([
      "1 Ada 24 pts",
      "2 Anonyme 22 pts",
      "3 Grace 21 pts",
      "5 Alexis 19 pts",
    ]);
    expect(lines.match(/data-viewer/g)).toHaveLength(1);
  });

  it("calls an anonymous player's line « Toi », without a rank", () => {
    const markup = card(view({ saveId: null, matchdaysPlayed: 10, submitted: true }, [row(1, "Ada", 24), row(null, null, 21, true)]));

    expect(markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).toContain("— Toi 21 pts");
  });
});

describe("the honours", () => {
  const season = (startYear: number, rank: number): SeasonResultView => ({
    seasonId: `season-${startYear}`,
    startYear,
    competitionCode: "fr.1",
    rank,
    champion: rank === 1,
    promoted: false,
    relegated: false,
    cupRound: null,
    cupWinner: false,
    points: 64,
    played: 34,
    won: 19,
    drawn: 7,
    lost: 8,
    goalsFor: 55,
    goalsAgainst: 38,
    formation: "4-3-3",
    bestPlayer: null,
  });

  const card = (seasons: SeasonResultView[], locale?: Locale): string => render(<ClubHonours saveId="save" seasons={seasons} />, locale);

  it("says so without a completed season, without a card", () => {
    const markup = card([]);

    expect(textOf(markup, "club-honours-empty")).toContain("Aucune saison terminée");
    expect(markup).not.toContain("<img");
  });

  it("links the latest season to its card, previewed for a computer only and named by the line beside it", () => {
    const markup = card([season(2026, 6)]);
    const line = /<a [^>]*data-testid="club-honours-season-2026".*?<\/a>/.exec(markup)?.[0] ?? "";

    expect(markup).toContain('href="/saves/save/seasons/season-2026"');
    expect(line.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).toBe("6e 2026-27 France — Division 1 · 64 pts Carte");
    expect(markup).toMatch(/<img alt="" [^>]*loading="lazy"[^>]*class="[^"]*max-lg:hidden/);
    expect(markup).toContain("/saves/save/seasons/season-2026/card?format=square");
    expect(markup).not.toContain('data-testid="club-honours-all"');
  });

  it("shows the three latest seasons, and the way to the others", () => {
    const markup = card([season(2029, 1), season(2028, 2), season(2027, 3), season(2026, 4)]);

    expect([...markup.matchAll(/club-honours-season-(\d+)/g)].map((match) => match[1])).toEqual(["2029", "2028", "2027"]);
    expect(markup).toContain('data-testid="club-honours-all"');
    expect(markup.replace(/<[^>]+>/g, " ")).toContain("Champion");
    expect(card([season(2029, 1)], "en").replace(/<[^>]+>/g, " ")).toContain("Champions");
  });
});

describe("the settings", () => {
  const user: CurrentUser = { id: "user", kind: "ANONYMOUS", lastSeenAt: new Date(0), email: null, name: null, image: null };
  const account: CurrentUser = { ...user, kind: "REGISTERED", name: "Alexis Martin", email: "alexis@example.com" };

  it("offers an anonymous player a Google account, their save being tied to this browser", () => {
    const markup = render(<ClubSettings user={user} ownedSaves={1} />);

    expect(markup).toContain('data-testid="google-sign-in"');
    expect(markup).toContain("Ta partie est liée à ce navigateur.");
    expect(markup).not.toContain('data-testid="sign-out"');
    expect(markup.replace(/<[^>]+>/g, " ")).toContain("1 sur 1 utilisée");
  });

  it("names a Google account, with its e-mail and the way out, and counts up to its three saves", () => {
    const markup = render(<ClubSettings user={account} ownedSaves={2} />);

    expect(textOf(markup, "account-name")).toBe("Alexis Martin");
    expect(markup).toContain("alexis@example.com");
    expect(textOf(markup, "sign-out")).toBe("Se déconnecter");
    expect(markup).not.toContain('data-testid="google-sign-in"');
    expect(markup.replace(/<[^>]+>/g, " ")).toContain("2 sur 3 utilisées");
    expect(render(<ClubSettings user={account} ownedSaves={2} />, "en").replace(/<[^>]+>/g, " ")).toContain("2 of 3 used");
  });

  it("does not repeat an e-mail that stands in for a name", () => {
    const markup = render(<ClubSettings user={{ ...account, name: null }} ownedSaves={0} />);

    expect(textOf(markup, "account-name")).toBe("alexis@example.com");
    expect(markup.match(/alexis@example\.com/g)).toHaveLength(1);
  });

  it("has the language switch, the saves and the privacy page's links", () => {
    const markup = render(<ClubSettings user={user} ownedSaves={1} />);

    expect(textOf(markup, "language-fr")).toBe("Français");
    expect(textOf(markup, "language-en")).toBe("English");
    expect(markup).toMatch(/aria-pressed="true"[^>]*data-testid="language-fr"/);
    expect(markup).toMatch(/aria-pressed="false"[^>]*data-testid="language-en"/);
    expect(markup).toMatch(/data-testid="settings-change-save"[^>]*href="\/"/);
    expect(markup).toMatch(/data-testid="settings-privacy"[^>]*href="\/privacy"/);
  });
});
