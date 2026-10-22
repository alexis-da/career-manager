/* eslint-disable @next/next/no-img-element -- ImageResponse renders plain elements only */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { CSSProperties, ReactNode } from "react";
import type { SeasonResultView } from "@/src/db/season-results";
import { seasonLabel } from "@/src/engine/world";
import { clubAccentsOn, type ClubColors } from "@/src/lib/color";
import { formatDecimal } from "@/src/lib/format";
import { faceDataUri } from "@/src/og/face-image";
import { DISPLAY_FONT, imageFonts } from "@/src/og/fonts";
import { POSITION_LABEL } from "../../../_lib/positions";
import { rankLabel, recordLabel } from "../../../_lib/seasons";

// The shareable card of a season: the brand's midnight blue, the club's colors as accents, and never a club name, real
// or fictional (CLAUDE.md, « Communication sortante »). The competition keeps its neutral name.

export type CardFormat = "landscape" | "square";

export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  landscape: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
};

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
}: {
  season: SeasonResultView;
  clubColors: ClubColors;
  accent: string;
  faceSize: number;
  square: boolean;
}): ReactNode {
  const player = season.bestPlayer;
  if (player === null) {
    return <div style={{ display: "flex", fontSize: 34, color: MUTED }}>Aucun joueur à 10 matchs</div>;
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
        <div style={{ fontSize: 26, color: ORANGE, letterSpacing: 2 }}>MEILLEUR JOUEUR</div>
        <div style={{ marginTop: 4, fontSize: 54, lineHeight: 1.05 }}>{player.name}</div>
        <div style={{ marginTop: 2, fontSize: 28, color: MUTED }}>{POSITION_LABEL[player.position]}</div>
        <div style={{ ...row, marginTop: 14 }}>
          <Stat value={String(player.goals)} label="BUTS" size={44} />
          <Stat value={String(player.assists)} label="PASSES" size={44} />
          <Stat value={formatDecimal(player.rating)} label="NOTE" size={44} />
        </div>
      </div>
    </div>
  );
}

/** The card of a season as a PNG response, 1200 × 630 or 1080 × 1080. */
export async function seasonCardResponse(
  season: SeasonResultView,
  clubColors: ClubColors,
  format: CardFormat,
): Promise<ImageResponse> {
  const [fonts, logo] = await Promise.all([imageFonts(), brandIcon()]);
  const square = format === "square";
  // The club color that stands out best on midnight blue, the brand's orange when neither does; the other club color
  // only as the thin band, when it stands out too.
  const [accent, secondary] = clubAccentsOn(clubColors, MIDNIGHT_BLUE, ORANGE);
  const rankSize = square ? 250 : 190;
  const statSize = square ? 72 : 60;

  // « CHAMPION » underlined in orange, or the rank with its « e » raised: « 2e », never « 2E ».
  const rank =
    season.rank === 1 ? (
      <div style={column}>
        <div style={{ fontSize: rankSize * 0.8, lineHeight: 0.95 }}>{rankLabel(1).toUpperCase()}</div>
        <div style={{ marginTop: 12, width: 140, height: 8, borderRadius: 4, background: ORANGE }} />
      </div>
    ) : (
      <div style={{ ...row, alignItems: "flex-start" }}>
        <div style={{ fontSize: rankSize, lineHeight: 0.95 }}>{String(season.rank)}</div>
        <div style={{ marginTop: rankSize * 0.06, marginLeft: 6, fontSize: rankSize * 0.42, lineHeight: 1 }}>e</div>
      </div>
    );

  const headline = (
    <div style={column}>
      <div style={{ fontSize: 44, color: accent, letterSpacing: 2 }}>{`SAISON ${seasonLabel(season.startYear)}`}</div>
      <div style={{ marginTop: 2, fontSize: 32, color: MUTED }}>{season.competitionName}</div>
      <div style={{ display: "flex", marginTop: square ? 28 : 12 }}>{rank}</div>
      <div style={{ ...row, marginTop: square ? 40 : 26 }}>
        <Stat value={String(season.points)} label="POINTS" size={statSize} />
        <Stat value={recordLabel(season)} label="V-N-D" size={statSize} />
        <Stat value={`${season.goalsFor}-${season.goalsAgainst}`} label="BUTS POUR-CONTRE" size={statSize} />
      </div>
    </div>
  );

  const footer = (
    <div style={{ ...row, alignItems: "center" }}>
      <img src={logo} width={48} height={48} alt="" />
      <div style={{ marginLeft: 14, fontSize: 32, letterSpacing: 1 }}>latewinner.app</div>
    </div>
  );

  const player = (
    <BestPlayer season={season} clubColors={clubColors} accent={accent} faceSize={square ? 300 : 250} square={square} />
  );

  return new ImageResponse(
    (
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
          <div style={{ ...column, justifyContent: "space-between", flex: 1, padding: "64px 64px 56px 90px" }}>
            {headline}
            {player}
            {footer}
          </div>
        ) : (
          <div style={{ ...row, flex: 1, padding: "48px 56px 40px 82px" }}>
            <div style={{ ...column, justifyContent: "space-between", flex: 1 }}>
              {headline}
              {footer}
            </div>
            <div style={{ ...column, justifyContent: "center", width: 400 }}>{player}</div>
          </div>
        )}
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
