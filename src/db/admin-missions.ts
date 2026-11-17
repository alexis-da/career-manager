import type { PrismaClient } from "../generated/prisma/client";
import { MISSION_KINDS, MISSION_TIERS, STREAK_CYCLE_DAYS, addDays, tierOf, type MissionKind, type MissionTier } from "../lib/missions";
import type { ShopItemName } from "./rewards";

// /admin's « Missions et jetons » (missions v2, docs/design/missions-v2.md § 7): the missions of the period, v2's
// (MissionTask, MissionDay) and v1's before the switch (DailyMission); the tokens earned and spent, day by day, by source
// and by item; the balances, and the check that every journal adds up to its balance. Each figure is one aggregate query
// over the period, through the days' indexes (MissionTask, MissionDay, DailyMission by day, TokenEntry by createdAt);
// the balances and the check read User and the journal whole, a few rows a player.

/** The missions of the period: v2's by tier and kind, v1's counted with their kind's. */
export type MissionFigures = {
  proposed: number; // shown, or taken on before
  completed: number;
  byTier: { tier: MissionTier; proposed: number; completed: number }[]; // v2's
  byKind: { kind: MissionKind; tier: MissionTier; proposed: number; completed: number }[]; // the catalogue's order
  perfectDays: number; // a player's three missions of a day
  changes: number; // « Changer de mission » used
  streaks: { days: number; players: number }[]; // running today (latest counted day today's or yesterday's), shortest first
  record: number; // the longest streak a day of the period made, 0 without one
  cycles: number; // the streaks' 7-day cycles completed over the period
  shields: { bought: number; used: number; held: number }; // bought and used over the period, held now
};

export type TokenSource = "MISSION" | "ALL_THREE" | "STREAK" | "WELCOME";

export type TokenFigures = {
  earned: number;
  spent: number;
  days: { day: string; earned: number; spent: number }[]; // every day of the period, oldest first
  sources: { reason: TokenSource; tokens: number }[];
  purchases: { item: ShopItemName; purchases: number; tokens: number }[]; // every item, the shop's order
  balances: { holders: number; median: number; p90: number; max: number; total: number }; // the players with tokens, now
  integrity: { checked: number; mismatched: number }; // players whose journal does not add up to their balance
};

const TOKEN_SOURCES: readonly TokenSource[] = ["MISSION", "ALL_THREE", "STREAK", "WELCOME"];
const SHOP_ITEMS: readonly ShopItemName[] = ["FITNESS_CAMP", "EXPRESS_CARE", "BUDGET_TOP_UP", "PROMISING_YOUTH", "STREAK_SHIELD", "COSMETIC"];

const isKind = (value: string): value is MissionKind => (MISSION_KINDS as readonly string[]).includes(value);

/** The missions and tokens of the period, from `first` to `last` (UTC days, today), `end` the day after. */
export async function missionsAndTokens(
  db: PrismaClient,
  first: string,
  last: string,
  end: string,
): Promise<{ missions: MissionFigures; tokens: TokenFigures }> {
  const [tasks, v1, [days], running, entries, [balances], [integrity]] = await Promise.all([
    db.$queryRaw<{ tier: string; kind: string; proposed: bigint; completed: bigint }[]>`
      SELECT "tier"::text AS tier, "kind"::text AS kind, count(*)::bigint AS proposed, count("completedAt")::bigint AS completed
      FROM "MissionTask"
      WHERE "day" >= ${first}::date AND "day" <= ${last}::date
      GROUP BY 1, 2`,
    db.$queryRaw<{ kind: string; proposed: bigint; completed: bigint; best: number | null }[]>`
      SELECT "kind"::text AS kind, count(*)::bigint AS proposed, count("completedAt")::bigint AS completed, max("best") AS best
      FROM "DailyMission"
      WHERE "day" >= ${first}::date AND "day" <= ${last}::date
      GROUP BY 1`,
    db.$queryRaw<{ perfect: bigint; changes: bigint; shielded: bigint; cycles: bigint; best: number | null }[]>`
      SELECT count("allDoneAt")::bigint AS perfect,
             count("changedAt")::bigint AS changes,
             count("shieldedAt")::bigint AS shielded,
             count(*) FILTER (WHERE "countedAt" IS NOT NULL AND "streak" % ${STREAK_CYCLE_DAYS}::int = 0)::bigint AS cycles,
             max("best") FILTER (WHERE "countedAt" IS NOT NULL) AS best
      FROM "MissionDay"
      WHERE "day" >= ${first}::date AND "day" <= ${last}::date`,
    // Each player's latest counted day of today or yesterday, v2's or v1's: their streak runs on.
    db.$queryRaw<{ days: number; players: bigint }[]>`
      SELECT "streak" AS days, count(*)::bigint AS players
      FROM (
        SELECT DISTINCT ON ("userId") "streak"
        FROM (
          SELECT "userId", "day", "streak" FROM "MissionDay"
          WHERE "countedAt" IS NOT NULL AND "day" >= ${last}::date - 1 AND "day" <= ${last}::date
          UNION ALL
          SELECT "userId", "day", "streak" FROM "DailyMission"
          WHERE "completedAt" IS NOT NULL AND "day" >= ${last}::date - 1 AND "day" <= ${last}::date
        ) counted
        ORDER BY "userId", "day" DESC
      ) running
      WHERE "streak" IS NOT NULL
      GROUP BY 1
      ORDER BY 1`,
    db.$queryRaw<{ day: Date; reason: string; item: string | null; entries: bigint; tokens: bigint }[]>`
      SELECT "createdAt"::date AS day, "reason"::text AS reason, "item"::text AS item, count(*)::bigint AS entries,
             sum("amount")::bigint AS tokens
      FROM "TokenEntry"
      WHERE "createdAt" >= ${first}::date AND "createdAt" < ${end}::date
      GROUP BY 1, 2, 3`,
    db.$queryRaw<{ holders: bigint; median: number | null; p90: number | null; max: number | null; total: bigint | null; shields: bigint }[]>`
      SELECT count(*) FILTER (WHERE "tokens" > 0)::bigint AS holders,
             percentile_disc(0.5) WITHIN GROUP (ORDER BY "tokens") FILTER (WHERE "tokens" > 0) AS median,
             percentile_disc(0.9) WITHIN GROUP (ORDER BY "tokens") FILTER (WHERE "tokens" > 0) AS p90,
             max("tokens") AS max,
             sum("tokens")::bigint AS total,
             count(*) FILTER (WHERE "streakShield")::bigint AS shields
      FROM "User"
      WHERE "tokens" > 0 OR "streakShield"`,
    db.$queryRaw<{ checked: bigint; mismatched: bigint }[]>`
      SELECT count(*)::bigint AS checked, count(*) FILTER (WHERE u."tokens" <> coalesce(j.total, 0))::bigint AS mismatched
      FROM "User" u
      LEFT JOIN (SELECT "userId", sum("amount")::bigint AS total FROM "TokenEntry" GROUP BY 1) j ON j."userId" = u."id"
      WHERE u."tokens" <> 0 OR j.total IS NOT NULL`,
  ]);

  const v1Of = (kind: MissionKind) => v1.find((row) => row.kind === kind);
  const byKind = MISSION_KINDS.map((kind) => {
    const v2 = tasks.filter((row) => row.kind === kind);
    const old = v1Of(kind);
    return {
      kind,
      tier: tierOf(kind),
      proposed: v2.reduce((sum, row) => sum + Number(row.proposed), 0) + Number(old?.proposed ?? 0),
      completed: v2.reduce((sum, row) => sum + Number(row.completed), 0) + Number(old?.completed ?? 0),
    };
  });
  const byTier = MISSION_TIERS.map((tier) => {
    const rows = tasks.filter((row) => row.tier === tier && isKind(row.kind));
    return {
      tier,
      proposed: rows.reduce((sum, row) => sum + Number(row.proposed), 0),
      completed: rows.reduce((sum, row) => sum + Number(row.completed), 0),
    };
  });

  const dayList: string[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) {
    dayList.push(day);
  }
  const dayOf = (date: Date): string => date.toISOString().slice(0, 10);
  const tokenDays = dayList.map((day) => {
    const rows = entries.filter((row) => dayOf(row.day) === day);
    return {
      day,
      earned: rows.filter((row) => Number(row.tokens) > 0).reduce((sum, row) => sum + Number(row.tokens), 0),
      // Subtracted from 0, never negated: a day without spending is 0, not -0 (« -0 » on the screen).
      spent: rows.filter((row) => Number(row.tokens) < 0).reduce((sum, row) => sum - Number(row.tokens), 0),
    };
  });
  const purchases = SHOP_ITEMS.map((item) => {
    const rows = entries.filter((row) => row.reason === "PURCHASE" && row.item === item);
    return {
      item,
      purchases: rows.reduce((sum, row) => sum + Number(row.entries), 0),
      tokens: rows.reduce((sum, row) => sum - Number(row.tokens), 0),
    };
  });

  return {
    missions: {
      proposed: byKind.reduce((sum, row) => sum + row.proposed, 0),
      completed: byKind.reduce((sum, row) => sum + row.completed, 0),
      byTier,
      byKind,
      perfectDays: Number(days?.perfect ?? 0),
      changes: Number(days?.changes ?? 0),
      streaks: running.map((row) => ({ days: row.days, players: Number(row.players) })),
      record: Math.max(0, days?.best ?? 0, ...v1.map((row) => row.best ?? 0)),
      cycles: Number(days?.cycles ?? 0),
      shields: {
        bought: purchases.find(({ item }) => item === "STREAK_SHIELD")?.purchases ?? 0,
        used: Number(days?.shielded ?? 0),
        held: Number(balances?.shields ?? 0),
      },
    },
    tokens: {
      earned: tokenDays.reduce((sum, day) => sum + day.earned, 0),
      spent: tokenDays.reduce((sum, day) => sum + day.spent, 0),
      days: tokenDays,
      sources: TOKEN_SOURCES.map((reason) => ({
        reason,
        tokens: entries.filter((row) => row.reason === reason).reduce((sum, row) => sum + Number(row.tokens), 0),
      })),
      purchases,
      balances: {
        holders: Number(balances?.holders ?? 0),
        median: balances?.median ?? 0,
        p90: balances?.p90 ?? 0,
        max: balances?.max ?? 0,
        total: Number(balances?.total ?? 0),
      },
      integrity: { checked: Number(integrity?.checked ?? 0), mismatched: Number(integrity?.mismatched ?? 0) },
    },
  };
}
