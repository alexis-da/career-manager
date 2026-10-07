import * as z from "zod";
import { POSITIONS, primariesWithSecondary, secondaryPositions, type Position } from "../engine/positions";
import { nextTransferWindowOpening, transferWindowAt, transferWindowCloseDate } from "../engine/world";
import type { Prisma } from "../generated/prisma/client";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
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
    select: { id: true, clubId: true, budget: true, wageBudget: true },
  });

const currentDateOf = async (saveId: string): Promise<Date> =>
  (await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } })).currentDate;

/** Names of reference clubs by id; Club is world data, shared by every save. */
async function clubNames(ids: readonly (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter((id): id is string => id !== null);
  if (unique.length === 0) {
    return new Map();
  }
  const clubs = await prisma.club.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(clubs.map((club) => [club.id, club.name]));
}

const nameOf = (names: ReadonlyMap<string, string>, id: string | null | undefined): string | null =>
  id === null || id === undefined ? null : (names.get(id) ?? null);

// ---------------------------------------------------------------- overview

export type MarketOverview = {
  currentDate: Date;
  windowOpen: boolean;
  windowClosesOn: Date | null; // last day of the open window
  nextWindowOpensOn: Date; // first day of the next window
  budget: number; // euros
  wageBudget: number; // euros per season
  payroll: number; // euros per season
  wageRoom: number; // euros per season left under the wage budget
  freeAgents: number;
  competitions: { code: string; name: string }[];
};

/** The transfer window and the managed club's money, as the top of the transfer page shows them. */
export async function getMarketOverview(saveId: string): Promise<MarketOverview> {
  const [currentDate, club] = await Promise.all([currentDateOf(saveId), managedClub(saveId)]);
  const [payroll, freeAgents, competitions] = await Promise.all([
    prisma.playerSave.aggregate({ where: { saveId, clubSaveId: club.id }, _sum: { wage: true } }),
    prisma.playerSave.count({ where: freeAgentWhere(saveId) }),
    prisma.competition.findMany({
      where: { seasons: { some: { saveId } } },
      orderBy: { name: "asc" },
      select: { code: true, name: true },
    }),
  ]);
  const wages = payroll._sum.wage ?? 0;
  return {
    currentDate,
    windowOpen: transferWindowAt(currentDate) !== null,
    windowClosesOn: transferWindowCloseDate(currentDate),
    nextWindowOpensOn: nextTransferWindowOpening(currentDate),
    budget: club.budget,
    wageBudget: club.wageBudget,
    payroll: wages,
    wageRoom: club.wageBudget - wages,
    freeAgents,
    competitions,
  };
}

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
  formerClubName: string | null; // the club that released him
};

/** Free agents of the save, best rated first, one page at a time. */
export async function listFreeAgents(saveId: string, page: number): Promise<Paginated<FreeAgentRow>> {
  const where = freeAgentWhere(saveId);
  const [currentDate, total] = await Promise.all([currentDateOf(saveId), prisma.playerSave.count({ where })]);
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
  const names = await clubNames(players.flatMap((player) => player.transfers.map((transfer) => transfer.fromClubId)));

  return {
    total,
    page: current,
    pageCount: pageCountOf(total),
    rows: players.map((player) => ({
      id: player.id,
      playerKey: player.playerKey,
      firstName: player.firstName,
      lastName: player.lastName,
      nationality: player.nationality,
      position: player.position,
      age: ageInYears(player.birthDate, currentDate),
      overall: player.overall,
      potential: player.potential,
      askedWage: quoteFor(player, null, currentDate).minimumWage,
      formerClubName: nameOf(names, player.transfers.at(0)?.fromClubId),
    })),
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
  contractUntil: Date | null;
};

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Players of the AI clubs matching the filters, sorted by rating or asking price, one page at a time. Age and
 * price depend on the current date, so they are filtered and sorted here rather than in SQL: the league has
 * a few thousand players, read with a narrow select.
 */
export async function listClubPlayers(saveId: string, filters: MarketFilters): Promise<Paginated<ClubPlayerRow>> {
  const currentDate = await currentDateOf(saveId);
  const words = (filters.q ?? "").split(/\s+/).filter((word) => word !== "");
  const where: Prisma.PlayerSaveWhereInput = {
    saveId,
    clubSave: {
      saveId,
      isManaged: false,
      ...(filters.competition === undefined ? {} : { club: { competition: { code: filters.competition } } }),
    },
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
    // Every word of the search must appear in the first or the last name: « kevin mor » finds Kevin Morel.
    AND: words.map((word) => ({
      OR: [
        { firstName: { contains: word, mode: "insensitive" as const } },
        { lastName: { contains: word, mode: "insensitive" as const } },
      ],
    })),
  };
  const players = await prisma.playerSave.findMany({
    where,
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
      clubSave: {
        select: {
          isManaged: true,
          reputation: true,
          club: { select: { name: true, primaryColor: true, secondaryColor: true } },
        },
      },
    },
  });

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
    const age = ageInYears(player.birthDate, currentDate);
    const quote = quoteFor(player, player.clubSave, currentDate);
    if ((filters.maxAge !== undefined && age > filters.maxAge) || (maxPrice !== undefined && quote.askingPrice > maxPrice)) {
      return [];
    }
    const row: ClubPlayerRow = {
      id: player.id,
      playerKey: player.playerKey,
      firstName: player.firstName,
      lastName: player.lastName,
      nationality: player.nationality,
      clubName: player.clubSave.club.name,
      clubColors: clubColorsOf(player.clubSave.club),
      position: player.position,
      age,
      overall: player.overall,
      potential: player.potential,
      askingPrice: quote.askingPrice,
      askedWage: quote.minimumWage,
      contractUntil: player.contractUntil,
    };
    return [{ key: player.playerKey, row }];
  });

  const sign = filters.dir === "asc" ? 1 : -1;
  entries.sort((a, b) => {
    const byPrice = a.row.askingPrice - b.row.askingPrice;
    const byOverall = a.row.overall - b.row.overall;
    // The player key breaks ties, in the same order whatever the direction.
    return sign * (filters.sort === "price" ? byPrice || byOverall : byOverall || byPrice) || byKey(a.key, b.key);
  });

  const page = clampPage(filters.page, entries.length);
  return {
    total: entries.length,
    page,
    pageCount: pageCountOf(entries.length),
    rows: entries.slice((page - 1) * MARKET_PAGE_SIZE, page * MARKET_PAGE_SIZE).map((entry) => entry.row),
  };
}

// -------------------------------------------------------------- movements

export type MovementRow = {
  id: string;
  date: Date;
  type: TransferKind;
  fee: number; // euros
  playerSaveId: string;
  firstName: string;
  lastName: string;
  position: Position;
  fromClubName: string | null; // null: a free agent signing
  toClubName: string | null; // null: a release or a retirement
  managedClubInvolved: boolean;
};

/** Every transfer of the save, most recent first, one page at a time; only the managed club's when `mine`. */
export async function listTransfers(saveId: string, options: { mine: boolean; page: number }): Promise<Paginated<MovementRow>> {
  const club = await managedClub(saveId);
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
      playerSave: { select: { id: true, firstName: true, lastName: true, position: true } },
    },
  });
  const names = await clubNames(transfers.flatMap((transfer) => [transfer.fromClubId, transfer.toClubId]));

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
      firstName: transfer.playerSave.firstName,
      lastName: transfer.playerSave.lastName,
      position: transfer.playerSave.position,
      fromClubName: nameOf(names, transfer.fromClubId),
      toClubName: nameOf(names, transfer.toClubId),
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
        clubSave: { select: { isManaged: true, reputation: true, club: { select: { name: true } } } },
        _count: { select: { transfers: { where: { saveId, type: "RETIREMENT" } } } },
      },
    }),
  ]);

  if (player._count.transfers > 0) {
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
    status: { kind: "club", clubName: player.clubSave.club.name, quote: quoteFor(player, player.clubSave, currentDate) },
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
        clubSave: { select: { isManaged: true, reputation: true, club: { select: { name: true } } } },
      },
    }),
  ]);
  return {
    budget: overview.budget,
    wageRoom: overview.wageRoom,
    nextWindowOpensOn: overview.nextWindowOpensOn,
    clubName: player.clubSave?.club.name ?? null,
    quote: quoteFor(player, player.clubSave, overview.currentDate),
  };
}
