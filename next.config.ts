import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/** Files the generated images read from disk (src/og/fonts.ts, the brand icon): traced into their functions. */
const IMAGE_FILES = ["./src/assets/fonts/**/*", "./public/brand/late-winner-icone.svg"];

const nextConfig: NextConfig = {
  // Playwright starts its own `next dev` with NEXT_DIST_DIR=.next-e2e: Next allows one dev server per build
  // directory, so the tests never collide with a development server started by hand.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Development only: at the bottom left, the indicator covers « Simuler jusqu'à… » in a phone's action bar.
  devIndicators: { position: "bottom-right" },
  outputFileTracingIncludes: {
    "/opengraph-image": IMAGE_FILES,
    "/saves/**/card": IMAGE_FILES,
  },
};

// The player's language and its messages, for each request (src/i18n/request.ts).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
