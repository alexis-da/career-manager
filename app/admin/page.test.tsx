import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AdminDashboard, AdminDay } from "@/src/db/admin-dashboard";
import type { ErrorGroupView, ErrorsSection } from "@/src/db/errors";
import type { Locale } from "@/src/i18n/locale";

// The page outside a request: its viewer is the administrator, its figures fixed, its language set by each test, without
// the frame of the pages outside a save, which needs the Server Actions of its language switcher.
const language = vi.hoisted(() => ({ current: "fr" as Locale }));
const asked = vi.hoisted(() => ({ period: 0 }));

const MB = 1024 * 1024;
const day = (date: string, figures: Partial<AdminDay> = {}): AdminDay => ({
  day: date,
  visits: 0,
  players: 0,
  registered: 0,
  day1: null,
  day7: null,
  active: 0,
  liveMatches: 0,
  simulatedMatches: 0,
  appLaunches: 0,
  databaseBytes: null,
  growth: null,
  purgedUsers: 0,
  purgedSaves: 0,
  purgedOneDayUsers: 0,
  purgedOneDaySaves: 0,
  purgedChallengeSaves: 0,
  ...figures,
});
const journey = (source: string, figures: Partial<AdminDashboard["total"]> = {}): AdminDashboard["total"] => ({
  source,
  visits: 0,
  players: 0,
  careers: 0,
  firstMatches: 0,
  seasonEnds: 0,
  medianMinutesToFirstMatch: null,
  live: { part: 0, whole: 0 },
  day1: { part: 0, whole: 0 },
  day7: { part: 0, whole: 0 },
  ...figures,
});

vi.mock("@/app/_components/public-page", () => ({ PublicPage: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/src/auth/current-user", () => ({ getCurrentUser: async () => ({ id: "admin" }), isAdmin: () => true }));
vi.mock("@/src/db/client", () => ({ prisma: {} }));
vi.mock("@/src/db/admin-dashboard", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/src/db/admin-dashboard")>();
  return {
    ...original,
    getAdminDashboard: async (_db: unknown, _now: Date, period: 7 | 30): Promise<AdminDashboard> => {
      asked.period = period;
      return {
        period,
        first: "2026-11-01",
        last: "2026-11-07",
        trackedSince: "2026-11-07",
        liveTrackedSince: "2026-11-06",
        days: [
          day("2026-11-06", { visits: null, players: 2, registered: 1, day1: 1, active: 5, databaseBytes: 180 * MB }),
          day("2026-11-07", {
            visits: 40,
            players: 10,
            active: 12,
            liveMatches: 4,
            simulatedMatches: 9,
            appLaunches: 6,
            databaseBytes: 181.4 * MB,
            growth: 1.4 * MB,
            purgedUsers: 3,
            purgedSaves: 2,
            // Of them, one player seen only on the day they started, and their career, at 14 days.
            purgedOneDayUsers: 1,
            purgedOneDaySaves: 1,
          }),
        ],
        sources: [
          journey("reddit-playmygame", {
            visits: 32,
            players: 8,
            careers: 8,
            firstMatches: 6,
            seasonEnds: 1,
            medianMinutesToFirstMatch: 7.5,
            live: { part: 2, whole: 7 },
            day1: { part: 1, whole: 4 },
          }),
          journey("(other)", { visits: 8, players: 2, careers: 2, firstMatches: 1 }),
          journey("(unknown)", { players: 2, careers: 1, medianMinutesToFirstMatch: 180 }),
        ],
        total: journey("", {
          visits: 40,
          players: 12,
          careers: 11,
          firstMatches: 7,
          seasonEnds: 1,
          medianMinutesToFirstMatch: 9,
          live: { part: 3, whole: 10 },
          day1: { part: 1, whole: 4 },
        }),
        players: { anonymous: 11, registered: 1, fr: 5, en: 5, phone: 6, computer: 4 },
        challenge: { weekKey: "2026-W45", saves: 12, entries: 14, submitted: 0, maxSaves: 20 },
        resumeLinks: { created: 9, creators: 4, used: 2 },
        // The production database of 9 November: 1 062 Mo in a day, 46 new players the day before.
        health: {
          databaseBytes: 1339.1 * MB,
          growth: 1061.9 * MB,
          growthSince: "2026-11-06",
          dailyGrowth: 1061.9 * MB,
          storageCost: 0.4577,
          projectedBytes: 33_196.1 * MB,
          projectedCost: 11.3463,
          costAlert: true,
          newPlayers: 46,
          bytesPerNewPlayer: 23.08 * MB,
          // A deletion, then the count before it: the latest first.
          cleanup: [
            {
              at: "2026-11-07T04:18:02.000Z",
              dryRun: false,
              deleted: { otherGoals: 18_000, managedEvents: 1_500, decisions: 500 },
              remaining: { otherGoals: 60_000, managedEvents: 1, decisions: 0 },
              milliseconds: 6_120,
            },
            {
              at: "2026-11-07T04:17:40.000Z",
              dryRun: true,
              deleted: { otherGoals: 0, managedEvents: 0, decisions: 0 },
              remaining: { otherGoals: 78_000, managedEvents: 1_501, decisions: 500 },
              milliseconds: 950,
            },
          ],
          // A deletion with a mismatch, then the count before it: the latest first.
          archive: [
            {
              at: "2026-11-07T04:20:05.000Z",
              mode: "delete",
              archived: 12,
              deletedSeasons: 40,
              deletedRows: 38_000,
              mismatches: 1,
              pending: 0,
              deletable: 3,
              rowsRemaining: 2_900,
              milliseconds: 18_400,
            },
            {
              at: "2026-11-07T04:19:30.000Z",
              mode: "count",
              archived: 0,
              deletedSeasons: 0,
              deletedRows: 0,
              mismatches: 0,
              pending: 12,
              deletable: 30,
              rowsRemaining: 40_900,
              milliseconds: 420,
            },
          ],
        },
      };
    },
  };
});
const group = (figures: Partial<ErrorGroupView>): ErrorGroupView => ({
  fingerprint: "a1",
  source: "SERVER",
  kind: "render",
  route: "/saves/[id]/live",
  message: "TypeError: Cannot read properties of undefined (reading 'score')",
  digest: "2718281828",
  lastDay: 3,
  lastWeek: 12,
  lastSeenAt: "2026-11-07T21:14:09.000Z",
  other: false,
  ...figures,
});
vi.mock("@/src/db/errors", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/src/db/errors")>();
  const latest = group({ fingerprint: "b2", source: "CLIENT", kind: "error", route: "/fr", message: "ChunkLoadError: Loading chunk 7 failed.", digest: null, lastDay: 1, lastWeek: 1, lastSeenAt: "2026-11-07T22:05:00.000Z" });
  return {
    ...original,
    getErrorsSection: async (): Promise<ErrorsSection> => ({
      lastDay: { total: 4, server: 3, client: 1 },
      lastWeek: { total: 18, server: 12, client: 6 },
      groups: [group({}), latest, group({ fingerprint: "(other):CLIENT", source: "CLIENT", kind: "error", route: "/", lastDay: 0, lastWeek: 5, other: true })],
      latest,
    }),
  };
});
vi.mock("next-intl/server", async () => {
  const { testTranslator } = await import("@/src/i18n/test-intl");
  return {
    getTranslations: async (namespace: "admin") => testTranslator(language.current, namespace),
    getLocale: async () => language.current,
  };
});

const render = async (locale: Locale, days?: string): Promise<string> => {
  language.current = locale;
  const { default: AdminPage } = await import("./page");
  return renderToStaticMarkup(await AdminPage({ params: Promise.resolve({}), searchParams: Promise.resolve(days === undefined ? {} : { days }) }));
};

describe("the administrator's dashboard", () => {
  it("is in French: its period, every section, sources by name, sizes in Mo and shares with a spaced percent sign", async () => {
    const markup = await render("fr");

    expect(asked.period).toBe(7);
    for (const text of [
      "Administration",
      "Les 7 derniers jours (UTC), du 01/11 au 07/11.",
      "Arrivées suivies depuis le 7 novembre 2026.",
      ">Acquisition</h2>",
      ">Parcours</h2>",
      ">Rétention</h2>",
      ">Activité</h2>",
      ">Santé</h2>",
      ">Erreurs</h2>",
      "3 serveur · 1 navigateur",
      // Apostrophes escaped in the markup.
      "Lancements de l&#x27;appli",
      // The players who went live, of those created since it is tracked, and the resume links of the period.
      "Passés par le direct",
      "3 sur 10 nouveaux joueurs depuis le 06/11",
      ">En direct</th>",
      "Liens de reprise",
      "pour 4 joueurs · 2 utilisés",
      "depuis l&#x27;écran d&#x27;accueil, un par session",
      "La plus récente · 07/11 à 22:05 UTC",
      "ChunkLoadError: Loading chunk 7 failed.",
      "Navigateur · error · /fr",
      "Serveur · render · /saves/[id]/live · digest 2718281828",
      "Autres erreurs (au-delà de 200 groupes dans la journée)",
      "30 % des visites",
      "Langue : français 5 · anglais 5",
      "Appareil : téléphone 6 · ordinateur 4",
      "reddit-playmygame",
      "Autres sources",
      "Inconnue (avant le suivi)",
      "Toutes les sources",
      "9 min",
      "3 h",
      "181,4 Mo",
      "+1,4 Mo",
      // The storage: its growth over the week, its cost on Neon's Launch plan now and in 30 days, past 5 $ there.
      "coût de stockage estimé sur l&#x27;offre Launch de Neon, 0,35 $ le Go par mois, et sa projection à 30 jours à ce rythme, en alerte au-delà de 5 $ par mois",
      "1 339,1 Mo",
      "Croissance sur 7 jours",
      "+1 061,9 Mo par jour depuis le 06/11",
      "Stockage par mois",
      "0,46 $",
      "à 0,35 $ le Go",
      "Dans 30 jours",
      "11,35 $",
      "32,4 Go à ce rythme",
      "Au-delà de 5 $ par mois",
      "Par nouveau joueur",
      "23,1 Mo",
      "46 nouveaux joueurs sur ces jours",
      "Défi de la semaine 45",
      "12 parties sur 20 · 14 joueurs inscrits · aucun classé après 10 journées",
      "3 joueurs, 2 parties et aucune partie de défi",
      // The saves of each rule: one at 30 days, one at 14, its player seen only on the day they started.
      "Parties purgées à 30 jours",
      "de joueurs sans compte, sans visite depuis 30 jours",
      "Parties purgées à 14 jours",
      "d&#x27;un joueur venu le seul jour de sa création",
      'href="/admin/stats"',
      // The event cleanup's passes: what the latest left, kind by kind, then each pass.
      "Nettoyage des événements",
      "Reste après le dernier passage : 60 000 buts des autres matchs, 1 événement et 0 décision du club dirigé.",
      "07/11 04:18",
      "Passage (UTC)",
      "Suppression",
      "Comptage",
      "20 000",
      "6,1 s",
      // The archive task's passes: what the latest left, its mismatch, then each pass.
      "Archives des saisons terminées",
      "Reste après le dernier passage : aucune saison à archiver, 3 saisons archivées dont les lignes restent, 2 900 lignes de saisons terminées.",
      "1 saison laissée en lignes au dernier passage",
      "Saisons archivées",
      "Lignes restantes",
      "38 000 supprimées",
      "1 écart",
      "18,4 s",
    ]) {
      expect(markup.replace(/ /g, " ")).toContain(text);
    }
    // One save a rule: the 30-day one's are the anonymous users' saves but the one-day users'.
    expect(markup).toMatch(/data-testid="admin-purged-inactive"(?:(?!<\/div>).)*>1<\/p>/);
    expect(markup).toMatch(/data-testid="admin-purged-one-day"(?:(?!<\/div>).)*>1<\/p>/);
    // The projected cost alerts, today's does not repeat it.
    expect(markup).toMatch(/data-testid="admin-storage-projection" data-alert="true"/);
    expect(markup).toMatch(/data-testid="admin-storage-cost" data-alert="false"/);
    // A count deletes nothing: « — » in its column, and every row says its totals.
    expect(markup).toMatch(/data-dry-run="true" data-deleted="0" data-remaining="80001"/);
    expect(markup).toMatch(/data-deleted="20000" data-remaining="60001"/);
    expect(markup).toMatch(/data-mode="delete" data-archived="12" data-deleted="38000" data-remaining="2900" data-mismatches="1"/);
    expect(markup).toMatch(/data-mode="count" data-archived="0" data-deleted="0" data-remaining="40900" data-mismatches="0"/);
    expect(markup).toContain('data-testid="admin-archive-mismatches"');
    // A step's share of its source's visits, under it: 6 first matches of 32 visits.
    expect(markup).toMatch(/>6<\/span><span[^>]*>19 %<\/span>/);
    // The live share is of players, not of visits: 30 % of the total's, 2 of 7 for its source.
    expect(markup).toMatch(/data-testid="admin-live-players"(?:(?!<\/div>).)*>30 %<\/p>/);
    expect(markup).toMatch(/data-live="2\/7"[^>]*><span[^>]*>29 %<\/span><span[^>]*>2\/7<\/span>/);
    expect(markup).toMatch(/data-testid="admin-resume-links"(?:(?!<\/div>).)*>9<\/p>/);
    // Before the tracking, a day's visits are not known.
    expect(markup).toMatch(/data-day="2026-11-06"[^>]*><td[^>]*>06\/11<\/td><td[^>]*>—<\/td>/);
  });

  it("is in English, over 30 days when asked, the period's link marked", async () => {
    const markup = await render("en", "30");

    expect(asked.period).toBe(30);
    for (const text of [
      "The last 30 days (UTC), from 01/11 to 07/11.",
      "Arrivals tracked since 7 November 2026.",
      ">Journey</h2>",
      "30% of visits",
      "Unknown (before tracking)",
      "181.4 MB",
      "storage cost estimated on Neon&#x27;s Launch plan, $0.35 per GB a month, and its projection 30 days ahead at this pace, flagged past $5 a month",
      "Careers purged at 30 days",
      "Careers purged at 14 days",
      "of a player seen only on the day they started",
      "Growth over 7 days",
      "+1,061.9 MB a day since 06/11",
      "Storage a month",
      "$0.46",
      "at $0.35 per GB",
      "In 30 days",
      "$11.35",
      "32.4 GB at this pace",
      "Past $5 a month",
      "Per new player",
      "23.1 MB",
      "46 new players over those days",
      "Weekly challenge, week 45",
      "12 careers of 20 · 14 players entered · none ranked after 10 matchdays",
      ">Errors</h2>",
      "12 server · 6 browser",
      "App launches",
      "Played live",
      "3 of 10 new players since 06/11",
      "Resume links",
      "for 4 players · 2 used",
      "The latest · 07/11 at 22:05 UTC",
      "Browser · error · /fr",
      "Other errors (past 200 groups in the day)",
      "Event cleanup",
      "Left after the latest pass: 60,000 goals of other matches, 1 event and 0 decisions of the managed club.",
      "Deletion",
      "Count",
      "6.1 s",
      "Archives of finished seasons",
      "Left after the latest pass: no season to archive, 3 archived seasons whose rows remain, 2,900 rows of finished seasons.",
      "1 season left as rows by the latest pass",
      "Rows left",
      "38,000 deleted",
      "1 mismatch",
      "18.4 s",
    ]) {
      expect(markup).toContain(text);
    }
    const thirtyDays = /<a[^>]*href="\/admin\?days=30"[^>]*>/.exec(markup)?.[0] ?? "";
    expect(thirtyDays).toContain('aria-current="page"');
    expect(/<a[^>]*href="\/admin"[^>]*>/.exec(markup)?.[0]).not.toContain("aria-current");
    expect(markup).not.toMatch(/Rétention|Visites/);
  });
});
