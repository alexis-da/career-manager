import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/** Files the generated images read from disk (src/og/fonts.ts, the brand icon): traced into their functions. */
const IMAGE_FILES = ["./src/assets/fonts/**/*", "./public/brand/late-winner-icone.svg"];

const nextConfig: NextConfig = {
  // Playwright starts its own `next dev` with NEXT_DIST_DIR=.next-e2e: Next allows one dev server per build
  // directory, so the tests never collide with a development server started by hand.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Development only: in any corner, the indicator would cover an entry of a save's bottom bar or its club's line, and
  // take the clicks of the end-to-end tests, which run on `next dev`.
  devIndicators: false,
  outputFileTracingIncludes: {
    "/opengraph-image": IMAGE_FILES,
    "/saves/**/card": IMAGE_FILES,
  },
  // The sign-in page went with the « closed » mode: its old links lead to the home page, for good (308), their query
  // kept (Auth.js's ?error=, shown there).
  async redirects() {
    return [{ source: "/login", destination: "/", permanent: true }];
  },
};

// The player's language and its messages, for each request (src/i18n/request.ts).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
