"use client";

import { PreviewCard } from "@base-ui/react/preview-card";
import { PlayerFace } from "@/src/components/player-face";
import { HoverCardContent } from "@/src/components/ui/hover-card";
import type { SquadPlayerView } from "@/src/db/squad";
import { formatDate, formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { AttributeBars } from "../../_components/attribute-bars";
import { PositionBadges } from "../../_components/position-badge";
import { clubAccentStyle } from "../../_lib/club-accent";
import { formBarClass, ratingClasses } from "../../_lib/ratings";

/** Wait before the card opens on a hovered row: long enough not to flash while the mouse crosses the table. */
export const PLAYER_CARD_DELAY_MS = 300;

/** One card for the whole squad table: each row is a trigger of this handle, with its player as payload. */
export const playerCardHandle = PreviewCard.createHandle<SquadPlayerView>();

function ConditionGauge({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <dt className="text-[0.625rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{label}</dt>
      <dd className="flex items-center gap-1.5">
        <span aria-hidden className="block h-1 flex-1 rounded-full bg-border">
          <span className={cn("block h-1 rounded-full", formBarClass(value))} style={{ width: `${value}%` }} />
        </span>
        <span className="text-xs font-semibold tabular-nums">{value}</span>
      </dd>
    </div>
  );
}

function PlayerCardBody({ player }: { player: SquadPlayerView }) {
  return (
    <div className="space-y-3" data-player-card={player.playerKey}>
      <div className="flex items-center gap-3">
        <PlayerFace playerKey={player.playerKey} age={player.age} clubColors={player.clubColors} size={48} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-lg leading-tight font-bold">
            {player.firstName} {player.lastName}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <PositionBadges playerKey={player.playerKey} position={player.position} />
            {player.age} ans
          </p>
        </div>
        <div className={cn("rounded-md px-2 py-1 text-center", ratingClasses(player.overall))}>
          <p className="font-heading text-2xl leading-none font-bold tabular-nums" title="Note">
            {player.overall}
          </p>
          <p className="mt-0.5 text-[0.5625rem] font-semibold tracking-[0.12em] uppercase tabular-nums" title="Potentiel">
            Pot. {player.potential}
          </p>
        </div>
      </div>

      <AttributeBars position={player.position} attributes={player.attributes} compact />

      <dl className="grid grid-cols-3 gap-3">
        <ConditionGauge label="Forme" value={player.form} />
        <ConditionGauge label="Moral" value={player.morale} />
        <ConditionGauge label="Condition" value={player.fitness} />
      </dl>

      <dl className="flex justify-between gap-3 border-t pt-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Fin de contrat</dt>
          <dd className={cn("font-semibold", player.contractExpiring && "text-warning")}>
            {player.contractUntil === null ? "—" : formatDate(player.contractUntil)}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-muted-foreground">Salaire</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(player.wage)} / saison</dd>
        </div>
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
            // Portaled out of the save layout: the club accent of the attribute bars is set again here.
            style={payload.clubColors === null ? undefined : clubAccentStyle(payload.clubColors.primary)}
            className="w-72 p-3.5"
          >
            <PlayerCardBody player={payload} />
          </HoverCardContent>
        )
      }
    </PreviewCard.Root>
  );
}
