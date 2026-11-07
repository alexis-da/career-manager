import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { DISPLAY_FONT, imageFonts } from "@/src/og/fonts";
import { SHARE_IMAGE_ALT, SHARE_IMAGE_SIZE } from "@/src/og/share-image";

// The share image of every page: the brand alone, never a club name (CLAUDE.md, « Marque et règles produit »).
export const alt = SHARE_IMAGE_ALT;
export const size = SHARE_IMAGE_SIZE;
export const contentType = "image/png";

const MIDNIGHT_BLUE = "#0B1340";
const ORANGE = "#FF9F1C";
const ICON_SIZE = 220;

export default async function Image() {
  const [icon, fonts] = await Promise.all([
    readFile(join(process.cwd(), "public/brand/late-winner-icone.svg"), "base64"),
    imageFonts(),
  ]);

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
          fontFamily: DISPLAY_FONT,
          fontStyle: "italic",
          fontWeight: 800,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain elements only */}
        <img src={`data:image/svg+xml;base64,${icon}`} width={ICON_SIZE} height={ICON_SIZE} alt="" />
        <div style={{ marginTop: 36, fontSize: 132, letterSpacing: 4, lineHeight: 1 }}>LATE WINNER</div>
        <div style={{ marginTop: 16, width: 120, height: 8, borderRadius: 4, background: ORANGE }} />
        <div style={{ marginTop: 24, fontSize: 48, color: "rgba(255, 255, 255, 0.85)" }}>The football career game</div>
      </div>
    ),
    { ...size, fonts },
  );
}
