import { useLocale, useTranslations } from "next-intl";
import { Panel } from "@/src/components/panel";
import type { ContractMovesView } from "@/src/db/contracts";
import { formatMoney } from "@/src/lib/format";
import { SectionTitle } from "./section-title";

/**
 * « Ton adjoint à l'intersaison » (docs/design/simplification.md § 6.9): what the turn that opened the season did to the
 * squad (SeasonBudget.contractMoves), after a turn only: the contracts ending on 30 June renewed, with their new end's
 * year, and those gone free; the free agents its assistant signed to play on, with their bonuses; the young players come
 * from the academy; and the squad it left, against the limit. Each line its count in data-count.
 */
export function SeasonAssistant({ moves }: { moves: ContractMovesView }) {
  const t = useTranslations("seasonStart.assistant");
  const tPositions = useTranslations("positions");
  const locale = useLocale();
  const { renewed, left, signed } = moves;
  return (
    <Panel
      aria-labelledby="season-start-assistant-title"
      data-testid="season-start-assistant"
      data-by-assistant={moves.byAssistant}
      className="space-y-3"
    >
      <SectionTitle id="season-start-assistant-title">{t("title")}</SectionTitle>
      <ul className="space-y-1.5 text-sm leading-snug">
        {renewed.length > 0 && (
          <li data-testid="season-start-renewed" data-count={renewed.length}>
            {t("renewed", {
              count: renewed.length,
              players: renewed
                .map((player) => t("renewedPlayer", { name: player.name, year: String(player.until.getUTCFullYear()) }))
                .join(", "),
            })}
          </li>
        )}
        {left.length > 0 && (
          <li data-testid="season-start-left" data-count={left.length}>
            {t("left", { count: left.length, players: left.map((player) => player.name).join(", ") })}
          </li>
        )}
        {renewed.length === 0 && left.length === 0 && (
          <li data-testid="season-start-no-contracts" className="text-muted-foreground">
            {t("noContracts")}
          </li>
        )}
        {signed.length > 0 && (
          <li data-testid="season-start-signed" data-count={signed.length}>
            {t("signed", {
              count: signed.length,
              players: signed
                .map((player) =>
                  t("signedPlayer", {
                    name: player.name,
                    position: tPositions(`label.${player.position}`).toLocaleLowerCase(locale),
                    bonus: formatMoney(player.bonus, locale),
                  }),
                )
                .join(", "),
            })}
          </li>
        )}
        {moves.youths > 0 && (
          <li data-testid="season-start-youths" data-count={moves.youths}>
            {t("youths", { count: moves.youths })}
          </li>
        )}
        <li data-testid="season-start-squad" data-count={moves.squad} className="font-semibold">
          {t("squad", { count: moves.squad, limit: moves.limit })}
        </li>
      </ul>
    </Panel>
  );
}
