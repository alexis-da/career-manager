import { cookies, headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { LOCALE_COOKIE, preferredLocale } from "@/src/i18n/locale";
import type { PublicPageName } from "@/src/i18n/public-pages";
import { cn } from "@/src/lib/utils";
import { setLanguageAction } from "../actions";

const OPTION = "font-semibold underline-offset-4 hover:underline max-sm:min-h-11";

/**
 * A discreet line over a public page that is not in the visitor's language (the one they chose, else their browser's):
 * the page in theirs, or staying in this one, the choice kept either way (setLanguageAction). Written in the visitor's
 * language. Never redirected by itself, and nothing for a crawler, which says no language.
 */
export async function LanguageBanner({ page, className }: { page: PublicPageName; className?: string }) {
  const [locale, cookieStore, requestHeaders] = await Promise.all([getLocale(), cookies(), headers()]);
  const preferred = preferredLocale(cookieStore.get(LOCALE_COOKIE)?.value, requestHeaders.get("accept-language"));
  if (preferred === null || preferred === locale) {
    return null;
  }
  const t = await getTranslations({ locale: preferred, namespace: "language.banner" });
  return (
    <aside lang={preferred} aria-label={t("label")} className="border-b bg-card/60" data-testid="language-banner">
      <form
        action={setLanguageAction}
        className={cn("mx-auto flex w-full flex-wrap items-center gap-x-5 gap-y-1 px-4 text-sm sm:py-2 lg:px-8", className)}
      >
        <input type="hidden" name="page" value={page} />
        {/* Under 640 px, its two buttons say it alone, on one line: the home page's button stays above the fold. */}
        <p className="text-muted-foreground max-sm:sr-only">{t("text")}</p>
        <div className="flex flex-wrap items-center gap-x-5">
          <button type="submit" name="locale" value={preferred} className={OPTION} data-testid="language-banner-switch">
            {t("switch")}
          </button>
          <button
            type="submit"
            name="locale"
            value={locale}
            className={cn(OPTION, "font-normal text-muted-foreground hover:text-foreground")}
            data-testid="language-banner-stay"
          >
            {t("stay")}
          </button>
        </div>
      </form>
    </aside>
  );
}
