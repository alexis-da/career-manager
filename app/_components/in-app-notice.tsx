import { useTranslations } from "next-intl";
import { cn } from "@/src/lib/utils";
import { OpenInChrome, ResumeLinkCopy } from "./in-app-actions";

/**
 * In an app's browser only (the in-app variants: src/lib/in-app-browser.ts), on the home page and the dashboard: open the
 * game in the phone's browser to keep the career. Android opens it in Chrome; an iPhone follows the steps. With a career
 * (`career`), its resume link goes along: Chrome opens it, the copy button gives it. Hidden everywhere else, by CSS: the
 * server never knows the browser.
 */
export function InAppNotice({ career, className }: { career: boolean; className?: string }) {
  const t = useTranslations("inApp");
  return (
    <section
      aria-labelledby="in-app-notice-title"
      data-testid="in-app-notice"
      className={cn("hidden space-y-2.5 rounded-card border-2 border-(--club) bg-card p-4 in-app:block", className)}
    >
      <h2 id="in-app-notice-title" className="font-heading text-xl leading-tight">
        {t("title")}
      </h2>
      <p className="text-sm text-muted-foreground">{career ? t("whyCareer") : t("why")}</p>
      <p data-testid="in-app-steps" className="hidden text-sm in-app-other:block">
        {career ? t("stepsCareer") : t("steps")}
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <OpenInChrome career={career} />
        {career && <ResumeLinkCopy className="max-sm:w-full" />}
      </div>
    </section>
  );
}
