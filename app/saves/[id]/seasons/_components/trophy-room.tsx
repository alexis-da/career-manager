import { useTranslations } from "next-intl";
import type { TrophyKind, TrophyRoom as Room } from "@/src/engine/career-history";
import { seasonLabel } from "@/src/engine/world";
import { competitionName } from "@/src/i18n/countries";
import { cn } from "@/src/lib/utils";

/** The section titles of the History tab. */
export const HISTORY_TITLE = "font-heading text-xl leading-tight lg:text-[1.625rem]";

/**
 * The trophy room (docs/design/historique.md § 1): a tile for each trophy won, its count and its seasons, the most
 * recent first; a trophy still to win stays, unlit, « À conquérir ». Lost finals counted under it.
 */
export function TrophyRoom({ room }: { room: Room }) {
  const t = useTranslations("seasons.history.trophies");
  const tWorld = useTranslations("world");
  const name = (kind: TrophyKind): string =>
    kind === "eu1" ? competitionName("eu.1", tWorld) : kind === "eu2" ? competitionName("eu.2", tWorld) : t(kind);
  return (
    <section aria-labelledby="trophy-room-title" data-testid="trophy-room" className="space-y-3">
      <h2 id="trophy-room-title" className={HISTORY_TITLE}>
        {t("title")}
      </h2>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {room.tiles.map((tile) => (
          <li
            key={tile.kind}
            data-testid="trophy-tile"
            data-kind={tile.kind}
            data-count={tile.seasons.length}
            data-to-conquer={String(tile.toConquer)}
            className={cn(
              "flex min-h-28 flex-col gap-1.5 rounded-card border p-3.5",
              tile.toConquer ? "border-dashed text-muted-foreground" : "bg-card",
            )}
          >
            <span className={cn("font-heading text-[2rem] leading-none normal-case", !tile.toConquer && "text-(--club)")}>
              {tile.toConquer ? "—" : `×${tile.seasons.length}`}
            </span>
            <span className="text-sm leading-tight font-bold wrap-break-word">{name(tile.kind)}</span>
            <span className="text-[0.8125rem] leading-snug tabular-nums">
              {tile.toConquer ? t("toConquer") : tile.seasons.map((year) => seasonLabel(year)).join(" · ")}
            </span>
          </li>
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
