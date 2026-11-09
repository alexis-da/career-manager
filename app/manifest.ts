import type { MetadataRoute } from "next";
import { APP_BACKGROUND } from "./_lib/install-app";

/**
 * The installable game's manifest (/manifest.webmanifest, linked by every page): Late Winner, standalone from the home
 * page, in the game's colours, with the brand's icons, the maskable ones without their rounded corners (the mark sits
 * in the safe zone). No offline game: the service worker (public/sw.js) only says when there is no connection.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Late Winner",
    short_name: "Late Winner",
    description: "The football career game",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: APP_BACKGROUND,
    theme_color: APP_BACKGROUND,
    icons: [
      { src: "/icons/late-winner-icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/late-winner-icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/late-winner-icone-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/late-winner-icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
