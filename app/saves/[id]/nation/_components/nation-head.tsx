import { useTranslations } from "next-intl";
import type { NationalTeamView } from "@/src/db/national-view";
import { seasonLabel } from "@/src/engine/world";
import { exceededLine, objectiveLine } from "../../_components/coach-names";
import { CoachNationMark } from "../../_components/coach-nation-mark";
import { zoneStanding } from "../_lib/nation";

/**
 * His nation on the bright blue (docs/design/selections.md § 9.7): its mark and its name, since when he coaches it, the
 * objective its federation set him for its cycle's tournament and what goes past it (or that it has none for him this
 * cycle), its rank of strength, and where it stands in its zone's qualifiers once it has played there.
 */
export function NationHead({ view }: { view: NationalTeamView }) {
  const t = useTranslations("nationalTeam");
  const tCoach = useTranslations("coachOffer");
  const tNations = useTranslations("nations");
  const tWorld = useTranslations("world");
  const standing = zoneStanding(view);
  const objective = view.objective !== null && view.tournament !== null ? view.objective : null;
  const exceeded = objective === null ? null : exceededLine(objective, tCoach);
  return (
    <section
      aria-labelledby="nation-head-title"
      data-testid="nation-head"
      data-nation={view.code}
      className="space-y-4 rounded-card bg-primary p-5 text-primary-foreground"
    >
      <div className="flex items-center gap-3.5">
        <CoachNationMark code={view.code} own className="size-14 text-xl" />
        {/* On two lines if need be, never cut. */}
        <div className="min-w-0">
          <h2 id="nation-head-title" className="font-heading text-[2rem] leading-none wrap-break-word">
            {tWorld(`nationalities.${view.code}`)}
          </h2>
          <p data-testid="nation-since" className="mt-1.5 text-sm font-semibold text-on-blue tabular-nums">
            {t("head.since", { season: seasonLabel(view.fromYear) })}
          </p>
        </div>
      </div>

      <div data-testid="nation-objective" data-objective={objective ?? "none"} className="space-y-1 rounded-lg bg-background px-3.5 py-3">
        {objective === null ? (
          <p className="text-[1.0625rem] leading-snug font-bold">{t("objective.none")}</p>
        ) : (
          <>
            <p className="text-[1.0625rem] leading-snug font-bold">
              {objectiveLine(
                { code: view.code, objective, tournament: view.tournament, year: view.tournamentYear },
                { tCoach, tNations, tWorld },
              )}
            </p>
            {exceeded !== null && (
              <p data-testid="nation-objective-exceeded" className="text-sm font-semibold text-highlight">
                {exceeded}
              </p>
            )}
            <p className="text-xs leading-snug text-muted-foreground">{t("objective.stakes")}</p>
          </>
        )}
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
        <span data-testid="nation-rank" data-rank={view.rank}>
          {t("head.rank", { rank: view.rank })}
        </span>
        {standing !== null && view.zone !== null && (
          <span data-testid="nation-zone-line" data-qualifying={standing.qualifying} className="text-on-blue">
            {t("head.zone", {
              zone: tNations(`campaign.zone.${view.zone.zone}`),
              rank: standing.rank,
              points: standing.points,
              played: standing.played,
            })}
          </span>
        )}
      </p>
    </section>
  );
}
