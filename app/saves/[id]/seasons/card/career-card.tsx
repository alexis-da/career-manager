/* eslint-disable @next/next/no-img-element -- ImageResponse renders plain elements only */
import { ImageResponse } from "next/og";
import type { CSSProperties, ReactNode } from "react";
import type { CareerHistoryView } from "@/src/db/career-history";
import type { CoachHistory } from "@/src/db/national-view";
import { TROPHY_KINDS, type TrophyKind } from "@/src/engine/career-history";
import { OLD_CONTINENT_CUP, type TournamentCode } from "@/src/engine/tournaments";
import { seasonLabel } from "@/src/engine/world";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { clubAccentsOn, type ClubColors } from "@/src/lib/color";
import { faceDataUri } from "@/src/og/face-image";
import { DISPLAY_FONT, imageFonts } from "@/src/og/fonts";
import { divisionsPath } from "../_lib/career";
import { COACH_TOURNAMENTS } from "../_lib/coach";
import {
  brandIcon,
  CARD_SIZES,
  column,
  FACE_BACKGROUND,
  MIDNIGHT_BLUE,
  MUTED,
  Ornament,
  ORANGE,
  PLAIN_DRESS,
  row,
  Stat,
  type CardDress,
  type CardFormat,
} from "../[seasonId]/card/season-card";

// The shareable card of a career (docs/design/historique.md § 5): the brand's midnight blue, the club's colors as
// accents, and never a club name, real or fictional, nor its initials, nor the manager's name nor the save's (CLAUDE.md,
// « Communication sortante »): its trophies, the summer tournaments won as a national coach among them
// (docs/design/selections.md § 9.10), two records by their figures alone (never the opponent), its first legend.

/** A row whose items go on to the next line when it is full. */
const WRAPPING_ROW: CSSProperties = { ...row, flexWrap: "wrap" };

/** The career as its card shows it: the history of its completed seasons (the career as its last season left it). */
export type CareerCardData = {
  seasons: number;
  firstYear: number | null;
  lastYear: number | null;
  path: string | null; // « D2 → D1 »
  trophies: { kind: TrophyKind; count: number }[]; // won only, in the trophy room's order
  coachTitles: { tournament: TournamentCode; count: number }[]; // won as a national coach, the Old Continent's first
  biggestWin: string | null; // « 7-0 »
  unbeaten: number | null; // matches
  player: { title: "legend" | "topScorer"; playerKey: string; name: string; age: number; matches: number; goals: number } | null;
  objectives: { met: number; total: number } | null;
};

/**
 * What a career's card shows, from the history of its completed seasons: its first legend, else its top scorer; and the
 * summer tournaments its manager won as a national coach (getCoachHistory), those that ended a completed season only.
 */
export function careerCardData(history: CareerHistoryView, coach: Pick<CoachHistory, "titles"> | null = null): CareerCardData {
  const { summary, records, players, totals } = history;
  // A tournament ends the season before its year: the last completed season's, at the latest.
  const lastTournamentYear = summary.lastYear === null ? null : summary.lastYear + 1;
  const coachTitles = COACH_TOURNAMENTS.flatMap((tournament) => {
    const count = (coach?.titles ?? []).filter(
      (title) => title.tournament === tournament && lastTournamentYear !== null && title.year <= lastTournamentYear,
    ).length;
    return count > 0 ? [{ tournament, count }] : [];
  });
  const legend = history.legends[0];
  const scorer = records.topScorer;
  const featured = legend !== undefined ? { title: "legend" as const, playerKey: legend.playerKey } : scorer !== null ? { title: "topScorer" as const, playerKey: scorer.playerKey } : null;
  const featuredPlayer = featured === null ? undefined : players.get(featured.playerKey);
  const win = records.biggestWin;
  return {
    seasons: summary.seasons,
    firstYear: summary.firstYear,
    lastYear: summary.lastYear,
    path: divisionsPath(summary.path),
    trophies: TROPHY_KINDS.flatMap((kind) => {
      const count = history.trophyRoom.tiles.find((tile) => tile.kind === kind)?.seasons.length ?? 0;
      return count > 0 ? [{ kind, count }] : [];
    }),
    coachTitles,
    biggestWin: win === null ? null : `${win.goalsFor}-${win.goalsAgainst}`,
    unbeaten: records.unbeaten.record?.length ?? null,
    player:
      featured === null || featuredPlayer === undefined
        ? null
        : {
            title: featured.title,
            playerKey: featured.playerKey,
            name: featuredPlayer.name,
            age: featuredPlayer.age,
            matches: totals.get(featured.playerKey)?.matches ?? 0,
            goals: totals.get(featured.playerKey)?.goals ?? 0,
          },
    objectives: summary.objectives,
  };
}

function FeaturedPlayer({
  player,
  clubColors,
  accent,
  faceSize,
  square,
  t,
}: {
  player: NonNullable<CareerCardData["player"]>;
  clubColors: ClubColors;
  accent: string;
  faceSize: number;
  square: boolean;
  t: Translator<"careerCard">;
}): ReactNode {
  const face = faceDataUri(player.playerKey, player.age, clubColors, faceSize, FACE_BACKGROUND);
  const ring = 8;
  return (
    <div style={{ ...(square ? row : column), alignItems: "center" }}>
      <div style={{ display: "flex", width: faceSize + ring * 2, height: faceSize + ring * 2, borderRadius: faceSize, border: `${ring}px solid ${accent}` }}>
        <img src={face} width={faceSize} height={faceSize} alt="" />
      </div>
      <div style={{ ...column, alignItems: square ? "flex-start" : "center", marginLeft: square ? 44 : 0, marginTop: square ? 0 : 18 }}>
        <div style={{ fontSize: 26, color: ORANGE, letterSpacing: 2 }}>{t(player.title === "legend" ? "legend" : "topScorer")}</div>
        <div style={{ marginTop: 4, fontSize: 50, lineHeight: 1.05 }}>{player.name}</div>
        <div style={{ marginTop: 6, fontSize: 30, color: MUTED }}>{t("playerFigures", { matches: player.matches, goals: player.goals })}</div>
      </div>
    </div>
  );
}

/** The card of a career as a PNG response, 1200 × 630 or 1080 × 1080, in the player's language and dress. */
export async function careerCardResponse(
  data: CareerCardData,
  clubColors: ClubColors,
  format: CardFormat,
  t: Translator<"careerCard">,
  locale: Locale,
  dress: CardDress = PLAIN_DRESS,
): Promise<ImageResponse> {
  const [fonts, logo] = await Promise.all([imageFonts(), brandIcon()]);
  const square = format === "square";
  const [accent, secondary] = clubAccentsOn(clubColors, MIDNIGHT_BLUE, ORANGE);

  const span =
    data.firstYear === null || data.lastYear === null
      ? t("firstSeason")
      : t("span", { first: seasonLabel(data.firstYear), last: seasonLabel(data.lastYear), count: data.seasons });
  // The club's trophies, then the summer tournaments won as a national coach.
  const won = [
    ...data.trophies.map(({ kind, count }) => t(kind, { count })),
    ...data.coachTitles.map(({ tournament, count }) => t(tournament === OLD_CONTINENT_CUP ? "coachEu" : "coachWorld", { count })),
  ];
  const trophies = won.length === 0 ? [t("noTrophy")] : won;
  // One under another as long as they fit, 4 in landscape and 6 square; beyond, side by side and a little smaller, on as
  // many lines as they need.
  const flowing = trophies.length > (square ? 6 : 4);
  const headline = (
    <div style={column}>
      <div style={{ ...row, alignItems: "center" }}>
        <div style={{ fontSize: square ? 96 : 80, lineHeight: 0.95, color: accent }}>{t("title")}</div>
        {data.objectives !== null && (
          <div
            style={{
              display: "flex",
              marginLeft: 28,
              padding: "5px 18px",
              border: `3px solid ${ORANGE}`,
              borderRadius: 40,
              fontSize: square ? 30 : 26,
              color: ORANGE,
            }}
          >
            {t("objectives", { met: data.objectives.met, total: data.objectives.total })}
          </div>
        )}
      </div>
      <div style={{ marginTop: 10, fontSize: square ? 34 : 30 }}>{span}</div>
      {data.path !== null && <div style={{ marginTop: 2, fontSize: square ? 30 : 26, color: MUTED }}>{data.path}</div>}
      <div style={{ ...(flowing ? WRAPPING_ROW : column), marginTop: square ? 28 : 18 }}>
        {trophies.map((line, index) => (
          <div
            key={index}
            style={{ ...row, alignItems: "center", marginTop: flowing ? 6 : index === 0 ? 0 : 6, marginRight: flowing ? 28 : 0 }}
          >
            <div style={{ display: "flex", width: 14, height: 14, borderRadius: 7, background: ORANGE, marginRight: 14 }} />
            <div style={{ fontSize: flowing ? (square ? 32 : 26) : square ? 38 : 32 }}>{line}</div>
          </div>
        ))}
      </div>
      {(data.biggestWin !== null || data.unbeaten !== null) && (
        <div style={{ ...row, marginTop: square ? 32 : 20 }}>
          {data.biggestWin !== null && <Stat value={data.biggestWin} label={t("biggestWin")} size={square ? 64 : 54} />}
          {data.unbeaten !== null && <Stat value={t("matches", { count: data.unbeaten })} label={t("unbeaten")} size={square ? 64 : 54} />}
        </div>
      )}
    </div>
  );
  const footer = (
    <div style={{ ...row, alignItems: "center" }}>
      <img src={logo} width={48} height={48} alt="" />
      <div style={{ marginLeft: 14, fontSize: 32, letterSpacing: 1 }}>latewinner.app</div>
      {dress.title !== null && (
        <div style={{ marginLeft: "auto", paddingLeft: 24, fontSize: square ? 30 : 26, color: accent }}>
          {t("manager", { title: dress.title.toLocaleUpperCase(locale) })}
        </div>
      )}
    </div>
  );
  const player =
    data.player === null ? null : (
      <FeaturedPlayer player={data.player} clubColors={clubColors} accent={accent} faceSize={square ? 220 : 220} square={square} t={t} />
    );
  const inset = dress.frame.width;
  const ornamentSize = inset * 2;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: dress.frame.border, padding: inset }}>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            position: "relative",
            background: MIDNIGHT_BLUE,
            color: "white",
            fontFamily: DISPLAY_FONT,
            fontStyle: "italic",
            fontWeight: 800,
          }}
        >
          {/* The club's two colors, as a band along the left edge. */}
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 18, background: accent }} />
          {secondary !== undefined && <div style={{ position: "absolute", left: 18, top: 0, bottom: 0, width: 8, background: secondary }} />}
          {square ? (
            <div style={{ ...column, justifyContent: "space-between", flex: 1, padding: `${60 - inset}px ${64 - inset}px ${56 - inset}px ${90 - inset}px` }}>
              {headline}
              {player}
              {footer}
            </div>
          ) : (
            <div style={{ ...row, flex: 1, padding: `${44 - inset}px ${56 - inset}px ${40 - inset}px ${82 - inset}px` }}>
              <div style={{ ...column, justifyContent: "space-between", flex: 1 }}>
                {headline}
                {footer}
              </div>
              {player !== null && <div style={{ ...column, justifyContent: "center", width: 380 }}>{player}</div>}
            </div>
          )}
        </div>
        {dress.frame.ornament !== "none" &&
          ([
            { left: inset - ornamentSize / 2, top: inset - ornamentSize / 2 },
            { right: inset - ornamentSize / 2, top: inset - ornamentSize / 2 },
            { left: inset - ornamentSize / 2, bottom: inset - ornamentSize / 2 },
            { right: inset - ornamentSize / 2, bottom: inset - ornamentSize / 2 },
          ] as const).map((corner, index) => (
            <div key={index} style={{ position: "absolute", display: "flex", ...corner }}>
              <Ornament kind={dress.frame.ornament} color={dress.frame.ornamentColor} size={ornamentSize} />
            </div>
          ))}
      </div>
    ),
    {
      ...CARD_SIZES[format],
      fonts,
      // The card of one player's save: never kept by a shared cache.
      headers: { "Cache-Control": "private, max-age=0" },
    },
  );
}
