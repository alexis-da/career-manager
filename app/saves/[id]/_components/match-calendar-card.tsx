import { ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { FixtureWithEvents } from "@/src/db/calendar";
import { cn } from "@/src/lib/utils";
import { fixtureWindow, nextFixture } from "../_lib/fixture-window";
import { FixtureRow } from "./fixture-row";
import { Panel } from "@/src/components/panel";

type MatchCalendarCardProps = {
  saveId: string;
  fixtures: FixtureWithEvents[]; // the managed club's season, in date order
  className?: string;
};

/** The managed club's calendar around its next match, beside the table on a computer. */
export function MatchCalendarCard({ saveId, fixtures, className }: MatchCalendarCardProps) {
  const t = useTranslations("fixtures");
  const next = nextFixture(fixtures);
  return (
    <Panel className={cn("flex flex-col gap-3", className)} aria-labelledby="match-calendar-card" data-testid="match-calendar-card">
      <h2 id="match-calendar-card" className="font-heading text-[1.75rem] leading-none">
        {t("title")}
      </h2>
      <ol className="space-y-1.5">
        {fixtureWindow(fixtures).map((fixture) => (
          <FixtureRow key={fixture.id} saveId={saveId} fixture={fixture} next={fixture.id === next?.id} dense />
        ))}
      </ol>
      <Link
        href={`/saves/${saveId}/fixtures`}
        data-testid="match-calendar-all"
        className="inline-flex items-center gap-0.5 self-start text-sm font-semibold text-(--club) hover:text-(--club-hover) max-sm:min-h-11"
      >
        {t("allFixtures")}
        <ChevronRightIcon aria-hidden className="size-4 shrink-0" />
      </Link>
    </Panel>
  );
}
