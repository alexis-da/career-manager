"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { SegmentedLinks } from "@/src/components/segmented";
import { sectionAt, tabAt, tabsOf, tabTestId, type SectionTab } from "../_lib/sections";

/**
 * The tabs of the current entry, when it has several: « Effectif · Composition », « Club · Défi · Palmarès ». A tab the
 * tutorial's first day hides is only missing from it: its address stays open, and it shows while it is the one open.
 */
export function SectionTabs({
  saveId,
  hasCup,
  hasEurope,
  hasNations,
  coach = false,
  hidden = [],
}: {
  saveId: string;
  hasCup: boolean;
  hasEurope: boolean;
  hasNations: boolean;
  coach?: boolean; // a national coach: « Sélection » under Équipe
  hidden?: readonly SectionTab[]; // those the tutorial's first day hides (src/lib/tutorial.ts)
}) {
  const t = useTranslations("nav");
  const base = `/saves/${saveId}`;
  const path = usePathname().slice(base.length);
  const active = tabAt(path);
  if (active === undefined) {
    return null;
  }
  const section = sectionAt(path);
  return (
    <SegmentedLinks
      label={t("sectionTabs", { section: t(section.key) })}
      testId="section-tabs"
      className="mb-5 lg:max-w-md"
      links={tabsOf(section, hasCup, hasEurope, hasNations, coach)
        .filter((tab) => tab === active || !hidden.includes(tab))
        .map((tab) => ({
          href: `${base}/${tab}`,
          label: t(tab),
          active: tab === active,
          testId: tabTestId(tab),
        }))}
    />
  );
}
