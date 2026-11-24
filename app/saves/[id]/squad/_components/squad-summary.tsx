import { useTranslations } from "next-intl";
import { SQUAD_LIMIT } from "@/src/engine/balance";
import { cn } from "@/src/lib/utils";

/**
 * The squad's count beside its title: its players against SQUAD_LIMIT, in amber once full (nobody more can be signed),
 * then its goalkeepers. No wage bill: the player manages no wage (docs/design/simplification.md § 6.2).
 */
export function SquadSummary({ players, goalkeepers }: { players: number; goalkeepers: number }) {
  const t = useTranslations("squad");
  return (
    <p className="text-sm text-muted-foreground tabular-nums" data-testid="squad-summary">
      <span data-testid="squad-summary-players" className={cn(players >= SQUAD_LIMIT && "text-warning")}>
        <span data-summary="players">{players}</span> {t("playersOf", { count: players, limit: SQUAD_LIMIT })}
      </span>{" "}
      · <span data-summary="goalkeepers">{goalkeepers}</span> {t("goalkeepers", { count: goalkeepers })}
    </p>
  );
}
