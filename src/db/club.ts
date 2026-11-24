import { NEUTRAL_BUDGET_COEFFICIENT } from "../engine/balance";
import { cupCode, cupPrizesOf } from "../engine/cup";
import type { EuropeCode } from "../engine/europe";
import { countryOf } from "../engine/promotion";
import { prisma } from "./client";
import { clubEuropePrizes } from "./europe";

/**
 * The board's last dotation to the managed club, as SeasonBudget keeps it on the league season it opened (gameplay v2,
 * V2): the season's budget and how it was made. Not its wage cap, still written (SeasonBudget.wageBudget) but read by
 * nothing: the budget is the only limit (docs/design/simplification.md § 1).
 */
export type ClubDotation = {
  startYear: number; // of its season
  reputation: number; // 1–99, the club's at the season's opening
  reputationRank: number; // by reputation in its division, ties sharing the best rank
  clubCount: number; // in its division that season: the clubs of the season's fixtures
  dotation: number; // euros: the creation's budget at that rank, in that division
  coefficient: number; // hundredths: 100 neutral, 70 to 140 by the objectives of the season before
  objectivesAmount: number; // euros: what the coefficient added to the dotation, negative for a malus
  carryOver: number; // euros: half of the transfer budget left unspent the season before
  budget: number; // euros: the dotation, plus the objectives' amount, plus the carry-over
  first: boolean; // the save's first season: its creation budget, nothing carried over, no objectives
};

/** The managed club's money: its budget, its only limit, and how the board made it. No wage: no screen shows one. */
export type ClubFinances = {
  budget: number; // euros
  dotation: ClubDotation | null; // the board's last; null for a save made before the season budgets, until its next season
};

/** The managed club's money, as the Club screen and the season's start show it. */
export async function getClubFinances(saveId: string): Promise<ClubFinances> {
  const [club, dotation] = await Promise.all([
    prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { budget: true } }),
    getLatestDotation(saveId),
  ]);
  return { budget: club.budget, dotation };
}

/** The managed club's latest dotation, by its season's start: the current season's, unless the save is older than them. */
async function getLatestDotation(saveId: string): Promise<ClubDotation | null> {
  const row = await prisma.seasonBudget.findFirst({
    where: { saveId },
    orderBy: { season: { startYear: "desc" } },
    select: {
      reputation: true,
      reputationRank: true,
      dotation: true,
      coefficient: true,
      carryOver: true,
      budget: true,
      season: { select: { id: true, startYear: true } },
    },
  });
  if (row === null) {
    return null;
  }
  const { season, ...dotation } = row;
  const seasonId = season.id;
  const [clubCount, earlierSeasons] = await Promise.all([
    // The clubs of its fixtures, exact for a past season too: a club promoted or relegated since has changed division. An
    // archived season's from its archive (src/db/season-archive.ts), never its rows.
    prisma.seasonArchive
      .findFirst({ where: { saveId, seasonId }, select: { clubSaveIds: true } })
      .then(
        (archive) =>
          archive?.clubSaveIds.length ??
          prisma.clubSave.count({
            where: {
              saveId,
              OR: [{ homeFixtures: { some: { saveId, seasonId } } }, { awayFixtures: { some: { saveId, seasonId } } }],
            },
          }),
      ),
    prisma.season.count({ where: { saveId, completed: true, startYear: { lt: season.startYear } } }),
  ]);
  return {
    ...dotation,
    startYear: season.startYear,
    clubCount,
    objectivesAmount: dotation.budget - dotation.carryOver - dotation.dotation,
    first: earlierSeasons === 0 && dotation.carryOver === 0 && dotation.coefficient === NEUTRAL_BUDGET_COEFFICIENT,
  };
}

/** The prize money the managed club has received this season, from its country's cup and its European competition. */
export type SeasonPrizes = {
  startYear: number; // of the season
  cup: { code: string; amount: number } | null; // euros; null without a cup this season
  europe: { code: EuropeCode; amount: number } | null; // euros, its participation included; null when it plays none
};

/**
 * The prize money of the managed club's current season (its latest league season's year), as its budget received it:
 * each cup tie's (cupPrizesOf, as progressCups credits it) and its European season's (clubEuropePrizes); null without a
 * cup nor a European season, as in a worldVersion 1 save.
 */
export async function getSeasonPrizes(saveId: string): Promise<SeasonPrizes | null> {
  const club = await prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { id: true, competition: { select: { code: true } } },
  });
  const latest = await prisma.season.findFirst({
    where: { saveId, competition: { kind: "LEAGUE" } },
    orderBy: { startYear: "desc" },
    select: { startYear: true },
  });
  if (latest === null) {
    return null;
  }
  const { startYear } = latest;
  const seasons = await prisma.season.findMany({
    where: { saveId, startYear, competition: { kind: { in: ["CUP", "EUROPE"] } } },
    select: { id: true, competition: { select: { code: true, kind: true } } },
  });
  const cupSeason = seasons.find((season) => season.competition.code === cupCode(countryOf(club.competition.code)));
  const ties =
    cupSeason === undefined
      ? []
      : await prisma.fixture.findMany({
          where: { saveId, seasonId: cupSeason.id, played: true, OR: [{ homeClubSaveId: club.id }, { awayClubSaveId: club.id }] },
          select: { round: true, homeClubSaveId: true, awayClubSaveId: true, winnerClubSaveId: true },
        });
  const cup =
    cupSeason === undefined
      ? null
      : {
          code: cupSeason.competition.code,
          amount: cupPrizesOf(
            ties.map((tie) => ({ round: tie.round, home: tie.homeClubSaveId, away: tie.awayClubSaveId, winner: tie.winnerClubSaveId ?? "" })),
            club.id,
          ),
        };
  const europe = await clubEuropePrizes(
    prisma,
    saveId,
    club.id,
    seasons.filter((season) => season.competition.kind === "EUROPE").map((season) => season.id),
  );
  return cup === null && europe === null ? null : { startYear, cup, europe };
}

/** The name the player manages the save under. */
export async function getManagerName(saveId: string): Promise<string> {
  const { managerName } = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { managerName: true } });
  return managerName;
}
