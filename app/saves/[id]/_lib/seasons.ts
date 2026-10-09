import { seasonLabel } from "@/src/engine/world";

/** « Champion » for the first, « 3e » otherwise. */
export function rankLabel(rank: number): string {
  return rank === 1 ? "Champion" : `${rank}e`;
}

/** Won, drawn, lost: « 24-8-6 ». */
export function recordLabel(season: { won: number; drawn: number; lost: number }): string {
  return `${season.won}-${season.drawn}-${season.lost}`;
}

/** Where a season's card is drawn; format "square" for 1080 × 1080, 1200 × 630 otherwise. */
export function seasonCardPath(saveId: string, seasonId: string, format: "landscape" | "square" = "landscape"): string {
  const path = `/saves/${saveId}/seasons/${seasonId}/card`;
  return format === "square" ? `${path}?format=square` : path;
}

/** The name of a downloaded card: late-winner-saison-2026-27.png. */
export function seasonCardFileName(startYear: number): string {
  return `late-winner-saison-${seasonLabel(startYear)}.png`;
}
