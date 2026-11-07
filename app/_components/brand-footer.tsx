import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { publicPath } from "@/src/i18n/public-pages";
import { cn } from "@/src/lib/utils";

/** The public pages the foot leads to, after what a page adds: the guide, the changelog, the about page, the privacy page. */
const FOOT_PAGES = [
  { page: "howToPlay", testId: "footer-how-to-play" },
  { page: "changelog", testId: "footer-changelog" },
  { page: "about", testId: "footer-about" },
  { page: "privacy", testId: "privacy-link" },
] as const;

/** The foot of the pages outside a save: what a page adds, and its links to the public pages, in the page's language. */
export function BrandFooter({ children, className }: { children?: ReactNode; className?: string }) {
  const t = useTranslations("footer");
  const locale = useLocale();
  return (
    <footer className={cn("flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-4 text-xs text-muted-foreground", className)}>
      {children}
      <nav aria-label={t("label")} className="flex flex-wrap items-center gap-x-6 gap-y-1">
        {FOOT_PAGES.map(({ page, testId }) => (
          <Link
            key={page}
            href={publicPath(page, locale)}
            className="hover:text-foreground hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:min-w-11 max-sm:items-center"
            data-testid={testId}
          >
            {t(page)}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
