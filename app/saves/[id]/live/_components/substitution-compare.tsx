"use client";

import { useTranslations } from "next-intl";
import { ArrowRightLeftIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { PlayerFace } from "@/src/components/player-face";
import { Button } from "@/src/components/ui/button";
import type { HalfTimePlayer, MatchActions } from "@/src/db/live-match";
import { positionGroup } from "@/src/engine/positions";
import type { ClubColors } from "@/src/lib/color";
import { getOrThrow } from "@/src/lib/maps";
import { cn } from "@/src/lib/utils";
import { FitnessGauge } from "../../_components/fitness-gauge";
import { FormArrow } from "../../_components/form-arrow";
import { FitLabel } from "../../_components/position-badge";
import { slotRating } from "../../_lib/positions";
import type { HalfTimeRules, HalfTimeState, SuggestedChange } from "../_lib/half-time-moves";
import { actionsDone, better, comparedChange, comparison, incomingFor, outgoingSlots, type ComparedPlayer } from "../_lib/substitution-compare";

/** A list to pick a player from: a thumb's height on a phone, as the formation's. */
const SELECT =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-input/30 px-2 text-sm font-semibold text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:h-11";

type SubstitutionCompareProps = {
  state: HalfTimeState;
  rules: HalfTimeRules;
  players: ReadonlyMap<string, HalfTimePlayer>;
  suggestion: SuggestedChange | null; // the assistant's change, which the comparison opens on
  substitutionsLeft: number;
  clubColors: ClubColors;
  onApply: (slot: number, incoming: string) => void;
};

/**
 * Every substitution the player can make at the pause, two at a glance: the player going off and the one coming on, side
 * by side, picked from two lists, the assistant's suggestion first. For each: his rating in the slot and how he fits it,
 * his condition at the restart, his form, what he has done in the match (goals, assists, cards) and the three attributes
 * the engine weighs most in the slot's line; the better figure stands out. Readable from 360 px, nothing sideways: the
 * lists stack, the names wrap, the labels sit in the middle column. Nothing when no substitution can be made.
 */
export function SubstitutionCompare({ state, rules, players, suggestion, substitutionsLeft, clubColors, onApply }: SubstitutionCompareProps) {
  const t = useTranslations("halfTime");
  const tPlayer = useTranslations("player");
  const tPositions = useTranslations("positions");
  const [picked, setPicked] = useState<{ out: string; in: string } | null>(null);

  const change = comparedChange(state, rules, players, picked);
  if (change === null) {
    return null;
  }
  const suggested = suggestion !== null && suggestion.out === change.out && suggestion.in === change.in;
  const compared = comparison(change, players);
  const outgoing = outgoingSlots(state, rules);
  const incoming = incomingFor(state, players, change.position);
  const playerOf = (key: string): HalfTimePlayer => getOrThrow(players, key, "player");
  const nameOf = (key: string): string => `${playerOf(key).firstName} ${playerOf(key).lastName}`;

  const pickOut = (key: string): void => {
    const slot = outgoing.find((candidate) => candidate.key === key);
    if (slot !== undefined) {
      // The best substitute for him, as the assistant would bring on.
      setPicked({ out: key, in: incomingFor(state, players, slot.position)[0] });
    }
  };

  const apply = (): void => {
    onApply(change.slot, change.in);
    // The next change worth making, or the best one left.
    setPicked(null);
  };

  return (
    <section
      data-testid="half-time-compare"
      data-suggested={suggested ? "true" : "false"}
      data-out-key={change.out}
      data-in-key={change.in}
      className="space-y-3"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="eyebrow text-highlight">
          {suggested ? t("suggestion.title", { count: substitutionsLeft }) : t("compare.title", { count: substitutionsLeft })}
        </h3>
        {suggested && (
          <span className="rounded-full bg-highlight px-2 py-0.5 text-[0.6875rem] leading-tight font-bold tracking-wide text-background uppercase">
            {t("compare.suggested")}
          </span>
        )}
      </div>

      {/* One under the other at every width: the panel is never wider than 512 px, and a name must not be cut. */}
      <div className="grid gap-2">
        <label className="grid min-w-0 gap-1 text-xs font-semibold text-muted-foreground">
          {t("compare.out")}
          <select value={change.out} onChange={(event) => pickOut(event.target.value)} data-testid="half-time-compare-out" className={SELECT}>
            {outgoing.map((slot) => (
              <option key={slot.key} value={slot.key}>
                {t("compare.outOption", {
                  position: tPositions(`short.${slot.position}`),
                  name: nameOf(slot.key),
                  injured: String(rules.injured.has(slot.key)),
                })}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-semibold text-muted-foreground">
          {t("compare.in")}
          <select
            value={change.in}
            onChange={(event) => setPicked({ out: change.out, in: event.target.value })}
            data-testid="half-time-compare-in"
            className={SELECT}
          >
            {incoming.map((key) => (
              <option key={key} value={key}>
                {t("compare.inOption", { name: nameOf(key), rating: slotRating(playerOf(key), change.position) })}
              </option>
            ))}
          </select>
        </label>
      </div>

      <table data-testid="half-time-compare-table" className="w-full table-fixed border-separate border-spacing-y-1 text-sm">
        <caption className="sr-only">{t("compare.caption", { out: nameOf(change.out), in: nameOf(change.in) })}</caption>
        <colgroup>
          <col />
          <col className="w-27" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <ComparedName player={playerOf(change.out)} clubColors={clubColors} side="out" label={t("compare.out")} />
            <td aria-hidden className="text-center align-middle">
              <ArrowRightLeftIcon className="mx-auto size-5 text-(--club)" />
            </td>
            <ComparedName player={playerOf(change.in)} clubColors={clubColors} side="in" label={t("compare.in")} />
          </tr>
        </thead>
        <tbody>
          <CompareRow
            row="rating"
            label={t("compare.rating", { position: tPositions(`short.${change.position}`) })}
            winner={better(compared.out.rating, compared.in.rating)}
            out={<RatingCell player={compared.out} />}
            in={<RatingCell player={compared.in} />}
          />
          <CompareRow
            row="fitness"
            label={tPlayer("fitness")}
            winner={better(Math.round(compared.out.fitness), Math.round(compared.in.fitness))}
            out={<FitnessGauge fitness={compared.out.fitness} moment="restart" className="max-w-full" />}
            in={<FitnessGauge fitness={compared.in.fitness} moment="restart" className="max-w-full" />}
          />
          <CompareRow
            row="form"
            label={tPlayer("form")}
            winner={better(compared.out.form, compared.in.form)}
            out={<FormCell form={compared.out.form} />}
            in={<FormCell form={compared.in.form} />}
          />
          <CompareRow
            row="match"
            label={t("compare.match")}
            winner={null}
            out={<ActionsCell actions={compared.out.actions} />}
            in={<ActionsCell actions={compared.in.actions} />}
          />
          <tr>
            <th colSpan={3} scope="colgroup" className="pt-2 text-center text-xs font-bold tracking-wide text-highlight uppercase">
              {t("compare.keyAttributes", { line: positionGroup(change.position) })}
            </th>
          </tr>
          {compared.attributes.map((name, index) => (
            <CompareRow
              key={name}
              row={name}
              label={tPlayer(`attributes.${name}`)}
              winner={better(compared.out.attributes[index], compared.in.attributes[index])}
              out={<span className="font-heading text-lg leading-none tabular-nums">{compared.out.attributes[index]}</span>}
              in={<span className="font-heading text-lg leading-none tabular-nums">{compared.in.attributes[index]}</span>}
            />
          ))}
        </tbody>
      </table>

      <Button variant="outline" className="h-11 w-full" onClick={apply} data-testid="half-time-compare-apply">
        {t("compare.apply")}
      </Button>
    </section>
  );
}

type CompareRowProps = {
  row: string;
  label: string;
  winner: "out" | "in" | null; // whose figure stands out
  out: ReactNode;
  in: ReactNode;
};

/** A line of the comparison: the player going off on the left, his figure toward the middle, the one coming on on the right. */
function CompareRow({ row, label, winner, out, in: incoming }: CompareRowProps) {
  const cell = (side: "out" | "in"): string =>
    cn(
      "min-w-0 rounded-md px-2 py-1.5 align-middle wrap-break-word",
      side === "out" ? "text-right" : "text-left",
      winner === side ? "bg-secondary font-bold text-foreground" : "text-muted-foreground",
    );
  return (
    <tr data-compare-row={row} data-better={winner ?? "none"}>
      <td className={cell("out")}>{out}</td>
      <th scope="row" className="px-1 text-center text-xs leading-tight font-semibold text-muted-foreground">
        {label}
      </th>
      <td className={cell("in")}>{incoming}</td>
    </tr>
  );
}

/** A player's name over his column: his face from 640 px, his first name, then his last name, whole on two lines at worst. */
function ComparedName({ player, clubColors, side, label }: { player: HalfTimePlayer; clubColors: ClubColors; side: "out" | "in"; label: string }) {
  return (
    <th scope="col" data-compare-player={side} data-player-key={player.id} className={cn("min-w-0 align-bottom font-normal", side === "out" ? "text-right" : "text-left")}>
      <span className={cn("flex min-w-0 items-end gap-2", side === "out" && "flex-row-reverse")}>
        <PlayerFace playerKey={player.id} age={player.age} clubColors={clubColors} size={36} className="shrink-0 max-sm:hidden" />
        <span className="flex min-w-0 flex-col">
          <span className={cn("text-[0.6875rem] font-bold tracking-wide uppercase", side === "out" ? "text-loss" : "text-win")}>{label}</span>
          <span className="text-xs text-muted-foreground wrap-break-word">{player.firstName}</span>
          <span data-compare-name className="font-bold text-foreground wrap-break-word">
            {player.lastName}
          </span>
        </span>
      </span>
    </th>
  );
}

/** His rating in the slot, large, and how he fits it, in the colour that warns of it. */
function RatingCell({ player }: { player: ComparedPlayer }) {
  return (
    <span className="inline-flex flex-col">
      <span className="font-heading text-2xl leading-none tabular-nums">{player.rating}</span>
      <FitLabel fit={player.fit} className="text-xs leading-tight" />
    </span>
  );
}

/** His form, the arrow and the figure. */
function FormCell({ form }: { form: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <FormArrow form={form} />
      {form}
    </span>
  );
}

/** What he has done in the match, in words; a substitute has not played. */
function ActionsCell({ actions }: { actions: MatchActions | null }) {
  const t = useTranslations("halfTime");
  if (actions === null) {
    return <span className="text-xs">{t("compare.notOn")}</span>;
  }
  const done = actionsDone(actions);
  if (done.length === 0) {
    return <span className="text-xs">{t("compare.nothing")}</span>;
  }
  return (
    <span className="text-xs leading-snug">
      {done.map(({ action, count }) => t(`compare.actions.${action}`, { count })).join(" · ")}
    </span>
  );
}
