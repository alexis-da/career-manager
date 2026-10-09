import type { NextConfig } from "next";

/** Files the generated images read from disk (src/og/fonts.ts, the brand icon): traced into their functions. */
const IMAGE_FILES = ["./src/assets/fonts/**/*", "./public/brand/late-winner-icone.svg"];

const nextConfig: NextConfig = {
  // Playwright starts its own `next dev` with NEXT_DIST_DIR=.next-e2e: Next allows one dev server per build
  // directory, so the tests never collide with a development server started by hand.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  outputFileTracingIncludes: {
    "/opengraph-image": IMAGE_FILES,
    "/saves/**/card": IMAGE_FILES,
  },
};

export default nextConfig;
