import { PlayerFace } from "../components/player-face";
import type { ClubColors } from "../lib/color";
import { svgMarkup } from "./svg-markup";

/**
 * A player's face as an SVG data URI, for an <img> of a generated image (ImageResponse), as the logo is: the same
 * drawing as on the pages, on a solid background since an image has no CSS variable to read.
 */
export function faceDataUri(playerKey: string, age: number, clubColors: ClubColors, size: number, background: string): string {
  const markup = svgMarkup(
    <PlayerFace playerKey={playerKey} age={age} clubColors={clubColors} size={size} background={background} />,
  );
  return `data:image/svg+xml;base64,${Buffer.from(markup).toString("base64")}`;
}
