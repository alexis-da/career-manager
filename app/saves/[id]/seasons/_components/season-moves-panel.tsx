import { useTranslations } from "next-intl";
import { competitionName } from "@/src/i18n/countries";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import type { CountryMoveView } from "@/src/db/promotion";
import { cn } from "@/src/lib/utils";
import { Panel, PanelTitle } from "@/src/components/panel";
import { rankLabel } from "../../_lib/seasons";

/**
 * One side of the season's moves: the clubs going up, or the ones going down, each with its final rank. The marks are the
 * table's: blue for the places going up, orange for the ones going down, the managed club's line on the highlight.
 */
function MoveList({ title, moves, up }: { title: string; moves: CountryMoveView[]; up: boolean }) {
  const t = useTranslations("seasons");
  const tWorld = useTranslations("world");
  const Icon = up ? ArrowUpIcon : ArrowDownIcon;
  return (
    <div className="space-y-1.5" data-testid={up ? "season-moves-promoted" : "season-moves-relegated"}>
      <h3 className="text-[0.8125rem] font-semibold text-muted-foreground">{title}</h3>
      <ul className="space-y-0.5">
        {moves.map((move) => (
          <li
            key={move.clubName}
            data-move={move.reason}
            className={cn("-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1 text-sm font-semibold", move.isManaged && "bg-secondary font-bold")}
          >
            <span
              aria-hidden
              className={cn("grid size-6 shrink-0 place-items-center rounded-sm", up ? "bg-primary text-primary-foreground" : "bg-(--club) text-(--club-fg)")}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0 wrap-break-word">
              {move.clubName}
              {move.isManaged && <span className="sr-only"> ({t("moves.managed")})</span>}
            </span>
            <span
              className="ml-auto shrink-0 text-xs font-medium text-muted-foreground tabular-nums"
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

/** The promotions and relegations of the season in the managed club's country, beside or under its card. */
export function SeasonMovesPanel({ moves }: { moves: CountryMoveView[] }) {
  const t = useTranslations("seasons.moves");
  const promoted = moves.filter((move) => move.reason === "PROMOTED");
  const relegated = moves.filter((move) => move.reason === "RELEGATED");
  return (
    <Panel className="space-y-4" aria-labelledby="season-moves-title" data-testid="season-moves">
      <PanelTitle id="season-moves-title">{t("title")}</PanelTitle>
      {/* From lg, the panel shares the screen with the card: the two lists one under the other. */}
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-1">
        {promoted.length > 0 && <MoveList title={t("promoted")} moves={promoted} up />}
        {relegated.length > 0 && <MoveList title={t("relegated")} moves={relegated} up={false} />}
      </div>
    </Panel>
  );
}
