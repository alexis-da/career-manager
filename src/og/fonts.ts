import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Fonts of the generated images (ImageResponse), read from src/assets/fonts once per server process. Barlow Condensed
// ExtraBold Italic, from the Google Fonts repository, under the SIL Open Font License (src/assets/fonts/OFL.txt).

/** The family name to use in the images' styles. */
export const DISPLAY_FONT = "Barlow Condensed";

type ImageFont = { name: string; data: Buffer; weight: 800; style: "italic" };

let fonts: Promise<ImageFont[]> | undefined;

/** The fonts to pass to ImageResponse: every text of the image is set in Barlow Condensed ExtraBold Italic. */
export function imageFonts(): Promise<ImageFont[]> {
  fonts ??= readFile(join(process.cwd(), "src/assets/fonts/BarlowCondensed-ExtraBoldItalic.ttf")).then((data) => [
    { name: DISPLAY_FONT, data, weight: 800, style: "italic" },
  ]);
  return fonts;
}
