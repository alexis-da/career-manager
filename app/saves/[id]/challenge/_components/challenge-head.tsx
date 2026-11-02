import { useLocale, useTranslations } from "next-intl";
import type { ChallengePageView } from "@/src/db/challenge-view";
import { formatParisWeekdayTime } from "@/src/lib/format";
import { Panel } from "../../_components/panel";

/** The head of the screen, on the bright blue: the week and its end, then the scenario, its club by name alone. */
export function ChallengeHead({ view }: { view: ChallengePageView }) {
  const t = useTranslations("challenge");
  const tScreen = useTranslations("challengeScreen");
  const world = useTranslations("world");
  const locale = useLocale();
  const { club } = view;
  return (
    <Panel aria-labelledby="challenge-title" className="flex flex-col gap-2.5 bg-primary text-primary-foreground">
      <p data-testid="challenge-week" className="w-fit rounded-full bg-(--club) px-3 py-1 text-xs font-bold tracking-wide text-(--club-fg) uppercase">
        {tScreen("weekPill", { week: view.weekNumber, end: formatParisWeekdayTime(view.endsAt, locale) })}
      </p>
      <h1 id="challenge-title" data-testid="challenge-title" className="font-heading text-[2.875rem] leading-[0.92] text-balance">
        {t("title")}
      </h1>
      <p className="text-[0.9375rem] leading-snug wrap-break-word text-on-blue">
        <strong data-testid="challenge-club" className="font-bold text-primary-foreground">
          {club.name}
        </strong>
        {club.competition !== null && (
          <>
            {" · "}
            <span data-testid="challenge-competition">
              {world("league", { country: world(`countries.${club.competition.country}`), tier: club.competition.tier })}
            </span>
          </>
        )}
      </p>
      <p className="text-[0.9375rem] leading-snug text-on-blue">{tScreen("pitch", { horizon: view.horizon })}</p>
    </Panel>
  );
}
