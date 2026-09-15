import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright starts its own `next dev` with NEXT_DIST_DIR=.next-e2e: Next allows one dev server per build
  // directory, so the tests never collide with a development server started by hand.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
