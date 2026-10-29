"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/src/lib/utils";

/** The tabs, each named in the nav messages by its key, which is also its data-testid's: « nav-squad ». */
const SECTIONS = [
  { segment: "", key: "dashboard" },
  { segment: "/squad", key: "squad" },
  { segment: "/lineup", key: "lineup" },
  { segment: "/fixtures", key: "fixtures" },
  { segment: "/standings", key: "standings" },
  { segment: "/cup", key: "cup" },
  { segment: "/transfers", key: "transfers" },
  { segment: "/seasons", key: "seasons" },
] as const;

/** The ends of the row that hide tabs: a gradient there says there is more. */
type HiddenEnds = { start: boolean; end: boolean };

/**
 * Tabs of a save, « Coupe » only with a cup, on a row of their own under the header, so that every tab is there at
 * every width: on a computer they hold on one line; narrower, the row scrolls sideways, with a gradient at an end that
 * hides tabs, and the active tab is brought into view on load. The active one gets the club accent at 18 % and an
 * accent underline.
 */
export function SaveNav({ saveId, hasCup }: { saveId: string; hasCup: boolean }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const base = `/saves/${saveId}`;
  const row = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<HiddenEnds>({ start: false, end: false });

  // The gradients follow the scrolling and the row's width; the observer's first call gives the initial state.
  useEffect(() => {
    const element = row.current;
    if (element === null) {
      return;
    }
    const update = () =>
      setHidden({
        start: element.scrollLeft > 1,
        end: element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
      });
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  // The active tab in view, centred when the row scrolls, on load and on every page of the save. The row's own
  // scrolling only: scrollIntoView would move the page too.
  useEffect(() => {
    const element = row.current;
    const active = element?.querySelector<HTMLElement>('[aria-current="page"]');
    if (element === null || element === undefined || active === null || active === undefined) {
      return;
    }
    element.scrollLeft = active.offsetLeft - (element.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);

  return (
    <nav aria-label={t("label")} data-testid="save-nav" className="relative mx-auto w-full max-w-[1440px]">
      {/* Positioned: the tabs' offsetLeft is measured from it. No scrollbar: the gradients say there is more. */}
      <div
        ref={row}
        className="relative flex h-10 items-center gap-1 overflow-x-auto px-4 [scrollbar-width:none] max-sm:h-12 lg:px-7 [&::-webkit-scrollbar]:hidden"
      >
        {SECTIONS.filter(({ segment }) => hasCup || segment !== "/cup").map(({ segment, key }) => {
          const href = `${base}${segment}`;
          const active = segment === "" ? pathname === base : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              data-testid={`nav-${key}`}
              className={cn(
                // The underline stays inside the row (4 px under a 32 px tab in a 40 px row; 2 px under a 44 px tab in
                // a 48 px row on a phone, for the thumb): the row scrolls, and would clip anything hanging out.
                "relative shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors max-sm:py-3",
                active
                  ? "bg-(--club)/18 font-semibold text-foreground after:absolute after:inset-x-2 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-(--club) max-sm:after:-bottom-0.5"
                  : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {t(key)}
            </Link>
          );
        })}
      </div>
      {hidden.start && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-linear-to-r from-background to-transparent" />
      )}
      {hidden.end && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l from-background to-transparent" />
      )}
    </nav>
  );
}
