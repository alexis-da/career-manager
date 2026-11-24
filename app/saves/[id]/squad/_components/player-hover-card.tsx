"use client";

import { PreviewCard } from "@base-ui/react/preview-card";
import { useLocale, useTranslations } from "next-intl";
import { PlayerFace } from "@/src/components/player-face";
import { HoverCardContent } from "@/src/components/ui/hover-card";
import type { SquadPlayerView } from "@/src/db/squad";
import { formatDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { AttributeBars } from "../../_components/attribute-bars";
import { PositionBadges } from "../../_components/position-badge";
import { fitnessBarClass, fitnessFigure, fitnessWidth } from "../../_lib/fitness";
import { formBarClass, ratingClasses } from "../../_lib/ratings";

/** Wait before the card opens on a hovered row: long enough not to flash while the mouse crosses the table. */
export const PLAYER_CARD_DELAY_MS = 300;

/** One card for the whole squad table: each row is a trigger of this handle, with its player as payload. */
export const playerCardHandle = PreviewCard.createHandle<SquadPlayerView>();

type ConditionGaugeProps = {
  label: string;
  value: number;
  barClass: string;
  width: string;
  title?: string; // what the short label leaves out
};

/** A gauge of the card: its label, a bar of the given colour and width, and the figure. */
function ConditionGauge({ label, value, barClass, width, title }: ConditionGaugeProps) {
  return (
    <div title={title} className="space-y-1">
      <dt className="text-[0.625rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{label}</dt>
      <dd className="flex items-center gap-1.5">
        <span aria-hidden className="block h-1 flex-1 rounded-full bg-border">
          <span className={cn("block h-1 rounded-full", barClass)} style={{ width }} />
        </span>
        <span className="text-xs font-semibold tabular-nums">{value}</span>
      </dd>
    </div>
  );
}

/** What the card shows of a player: never his wage, which the player does not manage. */
type CardPlayer = Pick<
  SquadPlayerView,
  | "playerKey"
  | "firstName"
  | "lastName"
  | "age"
  | "clubColors"
  | "position"
  | "overall"
  | "potential"
  | "attributes"
  | "form"
  | "fitness"
  | "fitnessAtNextMatch"
  | "contractUntil"
  | "contractExpiring"
>;

/** The card's content: who he is, his ratings and attributes, his form, fitness and contract's end. */
export function PlayerCardBody({ player }: { player: CardPlayer }) {
  const t = useTranslations("player");
  const locale = useLocale();
  return (
    <div className="space-y-3" data-player-card={player.playerKey} data-testid="player-card">
      <div className="flex items-center gap-3">
        <PlayerFace playerKey={player.playerKey} age={player.age} clubColors={player.clubColors} size={48} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-lg leading-tight font-bold">
            {player.firstName} {player.lastName}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <PositionBadges playerKey={player.playerKey} position={player.position} />
            {t("age", { age: player.age })}
          </p>
        </div>
        <div className={cn("rounded-md px-2 py-1 text-center", ratingClasses(player.overall))}>
          <p className="font-heading text-2xl leading-none font-bold tabular-nums" title={t("rating")}>
            {player.overall}
          </p>
          <p className="mt-0.5 text-[0.5625rem] font-semibold tracking-[0.12em] uppercase tabular-nums" title={t("potential")}>
            {t("potentialShort", { potential: player.potential })}
          </p>
        </div>
      </div>

      <AttributeBars position={player.position} attributes={player.attributes} compact />

      <dl className="grid grid-cols-2 gap-3">
        <ConditionGauge label={t("form")} value={player.form} barClass={formBarClass(player.form)} width={`${player.form}%`} />
        <ConditionGauge
          label={t("fitness")}
          value={fitnessFigure(player.fitness)}
          barClass={fitnessBarClass(player.fitness)}
          width={fitnessWidth(player.fitness)}
          title={t(`fitnessAt.${player.fitnessAtNextMatch ? "nextMatch" : "today"}`, { fitness: fitnessFigure(player.fitness) })}
        />
      </dl>

      {/* His contract's end, and no wage: the player manages none (docs/design/simplification.md § 6.2). */}
      <dl className="border-t pt-2 text-xs">
        <dt className="text-muted-foreground">{t("contractEnd")}</dt>
        <dd className={cn("font-semibold", player.contractExpiring && "text-warning")}>
          {player.contractUntil === null ? "—" : formatDate(player.contractUntil, locale)}
        </dd>
      </dl>
    </div>
  );
}

/**
 * The card of the hovered or focused row of the squad. A visual shortcut for mouse and keyboard users only: the
 * sheet opened by a click holds the same information and more.
 */
export function PlayerHoverCard() {
  return (
    // The primitive root rather than the HoverCard wrapper, which types the payload as unknown.
    <PreviewCard.Root handle={playerCardHandle}>
      {({ payload }) =>
        payload === undefined ? null : (
          <HoverCardContent
            side="right"
            align="start"
            sideOffset={12}
            className="w-72 p-3.5"
          >
            <PlayerCardBody player={payload} />
          </HoverCardContent>
        )
      }
    </PreviewCard.Root>
  );
}
