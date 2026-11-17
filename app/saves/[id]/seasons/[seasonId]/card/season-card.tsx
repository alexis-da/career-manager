/* eslint-disable @next/next/no-img-element -- ImageResponse renders plain elements only */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { CSSProperties, ReactNode } from "react";
import type { ClosedObjectivesView } from "@/src/db/objectives";
import type { SeasonResultView } from "@/src/db/season-results";
import { seasonLabel } from "@/src/engine/world";
import { competitionName } from "@/src/i18n/countries";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { clubAccentsOn, type ClubColors } from "@/src/lib/color";
import { frameStyleOf, type FrameStyle } from "@/src/lib/cosmetics";
import { formatDecimal } from "@/src/lib/format";
import { faceDataUri } from "@/src/og/face-image";
import { DISPLAY_FONT, imageFonts } from "@/src/og/fonts";

import { moveLabel, rankLabel, recordLabel } from "../../../_lib/seasons";

// The shareable card of a season: the brand's midnight blue, the club's colors as accents, and never a club name, real
// or fictional (CLAUDE.md, « Communication sortante »). The competition keeps its neutral name.

export type CardFormat = "landscape" | "square";

/** What the card's words come from, in the player's language: satori draws it outside React, without its context. */
export type CardTranslators = {
  positions: Translator<"positions">;
  world: Translator<"world">;
  seasons: Translator<"seasons">;
  seasonCard: Translator<"seasonCard">;
  objectives: Translator<"objectives">;
};

export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  landscape: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
};

/** What a card says of a season's objectives: how many were met, out of how many counted. */
export type CardObjectives = Pick<ClosedObjectivesView, "met" | "total">;

/**
 * What the player wears on the card (missions v2, docs/design/missions-v2.md § 3.3): a frame of the collection around it,
 * and the manager's title in words when one is chosen. The night frame and no title: the card as it was.
 */
export type CardDress = { frame: FrameStyle; title: string | null };

export const PLAIN_DRESS: CardDress = { frame: frameStyleOf(null), title: null };

/** A frame's ornament, at each corner of the card, in SVG. */
function Ornament({ kind, color, size }: { kind: FrameStyle["ornament"]; color: string; size: number }) {
  switch (kind) {
    case "dot":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="7" fill={color} />
        </svg>
      );
    case "star":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7-6.3-3.8-6.3 3.8 1.7-7L2 9.5l7.1-.6z" fill={color} />
        </svg>
      );
    case "laurel":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path d="M12 21C6 18 4 12 5 4" stroke={color} strokeWidth="1.6" fill="none" />
          <path d="M12 21C18 18 20 12 19 4" stroke={color} strokeWidth="1.6" fill="none" />
          <ellipse cx="5.6" cy="8.5" rx="1.7" ry="3.2" fill={color} transform="rotate(-25 5.6 8.5)" />
          <ellipse cx="7.4" cy="14.4" rx="1.7" ry="3.2" fill={color} transform="rotate(-45 7.4 14.4)" />
          <ellipse cx="18.4" cy="8.5" rx="1.7" ry="3.2" fill={color} transform="rotate(25 18.4 8.5)" />
          <ellipse cx="16.6" cy="14.4" rx="1.7" ry="3.2" fill={color} transform="rotate(45 16.6 14.4)" />
        </svg>
      );
    case "none":
      return null;
  }
}

const MIDNIGHT_BLUE = "#0B1340";
const FACE_BACKGROUND = "#1A2560";
const ORANGE = "#FF9F1C";
const MUTED = "rgba(255, 255, 255, 0.68)";

let icon: Promise<string> | undefined;

function brandIcon(): Promise<string> {
  icon ??= readFile(join(process.cwd(), "public/brand/late-winner-icone.svg"), "base64").then(
    (data) => `data:image/svg+xml;base64,${data}`,
  );
  return icon;
}

const column: CSSProperties = { display: "flex", flexDirection: "column" };
const row: CSSProperties = { display: "flex", flexDirection: "row" };

function Stat({ value, label, size }: { value: string; label: string; size: number }) {
  return (
    <div style={{ ...column, marginRight: size * 0.75 }}>
      <div style={{ fontSize: size, lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: size * 0.4, color: MUTED, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function BestPlayer({
  season,
  clubColors,
  accent,
  faceSize,
  square,
  t,
  locale,
}: {
  season: SeasonResultView;
  clubColors: ClubColors;
  accent: string;
  faceSize: number;
  square: boolean;
  t: CardTranslators;
  locale: Locale;
}): ReactNode {
  const player = season.bestPlayer;
  if (player === null) {
    return <div style={{ display: "flex", fontSize: 34, color: MUTED }}>{t.seasonCard("noBestPlayer")}</div>;
  }
  const face = faceDataUri(player.playerKey, player.age, clubColors, faceSize, FACE_BACKGROUND);
  const ring = 8;
  return (
    <div style={{ ...(square ? row : column), alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          width: faceSize + ring * 2,
          height: faceSize + ring * 2,
          borderRadius: faceSize,
          border: `${ring}px solid ${accent}`,
        }}
      >
        <img src={face} width={faceSize} height={faceSize} alt="" />
      </div>
      <div style={{ ...column, alignItems: square ? "flex-start" : "center", marginLeft: square ? 48 : 0, marginTop: square ? 0 : 20 }}>
        <div style={{ fontSize: 26, color: ORANGE, letterSpacing: 2 }}>{t.seasonCard("bestPlayer")}</div>
        <div style={{ marginTop: 4, fontSize: 54, lineHeight: 1.05 }}>{player.name}</div>
        <div style={{ marginTop: 2, fontSize: 28, color: MUTED }}>{t.positions(`label.${player.position}`)}</div>
        <div style={{ ...row, marginTop: 14 }}>
          <Stat value={String(player.goals)} label={t.seasonCard("playerGoals")} size={44} />
          <Stat value={String(player.assists)} label={t.seasonCard("playerAssists")} size={44} />
          <Stat value={formatDecimal(player.rating, locale)} label={t.seasonCard("playerRating")} size={44} />
        </div>
      </div>
    </div>
  );
}

/**
 * The word a card shows in place of the rank, underlined in orange, and the smaller line under it: « DOUBLÉ » for
 * the league and the cup the same season, « CHAMPION », « COUPE » for the cup alone (the rank under it), « PROMU »
 * (the rank under it); null for any other season, which shows its rank. In the player's language: « DOUBLE »,
 * « CHAMPIONS », « CUP », « PROMOTED » in English.
 */
export function cardBadge(
  season: Pick<SeasonResultView, "rank" | "promoted" | "relegated" | "cupWinner">,
  t: Pick<CardTranslators, "seasons" | "seasonCard">,
): { badge: string; line: string | null } | null {
  const champion = season.rank === 1;
  const promoted = season.promoted ? moveLabel(season, t.seasons) : null;
  if (champion && season.cupWinner) {
    return {
      badge: t.seasonCard("double"),
      line: promoted === null ? t.seasonCard("doubleLine") : t.seasonCard("doubleLinePromoted", { move: promoted }),
    };
  }
  if (champion) {
    return { badge: rankLabel(1, t.seasons).toUpperCase(), line: promoted };
  }
  const rank = rankLabel(season.rank, t.seasons);
  if (season.cupWinner) {
    return { badge: t.seasonCard("cup"), line: t.seasonCard(season.promoted ? "placePromoted" : "place", { rank }) };
  }
  return season.promoted ? { badge: t.seasonCard("promoted"), line: t.seasonCard("place", { rank }) } : null;
}

/**
 * The line of a season's objectives on its card, the screens' own words: « Objectifs : 2/3 » (« Objectives: 2/3 »);
 * null for a season without objectives, a save's from before them.
 */
export function objectivesLine(objectives: CardObjectives | null, t: Pick<CardTranslators, "objectives">): string | null {
  return objectives === null ? null : t.objectives("met", { met: objectives.met, total: objectives.total });
}

/**
 * The card of a season as a PNG response, 1200 × 630 or 1080 × 1080, in the player's language, with its objectives
 * (getClosedObjectives) when it had some, in the frame the player wears and with their title (CardDress).
 */
export async function seasonCardResponse(
  season: SeasonResultView,
  clubColors: ClubColors,
  format: CardFormat,
  t: CardTranslators,
  locale: Locale,
  objectives: CardObjectives | null,
  dress: CardDress = PLAIN_DRESS,
): Promise<ImageResponse> {
  const [fonts, logo] = await Promise.all([imageFonts(), brandIcon()]);
  const square = format === "square";
  // The club color that stands out best on midnight blue, the brand's orange when neither does; the other club color
  // only as the thin band, when it stands out too.
  const [accent, secondary] = clubAccentsOn(clubColors, MIDNIGHT_BLUE, ORANGE);
  const rankSize = square ? 250 : 190;
  const statSize = square ? 72 : 60;

  // The badge (cardBadge) underlined in orange, with its line; or the rank with its suffix raised: « 2e », « 2nd »,
  // never « 2E ».
  const badge = cardBadge(season, t);
  const rank =
    badge !== null ? (
      <div style={column}>
        <div style={{ fontSize: rankSize * 0.8, lineHeight: 0.95 }}>{badge.badge}</div>
        <div style={{ marginTop: 12, width: 140, height: 8, borderRadius: 4, background: ORANGE }} />
        {badge.line !== null && <div style={{ marginTop: 14, fontSize: square ? 36 : 30, color: MUTED }}>{badge.line}</div>}
      </div>
    ) : (
      <div style={{ ...row, alignItems: "flex-start" }}>
        <div style={{ fontSize: rankSize, lineHeight: 0.95 }}>{String(season.rank)}</div>
        <div style={{ marginTop: rankSize * 0.06, marginLeft: 6, fontSize: rankSize * 0.42, lineHeight: 1 }}>
          {t.seasonCard("rankSuffix", { rank: season.rank })}
        </div>
      </div>
    );

  // « Objectifs : 2/3 » in an orange pill beside the season, on its line: nothing under it moves, in either format.
  const objectivesText = objectivesLine(objectives, t);
  const headline = (
    <div style={column}>
      <div style={{ ...row, alignItems: "center" }}>
        <div style={{ fontSize: 44, color: accent, letterSpacing: 2 }}>
          {t.seasonCard("season", { season: seasonLabel(season.startYear) })}
        </div>
        {objectivesText !== null && (
          <div
            style={{
              display: "flex",
              marginLeft: 28,
              padding: "5px 18px",
              border: `3px solid ${ORANGE}`,
              borderRadius: 40,
              fontSize: square ? 32 : 28,
              color: ORANGE,
            }}
          >
            {objectivesText}
          </div>
        )}
      </div>
      <div style={{ marginTop: 2, fontSize: 32, color: MUTED }}>{competitionName(season.competitionCode, t.world)}</div>
      <div style={{ display: "flex", marginTop: square ? 28 : 12 }}>{rank}</div>
      <div style={{ ...row, marginTop: square ? 40 : 26 }}>
        <Stat value={String(season.points)} label={t.seasonCard("points")} size={statSize} />
        <Stat value={recordLabel(season)} label={t.seasonCard("record")} size={statSize} />
        <Stat value={`${season.goalsFor}-${season.goalsAgainst}`} label={t.seasonCard("goals")} size={statSize} />
      </div>
    </div>
  );

  // The manager's title, when one is chosen, at the footer's end: nothing above it moves.
  const footer = (
    <div style={{ ...row, alignItems: "center" }}>
      <img src={logo} width={48} height={48} alt="" />
      <div style={{ marginLeft: 14, fontSize: 32, letterSpacing: 1 }}>latewinner.app</div>
      {dress.title !== null && (
        <div style={{ marginLeft: "auto", paddingLeft: 24, fontSize: square ? 30 : 26, color: accent }}>
          {t.seasonCard("manager", { title: dress.title.toLocaleUpperCase(locale) })}
        </div>
      )}
    </div>
  );
  // The frame's border takes its room from the card's margins: the content keeps its size. Its ornaments sit on the
  // border's inner corners, whole.
  const inset = dress.frame.width;
  const ornamentSize = inset * 2;

  const player = (
    <BestPlayer
      season={season}
      clubColors={clubColors}
      accent={accent}
      faceSize={square ? 300 : 250}
      square={square}
      t={t}
      locale={locale}
    />
  );

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
        {secondary !== undefined && (
          <div style={{ position: "absolute", left: 18, top: 0, bottom: 0, width: 8, background: secondary }} />
        )}
        {square ? (
          <div
            style={{
              ...column,
              justifyContent: "space-between",
              flex: 1,
              padding: `${64 - inset}px ${64 - inset}px ${56 - inset}px ${90 - inset}px`,
            }}
          >
            {headline}
            {player}
            {footer}
          </div>
        ) : (
          <div style={{ ...row, flex: 1, padding: `${48 - inset}px ${56 - inset}px ${40 - inset}px ${82 - inset}px` }}>
            <div style={{ ...column, justifyContent: "space-between", flex: 1 }}>
              {headline}
              {footer}
            </div>
            <div style={{ ...column, justifyContent: "center", width: 400 }}>{player}</div>
          </div>
        )}
      </div>
      {/* The frame's ornament at each inner corner of its border. */}
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
