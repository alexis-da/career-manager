import { cache } from "react";
import * as z from "zod";
import { displayClubName } from "../engine/club-name";
import { POSITIONS, primariesWithSecondary, secondaryPositions, type Position } from "../engine/positions";
import { nextTransferWindowOpening, transferWindowAt, transferWindowCloseDate } from "../engine/world";
import type { Prisma } from "../generated/prisma/client";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears, earliestBirthForMaxAge } from "../lib/dates";
import { prisma } from "./client";
import { getPlayerProfiles, type PlayerProfile, type TransferKind } from "./players";
import { freeAgentWhere, quoteFor, quoteSquad, type ContractTerms, type TransferQuote } from "./transfers";

/** Rows per page in every list of the transfer market. */
export const MARKET_PAGE_SIZE = 50;

const EUROS_PER_MILLION = 1_000_000;

export type Paginated<T> = {
  rows: T[];
  total: number;
  page: number; // 1-based, within 1..pageCount
  pageCount: number;
};

const pageCountOf = (total: number): number => Math.max(1, Math.ceil(total / MARKET_PAGE_SIZE));
const clampPage = (page: number, total: number): number => Math.min(Math.max(1, page), pageCountOf(total));

const managedClub = (saveId: string) =>
  prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { id: true, clubId: true, budget: true, wageBudget: true, reputation: true, club: { select: { slug: true, name: true } } },
  });

const currentDateOf = async (saveId: string): Promise<Date> =>
  (await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } })).currentDate;

/** How many free agents the save has: once per request, for the market's banner and its list (React's cache). */
const countFreeAgents = cache(
  async (saveId: string): Promise<number> => prisma.playerSave.count({ where: freeAgentWhere(saveId) }),
);

/** Names of reference clubs by id; Club is world data, shared by every save. */
/** A club as the market shows it: its name, and its colors, which dress a player's face. */
type ClubLook = { name: string; colors: ClubColors };

async function clubLooks(ids: readonly (string | null)[]): Promise<Map<string, ClubLook>> {
  const unique = [...new Set(ids)].filter((id): id is string => id !== null);
  if (unique.length === 0) {
    return new Map();
  }
  const clubs = await prisma.club.findMany({
    where: { id: { in: unique } },
    select: { id: true, slug: true, name: true, primaryColor: true, secondaryColor: true },
  });
  return new Map(clubs.map((club) => [club.id, { name: displayClubName(club), colors: clubColorsOf(club) }]));
}

const nameOf = (looks: ReadonlyMap<string, ClubLook>, id: string | null | undefined): string | null =>
  id === null || id === undefined ? null : (looks.get(id)?.name ?? null);

// ---------------------------------------------------------------- overview

export type MarketOverview = {
  currentDate: Date;
  windowOpen: boolean;
  windowClosesOn: Date | null; // last day of the open window
  nextWindowOpensOn: Date; // first day of the next window
  clubName: string; // the managed club
  reputation: number; // its reputation: a player whose minimumReputation is higher refuses it, before any offer
  budget: number; // euros
  wageBudget: number; // euros per season
  payroll: number; // euros per season
  wageRoom: number; // euros per season left under the wage budget
  freeAgents: number;
  competitions: { code: string }[]; // named by the screens
};

/**
 * The transfer window and the managed club's money, as the top of the transfer page shows them. Read once per request
 * (React's cache: the page and its proposals both ask); outside a server render, every call reads.
 */
export const getMarketOverview = cache(async (saveId: string): Promise<MarketOverview> => {
  const [currentDate, club] = await Promise.all([currentDateOf(saveId), managedClub(saveId)]);
  const [payroll, freeAgents, competitions] = await Promise.all([
    prisma.playerSave.aggregate({ where: { saveId, clubSaveId: club.id }, _sum: { wage: true } }),
    countFreeAgents(saveId),
    prisma.competition.findMany({
      where: { kind: "LEAGUE", seasons: { some: { saveId } } },
      orderBy: { code: "asc" },
      select: { code: true },
    }),
  ]);
  const wages = payroll._sum.wage ?? 0;
  return {
    currentDate,
    windowOpen: transferWindowAt(currentDate) !== null,
    windowClosesOn: transferWindowCloseDate(currentDate),
    nextWindowOpensOn: nextTransferWindowOpening(currentDate),
    clubName: displayClubName(club.club),
    reputation: club.reputation,
    budget: club.budget,
    wageBudget: club.wageBudget,
    payroll: wages,
    wageRoom: club.wageBudget - wages,
    freeAgents,
    competitions,
  };
});

// ------------------------------------------------------------- free agents

export type FreeAgentRow = {
  id: string;
  playerKey: string;
  firstName: string;
  lastName: string;
  nationality: string;
  position: Position;
  age: number;
  overall: number;
  potential: number;
  askedWage: number; // lowest wage he accepts, euros per season
  minimumReputation: number; // the lowest reputation of a club he joins
  formerClubName: string | null; // the club that released him
};

/** Free agents of the save, best rated first, one page at a time. */
export async function listFreeAgents(saveId: string, page: number): Promise<Paginated<FreeAgentRow>> {
  const where = freeAgentWhere(saveId);
  const [currentDate, total] = await Promise.all([currentDateOf(saveId), countFreeAgents(saveId)]);
  const current = clampPage(page, total);
  const players = await prisma.playerSave.findMany({
    where,
    orderBy: [{ overall: "desc" }, { playerKey: "asc" }],
    skip: (current - 1) * MARKET_PAGE_SIZE,
    take: MARKET_PAGE_SIZE,
    select: {
      id: true,
      playerKey: true,
      firstName: true,
      lastName: true,
      nationality: true,
      position: true,
      birthDate: true,
      overall: true,
      potential: true,
      wage: true,
      contractUntil: true,
      transfers: {
        where: { saveId, type: "FREE", toClubId: null },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take: 1,
        select: { fromClubId: true },
      },
    },
  });
  const names = await clubLooks(players.flatMap((player) => player.transfers.map((transfer) => transfer.fromClubId)));

  return {
    total,
    page: current,
    pageCount: pageCountOf(total),
    rows: players.map((player) => {
      const quote = quoteFor(player, null, currentDate);
      return {
        id: player.id,
        playerKey: player.playerKey,
        firstName: player.firstName,
        lastName: player.lastName,
        nationality: player.nationality,
        position: player.position,
        age: ageInYears(player.birthDate, currentDate),
        overall: player.overall,
        potential: player.potential,
        askedWage: quote.minimumWage,
        minimumReputation: quote.minimumReputation,
        formerClubName: nameOf(names, player.transfers.at(0)?.fromClubId),
      };
    }),
  };
}

// ----------------------------------------------------- players of AI clubs

/**
 * Filters of the list of AI clubs' players, read from the page's search params. An invalid or empty value is
 * ignored rather than refused: the URL is typed by hand as often as it is built by the form.
 */
export const marketFiltersSchema = z.object({
  position: z.enum(POSITIONS).optional().catch(undefined),
  withSecondary: z.literal("1").optional().catch(undefined), // the position filter also matches secondary positions
  competition: z.string().trim().min(1).max(20).optional().catch(undefined), // Competition.code
  minOverall: z.coerce.number().int().min(1).max(99).optional().catch(undefined),
  maxAge: z.coerce.number().int().min(15).max(50).optional().catch(undefined),
  maxPrice: z.coerce.number().positive().max(10_000).optional().catch(undefined), // millions of euros
  q: z.string().trim().min(1).max(100).optional().catch(undefined),
  sort: z.enum(["overall", "price"]).catch("overall"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  page: z.coerce.number().int().min(1).catch(1),
});

export type MarketFilters = z.output<typeof marketFiltersSchema>;

export type ClubPlayerRow = {
  id: string;
  playerKey: string;
  firstName: string;
  lastName: string;
  nationality: string;
  clubName: string;
  clubColors: ClubColors;
  position: Position;
  age: number;
  overall: number;
  potential: number;
  askingPrice: number; // euros, what his club asks today
  askedWage: number; // lowest wage he accepts to move, euros per season
  minimumReputation: number; // the lowest reputation of a club he joins
  contractUntil: Date | null;
};

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** What a row of the AI clubs' players needs: no column more. */
const CLUB_PLAYER_SELECT = {
  id: true,
  playerKey: true,
  firstName: true,
  lastName: true,
  nationality: true,
  position: true,
  birthDate: true,
  overall: true,
  potential: true,
  wage: true,
  contractUntil: true,
  clubSave: {
    select: {
      isManaged: true,
      reputation: true,
      club: { select: { slug: true, name: true, primaryColor: true, secondaryColor: true } },
    },
  },
} as const satisfies Prisma.PlayerSaveSelect;

type ClubPlayer = Prisma.PlayerSaveGetPayload<{ select: typeof CLUB_PLAYER_SELECT }>;

/**
 * Which clubs' players the list reads, by their ids rather than a join on ClubSave, which hides from Postgres how many
 * players a club has (it would read them all to sort one page): every club's but the managed one's, or the AI clubs of a
 * competition, the club's current one in the save, never the world's.
 */
async function listedClubs(saveId: string, competition: string | undefined): Promise<Prisma.PlayerSaveWhereInput[]> {
  if (competition === undefined) {
    const managed = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
    return [{ clubSaveId: { not: null } }, { clubSaveId: { not: managed.id } }];
  }
  const clubs = await prisma.clubSave.findMany({
    where: { saveId, isManaged: false, competition: { code: competition } },
    select: { id: true },
  });
  return [{ clubSaveId: { in: clubs.map((club) => club.id) } }];
}

/** The filters the database applies: all of them but a secondary position and the price, which only this code knows. */
function clubPlayersWhere(
  saveId: string,
  clubs: Prisma.PlayerSaveWhereInput[],
  filters: MarketFilters,
  currentDate: Date,
): Prisma.PlayerSaveWhereInput {
  const words = (filters.q ?? "").split(/\s+/).filter((word) => word !== "");
  return {
    saveId,
    ...(filters.position === undefined
      ? {}
      : {
          // Secondary positions are not stored: SQL keeps the primary positions that may have the wanted one, the
          // check below the players who do have it.
          position:
            filters.withSecondary === undefined
              ? filters.position
              : { in: [filters.position, ...primariesWithSecondary(filters.position)] },
        }),
    ...(filters.minOverall === undefined ? {} : { overall: { gte: filters.minOverall } }),
    // The age on the current date, as ageInYears counts it.
    ...(filters.maxAge === undefined ? {} : { birthDate: { gte: earliestBirthForMaxAge(filters.maxAge, currentDate) } }),
    AND: [
      ...clubs,
      // Every word of the search must appear in the first or the last name: « kevin mor » finds Kevin Morel.
      ...words.map((word) => ({
        OR: [
          { firstName: { contains: word, mode: "insensitive" as const } },
          { lastName: { contains: word, mode: "insensitive" as const } },
        ],
      })),
    ],
  };
}

/** The rows of the players kept by the filters only this code applies, in the list's order. */
function sortedClubPlayers(players: readonly ClubPlayer[], filters: MarketFilters, currentDate: Date): ClubPlayerRow[] {
  const maxPrice = filters.maxPrice === undefined ? undefined : Math.round(filters.maxPrice * EUROS_PER_MILLION);
  const entries = players.flatMap((player) => {
    // Always set: the filter requires a club. The check narrows the type.
    if (player.clubSave === null) {
      return [];
    }
    if (
      filters.position !== undefined &&
      player.position !== filters.position &&
      !secondaryPositions(player.playerKey, player.position).includes(filters.position)
    ) {
      return [];
    }
    const quote = quoteFor(player, player.clubSave, currentDate);
    if (maxPrice !== undefined && quote.askingPrice > maxPrice) {
      return [];
    }
    const row: ClubPlayerRow = {
      id: player.id,
      playerKey: player.playerKey,
      firstName: player.firstName,
      lastName: player.lastName,
      nationality: player.nationality,
      clubName: displayClubName(player.clubSave.club),
      clubColors: clubColorsOf(player.clubSave.club),
      position: player.position,
      age: ageInYears(player.birthDate, currentDate),
      overall: player.overall,
      potential: player.potential,
      askingPrice: quote.askingPrice,
      askedWage: quote.minimumWage,
      minimumReputation: quote.minimumReputation,
      contractUntil: player.contractUntil,
    };
    return [row];
  });

  const sign = filters.dir === "asc" ? 1 : -1;
  return entries.sort((a, b) => {
    const byPrice = a.askingPrice - b.askingPrice;
    const byOverall = a.overall - b.overall;
    // The player key breaks ties, in the same order whatever the direction.
    return sign * (filters.sort === "price" ? byPrice || byOverall : byOverall || byPrice) || byKey(a.playerKey, b.playerKey);
  });
}

/**
 * Players of the AI clubs matching the filters, sorted by rating or asking price, one page at a time. The database
 * filters them, counts them and finds the page's ratings; it reads only the players of those ratings, which the asking
 * price then orders (it depends on the date, and is computed here). A secondary position, a price bound or the sort by
 * price are this code's alone: with one of them, every candidate is read, with a narrow select.
 */
export async function listClubPlayers(saveId: string, filters: MarketFilters): Promise<Paginated<ClubPlayerRow>> {
  const [currentDate, clubs] = await Promise.all([currentDateOf(saveId), listedClubs(saveId, filters.competition)]);
  const where = clubPlayersWhere(saveId, clubs, filters, currentDate);
  const paged = (rows: ClubPlayerRow[], total: number, page: number, offset: number): Paginated<ClubPlayerRow> => ({
    total,
    page,
    pageCount: pageCountOf(total),
    rows: rows.slice((page - 1) * MARKET_PAGE_SIZE - offset, page * MARKET_PAGE_SIZE - offset),
  });

  const secondary = filters.position !== undefined && filters.withSecondary !== undefined;
  if (filters.sort === "price" || filters.maxPrice !== undefined || secondary) {
    const players = await prisma.playerSave.findMany({ where, select: CLUB_PLAYER_SELECT });
    const rows = sortedClubPlayers(players, filters, currentDate);
    return paged(rows, rows.length, clampPage(filters.page, rows.length), 0);
  }

  const total = await prisma.playerSave.count({ where });
  const page = clampPage(filters.page, total);
  const start = (page - 1) * MARKET_PAGE_SIZE;
  // The ratings of the page's places, in the list's order: the rating orders it, the price and the key only within one.
  const ratings = await prisma.playerSave.findMany({
    where,
    orderBy: { overall: filters.dir },
    skip: start,
    take: MARKET_PAGE_SIZE,
    select: { overall: true },
  });
  const first = ratings.at(0)?.overall;
  const last = ratings.at(-1)?.overall;
  if (first === undefined || last === undefined) {
    return { total, page, pageCount: pageCountOf(total), rows: [] };
  }
  const [low, high] = filters.dir === "desc" ? [last, first] : [first, last];
  const [before, players] = await Promise.all([
    // The players placed before the first rating's.
    prisma.playerSave.count({
      where: { AND: [where, { overall: filters.dir === "desc" ? { gt: first } : { lt: first } }] },
    }),
    prisma.playerSave.findMany({
      where: { AND: [where, { overall: { gte: low, lte: high } }] },
      select: CLUB_PLAYER_SELECT,
    }),
  ]);
  return paged(sortedClubPlayers(players, filters, currentDate), total, page, before);
}

// -------------------------------------------------------------- movements

export type MovementRow = {
  id: string;
  date: Date;
  type: TransferKind;
  fee: number; // euros
  playerSaveId: string;
  playerKey: string; // his face's
  firstName: string;
  lastName: string;
  position: Position;
  age: number; // today, his face's as everywhere else
  clubColors: ClubColors | null; // the club he joins, his face's shirt; none for a release or a retirement
  fromClubName: string | null; // null: a free agent signing
  toClubName: string | null; // null: a release or a retirement
  managedClubInvolved: boolean;
};

/** Every transfer of the save, most recent first, one page at a time; only the managed club's when `mine`. */
export async function listTransfers(saveId: string, options: { mine: boolean; page: number }): Promise<Paginated<MovementRow>> {
  const [club, currentDate] = await Promise.all([managedClub(saveId), currentDateOf(saveId)]);
  const where: Prisma.TransferWhereInput = {
    saveId,
    ...(options.mine ? { OR: [{ fromClubId: club.clubId }, { toClubId: club.clubId }] } : {}),
  };
  const total = await prisma.transfer.count({ where });
  const page = clampPage(options.page, total);
  const transfers = await prisma.transfer.findMany({
    where,
    // Within a day, cuids grow with creation time: the id keeps the most recent first.
    orderBy: [{ date: "desc" }, { id: "desc" }],
    skip: (page - 1) * MARKET_PAGE_SIZE,
    take: MARKET_PAGE_SIZE,
    select: {
      id: true,
      date: true,
      type: true,
      fee: true,
      fromClubId: true,
      toClubId: true,
      playerSave: { select: { id: true, playerKey: true, firstName: true, lastName: true, position: true, birthDate: true } },
    },
  });
  const looks = await clubLooks(transfers.flatMap((transfer) => [transfer.fromClubId, transfer.toClubId]));

  return {
    total,
    page,
    pageCount: pageCountOf(total),
    rows: transfers.map((transfer) => ({
      id: transfer.id,
      date: transfer.date,
      type: transfer.type,
      fee: transfer.fee,
      playerSaveId: transfer.playerSave.id,
      playerKey: transfer.playerSave.playerKey,
      firstName: transfer.playerSave.firstName,
      lastName: transfer.playerSave.lastName,
      position: transfer.playerSave.position,
      age: ageInYears(transfer.playerSave.birthDate, currentDate),
      clubColors: transfer.toClubId === null ? null : (looks.get(transfer.toClubId)?.colors ?? null),
      fromClubName: nameOf(looks, transfer.fromClubId),
      toClubName: nameOf(looks, transfer.toClubId),
      managedClubInvolved: transfer.fromClubId === club.clubId || transfer.toClubId === club.clubId,
    })),
  };
}

// ----------------------------------------------------------- player sheet

/** Where a player stands for the managed club: what the sheet lets it do. */
export type PlayerSheetStatus =
  | { kind: "managed"; terms: ContractTerms }
  | { kind: "club"; clubName: string; quote: TransferQuote }
  | { kind: "free"; quote: TransferQuote }
  | { kind: "retired" };

export type PlayerSheet = {
  profile: PlayerProfile;
  status: PlayerSheetStatus;
};

/** The sheet of any player of the save, or null when there is no such player. */
export async function getPlayerSheet(saveId: string, playerSaveId: string): Promise<PlayerSheet | null> {
  const profile = (await getPlayerProfiles(saveId, { id: playerSaveId })).at(0);
  if (profile === undefined) {
    return null;
  }
  const [currentDate, player] = await Promise.all([
    currentDateOf(saveId),
    prisma.playerSave.findFirstOrThrow({
      where: { id: playerSaveId, saveId },
      select: {
        birthDate: true,
        overall: true,
        potential: true,
        wage: true,
        contractUntil: true,
        clubSave: { select: { isManaged: true, reputation: true, club: { select: { slug: true, name: true } } } },
        retired: true,
      },
    }),
  ]);

  if (player.retired) {
    return { profile, status: { kind: "retired" } };
  }
  if (player.clubSave === null) {
    return { profile, status: { kind: "free", quote: quoteFor(player, null, currentDate) } };
  }
  if (player.clubSave.isManaged) {
    const terms = (await quoteSquad(saveId)).get(playerSaveId);
    if (terms === undefined) {
      throw new Error(`No contract terms for player ${playerSaveId}`);
    }
    return { profile, status: { kind: "managed", terms } };
  }
  return {
    profile,
    status: { kind: "club", clubName: displayClubName(player.clubSave.club), quote: quoteFor(player, player.clubSave, currentDate) },
  };
}

// --------------------------------------------------------------- refusals

/** Figures that explain a refused signing or offer: what the club can spend and what the player's side asks. */
export type OfferFacts = {
  budget: number;
  wageRoom: number;
  nextWindowOpensOn: Date;
  clubName: string | null; // the selling club; null for a free agent
  quote: TransferQuote;
};

export async function getOfferFacts(saveId: string, playerSaveId: string): Promise<OfferFacts> {
  const [overview, player] = await Promise.all([
    getMarketOverview(saveId),
    prisma.playerSave.findFirstOrThrow({
      where: { id: playerSaveId, saveId },
      select: {
        birthDate: true,
        overall: true,
        potential: true,
        wage: true,
        contractUntil: true,
        clubSave: { select: { isManaged: true, reputation: true, club: { select: { slug: true, name: true } } } },
      },
    }),
  ]);
  return {
    budget: overview.budget,
    wageRoom: overview.wageRoom,
    nextWindowOpensOn: overview.nextWindowOpensOn,
    clubName: player.clubSave === null ? null : displayClubName(player.clubSave.club),
    quote: quoteFor(player, player.clubSave, overview.currentDate),
  };
}
