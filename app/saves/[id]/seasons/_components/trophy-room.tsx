import { useTranslations } from "next-intl";
import type { TrophyKind, TrophyRoom as Room } from "@/src/engine/career-history";
import { seasonLabel } from "@/src/engine/world";
import { competitionName } from "@/src/i18n/countries";
import { cn } from "@/src/lib/utils";
import { tournamentName, type CoachTrophyTile } from "../_lib/coach";

/** The section titles of the History tab. */
export const HISTORY_TITLE = "font-heading text-xl leading-tight lg:text-[1.625rem]";

/** A tile of the trophy room: its count, its name, its seasons or years, unlit while still to conquer. */
function Tile({ kind, name, count, toConquer, when }: { kind: string; name: string; count: number; toConquer: boolean; when: string }) {
  return (
    <li
      data-testid="trophy-tile"
      data-kind={kind}
      data-count={count}
      data-to-conquer={String(toConquer)}
      className={cn("flex min-h-28 flex-col gap-1.5 rounded-card border p-3.5", toConquer ? "border-dashed text-muted-foreground" : "bg-card")}
    >
      <span className={cn("font-heading text-[2rem] leading-none normal-case", !toConquer && "text-(--club)")}>{toConquer ? "—" : `×${count}`}</span>
      <span className="text-sm leading-tight font-bold wrap-break-word">{name}</span>
      <span className="text-[0.8125rem] leading-snug tabular-nums">{when}</span>
    </li>
  );
}

/**
 * The trophy room (docs/design/historique.md § 1): a tile for each trophy won, its count and its seasons, the most
 * recent first; a trophy still to win stays, unlit, « À conquérir ». Lost finals counted under it. Then, from his first
 * mission as a national coach, the two summer tournaments (docs/design/selections.md § 5.5), with the years he won them.
 */
export function TrophyRoom({ room, coach = [] }: { room: Room; coach?: readonly CoachTrophyTile[] }) {
  const t = useTranslations("seasons.history.trophies");
  const tWorld = useTranslations("world");
  const tNations = useTranslations("nations");
  const name = (kind: TrophyKind): string =>
    kind === "eu1" ? competitionName("eu.1", tWorld) : kind === "eu2" ? competitionName("eu.2", tWorld) : t(kind);
  return (
    <section aria-labelledby="trophy-room-title" data-testid="trophy-room" className="space-y-3">
      <h2 id="trophy-room-title" className={HISTORY_TITLE}>
        {t("title")}
      </h2>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {room.tiles.map((tile) => (
          <Tile
            key={tile.kind}
            kind={tile.kind}
            name={name(tile.kind)}
            count={tile.seasons.length}
            toConquer={tile.toConquer}
            when={tile.toConquer ? t("toConquer") : tile.seasons.map((year) => seasonLabel(year)).join(" · ")}
          />
        ))}
        {/* Won as national coach: never among the trophies of the club's legends (TROPHY_KINDS). */}
        {coach.map((tile) => (
          <Tile
            key={tile.tournament}
            kind={`coach-${tile.tournament}`}
            name={tournamentName(tile.tournament, tNations)}
            count={tile.years.length}
            toConquer={tile.toConquer}
            when={tile.toConquer ? t("toConquer") : tile.years.join(" · ")}
          />
        ))}
      </ul>
      {room.lostFinals > 0 && (
        <p data-testid="trophy-lost-finals" className="text-sm text-muted-foreground">
          {t("lostFinals", { count: room.lostFinals })}
        </p>
      )}
    </section>
  );
}
