import Image from "next/image";
import Link from "next/link";
import { useLocale } from "next-intl";
import type { ReactNode } from "react";
import { publicPath, type PublicPageName } from "@/src/i18n/public-pages";
import { cn } from "@/src/lib/utils";
import { BrandFooter } from "./brand-footer";
import { LanguageBanner } from "./language-banner";
import { LanguageSwitcher } from "./language-switcher";

type PublicPageProps = {
  children: ReactNode;
  tools?: ReactNode; // what a page offers beside the game's mark on a computer, under its content on a phone
  footer?: ReactNode; // what it adds to its foot
  className?: string; // its width, « max-w-6xl » for instance
  // The public page this is (src/i18n/public-pages.ts): the language switcher goes to its address in the other language,
  // and a visitor of the other language is offered it (LanguageBanner), unless `languageBanner` is false.
  page?: PublicPageName;
  languageBanner?: boolean;
};

/**
 * A page outside a save: the game's mark and the language on one line, the page, its foot. One DOM: `tools` come after the
 * content, and go up to the first line from 1024 px.
 */
export function PublicPage({ children, tools, footer, className, page, languageBanner = true }: PublicPageProps) {
  const locale = useLocale();
  return (
    <main className="flex-1 bg-background text-foreground">
      {page !== undefined && languageBanner && <LanguageBanner page={page} className={className} />}
      <div
        className={cn(
          "mx-auto grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-6 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:gap-y-10 lg:px-8 lg:py-8",
          className,
        )}
      >
        <Link href={publicPath("home", locale)} data-testid="public-home" className="flex min-h-11 w-fit items-center gap-2.5">
          <Image src="/brand/late-winner-icone.svg" alt="" width={36} height={36} unoptimized />
          <span className="font-heading text-2xl leading-none">Late Winner</span>
        </Link>
        <LanguageSwitcher page={page} className="lg:col-start-3 lg:row-start-1" />
        <div className="col-span-full min-w-0 self-start lg:row-start-2">{children}</div>
        {tools !== undefined && (
          <div className="col-span-full min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-1">{tools}</div>
        )}
        <BrandFooter className="col-span-full">{footer}</BrandFooter>
      </div>
    </main>
  );
}
