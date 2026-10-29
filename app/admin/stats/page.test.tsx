import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AdminStats } from "@/src/db/stats";
import type { Locale } from "@/src/i18n/locale";

// The page outside a request: its viewer is the administrator, its figures fixed, its language set by each test.
const language = vi.hoisted(() => ({ current: "fr" as Locale }));

vi.mock("@/src/auth/current-user", () => ({ getCurrentUser: async () => ({ id: "admin" }), isAdmin: () => true }));
vi.mock("@/src/db/client", () => ({ prisma: {} }));
vi.mock("@/src/db/stats", () => ({
  STATS_DAYS: 14,
  getAdminStats: async (): Promise<AdminStats> => ({
    usersByKind: { anonymous: 3, registered: 2 },
    saves: 7,
    newUsersPerDay: [{ day: "2026-10-27", users: 4 }],
    cohorts: [{ day: "2026-10-27", users: 4, day1: 1, day7: null }],
    databaseBytes: 3.5 * 1024 * 1024,
    largestTables: [{ table: "PlayerSave", data: 1024 * 1024, indexes: 512 * 1024, toast: 0, total: 1.5 * 1024 * 1024, dead: 0 }],
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

  it("are in English, sizes in MB", async () => {
    const markup = await render("en");
    for (const text of ["Statistics", "Google accounts", "New users and retention, last 14 days (UTC)", "D+1", "Indexes"]) {
      expect(markup).toContain(text);
    }
    expect(markup).toContain("Database: 3.5 MB");
    expect(markup).toContain("1 (25%)");
    expect(markup).not.toMatch(/Statistiques|Utilisateurs|Données/);
  });
});
