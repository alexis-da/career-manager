import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The share image of every page: the brand alone, never a club name (CLAUDE.md, « Marque et règles produit »).
export const alt = "Late Winner — The football career game";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MIDNIGHT_BLUE = "#0B1340";
const ORANGE = "#FF9F1C";
const ICON_SIZE = 220;

export default async function Image() {
  const icon = await readFile(join(process.cwd(), "public/brand/late-winner-icone.svg"), "base64");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: MIDNIGHT_BLUE,
          color: "white",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain elements only */}
        <img src={`data:image/svg+xml;base64,${icon}`} width={ICON_SIZE} height={ICON_SIZE} alt="" />
        <div style={{ marginTop: 44, fontSize: 104, fontWeight: 700, letterSpacing: 6 }}>LATE WINNER</div>
        <div style={{ marginTop: 12, width: 120, height: 8, borderRadius: 4, background: ORANGE }} />
        <div style={{ marginTop: 24, fontSize: 40, color: "rgba(255, 255, 255, 0.85)" }}>The football career game</div>
      </div>
    ),
    size,
  );
}
