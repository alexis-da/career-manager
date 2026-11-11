import type { Metadata } from "next";
import Link from "@/src/components/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicPage } from "@/app/_components/public-page";
import { getCurrentUser, isAdmin } from "@/src/auth/current-user";
import { SegmentedLinks } from "@/src/components/segmented";
import { getAdminDashboard, type AdminPeriod } from "@/src/db/admin-dashboard";
import { prisma } from "@/src/db/client";
import { getErrorsSection } from "@/src/db/errors";
import { INTL_LOCALES } from "@/src/i18n/locale";
import { formatDate } from "@/src/lib/format";
import {
  AcquisitionSection,
  ActivitySection,
  ErrorsSection,
  HealthSection,
  JourneySection,
  RetentionSection,
  type AdminFormats,
} from "./_components/admin-sections";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin"))("title"), robots: { index: false } };
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** The period of ?days=: 30 days, else 7. */
const periodOf = (days: string | string[] | undefined): AdminPeriod => (days === "30" ? 30 : 7);

/**
 * The administrator's dashboard (ADMIN_EMAIL): where players come from and how far they go, who comes back, what is
 * played, the game's errors over 24 hours and 7 days (src/db/errors.ts), the database's health, over 7 or 30 days
 * (src/db/admin-dashboard.ts). 404 for anyone else, signed out
 * included, as a page that does not exist. /admin/stats stays, a link away, with its tables and saves' first steps.
 */
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    notFound();
  }
  const period = periodOf((await searchParams).days);
  // Not simulation code: the figures are about real days.
  const now = new Date();
  const [dashboard, errors] = await Promise.all([getAdminDashboard(prisma, now, period), getErrorsSection(prisma, now)]);
  const [t, locale] = await Promise.all([getTranslations("admin"), getLocale()]);

  const integers = new Intl.NumberFormat(INTL_LOCALES[locale]);
  const decimals = new Intl.NumberFormat(INTL_LOCALES[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const cents = new Intl.NumberFormat(INTL_LOCALES[locale], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateOf = (day: string) => new Date(`${day}T00:00:00.000Z`);
  const format: AdminFormats = {
    integer: (value) => integers.format(value),
    megabytes: (bytes) => t("values.megabytes", { size: decimals.format(bytes / MB) }),
    size: (bytes) =>
      bytes < GB ? t("values.megabytes", { size: decimals.format(bytes / MB) }) : t("values.gigabytes", { size: decimals.format(bytes / GB) }),
    growth: (bytes) => t("values.growth", { sign: bytes < 0 ? "−" : "+", size: decimals.format(Math.abs(bytes) / MB) }),
    // « 5 $ », « 0,46 $ »: cents only when there are some.
    dollars: (amount) => t("values.dollars", { amount: (Number.isInteger(amount) ? integers : cents).format(amount) }),
    percent: (part, whole) => (whole === 0 ? null : t("values.percent", { percent: Math.round((part / whole) * 100) })),
    // « 07/11 », day first in both languages.
    day: (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}`,
    date: (day) => formatDate(dateOf(day), locale),
    duration: (minutes) =>
      minutes < 60
        ? t("values.minutes", { count: Math.max(1, Math.round(minutes)) })
        : minutes < 48 * 60
          ? t("values.hours", { count: Math.round(minutes / 60) })
          : t("values.days", { count: Math.round(minutes / (24 * 60)) }),
    seconds: (milliseconds) => t("values.seconds", { seconds: decimals.format(milliseconds / 1000) }),
  };
  const sections = { dashboard, t, format };

  return (
    <PublicPage className="max-w-6xl">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-heading text-3xl" data-testid="admin-title">
              {t("title")}
            </h1>
            <p className="text-sm text-muted-foreground" data-testid="admin-lead">
              {t("lead", { period: String(period), first: format.day(dashboard.first), last: format.day(dashboard.last) })}{" "}
              {dashboard.trackedSince === null ? t("notTracked") : t("trackedSince", { date: format.date(dashboard.trackedSince) })}
            </p>
          </div>
          <SegmentedLinks
            label={t("periodLabel")}
            testId="admin-period"
            className="w-full sm:w-64"
            links={[
              { href: "/admin", label: t("period7"), active: period === 7, testId: "admin-period-7" },
              { href: "/admin?days=30", label: t("period30"), active: period === 30, testId: "admin-period-30" },
            ]}
          />
        </header>

        <AcquisitionSection {...sections} />
        <JourneySection {...sections} />
        <div className="grid gap-6 xl:grid-cols-2">
          <RetentionSection {...sections} />
          <ActivitySection {...sections} />
        </div>
        <ErrorsSection errors={errors} t={t} format={format} />
        <HealthSection
          {...sections}
          statsLink={
            <Link href="/admin/stats" className="inline-flex min-h-11 items-center text-sm font-semibold underline" data-testid="admin-stats-link">
              {t("statsLink")}
            </Link>
          }
        />
      </div>
    </PublicPage>
  );
}
