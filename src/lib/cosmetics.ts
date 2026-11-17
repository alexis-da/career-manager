// The collection of missions v2 (docs/design/missions-v2.md, § 3): manager titles, achievement badges and frames of the
// season's card, without a club's name or a brand. Each has an id kept with what players own and wear (PlayerCosmetic,
// User.title, User.badge, User.frame): never rename one. Pure: the catalogue, how each is had, and the frames' colours.

export const COSMETIC_KINDS = ["TITLE", "BADGE", "FRAME"] as const;
export type CosmeticKind = (typeof COSMETIC_KINDS)[number];

/** The achievements that unlock a cosmetic, each checked where its fact is written (src/db/rewards.ts). */
export type Achievement =
  | { on: "missions"; kinds: "any" | readonly string[]; count: number } // missions done, of these kinds
  | { on: "perfectDay" } // the three missions of a day
  | { on: "liveMatches"; count: number }
  | { on: "liveWins"; count: number }
  | { on: "season"; what: "championD1" | "championD2" | "champion" | "promoted" | "cup" | "double" | "roadmap" }
  | { on: "challengePodium" };

/** How a cosmetic is had: worn by default, a streak's cycles done in all, bought, or an achievement. */
export type Unlock =
  | { by: "default" }
  | { by: "streak"; cycle: number }
  | { by: "shop"; price: number }
  | { by: "achievement"; achievement: Achievement };

export type Cosmetic = { id: string; kind: CosmeticKind; unlock: Unlock };

/** Prices of the cosmetics on sale, in tokens. */
export const TITLE_PRICE = 250;
export const FRAME_PRICE = 400;

/** The catalogue, kind by kind, in the order the collection shows them. */
export const COSMETICS = [
  // Titles
  { id: "title-rookie", kind: "TITLE", unlock: { by: "default" } },
  { id: "title-regular", kind: "TITLE", unlock: { by: "streak", cycle: 2 } },
  { id: "title-relentless", kind: "TITLE", unlock: { by: "streak", cycle: 5 } },
  { id: "title-live-master", kind: "TITLE", unlock: { by: "achievement", achievement: { on: "liveMatches", count: 50 } } },
  {
    id: "title-tactician",
    kind: "TITLE",
    unlock: { by: "achievement", achievement: { on: "missions", kinds: ["LIVE_INSTRUCTION", "LIVE_SUBSTITUTION"], count: 25 } },
  },
  { id: "title-youth-coach", kind: "TITLE", unlock: { by: "achievement", achievement: { on: "missions", kinds: ["START_YOUTH"], count: 30 } } },
  { id: "title-champion", kind: "TITLE", unlock: { by: "achievement", achievement: { on: "season", what: "championD1" } } },
  { id: "title-cup-king", kind: "TITLE", unlock: { by: "achievement", achievement: { on: "season", what: "cup" } } },
  { id: "title-professor", kind: "TITLE", unlock: { by: "shop", price: TITLE_PRICE } },
  { id: "title-strategist", kind: "TITLE", unlock: { by: "shop", price: TITLE_PRICE } },
  { id: "title-unsinkable", kind: "TITLE", unlock: { by: "shop", price: TITLE_PRICE } },
  { id: "title-builder", kind: "TITLE", unlock: { by: "shop", price: TITLE_PRICE } },
  // Badges, never on sale
  { id: "badge-first-mission", kind: "BADGE", unlock: { by: "achievement", achievement: { on: "missions", kinds: "any", count: 1 } } },
  { id: "badge-perfect-day", kind: "BADGE", unlock: { by: "achievement", achievement: { on: "perfectDay" } } },
  { id: "badge-centurion", kind: "BADGE", unlock: { by: "achievement", achievement: { on: "missions", kinds: "any", count: 100 } } },
  { id: "badge-one-week", kind: "BADGE", unlock: { by: "streak", cycle: 1 } },
  { id: "badge-one-month", kind: "BADGE", unlock: { by: "streak", cycle: 4 } },
  { id: "badge-seven-weeks", kind: "BADGE", unlock: { by: "streak", cycle: 7 } },
  { id: "badge-live", kind: "BADGE", unlock: { by: "achievement", achievement: { on: "liveMatches", count: 1 } } },
  { id: "badge-ten-live-wins", kind: "BADGE", unlock: { by: "achievement", achievement: { on: "liveWins", count: 10 } } },
  {
    id: "badge-wall",
    kind: "BADGE",
    unlock: { by: "achievement", achievement: { on: "missions", kinds: ["CLEAN_SHEET", "LIVE_CLEAN_SHEET"], count: 10 } },
  },
  { id: "badge-champion-d1", kind: "BADGE", unlock: { by: "achievement", achievement: { on: "season", what: "championD1" } } },
  { id: "badge-champion-d2", kind: "BADGE", unlock: { by: "achievement", achievement: { on: "season", what: "championD2" } } },
  { id: "badge-promoted", kind: "BADGE", unlock: { by: "achievement", achievement: { on: "season", what: "promoted" } } },
  { id: "badge-cup", kind: "BADGE", unlock: { by: "achievement", achievement: { on: "season", what: "cup" } } },
  { id: "badge-double", kind: "BADGE", unlock: { by: "achievement", achievement: { on: "season", what: "double" } } },
  { id: "badge-roadmap", kind: "BADGE", unlock: { by: "achievement", achievement: { on: "season", what: "roadmap" } } },
  { id: "badge-challenge-podium", kind: "BADGE", unlock: { by: "achievement", achievement: { on: "challengePodium" } } },
  // Frames of the season's card
  { id: "frame-night", kind: "FRAME", unlock: { by: "default" } },
  { id: "frame-bronze", kind: "FRAME", unlock: { by: "streak", cycle: 1 } },
  { id: "frame-silver", kind: "FRAME", unlock: { by: "streak", cycle: 3 } },
  { id: "frame-gold", kind: "FRAME", unlock: { by: "streak", cycle: 6 } },
  { id: "frame-gold-laurels", kind: "FRAME", unlock: { by: "streak", cycle: 8 } },
  { id: "frame-laurels", kind: "FRAME", unlock: { by: "achievement", achievement: { on: "season", what: "champion" } } },
  { id: "frame-double-star", kind: "FRAME", unlock: { by: "achievement", achievement: { on: "season", what: "double" } } },
  { id: "frame-neon", kind: "FRAME", unlock: { by: "shop", price: FRAME_PRICE } },
  { id: "frame-checkerboard", kind: "FRAME", unlock: { by: "shop", price: FRAME_PRICE } },
  { id: "frame-aurora", kind: "FRAME", unlock: { by: "shop", price: FRAME_PRICE } },
  { id: "frame-stripes", kind: "FRAME", unlock: { by: "shop", price: FRAME_PRICE } },
] as const satisfies readonly Cosmetic[];

/** A cosmetic's id: its name in the messages (rewards.cosmetics). */
export type CosmeticId = (typeof COSMETICS)[number]["id"];

export const COSMETIC_IDS: ReadonlySet<string> = new Set(COSMETICS.map(({ id }) => id));

/** Whether a string is a cosmetic's id of the catalogue. */
export const isCosmeticId = (id: string | null | undefined): id is CosmeticId => id !== null && id !== undefined && COSMETIC_IDS.has(id);

/** The cosmetic of an id, undefined for an unknown one (a hand-made address, a removed cosmetic). */
export function cosmeticOf(id: string | null | undefined): (Cosmetic & { id: CosmeticId }) | undefined {
  return id === null || id === undefined ? undefined : COSMETICS.find((cosmetic) => cosmetic.id === id);
}

/** The cosmetic worn when none is chosen, by kind: the default title and frame, no badge. */
export const DEFAULT_COSMETIC: Readonly<Record<CosmeticKind, CosmeticId | null>> = {
  TITLE: "title-rookie",
  BADGE: null,
  FRAME: "frame-night",
};

/** Whether a player owns a cosmetic: the defaults, and those of their collection. */
export function owns(owned: ReadonlySet<string>, id: string): boolean {
  return cosmeticOf(id)?.unlock.by === "default" || owned.has(id);
}

/** The cosmetics a streak's cycle unlocks, the seventh day of that cycle (cycles done in all, never lost). */
export function streakLotOf(cycle: number): (Cosmetic & { id: CosmeticId })[] {
  return COSMETICS.filter(({ unlock }) => unlock.by === "streak" && unlock.cycle === cycle);
}

/** The next streak lot after `cycles` cycles done, and the cycle it comes with; null once the last is had. */
export function nextStreakLot(cycles: number): { cycle: number; cosmetics: (Cosmetic & { id: CosmeticId })[] } | null {
  const cycle = cycles + 1;
  const cosmetics = streakLotOf(cycle);
  return cosmetics.length === 0 ? null : { cycle, cosmetics };
}

/** The cosmetics on sale, and their price. */
export function priceOf(id: string): number | null {
  const unlock = cosmeticOf(id)?.unlock;
  return unlock?.by === "shop" ? unlock.price : null;
}

/**
 * A frame of the season's card: its border and its corners' ornament, in the card's colours (src/og, satori draws them).
 * The night frame is the card as it was.
 */
export type FrameStyle = {
  border: string; // CSS background of the border: a colour or a gradient
  width: number; // of the border, in pixels of a 1200 × 630 card
  ornament: "none" | "star" | "laurel" | "dot"; // at each corner
  ornamentColor: string;
};

export const FRAME_STYLES: Readonly<Record<Extract<CosmeticId, `frame-${string}`>, FrameStyle>> = {
  "frame-night": { border: "#0B1340", width: 0, ornament: "none", ornamentColor: "#0B1340" },
  "frame-bronze": { border: "linear-gradient(135deg, #8C5A2B, #D7A26A, #8C5A2B)", width: 18, ornament: "dot", ornamentColor: "#F2C998" },
  "frame-silver": { border: "linear-gradient(135deg, #8E97A8, #E6EAF2, #8E97A8)", width: 18, ornament: "dot", ornamentColor: "#FFFFFF" },
  "frame-gold": { border: "linear-gradient(135deg, #B8860B, #FFD866, #B8860B)", width: 20, ornament: "star", ornamentColor: "#FFF2B3" },
  "frame-gold-laurels": { border: "linear-gradient(135deg, #B8860B, #FFD866, #B8860B)", width: 22, ornament: "laurel", ornamentColor: "#FFF2B3" },
  "frame-laurels": { border: "linear-gradient(135deg, #1E5E3A, #4CC27A, #1E5E3A)", width: 20, ornament: "laurel", ornamentColor: "#D8F5E3" },
  "frame-double-star": { border: "linear-gradient(135deg, #1F3BFF, #FF9F1C)", width: 20, ornament: "star", ornamentColor: "#FFFFFF" },
  "frame-neon": { border: "linear-gradient(135deg, #00F0FF, #FF2BD6)", width: 16, ornament: "dot", ornamentColor: "#FFFFFF" },
  "frame-checkerboard": {
    border: "repeating-linear-gradient(45deg, #FFFFFF 0px, #FFFFFF 12px, #0B1340 12px, #0B1340 24px)",
    width: 18,
    ornament: "none",
    ornamentColor: "#FFFFFF",
  },
  "frame-aurora": { border: "linear-gradient(135deg, #2BD9A0, #1F3BFF, #A64DFF)", width: 18, ornament: "star", ornamentColor: "#E8FFF7" },
  "frame-stripes": {
    border: "repeating-linear-gradient(90deg, #FF9F1C 0px, #FF9F1C 16px, #1F3BFF 16px, #1F3BFF 32px)",
    width: 16,
    ornament: "none",
    ornamentColor: "#FFFFFF",
  },
};

/** A frame's style by its id, the night frame's for none or an unknown one. */
export function frameStyleOf(id: string | null | undefined): FrameStyle {
  const style = isCosmeticId(id) && id.startsWith("frame-") ? (FRAME_STYLES as Readonly<Record<string, FrameStyle>>)[id] : undefined;
  return style ?? FRAME_STYLES["frame-night"];
}
