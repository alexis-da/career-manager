import { useTranslations } from "next-intl";
import { competitionName } from "@/src/i18n/countries";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import type { CountryMoveView } from "@/src/db/promotion";
import { cn } from "@/src/lib/utils";
import { Panel, PanelTitle } from "../../_components/panel";
import { rankLabel } from "../../_lib/seasons";

/** One side of the season's moves: the clubs going up, or the ones going down, each with its final rank. */
function MoveList({ title, moves, up }: { title: string; moves: CountryMoveView[]; up: boolean }) {
  const t = useTranslations("seasons");
  const tWorld = useTranslations("world");
  const Icon = up ? ArrowUpIcon : ArrowDownIcon;
  return (
    <div className="space-y-2" data-testid={up ? "season-moves-promoted" : "season-moves-relegated"}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="space-y-1.5">
        {moves.map((move) => (
          <li
            key={move.clubName}
            data-move={move.reason}
            className={cn("flex items-center gap-2 text-sm", move.isManaged && "font-semibold text-(--club)")}
          >
            <Icon className={cn("size-4 shrink-0", up ? "text-(--club)" : "text-muted-foreground")} aria-hidden />
            <span>{move.clubName}</span>
            <span
              className="ml-auto text-xs text-muted-foreground tabular-nums"
              title={t("moves.rankIn", { rank: rankLabel(move.rank, t), competition: competitionName(move.from, tWorld) })}
            >
              {rankLabel(move.rank, t)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The promotions and relegations of the season in the managed club's country, under its card. */
export function SeasonMovesPanel({ moves }: { moves: CountryMoveView[] }) {
  const t = useTranslations("seasons.moves");
  const promoted = moves.filter((move) => move.reason === "PROMOTED");
  const relegated = moves.filter((move) => move.reason === "RELEGATED");
  return (
    <Panel className="space-y-4" aria-labelledby="season-moves-title" data-testid="season-moves">
      <PanelTitle id="season-moves-title">{t("title")}</PanelTitle>
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {promoted.length > 0 && <MoveList title={t("promoted")} moves={promoted} up />}
        {relegated.length > 0 && <MoveList title={t("relegated")} moves={relegated} up={false} />}
      </div>
    </Panel>
  );
}
