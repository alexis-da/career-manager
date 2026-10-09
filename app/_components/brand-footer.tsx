import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

/** The foot of the pages outside a save (inside a .brand scope): the privacy link, and what a page adds before it. */
export function BrandFooter({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <footer lang="fr" className={cn("flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-4 text-xs text-muted-foreground", className)}>
      {children}
      <Link href="/privacy" className="hover:text-foreground hover:underline">
        Confidentialité
      </Link>
    </footer>
  );
}
