import { useTranslations } from "next-intl";
import type { PlayerProfile } from "@/src/db/players";
import type { ProgressionPoint } from "@/src/db/progression-view";
import { seasonLabel } from "@/src/engine/world";
import { CURVE_BOX, curveLayout, FULL_GROWTH_MINUTES, signedChange } from "../_lib/progression";
import { LastProgression, LeagueMinutesGauge } from "./progression";

/**
 * His rating season by season at the club: a point per completed season whose relevé has him, then this one, the
 * potential known in dashes above. An image for the screen readers, its points in its label. Never under two points.
 */
function ProgressionCurve({ points }: { points: readonly ProgressionPoint[] }) {
  const t = useTranslations("progression");
  const { width, height } = CURVE_BOX;
  const { ratings, potentials, labelled } = curveLayout(points);
  const path = (marks: readonly { x: number; y: number }[]): string => marks.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const label = t("curveLabel", {
    points: points.map((point) => t("curvePoint", { season: seasonLabel(point.startYear), overall: point.overall })).join(", "),
  });
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      className="block h-auto w-full overflow-visible"
      data-testid="player-progression-curve"
      data-points={points.length}
    >
      <line x1={0} x2={width} y1={height - 22} y2={height - 22} className="stroke-border" strokeWidth={1} />
      {potentials.length > 1 && (
        <polyline points={path(potentials)} fill="none" className="stroke-muted-foreground" strokeWidth={1.5} strokeDasharray="4 4" />
      )}
      <polyline points={path(ratings)} fill="none" className="stroke-highlight" strokeWidth={2.5} strokeLinejoin="round" />
      {ratings.map((mark, index) => {
        const last = index === ratings.length - 1;
        return (
          <g key={mark.startYear}>
            <circle cx={mark.x} cy={mark.y} r={last ? 5 : 4} className={last ? "fill-highlight" : "fill-background stroke-highlight"} strokeWidth={2} />
            <text x={mark.x} y={mark.y - 10} textAnchor="middle" className="fill-foreground font-heading text-[15px]">
              {mark.value}
            </text>
            {labelled.includes(index) && (
              <text x={mark.x} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[11px] tabular-nums">
                {seasonLabel(mark.startYear)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The sheet's « Progression » (docs/design/effectif-adjoint.md § 3.2). For a player of the managed club: the summer
 * passed, his curve at the club, his potential and its room, then the summer to come: with room, about what his league
 * minutes will bring at their rhythm, their gauge and the two bounds; from 30, the decline his age brings. For anyone
 * else's, the summer passed alone, a lead for a signing; nothing without it.
 */
export function PlayerProgression({ profile }: { profile: Pick<PlayerProfile, "overall" | "potential" | "progression"> }) {
  const t = useTranslations("progression");
  const { last, outlook, history } = profile.progression;
  if (outlook === null && (last === null || last === 0)) {
    return null;
  }
  const room = Math.max(0, profile.potential - profile.overall);
  const growth = outlook?.growth ?? null;
  return (
    <section aria-label={t("title")} data-testid="player-sheet-progression" className="space-y-3 rounded-lg bg-background p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="eyebrow text-muted-foreground">{t("title")}</h3>
        {last !== null && last !== 0 && (
          <span className="inline-flex items-baseline gap-1 text-xs text-muted-foreground">
            <LastProgression change={last} className="text-sm" />
            <span aria-hidden>{t("lastSummer")}</span>
          </span>
        )}
      </div>

      {history.length >= 2 && (
        <figure className="space-y-1">
          <figcaption className="text-xs text-muted-foreground">{t("curveTitle")}</figcaption>
          <ProgressionCurve points={history} />
        </figure>
      )}

      {outlook !== null && (
        <p data-testid="player-sheet-potential" className="text-sm font-semibold tabular-nums">
          {room > 0 ? t("potential", { potential: profile.potential, room }) : t("potentialReached", { potential: profile.potential })}
        </p>
      )}

      {growth !== null && growth.starter > 0 && (
        <div data-testid="player-sheet-summer" data-change={growth.expected} className="space-y-1.5">
          <p className="font-heading text-xl leading-none">{t("summer", { change: signedChange(growth.expected) })}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="text-muted-foreground">{t("league")}</span>
            <LeagueMinutesGauge minutes={outlook?.leagueMinutes ?? 0} barClassName="w-24" />
          </p>
          <p data-testid="player-sheet-bounds" className="text-xs text-muted-foreground tabular-nums">
            {t("bounds", { idle: signedChange(growth.idle), starter: signedChange(growth.starter) })}
          </p>
          <p className="text-xs text-muted-foreground">{t("fullEffect", { full: FULL_GROWTH_MINUTES })}</p>
        </div>
      )}

      {outlook?.decline !== null && outlook?.decline !== undefined && (
        <div data-testid="player-sheet-decline" data-change={outlook.decline} className="space-y-1.5">
          <p className="font-heading text-xl leading-none">{t("summer", { change: signedChange(outlook.decline) })}</p>
          <p className="text-xs text-muted-foreground">{t("decline")}</p>
        </div>
      )}
    </section>
  );
}
