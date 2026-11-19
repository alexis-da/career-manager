import { COACH_STAGES } from "../engine/national-coach";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { COSMETICS, cosmeticOf, isCosmeticId, owns, type Achievement, type CosmeticId, type CosmeticKind } from "../lib/cosmetics";
import { describeError } from "../lib/diagnostics";
import { prisma } from "./client";
import { getCoachSeason } from "./national-view";

// The rewards of missions v2 (docs/design/missions-v2.md): the tokens' journal and balance, the collection of cosmetics
// and the achievements that unlock them. Every token is written once, by its key (« mission:2026-11-18:HARD »), in the
// transaction that earns or spends it, with the balance: two tabs, two clicks or a retry never credit twice. Only the
// player's own rows, by user: nothing of the game reads them but the cosmetics worn.

type Db = PrismaClient | Prisma.TransactionClient;

export type TokenReason = "MISSION" | "ALL_THREE" | "STREAK" | "WELCOME" | "PURCHASE";
export type ShopItemName = "FITNESS_CAMP" | "EXPRESS_CARE" | "BUDGET_TOP_UP" | "PROMISING_YOUTH" | "STREAK_SHIELD" | "COSMETIC";

export type TokenWrite = {
  userId: string;
  key: string; // unique for the player: the entry is written once
  reason: TokenReason;
  amount: number; // a gain, or a spending below 0
  day?: string | null; // the UTC day of a mission or a bonus, « YYYY-MM-DD »
  saveId?: string | null; // the career of a purchase
  item?: ShopItemName | null;
  cosmetic?: string | null;
};

/**
 * Serializes a player's rewards: every transaction that writes their tokens, missions or collection takes it first, so
 * that two moves at once (two careers, two tabs) read and write one after the other. Released with the transaction.
 */
export async function lockRewards(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`rewards:${userId}`}, 0))`;
}

/**
 * Writes an entry of the journal once, by its key, and moves the balance by its amount, in the transaction given: false
 * when the key was already written (nothing changes). A spending is checked by its caller; the database refuses a
 * negative balance anyway (User_tokens_not_negative).
 */
export async function writeTokens(tx: Prisma.TransactionClient, entry: TokenWrite): Promise<boolean> {
  const written = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "TokenEntry" ("id", "userId", "key", "reason", "amount", "day", "saveId", "item", "cosmetic")
    VALUES (gen_random_uuid()::text, ${entry.userId}, ${entry.key}, ${entry.reason}::"TokenReason", ${entry.amount},
            ${entry.day ?? null}::date, ${entry.saveId ?? null}, ${entry.item ?? null}::"ShopItem", ${entry.cosmetic ?? null})
    ON CONFLICT ("userId", "key") DO NOTHING
    RETURNING "id"`;
  if (written.length === 0) {
    return false;
  }
  if (entry.amount !== 0) {
    await tx.$executeRaw`UPDATE "User" SET "tokens" = "tokens" + ${entry.amount} WHERE "id" = ${entry.userId}`;
  }
  return true;
}

/** A player's balance, read in their transaction once their rewards are locked. */
export async function tokensOf(tx: Db, userId: string): Promise<number> {
  const [row] = await tx.$queryRaw<{ tokens: number }[]>`SELECT "tokens" FROM "User" WHERE "id" = ${userId}`;
  return row?.tokens ?? 0;
}

/** An entry of the journal as the Rewards screen shows it. */
export type TokenEntryView = {
  key: string;
  reason: TokenReason;
  amount: number;
  day: string | null;
  item: ShopItemName | null;
  cosmetic: string | null;
  at: string; // ISO
};

/** The player's latest entries, the newest first. */
export async function getTokenJournal(userId: string, limit: number, db: Db = prisma): Promise<TokenEntryView[]> {
  const rows = await db.tokenEntry.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: limit,
    select: { key: true, reason: true, amount: true, day: true, item: true, cosmetic: true, createdAt: true },
  });
  return rows.map((row) => ({
    key: row.key,
    reason: row.reason,
    amount: row.amount,
    day: row.day === null ? null : row.day.toISOString().slice(0, 10),
    item: row.item,
    cosmetic: row.cosmetic,
    at: row.createdAt.toISOString(),
  }));
}

/** The cosmetics a player has unlocked, and those they wear (null: the default of its kind). */
export type CollectionView = {
  owned: string[];
  worn: Record<CosmeticKind, string | null>;
};

export async function getCollection(userId: string, db: Db = prisma): Promise<CollectionView> {
  const owned = await db.playerCosmetic.findMany({ where: { userId }, orderBy: { unlockedAt: "asc" }, select: { cosmetic: true } });
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { title: true, badge: true, frame: true } });
  return { owned: owned.map(({ cosmetic }) => cosmetic), worn: { TITLE: user.title, BADGE: user.badge, FRAME: user.frame } };
}

/** Unlocks cosmetics for a player, once each: those already had change nothing. Returns those new. */
export async function unlockCosmetics(
  tx: Prisma.TransactionClient,
  userId: string,
  ids: readonly string[],
  source: "STREAK" | "SHOP" | "ACHIEVEMENT",
): Promise<string[]> {
  const known = ids.filter((id) => cosmeticOf(id) !== undefined);
  if (known.length === 0) {
    return [];
  }
  const rows = await tx.$queryRaw<{ cosmetic: string }[]>`
    INSERT INTO "PlayerCosmetic" ("userId", "cosmetic", "source")
    SELECT ${userId}, unnest(${known}::text[]), ${source}::"CosmeticSource"
    ON CONFLICT DO NOTHING
    RETURNING "cosmetic"`;
  return rows.map(({ cosmetic }) => cosmetic);
}

export class CosmeticNotOwnedError extends Error {
  constructor(id: string) {
    super(`Cosmetic ${id} is not owned`);
  }
}

/**
 * Wears a cosmetic of the collection: one of each kind; null takes the default back (the rookie's title, the night's
 * frame, no badge). Refused for one the player does not own.
 */
export async function wearCosmetic(userId: string, kind: CosmeticKind, id: string | null): Promise<void> {
  if (id !== null) {
    const cosmetic = cosmeticOf(id);
    if (cosmetic === undefined || cosmetic.kind !== kind) {
      throw new CosmeticNotOwnedError(id);
    }
    const owned = await prisma.playerCosmetic.findUnique({ where: { userId_cosmetic: { userId, cosmetic: id } }, select: { cosmetic: true } });
    if (!owns(new Set(owned === null ? [] : [owned.cosmetic]), id)) {
      throw new CosmeticNotOwnedError(id);
    }
  }
  const worn = id === null || cosmeticOf(id)?.unlock.by === "default" ? null : id;
  await prisma.user.update({ where: { id: userId }, data: kind === "TITLE" ? { title: worn } : kind === "BADGE" ? { badge: worn } : { frame: worn } });
}

/** The cosmetics an achievement of these kinds unlocks, given the player's figures. */
function achieved(check: (achievement: Achievement) => boolean): string[] {
  return COSMETICS.filter(({ unlock }) => unlock.by === "achievement" && check(unlock.achievement)).map(({ id }) => id);
}

/**
 * The achievements of the missions done (counted by kind, all the player's), a perfect day, and the live matches: the
 * cosmetics they unlock, once. Called in the transaction that completes a mission or ends a live match.
 */
export async function unlockMissionAchievements(
  tx: Prisma.TransactionClient,
  userId: string,
  figures: { perfectDay: boolean; liveMatches?: number; liveWins?: number },
): Promise<string[]> {
  const counts = await tx.$queryRaw<{ kind: string; done: bigint }[]>`
    SELECT "kind"::text AS kind, count(*)::bigint AS done
    FROM "MissionTask" WHERE "userId" = ${userId} AND "completedAt" IS NOT NULL
    GROUP BY 1`;
  const doneOf = (kinds: "any" | readonly string[]): number =>
    counts.filter(({ kind }) => kinds === "any" || kinds.includes(kind)).reduce((sum, { done }) => sum + Number(done), 0);
  const ids = achieved((achievement) => {
    switch (achievement.on) {
      case "missions":
        return doneOf(achievement.kinds) >= achievement.count;
      case "perfectDay":
        return figures.perfectDay;
      case "liveMatches":
        return figures.liveMatches !== undefined && figures.liveMatches >= achievement.count;
      case "liveWins":
        return figures.liveWins !== undefined && figures.liveWins >= achievement.count;
      default:
        return false;
    }
  });
  return unlockCosmetics(tx, userId, ids, "ACHIEVEMENT");
}

/**
 * A season closed (advanceToNextSeason, once its transaction is committed): its palmarès, its objectives and the summer
 * tournament that ended it, won by the nation its manager coached, unlock their cosmetics for the save's owner, never in
 * a challenge save. A failure is logged, never thrown: it costs a badge, never the season.
 */
export async function unlockSeasonAchievements(saveId: string, seasonId: string | null, db: PrismaClient = prisma): Promise<void> {
  if (seasonId === null) {
    return;
  }
  try {
    const save = await db.save.findUniqueOrThrow({ where: { id: saveId }, select: { ownerId: true, challengeId: true } });
    if (save.ownerId === null || save.challengeId !== null) {
      return;
    }
    const result = await db.seasonResult.findFirst({
      where: { saveId, seasonId },
      select: { trophies: true, promoted: true, competition: { select: { tier: true } }, season: { select: { startYear: true } } },
    });
    if (result === null) {
      return;
    }
    const objectives = await db.seasonObjective.findMany({
      where: { saveId, seasonId, OR: [{ imposed: true }, { chosen: true }] },
      select: { outcome: true },
    });
    // The nation he coached that season, and the summer tournament that ended it.
    const coached = await getCoachSeason(saveId, result.season.startYear);
    const champion = result.trophies.includes("champion");
    const cup = result.trophies.includes("cup");
    const facts: Record<string, boolean> = {
      championD1: champion && result.competition.tier === 1,
      championD2: champion && result.competition.tier === 2,
      champion,
      promoted: result.promoted,
      cup,
      double: champion && cup,
      // Either European competition won (the season's league result keeps its trophy, « europe »).
      europe: result.trophies.includes("europe"),
      roadmap: objectives.length > 0 && objectives.every(({ outcome }) => outcome === "ACHIEVED" || outcome === "EXCEEDED"),
      // A summer tournament won as national coach (docs/design/selections.md § 5.5).
      nationalTournament: coached?.tournament?.stage === COACH_STAGES.WINNER,
    };
    const ids = achieved((achievement) => achievement.on === "season" && facts[achievement.what] === true);
    const ownerId = save.ownerId;
    await db.$transaction(async (tx) => {
      await lockRewards(tx, ownerId);
      await unlockCosmetics(tx, ownerId, ids, "ACHIEVEMENT");
    });
  } catch (error) {
    console.error(`[unlockSeasonAchievements] ${saveId}: ${describeError(error)}`);
  }
}

/** The weekly challenge's podium (a top-10 rank of a finished week, a Google account), unlocked when its ranking is read. */
export async function unlockChallengePodium(userId: string, db: PrismaClient = prisma): Promise<void> {
  try {
    const ids = achieved((achievement) => achievement.on === "challengePodium");
    const owned = await db.playerCosmetic.count({ where: { userId, cosmetic: { in: ids } } });
    if (owned === ids.length) {
      return;
    }
    await db.$transaction(async (tx) => {
      await lockRewards(tx, userId);
      await unlockCosmetics(tx, userId, ids, "ACHIEVEMENT");
    });
  } catch (error) {
    console.error(`[unlockChallengePodium] ${userId}: ${describeError(error)}`);
  }
}

/**
 * At a Google sign-in (moveHistory, src/db/accounts.ts), the anonymous player's rewards go to the account: the journal's
 * entries, their key prefixed « merge:<anonymous>: » to stay unique, and the balance with them; the collection's
 * union; a shield in reserve when either had one; the worn cosmetics of the account, else the anonymous player's; the
 * counters added. Nothing is lost, nothing credited again.
 */
export async function moveRewards(tx: Prisma.TransactionClient, fromUserId: string, toUserId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE "TokenEntry" SET "userId" = ${toUserId}, "key" = ${`merge:${fromUserId}:`} || "key"
    WHERE "userId" = ${fromUserId}`;
  await tx.$executeRaw`
    INSERT INTO "PlayerCosmetic" ("userId", "cosmetic", "source", "unlockedAt")
    SELECT ${toUserId}, "cosmetic", "source", "unlockedAt" FROM "PlayerCosmetic" WHERE "userId" = ${fromUserId}
    ON CONFLICT DO NOTHING`;
  await tx.$executeRaw`
    UPDATE "User" AS account
    SET "tokens" = account."tokens" + anonymous."tokens",
        "streakShield" = account."streakShield" OR anonymous."streakShield",
        "title" = coalesce(account."title", anonymous."title"),
        "badge" = coalesce(account."badge", anonymous."badge"),
        "frame" = coalesce(account."frame", anonymous."frame"),
        "liveMatches" = account."liveMatches" + anonymous."liveMatches",
        "liveWins" = account."liveWins" + anonymous."liveWins"
    FROM "User" AS anonymous
    WHERE account."id" = ${toUserId} AND anonymous."id" = ${fromUserId}`;
  // The anonymous player's balance went with their entries: theirs is 0 until their row goes.
  await tx.$executeRaw`UPDATE "User" SET "tokens" = 0 WHERE "id" = ${fromUserId}`;
}


/**
 * The frame and title a season's card may wear, from its address: the save owner's own only, the night frame and no
 * title otherwise (a hand-made address draws nothing it should not). The defaults need no query.
 */
export async function ownedCardDress(
  userId: string | null,
  frame: string | null,
  title: string | null,
  db: Db = prisma,
): Promise<{ frame: CosmeticId; title: CosmeticId | null }> {
  const wanted = [frame, title].filter((id): id is CosmeticId => isCosmeticId(id) && cosmeticOf(id)?.unlock.by !== "default");
  const rows =
    userId === null || wanted.length === 0
      ? []
      : await db.playerCosmetic.findMany({ where: { userId, cosmetic: { in: wanted } }, select: { cosmetic: true } });
  const owned = new Set(rows.map(({ cosmetic }) => cosmetic));
  const wearable = (id: string | null, kind: CosmeticKind): id is CosmeticId => isCosmeticId(id) && cosmeticOf(id)?.kind === kind && owned.has(id);
  return { frame: wearable(frame, "FRAME") ? frame : "frame-night", title: wearable(title, "TITLE") ? title : null };
}
