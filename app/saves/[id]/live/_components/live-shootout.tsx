import { useTranslations } from "next-intl";
import { cn } from "@/src/lib/utils";
import { Panel } from "@/src/components/panel";
import type { ShootoutKick } from "../../_lib/match-events";
import { LiveCardTitle } from "./live-card-title";

/** A shoot-out kick: the kicker, scored or missed. */
function KickText({ name, scored }: { name: string; scored: boolean }) {
  const t = useTranslations("live");
  return (
    <span>
      {name}{" "}
      <span className={cn("text-xs font-semibold", scored ? "text-win" : "text-loss")}>
        {scored ? t("kick.scored") : t("kick.missed")}
      </span>
    </span>
  );
}

/** The shoot-out, as far as it has been taken: each kick under the one before, with the running score. */
export function LiveShootout({ taken }: { taken: ShootoutKick[] }) {
  const t = useTranslations("live");
  const score = taken.at(-1) ?? { home: 0, away: 0 };
  return (
    <Panel className="max-sm:p-4" data-shootout="" data-testid="live-shootout">
      <div className="flex items-baseline justify-between gap-3">
        <LiveCardTitle>{t("shootout")}</LiveCardTitle>
        <p className="font-heading text-2xl tabular-nums" data-shootout-score="">
          {score.home} – {score.away}
        </p>
      </div>
      <ol aria-label={t("shootout")} className="mt-3 space-y-1 text-sm">
        {taken.map(({ event, scored, home, away }) => (
          <li
            key={event.id}
            data-kick={scored ? "scored" : "missed"}
            className="grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-center gap-3 rounded-md px-2 py-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 max-sm:grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)] max-sm:gap-1.5 max-sm:px-1"
          >
            <span className="text-right wrap-break-word">{event.side === "home" && <KickText name={event.playerName} scored={scored} />}</span>
            <span className="text-center font-heading tabular-nums">
              {home} – {away}
            </span>
            <span className="wrap-break-word">{event.side === "away" && <KickText name={event.playerName} scored={scored} />}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
