import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "@/src/components/link";
import { buttonVariants } from "@/src/components/ui/button";
import { prisma } from "@/src/db/client";
import { readResumeLink } from "@/src/db/resume-links";
import { listSaves } from "@/src/db/saves";
import { publicPath } from "@/src/i18n/public-pages";
import { formatDate } from "@/src/lib/format";
import { resumeViewOf } from "@/src/lib/resume-link";
import { PublicPage } from "../_components/public-page";
import { ResumeForm } from "./_components/resume-form";
import { currentResumeViewer } from "./_lib/viewer";
import { resumeViewText } from "./_lib/view-text";

export const dynamic = "force-dynamic";

/** No crawler reads it, and no address it leads to learns of the link (its token is in this page's address). */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getTranslations("resume"))("title"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

/**
 * A resume link opened (src/db/resume-links.ts): the careers it leads to and the button that brings them to this browser,
 * or why it cannot. Opening it spends nothing: the button does (resumeCareerAction), so a link's preview never does. In
 * the player's language, no locale in its address, like a save's pages.
 */
export default async function ResumePage({ searchParams }: PageProps<"/resume">) {
  const query = await searchParams;
  const token = typeof query.t === "string" ? query.t : "";
  // Not simulation code: a link's time is real time.
  const [link, viewer] = await Promise.all([readResumeLink(prisma, token, new Date()), currentResumeViewer()]);
  const view = resumeViewOf(link, viewer);
  const [t, locale] = await Promise.all([getTranslations("resume"), getLocale()]);
  // The careers it leads to, while it still does: the player knows them by their club.
  const careers = link.status === "valid" || view === "here" ? await listSaves(link.status === "unknown" ? null : { id: link.userId }) : [];
  const [career] = careers;

  return (
    <PublicPage className="max-w-xl">
      <section aria-labelledby="resume-title" data-testid="resume" data-view={view} className="space-y-5">
        <h1 id="resume-title" className="font-heading text-4xl leading-none">
          {view === "ready" ? t("ready.heading") : resumeViewText(view, t).heading}
        </h1>
        {career !== undefined && (
          <div className="space-y-1 rounded-card bg-card p-4" data-testid="resume-career">
            <p className="font-bold wrap-break-word">
              {t("career", { club: career.club.name, manager: career.managerName, date: formatDate(career.currentDate, locale) })}
            </p>
            {careers.length > 1 && <p className="text-sm text-muted-foreground">{t("moreCareers", { count: careers.length - 1 })}</p>}
          </div>
        )}
        <p className="text-muted-foreground">{view === "ready" ? t("ready.text") : resumeViewText(view, t).text}</p>
        {view === "ready" ? (
          <ResumeForm token={token} />
        ) : view === "here" && career !== undefined ? (
          <Link href={`/saves/${career.id}`} className={buttonVariants({ variant: "club", size: "lg" })} data-testid="resume-open">
            {t("here.open")}
          </Link>
        ) : (
          <Link href={publicPath("home", locale)} className={buttonVariants({ variant: "outline", size: "lg" })} data-testid="resume-home">
            {t("home")}
          </Link>
        )}
      </section>
    </PublicPage>
  );
}
