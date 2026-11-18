import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { CareerHistoryView } from "@/src/db/career-history";
import type { PlayerRecord } from "@/src/engine/career-history";
import { seasonLabel, seasonStartYear } from "@/src/engine/world";
import { competitionName } from "@/src/i18n/countries";
import { formatDate, formatMoney } from "@/src/lib/format";
import { Panel } from "@/src/components/panel";
import { rankLabel } from "../../_lib/seasons";
import { HISTORY_TITLE } from "./trophy-room";

/** A record: what it is, its value at the right, then the lines that tell it. */
function RecordRow({ testId, label, value, lines }: { testId: string; label: string; value: string; lines: ReactNode[] }) {
  return (
    <div data-testid={testId} className="border-b py-2.5 last:border-b-0">
      <dt className="flex items-baseline justify-between gap-x-3">
        <span className="min-w-0 text-sm font-semibold wrap-break-word">{label}</span>
        <span className="shrink-0 font-heading text-xl leading-none normal-case tabular-nums">{value}</span>
      </dt>
      {lines.map((line, index) => (
        <dd key={index} className="text-[0.8125rem] leading-snug text-muted-foreground tabular-nums wrap-break-word">
          {line}
        </dd>
      ))}
    </div>
  );
}

/**
 * The career's records (docs/design/historique.md § 3): the widest win, the longest unbeaten run (and the one going on),
 * the best points total of each division, the top scorer and the most capped player (and a player at the club close
 * behind), the biggest transfer each way, the most successful youth of the club.
 */
export function CareerRecords({ history }: { history: CareerHistoryView }) {
  const t = useTranslations("seasons.history.records");
  const tSeasons = useTranslations("seasons");
  const tLegends = useTranslations("seasons.history.legends");
  const tWorld = useTranslations("world");
  const tPositions = useTranslations("positions");
  const locale = useLocale();
  const { records, players, clubNames, totals } = history;
  const nameOf = (playerKey: string): string => players.get(playerKey)?.name ?? playerKey;
  const day = (epoch: number): string => formatDate(new Date(epoch), locale);
  const rows: ReactNode[] = [];

  const win = records.biggestWin;
  if (win !== null) {
    rows.push(
      <RecordRow
        key="win"
        testId="record-biggest-win"
        label={t("biggestWin")}
        value={`${win.goalsFor}-${win.goalsAgainst}`}
        lines={[
          t("biggestWinDetail", {
            club: clubNames.get(win.opponentClubSaveId) ?? t("elsewhere"),
            competition: competitionName(win.competitionCode, tWorld),
            season: seasonLabel(win.startYear),
          }),
        ]}
      />,
    );
  }
  const run = records.unbeaten.record;
  if (run !== null) {
    const current = records.unbeaten.current;
    rows.push(
      <RecordRow
        key="unbeaten"
        testId="record-unbeaten"
        label={t("unbeaten")}
        value={t("matches", { count: run.length })}
        lines={[
          run.current ? t("unbeatenOngoing", { from: day(run.from) }) : t("unbeatenDetail", { from: day(run.from), to: day(run.to) }),
          ...(run.current || current === 0 ? [] : [t("currentRun", { count: current })]),
        ]}
      />,
    );
  }
  for (const points of records.points) {
    rows.push(
      <RecordRow
        key={`points-${points.tier}`}
        testId={`record-points-d${points.tier}`}
        label={t("points", { tier: points.tier })}
        value={t("pointsValue", { points: points.points })}
        lines={[t("pointsDetail", { season: seasonLabel(points.startYear), rank: rankLabel(points.rank, tSeasons), played: points.played })]}
      />,
    );
  }
  const playerLines = (record: PlayerRecord, chaser: (name: string, gap: number) => string): string[] => {
    const holder = players.get(record.playerKey);
    const detail = t("playerDetail", { name: nameOf(record.playerKey), position: holder === undefined ? "—" : tPositions(`short.${holder.position}`) });
    return [
      holder?.atClub === true ? `${detail} · ${t("stillHere")}` : detail,
      ...(record.chaser === null ? [] : [chaser(nameOf(record.chaser.playerKey), record.chaser.gap)]),
    ];
  };
  if (records.topScorer !== null) {
    rows.push(
      <RecordRow
        key="scorer"
        testId="record-top-scorer"
        label={t("topScorer")}
        value={t("goals", { count: records.topScorer.value })}
        lines={playerLines(records.topScorer, (name, gap) => t("chaserGoals", { name, gap }))}
      />,
    );
  }
  if (records.mostCapped !== null) {
    rows.push(
      <RecordRow
        key="capped"
        testId="record-most-capped"
        label={t("mostCapped")}
        value={t("matches", { count: records.mostCapped.value })}
        lines={playerLines(records.mostCapped, (name, gap) => t("chaserMatches", { name, gap }))}
      />,
    );
  }
  for (const [transfer, key, label, detail] of [
    [records.biggestIn, "in", t("biggestIn"), "transferIn"],
    [records.biggestOut, "out", t("biggestOut"), "transferOut"],
  ] as const) {
    if (transfer !== null) {
      rows.push(
        <RecordRow
          key={key}
          testId={`record-transfer-${key}`}
          label={label}
          value={formatMoney(transfer.fee, locale)}
          lines={[
            t(detail, {
              name: nameOf(transfer.playerKey),
              club: (transfer.otherClubId === null ? undefined : clubNames.get(transfer.otherClubId)) ?? t("elsewhere"),
              season: seasonLabel(seasonStartYear(new Date(transfer.date))),
            }),
          ]}
        />,
      );
    }
  }
  const youth = records.bestYouth;
  if (youth !== null) {
    const player = players.get(youth.playerKey);
    rows.push(
      <RecordRow
        key="youth"
        testId="record-best-youth"
        label={t("bestYouth")}
        value={tLegends("index", { index: youth.index })}
        lines={[
          t("youthDetail", {
            name: nameOf(youth.playerKey),
            origin: youth.shop ? t("shop") : t("academy", { year: youth.year ?? "" }),
            matches: t("matches", { count: totals.get(youth.playerKey)?.matches ?? 0 }),
            overall: player?.overall ?? 0,
          }),
        ]}
      />,
    );
  }

  return (
    <Panel aria-labelledby="career-records-title" data-testid="career-records" className="space-y-1">
      <h2 id="career-records-title" className={HISTORY_TITLE}>
        {t("title")}
      </h2>
      {rows.length === 0 ? (
        <p data-testid="career-records-empty" className="pt-1 text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <dl>{rows}</dl>
      )}
    </Panel>
  );
}
