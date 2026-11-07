import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { buttonVariants } from "@/src/components/ui/button";
import { FORMATION_NAMES } from "@/src/engine/formations";
import { publicPath } from "@/src/i18n/public-pages";
import { cn } from "@/src/lib/utils";

const FEATURES = ["club", "lineup", "live", "market", "objectives", "promotion"] as const;

const ACCESS = ["free", "browser", "phone"] as const;

const QUESTIONS = ["free", "account", "phone", "languages", "save"] as const;

/** The screenshots, taken on a phone with the fictional club names (public/screenshots, each in both languages). */
export const SCREENSHOTS = [
  { key: "lineup", file: "lineup" },
  { key: "live", file: "live-choice" },
  { key: "market", file: "market" },
] as const;

/** Their size: 720 × 1015, one frame for the three. */
export const SCREENSHOT_SIZE = { width: 720, height: 1015 };

const SECTION_TITLE = "font-heading text-[1.75rem] leading-none lg:text-4xl";

function Section({ id, title, children, className }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn("space-y-5 lg:space-y-6", className)} data-testid={id}>
      <h2 id={id} className={SECTION_TITLE}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * What a first visit reads under the creation form, rendered by the server in the page's language: what one does in the
 * game, three screenshots, the weekly challenge, a free game with nothing to install, then the questions asked. A few
 * hundred words, no club name: the screenshots were taken with the fictional names.
 */
export function LandingSections({ clubCount }: { clubCount: number }) {
  const t = useTranslations("landing");
  const locale = useLocale();
  return (
    <div className="space-y-14 border-t pt-10 lg:space-y-20 lg:pt-14" data-testid="landing">
      <Section id="landing-features" title={t("features.title")}>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {FEATURES.map((feature) => (
            <li key={feature} className="space-y-1.5 rounded-card bg-card p-5 lg:p-6">
              <h3 className="text-lg leading-snug font-bold">{t(`features.${feature}.title`)}</h3>
              <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
                {t(`features.${feature}.text`, { count: clubCount, formations: FORMATION_NAMES.length })}
              </p>
            </li>
          ))}
        </ul>
        <Link
          href={publicPath("howToPlay", locale)}
          className="inline-flex min-h-11 items-center text-[0.9375rem] font-semibold text-(--club) hover:text-(--club-hover)"
          data-testid="landing-guide-link"
        >
          {t("features.guide")} →
        </Link>
      </Section>

      <Section id="landing-screenshots" title={t("screenshots.title")}>
        {/* Side by side from 640 px; under it a row the thumb scrolls, inside the page, which never scrolls sideways. */}
        <div
          role="region"
          aria-label={t("screenshots.label")}
          tabIndex={0}
          className="-mx-4 overflow-x-auto px-4 pb-2 focus-visible:outline-2 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0"
        >
          <ul className="flex snap-x snap-mandatory gap-4 sm:grid sm:grid-cols-3 lg:gap-6">
            {SCREENSHOTS.map(({ key, file }) => (
              <li key={key} className="w-[72%] shrink-0 snap-center sm:w-auto">
                <figure className="space-y-3">
                  <Image
                    src={`/screenshots/${file}-${locale}.webp`}
                    alt={t(`screenshots.${key}.alt`)}
                    {...SCREENSHOT_SIZE}
                    unoptimized
                    className="h-auto w-full rounded-card border"
                    data-testid="landing-screenshot"
                  />
                  <figcaption className="text-[0.9375rem] font-semibold">{t(`screenshots.${key}.caption`)}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <section
        aria-labelledby="landing-challenge"
        className="space-y-4 rounded-card bg-primary p-6 text-primary-foreground lg:p-10"
        data-testid="landing-challenge"
      >
        <h2 id="landing-challenge" className={SECTION_TITLE}>
          {t("challenge.title")}
        </h2>
        <p className="max-w-2xl text-[0.9375rem] leading-relaxed lg:text-[1.0625rem]">{t("challenge.text")}</p>
        <Link
          href={publicPath("challenge", locale)}
          className={cn(buttonVariants({ variant: "outline" }), "h-11 border-white/60 bg-transparent px-4 text-[0.9375rem] font-semibold")}
          data-testid="landing-challenge-link"
        >
          {t("challenge.link")}
        </Link>
      </section>

      <Section id="landing-access" title={t("access.title")}>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:gap-4">
          {ACCESS.map((point) => (
            <li key={point} className="space-y-1.5 rounded-card bg-card p-5 lg:p-6">
              <h3 className="text-lg leading-snug font-bold">{t(`access.${point}.title`)}</h3>
              <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{t(`access.${point}.text`)}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="landing-faq" title={t("faq.title")}>
        <div className="grid grid-cols-1 gap-x-12 gap-y-6 lg:grid-cols-2">
          {QUESTIONS.map((question) => (
            <div key={question} className="space-y-1.5">
              <h3 className="text-lg leading-snug font-bold">{t(`faq.${question}.question`)}</h3>
              <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{t(`faq.${question}.answer`)}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
