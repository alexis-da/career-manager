import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

/** The foot of the pages outside a save: what a page adds, and the privacy link. */
export function BrandFooter({ children, className }: { children?: ReactNode; className?: string }) {
  const t = useTranslations("footer");
  return (
    <footer className={cn("flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-4 text-xs text-muted-foreground", className)}>
      {children}
      <Link
        href="/privacy"
        className="hover:text-foreground hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:min-w-11 max-sm:items-center"
        data-testid="privacy-link"
      >
        {t("privacy")}
      </Link>
    </footer>
  );
}
