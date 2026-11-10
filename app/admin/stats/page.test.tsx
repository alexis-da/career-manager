import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AdminStats } from "@/src/db/stats";
import type { Locale } from "@/src/i18n/locale";

// The page outside a request: its viewer is the administrator, its figures fixed, its language set by each test, without
// the frame of the pages outside a save, which needs the Server Actions of its language switcher.
const language = vi.hoisted(() => ({ current: "fr" as Locale }));

vi.mock("@/app/_components/public-page", () => ({ PublicPage: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/src/auth/current-user", () => ({ getCurrentUser: async () => ({ id: "admin" }), isAdmin: () => true }));
vi.mock("@/src/db/client", () => ({ prisma: {} }));
vi.mock("@/src/db/stats", () => ({
  STATS_DAYS: 14,
  getAdminStats: async (): Promise<AdminStats> => ({
    usersByKind: { anonymous: 3, registered: 2 },
    saves: 7,
    newUsersPerDay: [{ day: "2026-10-27", users: 4 }],
    cohorts: [{ day: "2026-10-27", users: 4, day1: 1, day7: null }],
    firstSteps: [
      { day: "2026-10-26", saves: 8, lineups: 3, firstMatches: 6, tenMatches: 2 },
      { day: "2026-10-27", saves: 2, lineups: 0, firstMatches: 1, tenMatches: 0 },
    ],
    databaseBytes: 3.5 * 1024 * 1024,
    largestTables: [
      {
        table: "PlayerSave",
        data: 1024 * 1024,
        indexes: 512 * 1024,
        toast: 0,
        total: 1.5 * 1024 * 1024,
        // A quarter of the rows dead, three updates in four in their page; four autovacuums, no autoanalyze yet.
        live: 750_000,
        dead: 250_000,
        updates: 400_000,
        hotUpdates: 300_000,
        lastAutovacuum: "2026-10-27T03:12:40.000Z",
        autovacuums: 4,
        lastAutoanalyze: null,
      },
      {
        table: "MatchEvent",
        data: 512 * 1024,
        indexes: 256 * 1024,
        toast: 0,
        total: 0.75 * 1024 * 1024,
        live: 9_000,
        dead: 0,
        updates: 0,
        hotUpdates: 0,
        lastAutovacuum: null,
        autovacuums: 0,
        lastAutoanalyze: "2026-10-27T05:00:00.000Z",
      },
    ],
    serverStartedAt: "2026-10-26T22:05:09.000Z",
  }),
}));
vi.mock("next-intl/server", async () => {
  const { testTranslator } = await import("@/src/i18n/test-intl");
  return {
    getTranslations: async (namespace: "adminStats") => testTranslator(language.current, namespace),
    getLocale: async () => language.current,
  };
});

const render = async (locale: Locale): Promise<string> => {
  language.current = locale;
  const { default: AdminStatsPage } = await import("./page");
  return renderToStaticMarkup(await AdminStatsPage());
};

describe("the administrator's statistics", () => {
  it("are in French, sizes in Mo and shares with a spaced percent sign", async () => {
    const markup = await render("fr");
    for (const text of ["Statistiques", "Comptes Google", "Nouveaux utilisateurs et rétention, 14 derniers jours (UTC)", "J+1"]) {
      expect(markup).toContain(text);
    }
    expect(markup).toContain("Base de données : 3,5 Mo");
    expect(markup).toContain("1 (25 %)");
  });

  it("show how far new saves went, and the share of them that played a match over all the days", async () => {
    const fr = await render("fr");
    expect(fr).toContain("Premiers pas des nouvelles parties, 14 derniers jours complets (UTC)");
    expect(fr).toContain("Sur ces 14 jours : 10 parties, 1er match joué : 7 (70 %)");
    expect(fr).toContain("6 (75 %)");

    const en = await render("en");
    expect(en).toContain("First steps of new careers, last 14 complete days (UTC)");
    expect(en).toContain("Over these 14 days: 10 careers, first match played: 7 (70%)");
  });

  it("are in English, sizes in MB", async () => {
    const markup = await render("en");
    for (const text of ["Statistics", "Google accounts", "New users and retention, last 14 days (UTC)", "D+1", "Indexes"]) {
      expect(markup).toContain(text);
    }
    expect(markup).toContain("Database: 3.5 MB");
    expect(markup).toContain("1 (25%)");
    expect(markup).not.toMatch(/Statistiques|Utilisateurs|Données/);
  });

  it("show the rows and upkeep of the largest tables, since the server started, in French and in English", async () => {
    // The thousands' separator of French, a narrow no-break space, read as a space.
    const fr = (await render("fr")).replace(/[  ]/g, " ");
    for (const text of [
      "Lignes et entretien des plus grosses tables",
      "dernier démarrage du serveur le 26/10 22:05 UTC",
      "750 000",
      "250 000",
      "25 %",
      "75 %",
      "27/10 03:12 · 4 fois",
      "analyse : jamais",
      "analyse : 27/10 05:00",
      ">jamais<",
    ]) {
      expect(fr).toContain(text);
    }
    expect(fr).toMatch(/data-table="PlayerSave" data-live="750000" data-dead="250000" data-autovacuums="4"/);
    // No update yet: no share of them.
    expect(fr).toMatch(/data-table="MatchEvent"[^>]*>(?:(?!<\/tr>).)*>—</);

    const en = await render("en");
    for (const text of [
      "Rows and upkeep of the largest tables",
      "the server last started on 26/10 22:05 UTC",
      "750,000",
      "250,000",
      "25%",
      "75%",
      "27/10 03:12 · 4 times",
      "analysis: never",
      ">never<",
    ]) {
      expect(en).toContain(text);
    }
  });
});
