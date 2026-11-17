import type { PrismaClient } from "../generated/prisma/client";
import { COSMETICS, DEFAULT_COSMETIC, nextStreakLot, type CosmeticKind } from "../lib/cosmetics";
import { MISSION_KINDS, MISSION_TIERS, type MissionKind, type MissionTier, type StreakView } from "../lib/missions";
import { prisma } from "./client";
import { getMissionStreak } from "./missions";
import { getCollection, getTokenJournal, type TokenEntryView } from "./rewards";
import { getShop, type ShopView } from "./shop";

// The Rewards tab of a save (Club → Récompenses, missions v2): the player's tokens and their journal, the streak and its
// lots, the career's shop, the cosmetics on sale and the collection. A challenge save shows the tokens and the collection
// only, and why there is no shop. Read only.

/** An entry of the journal, with the mission it paid for when it is one's. */
export type JournalEntry = TokenEntryView & { tier: MissionTier | null; kind: MissionKind | null };

/** A cosmetic of the catalogue as the player has it. */
export type CosmeticView = {
  id: string;
  kind: CosmeticKind;
  owned: boolean;
  worn: boolean;
  price: number | null; // on sale, not owned yet
  streakCycle: number | null; // a streak's lot: its cycle
};

export type RewardsPageView = {
  challenge: boolean;
  tokens: number;
  journal: JournalEntry[]; // the latest first
  streak: (StreakView & { shield: boolean }) | null; // null in a challenge save
  nextLot: { cycle: number; cosmetics: string[] } | null;
  shop: ShopView;
  cosmetics: CosmeticView[];
};

/** The journal's entries a page reads: the latest five shown, the rest behind « Tout le journal ». */
export const JOURNAL_ENTRIES = 50;

const isKind = (value: string): value is MissionKind => (MISSION_KINDS as readonly string[]).includes(value);
const isTier = (value: string): value is MissionTier => (MISSION_TIERS as readonly string[]).includes(value);

/** The day and tier of a mission's entry, by its key (« mission:2026-11-18:HARD », « merge:<id>:mission:… »). */
function missionOfKey(key: string): { day: string; tier: MissionTier } | null {
  const match = /(?:^|:)mission:(\d{4}-\d{2}-\d{2}):([A-Z]+)$/.exec(key);
  return match === null || !isTier(match[2]) ? null : { day: match[1], tier: match[2] };
}

/** The journal of a player, each mission's entry with its mission. */
async function journalOf(userId: string, db: PrismaClient): Promise<JournalEntry[]> {
  const entries = await getTokenJournal(userId, JOURNAL_ENTRIES, db);
  const missions = entries.map((entry) => (entry.reason === "MISSION" ? missionOfKey(entry.key) : null));
  const days = [...new Set(missions.flatMap((mission) => (mission === null ? [] : [mission.day])))];
  const tasks =
    days.length === 0
      ? []
      : await db.missionTask.findMany({
          where: { userId, day: { in: days.map((day) => new Date(`${day}T00:00:00.000Z`)) } },
          select: { day: true, tier: true, kind: true },
        });
  const kindOf = new Map(tasks.map((task) => [`${task.day.toISOString().slice(0, 10)}:${task.tier}`, task.kind]));
  return entries.map((entry, index) => {
    const mission = missions[index];
    const kind = mission === null ? undefined : kindOf.get(`${mission.day}:${mission.tier}`);
    return { ...entry, tier: mission?.tier ?? null, kind: kind !== undefined && isKind(kind) ? kind : null };
  });
}

/** The Rewards tab of a save, for its owner. `now` is real time (the streak's day). */
export async function getRewardsPage(saveId: string, now: Date, db: PrismaClient = prisma): Promise<RewardsPageView> {
  const save = await db.save.findUniqueOrThrow({ where: { id: saveId }, select: { ownerId: true, challengeId: true } });
  if (save.ownerId === null) {
    throw new Error(`Save ${saveId} has no owner`);
  }
  const userId = save.ownerId;
  const challenge = save.challengeId !== null;
  const shop = await getShop(saveId, db);
  const journal = await journalOf(userId, db);
  const collection = await getCollection(userId, db);
  const streak = challenge ? null : await getMissionStreak(saveId, now, db);
  const lot = streak === null ? null : nextStreakLot(streak.cycles);
  const owned = new Set(collection.owned);
  const cosmetics = COSMETICS.map((cosmetic): CosmeticView => {
    const has = cosmetic.unlock.by === "default" || owned.has(cosmetic.id);
    const worn = (collection.worn[cosmetic.kind] ?? DEFAULT_COSMETIC[cosmetic.kind]) === cosmetic.id;
    return {
      id: cosmetic.id,
      kind: cosmetic.kind,
      owned: has,
      worn,
      price: !has && cosmetic.unlock.by === "shop" ? cosmetic.unlock.price : null,
      streakCycle: cosmetic.unlock.by === "streak" ? cosmetic.unlock.cycle : null,
    };
  });
  return {
    challenge,
    tokens: shop.tokens,
    journal,
    streak,
    nextLot: lot === null ? null : { cycle: lot.cycle, cosmetics: lot.cosmetics.map(({ id }) => id) },
    shop,
    cosmetics,
  };
}

/** The cosmetics a player wears, as the screens and the season's card show them: null for a badge never chosen. */
export type WornCosmetics = { title: string; badge: string | null; frame: string };

export async function getWornCosmetics(userId: string | null, db: PrismaClient = prisma): Promise<WornCosmetics> {
  const user = userId === null ? null : await db.user.findUnique({ where: { id: userId }, select: { title: true, badge: true, frame: true } });
  return {
    title: user?.title ?? DEFAULT_COSMETIC.TITLE ?? "title-rookie",
    badge: user?.badge ?? null,
    frame: user?.frame ?? DEFAULT_COSMETIC.FRAME ?? "frame-night",
  };
}
