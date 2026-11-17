"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { SegmentedLinks } from "@/src/components/segmented";
import { sectionAt, tabAt, tabsOf, tabTestId } from "../_lib/sections";

/** The tabs of the current entry, when it has several: « Effectif · Composition », « Club · Défi · Palmarès ». */
export function SectionTabs({ saveId, hasCup, hasEurope }: { saveId: string; hasCup: boolean; hasEurope: boolean }) {
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
      links={tabsOf(section, hasCup, hasEurope).map((tab) => ({
        href: `${base}/${tab}`,
        label: t(tab),
        active: tab === active,
        testId: tabTestId(tab),
      }))}
    />
  );
}
