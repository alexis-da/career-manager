/**
 * Season budgets, reputation and objectives over several seasons (npm run measure:seasons -- [--seasons=N] [--seed=S]
 * [--out=file.md] [--from=file.json]): the guard of gameplay v2, V2 (docs/design/gameplay-v2.md, « Garde-fou »), and the
 * objectives' outcomes of V3, every club's measured with the game's rules.
 *
 * Plays a worldVersion 2 twin of the demo save (demo seed unless --seed, demo club, the cups as the game gives them,
 * an owner of its own for each seed: several seeds may run at once) for N complete
 * seasons (default 6), the assistant deciding everything and the player nothing, each season followed by
 * advanceToNextSeason, the assistant managing the managed club's contracts as an AI club's (assistantContracts:
 * renewals, releases and free signings in the preseason). Every club is recorded at each season's start (the first
 * right after the creation, the others right after the transition, its preseason included: N + 1 starts) and end (every
 * fixture played, the transition still to come). Then prints, in markdown: six representative French AI clubs season
 * by season; means by division and reputation third; whether the wage budget rather than the transfer budget limits a
 * typical signing; the managed club's squad and budget path at the game's coefficient and at the clamp's ends,
 * recomputed afterwards; the drifts; each division's spread of reputations, its standard deviation season by season
 * against the first; and how often each season objective is exceeded, achieved or missed, by division and reputation
 * third, with the managed club's own; and the European competitions (docs/design/europe.md): who qualifies, who
 * qualifies again and who goes down, the budgets and reputations of their clubs against the other first division clubs,
 * the European objective by reputation third, the knockout ties, and the fitness of the starters of the European clubs at
 * kick-off against the other first division clubs' (each date's AI lineups read before it is played, as
 * measure:balance reads them).
 *
 * --out writes the markdown there and the raw records beside it (the same name, .json), for later analyses;
 * --from reads such a JSON instead of playing, to print the report again without the database. The twin and its
 * throwaway owner are deleted at the end. Writes to the database: the local one only (src/db/client.ts refuses any
 * other, and this script refuses even ALLOW_REMOTE_DB=1).
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { prisma } from "../src/db/client";
import { isLocalDatabase } from "../src/db/database-url";
import { europeFixtures, europeRunsOf, europeSeasonsOf } from "../src/db/europe";
import { aiLineupOf, playNextMatchday, PLAYER_SELECT, squadsOf, withSuspensions } from "../src/db/matchday";
import { readCallUps } from "../src/db/nations";
import { createSave } from "../src/db/saves";
import { advanceToNextSeason, type SeasonTransition } from "../src/db/season";
import { parseFormation } from "../src/db/lineup";
import { getStandings } from "../src/db/standings";
import { DEMO_CLUB_SLUG, DEMO_SEED } from "../src/db/test-support";
import { europeObjective, europeReputationBonus, EUROPE_LEAGUE_ROUNDS, EUROPE_STAGES, type EuropeCode } from "../src/engine/europe";
import { recoveredFitness } from "../src/engine/fitness";
import {
  YOUTH_OBJECTIVE_MAX_AGE,
  BUDGET_CARRY_OVER_SHARE,
  BUDGET_COEFFICIENT_RANGE,
  BUDGET_STEP,
  CHOSEN_COEFFICIENT,
  CUP_COEFFICIENT,
  EUROPE_PRIZES,
  NEUTRAL_BUDGET_COEFFICIENT,
  RANKING_COEFFICIENT,
  REPUTATION_TARGET_SHARE,
  ROTATION_FITNESS,
  WAGE_BUDGET_FLOOR_SHARE,
  WAGE_BUDGET_MARGIN,
} from "../src/engine/balance";
import { cupRunOf, type PlayedTie } from "../src/engine/cup";
import {
  clubFinances,
  managedWageMargin,
  marketValueFor,
  seasonFinances,
  wageBudgetFloor,
  wageFor,
  type SeasonFinances,
} from "../src/engine/economy";
import { averageOpponent, chooseFormation, rankFormations } from "../src/engine/formation-choice";
import { breakWindows } from "../src/engine/schedule";
import { formationPositions } from "../src/engine/formations";
import { isAvailable, selectLineup, type SquadPlayer } from "../src/engine/lineup";
import {
  budgetCoefficient,
  CUP_WON_ROUND,
  cupObjective,
  divisionOf,
  expectedSeasonGoals,
  objectiveOutcome,
  optionalTarget,
  rankingObjective,
  rankingOutcome,
  reputationThird,
  type ObjectiveKind,
  type ObjectiveOutcome,
  type RankingObjective,
} from "../src/engine/objectives";
import { formationStrength } from "../src/engine/strength";
import { ageInYears } from "../src/lib/dates";
import { rankInNextDivision, reputationAfterSeason, reputationRanks, reputationTarget } from "../src/engine/reputation";
import { competitionTier, type CompetitionTier } from "../src/engine/tiers";
import { seasonLabel, seasonStartDate, seasonStartYear } from "../src/engine/world";
import type { WorldVersion } from "../src/engine/world-version";
import { getOrThrow } from "../src/lib/maps";

const OWNER = "test-owner-measure-seasons";
const WORLD_VERSION: WorldVersion = 2;
const DAY_MS = 86_400_000;

/** A club's typical signing (c): this age, his potential his overall, the median overall of the club's eleven best. */
const SIGNING_AGE = 25;
const ELEVEN = 11;

/** The divisions whose top, middle and bottom clubs (a) follows. */
const FOLLOWED_DIVISIONS = ["fr.1", "fr.2"] as const;

/** How far a division's standard deviation of reputations may go from the first season's (g): ±10 %. */
const SPREAD_TOLERANCE = 0.1;

/** Drift thresholds (e): the mean dotation against the creation budget, the mean budget, the clubs the wages bind. */
const DOTATION_RATIO_RANGE = { low: 0.5, high: 2 } as const;
const BUDGET_RATIO_MAX = 3;
const WAGE_BOUND_MIN_SHARE = 0.5;

/** The managed club's coefficients of (d), in hundredths: the clamp's ends. */
const EXTREME_COEFFICIENTS = [BUDGET_COEFFICIENT_RANGE.best, BUDGET_COEFFICIENT_RANGE.worst] as const;

type Options = { seasons: number; seed: string; out: string | undefined; from: string | undefined };

/** A club as a snapshot reads it, at a season's start or end. */
type ClubState = {
  clubSaveId: string;
  clubId: string; // Club.id, as Transfer stores it
  slug: string;
  initialRank: number; // in the world's source season: the creation's finances and reputation
  managed: boolean;
  code: string; // the league it plays this season
  tier: CompetitionTier;
  clubCount: number; // of that league
  reputation: number;
  reputationRank: number; // reputationRanks in its league: the rank expected of it this season, its dotation's
  budget: number;
  wageBudget: number;
  payroll: number; // its players' wages
  squadSize: number;
  topElevenMedian: number; // median overall of its eleven best players
};

/** A club at a season's start: right after the creation or the transition, the preseason played. */
type ClubStart = ClubState & {
  preseasonBalance: number; // fees received less fees paid on the season's first day: the preseason's wage sales
  europeParticipation?: number; // its European competition's participation, credited at the opening after the dotation; 0 without
  cupEntry?: number | null; // the cup round it enters at: 1 in the preliminary round, 2 exempt; null without a cup
  expected?: { scored: number; conceded: number }; // its league goals expected over the season (expectedSeasonGoals)
};

/** A club at a season's end: every fixture played, the transition still to come. */
type ClubEnd = ClubState & {
  finalRank: number; // the league table's, as getStandings orders it
  points: number;
  goalsFor: number; // league matches
  goalsAgainst: number;
  cupRound: number | null; // last cup round played: 1 preliminary … 6 final; null without a tie
  cupWinner: boolean;
  feesReceived: number; // transfers dated within the season, its first day included: the club selling
  feesPaid: number; // the club buying
  youthStarts?: number; // the most league starts of its players aged YOUTH_OBJECTIVE_MAX_AGE or less on the season's first day
};

/** One of the managed club's objectives of a season, as the transition closed it. */
type ManagedObjective = {
  kind: ObjectiveKind;
  imposed: boolean;
  chosen: boolean;
  byAssistant: boolean;
  target: number;
  exceed: number | null;
  outcome: ObjectiveOutcome | null;
};

/** The managed club's SeasonBudget of a season. */
type ManagedBudget = {
  reputation: number;
  reputationRank: number;
  dotation: number;
  coefficient: number;
  carryOver: number;
  budget: number;
  wageBudget: number;
};

/** A club's European season, as the season's end records it. */
type EuropeRecord = {
  clubSaveId: string;
  slug: string;
  code: EuropeCode;
  pot: number;
  path: "RANK" | "CUP";
  reputation: number; // at the opening
  stage: number; // EUROPE_STAGES: 1 league phase … 6 won
};

/** A European knockout tie played: its competition, its round, how it was decided, and whether the better ranked won. */
type KnockoutRecord = { code: EuropeCode; round: number; decidedBy: string | null; betterRankedWon: boolean };

/** Starters' fitness at kick-off, summed. */
type FitnessTally = { sum: number; count: number; below: number };

/**
 * The AI starters' fitness at kick-off of a season: the European clubs' in their league, cup and European matches, the other
 * first division clubs' in their league matches, and both by month.
 */
type FitnessRecord = {
  groups: Record<"europeLeague" | "europeCup" | "europeEurope" | "othersLeague", FitnessTally>;
  byMonth: Record<string, Record<"europe" | "others", FitnessTally>>;
  load?: Record<"europe" | "others", LoadTally>; // absent from records from before it
  nations?: NationsRecord; // absent from records from before the national teams
};

/** A break of a season (docs/design/selections.md): what it cost, whom it took, what it did to them. */
type BreakRecord = {
  from: string;
  cpuMs: number;
  wallMs: number;
  calledByClub: Record<string, number>; // clubSaveId: its players the nations called
  played: number; // players of our clubs who played
  injuryDays: number[]; // the injuries of our clubs' players in the break
  fitnessAfter: number; // the mean fitness, on the break's last date, of our clubs' players who played
};

/** The groups of first division clubs the breaks are compared on: the European clubs lending the most players, the other European clubs, the rest. */
type LendingGroup = "lenders" | "europeOthers" | "others";

/** A season's national teams: their strength at its start, the European clubs that lend the most, its breaks, and their effects. */
type NationsRecord = {
  strength: { code: string; eleven: number; outside: number; points: number }[]; // strongest first
  lenders: string[]; // European clubs whose players the nations call LENDER_CALL_UPS times or more at the first break
  tier1: number; // first division clubs
  breaks: BreakRecord[];
  byMonth: Record<string, Record<"lenders" | "europeOthers", FitnessTally>>; // European clubs' starters, every match
  injuries: Record<LendingGroup, { club: number; breaks: number }>; // in the clubs' matches, in the breaks
};

/** A European club lending this many players to the nations at the season's first break is a « big lender ». */
const LENDER_CALL_UPS = 6;

/**
 * A group's AI clubs over a season, every match of theirs (league, cup, Europe): how many clubs, their starters rested
 * for a fresher player (selectRestedLineup against selectLineup), their injuries, and their players available at kick-off.
 */
type LoadTally = { clubs: number; matches: number; rotations: number; injuries: number; available: number };

type SeasonSnapshot = {
  season: number; // 1-based; the last one is the season the last transition opened, never played
  startYear: number;
  start: ClubStart[];
  managedBudget: ManagedBudget | null;
  end: ClubEnd[] | null; // null for the season the last transition opened
  playSeconds: number | null; // its matches and its transition
  transition: SeasonTransition | null; // the one that closed it
  managedObjectives?: ManagedObjective[]; // the managed club's objectives of the season, as the transition closed them
  europe?: EuropeRecord[]; // its European clubs and how far they went; absent from records from before Europe
  knockout?: KnockoutRecord[];
  fitness?: FitnessRecord;
};

/** A typical signing for a club (c): how many its transfer budget pays, how many its wage room pays. */
type Signing = {
  overall: number;
  value: number; // marketValueFor
  wage: number; // wageFor
  byBudget: number; // budget / value
  byWages: number; // max(0, wage budget − payroll) / wage
  wageBound: boolean; // the wages limit first
};

type ClubSeasonEnd = Pick<
  ClubEnd,
  "budget" | "payroll" | "finalRank" | "points" | "goalsFor" | "goalsAgainst" | "cupRound" | "cupWinner" | "feesReceived" | "feesPaid"
> & {
  objective: RankingObjective; // its ranking objective, from its reputation rank at the season's start
  outcome: ObjectiveOutcome;
  rankingCoefficient: number; // an AI club's coefficient for the next season (aiCoefficient)
  move: "PROMOTED" | "RELEGATED" | null;
  // Every objective its season would have given it, with the game's rules (objectiveOutcome); null when it has none (the
  // cup without a cup) or the records lack what it needs (records from before the objectives).
  objectives: Record<ObjectiveKind, ObjectiveOutcome | null>;
};

/** A club's season, derived from the snapshots: its start, the finances it was given, its typical signing, its end. */
type ClubSeason = {
  season: number;
  startYear: number;
  clubSaveId: string;
  slug: string;
  managed: boolean;
  code: string;
  tier: CompetitionTier;
  clubCount: number;
  reputation: number;
  reputationRank: number;
  third: number; // 1 top, 2 middle, 3 bottom: ceil(3 × reputation rank / clubs)
  creationBudget: number; // its budget at the start of season 1, before any season
  dotation: number; // clubFinances at its reputation rank in its league: the creation's function
  board: SeasonFinances | null; // what the transition gave it at this season's start, recomputed; null in season 1
  budget: number; // recorded at the start, after the preseason
  preseasonBalance: number;
  europeParticipation: number; // credited at the opening, after the dotation
  wageBudget: number;
  tableWageBudget: number; // the creation's wage budget at its rank: its wage budget's ceiling, and twice its floor
  payroll: number;
  squadSize: number; // its players at the start, after the preseason
  wageRoom: number;
  signing: Signing;
  end: ClubSeasonEnd | null; // null for the season the last transition opened
};

// ------------------------------------------------------------------ Formatting

const round = (value: number, digits = 1): number => Math.round(value * 10 ** digits) / 10 ** digits;
const fixed = (value: number, digits = 1): string => (Number.isFinite(value) ? round(value, digits).toFixed(digits) : "—");
const millions = (euros: number): string => fixed(euros / 1_000_000, 1);
const signedMillions = (euros: number): string => `${euros > 0 ? "+" : ""}${millions(euros)}`;
const coefficientText = (hundredths: number): string => fixed(hundredths / 100, 2);
const mean = (values: readonly number[]): number =>
  values.length === 0 ? Number.NaN : values.reduce((sum, value) => sum + value, 0) / values.length;

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Mean, then the range: « 1.02 (0.61–1.85) ». */
function spread(values: readonly number[], digits = 2): string {
  if (values.length === 0) {
    return "—";
  }
  return `${fixed(mean(values), digits)} (${fixed(Math.min(...values), digits)}–${fixed(Math.max(...values), digits)})`;
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}

const bySlug = (a: { slug: string }, b: { slug: string }): number => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

// ------------------------------------------------------------------ Snapshots

/** Every club of the save as it stands: finances, reputation and its rank in its league, payroll, best eleven. */
async function readClubs(saveId: string): Promise<ClubState[]> {
  const clubs = await prisma.clubSave.findMany({
    where: { saveId },
    select: {
      id: true,
      clubId: true,
      isManaged: true,
      budget: true,
      wageBudget: true,
      reputation: true,
      competition: { select: { code: true, tier: true } },
      club: { select: { slug: true, initialRank: true } },
    },
  });
  const players = await prisma.playerSave.findMany({
    where: { saveId, clubSaveId: { not: null } },
    select: { clubSaveId: true, overall: true, wage: true },
  });
  const squads = Map.groupBy(players, (player) => player.clubSaveId ?? "");
  const divisions = Map.groupBy(clubs, (club) => club.competition.code);
  const rankOf = new Map<string, number>();
  for (const division of divisions.values()) {
    const ranks = reputationRanks(
      division.map((club) => ({ key: club.id, reputation: club.reputation, wageBudget: club.wageBudget, slug: club.club.slug })),
    );
    for (const [clubSaveId, rank] of ranks) {
      rankOf.set(clubSaveId, rank);
    }
  }
  return clubs
    .map((club): ClubState => {
      const squad = squads.get(club.id) ?? [];
      const best = squad
        .map((player) => player.overall)
        .sort((a, b) => b - a)
        .slice(0, ELEVEN);
      return {
        clubSaveId: club.id,
        clubId: club.clubId,
        slug: club.club.slug,
        initialRank: club.club.initialRank,
        managed: club.isManaged,
        code: club.competition.code,
        tier: competitionTier(club.competition.tier),
        clubCount: getOrThrow(divisions, club.competition.code, "league").length,
        reputation: club.reputation,
        reputationRank: getOrThrow(rankOf, club.id, "reputation rank"),
        budget: club.budget,
        wageBudget: club.wageBudget,
        payroll: squad.reduce((sum, player) => sum + player.wage, 0),
        squadSize: squad.length,
        topElevenMedian: best.length === 0 ? 0 : best[Math.floor((best.length - 1) / 2)],
      };
    })
    .sort(bySlug);
}

/** Transfer fees by club (Club.id) over [from, to): received when it sells, paid when it buys. */
async function feesByClub(saveId: string, from: Date, to: Date): Promise<{ received: Map<string, number>; paid: Map<string, number> }> {
  const transfers = await prisma.transfer.findMany({
    where: { saveId, fee: { gt: 0 }, date: { gte: from, lt: to } },
    select: { fromClubId: true, toClubId: true, fee: true },
  });
  const received = new Map<string, number>();
  const paid = new Map<string, number>();
  for (const { fromClubId, toClubId, fee } of transfers) {
    if (fromClubId !== null) {
      received.set(fromClubId, (received.get(fromClubId) ?? 0) + fee);
    }
    if (toClubId !== null) {
      paid.set(toClubId, (paid.get(toClubId) ?? 0) + fee);
    }
  }
  return { received, paid };
}

/** The season's start: every club, the preseason's fees, and the managed club's SeasonBudget. */
async function recordStart(saveId: string): Promise<{ startYear: number; clubs: ClubStart[]; managedBudget: ManagedBudget | null }> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
  const startYear = seasonStartYear(save.currentDate);
  const firstDay = seasonStartDate(startYear);
  const clubs = await readClubs(saveId);
  const fees = await feesByClub(saveId, firstDay, new Date(firstDay.getTime() + DAY_MS));
  const budgets = await prisma.seasonBudget.findMany({
    where: { saveId, season: { startYear } },
    select: {
      reputation: true,
      reputationRank: true,
      dotation: true,
      coefficient: true,
      carryOver: true,
      budget: true,
      wageBudget: true,
    },
  });
  if (budgets.length !== 1) {
    console.warn(`  ${budgets.length} SeasonBudget rows for ${seasonLabel(startYear)}, one expected`);
  }
  const cupEntries = await cupEntriesOf(saveId, startYear);
  const participation = await europeParticipationOf(saveId, startYear);
  const expected = await expectedGoalsOf(saveId, clubs, firstDay);
  return {
    startYear,
    clubs: clubs.map((club) => ({
      ...club,
      preseasonBalance: (fees.received.get(club.clubId) ?? 0) - (fees.paid.get(club.clubId) ?? 0),
      europeParticipation: participation.get(club.slug) ?? 0,
      cupEntry: cupEntries(club),
      expected: getOrThrow(expected, club.clubSaveId, "expected goals"),
    })),
    managedBudget: budgets[0] ?? null,
  };
}

/** The participation prize each European club of a year received at the opening (EUROPE_PRIZES), by slug. */
async function europeParticipationOf(saveId: string, startYear: number): Promise<Map<string, number>> {
  const seasons = await prisma.season.findMany({ where: { saveId, startYear, competition: { kind: "EUROPE" } }, select: { id: true } });
  const participation = new Map<string, number>();
  for (const season of await europeSeasonsOf(prisma, saveId, seasons.map((row) => row.id))) {
    for (const entrant of season.entrants) {
      participation.set(entrant.club, EUROPE_PRIZES[season.code].participation);
    }
  }
  return participation;
}

/** The cup round each club enters at in a season: 1 when it plays the preliminary round, 2 exempt; null without a cup. */
async function cupEntriesOf(saveId: string, startYear: number): Promise<(club: ClubState) => number | null> {
  const cups = await prisma.season.findMany({
    where: { saveId, startYear, competition: { kind: "CUP" } },
    select: { id: true, competition: { select: { code: true } } },
  });
  const preliminary = await prisma.fixture.findMany({
    where: { saveId, seasonId: { in: cups.map((cup) => cup.id) }, round: 1 },
    select: { homeClubSaveId: true, awayClubSaveId: true },
  });
  const inPreliminary = new Set(preliminary.flatMap((tie) => [tie.homeClubSaveId, tie.awayClubSaveId]));
  const countries = new Set(cups.map((cup) => cup.competition.code.split(".")[0]));
  return (club) => (countries.has(club.code.split(".")[0]) ? (inPreliminary.has(club.clubSaveId) ? 1 : 2) : null);
}

/**
 * Each club's league goals expected over the season (expectedSeasonGoals) from its squad at the start: an AI club in the
 * formation it chooses (chooseFormation), the managed club in its own, as its objectives are set (openSeasonObjectives).
 */
async function expectedGoalsOf(
  saveId: string,
  clubs: readonly ClubState[],
  firstDay: Date,
): Promise<Map<string, { scored: number; conceded: number }>> {
  const managed = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, formation: true } });
  const rows = await prisma.playerSave.findMany({
    where: { saveId, clubSaveId: { not: null } },
    select: {
      clubSaveId: true,
      playerKey: true,
      position: true,
      overall: true,
      pace: true,
      shooting: true,
      passing: true,
      dribbling: true,
      defending: true,
      physical: true,
      goalkeeping: true,
      form: true,
      morale: true,
      fitness: true,
      injuredUntil: true,
    },
  });
  const squads = Map.groupBy(
    rows.map(({ clubSaveId, playerKey, injuredUntil, ...player }) => ({
      clubSaveId: clubSaveId ?? "",
      player: { ...player, id: playerKey, injured: injuredUntil !== null && injuredUntil > firstDay } satisfies SquadPlayer,
    })),
    (row) => row.clubSaveId,
  );
  return new Map(
    clubs.map((club) => {
      const squad = (squads.get(club.clubSaveId) ?? []).map((row) => row.player);
      const formation = club.clubSaveId === managed.id ? parseFormation(managed.formation) : chooseFormation(squad, club.tier).formation;
      const strength = formationStrength(selectLineup(squad, formationPositions(formation)), formation);
      return [club.clubSaveId, expectedSeasonGoals(strength, averageOpponent(club.tier), 2 * (club.clubCount - 1))];
    }),
  );
}

/** The season's end, every fixture played: every club, its final league rank and goals, its cup run, its fees. */
async function recordEnd(saveId: string, startYear: number): Promise<ClubEnd[]> {
  const unplayed = await prisma.fixture.count({ where: { saveId, played: false } });
  if (unplayed > 0) {
    throw new Error(`${unplayed} fixtures left to play at the end of ${seasonLabel(startYear)}`);
  }
  const clubs = await readClubs(saveId);
  const idOfSlug = new Map(clubs.map((club) => [club.slug, club.clubSaveId]));
  const seasons = await prisma.season.findMany({
    where: { saveId, completed: false },
    select: { id: true, startYear: true, competition: { select: { kind: true } } },
  });
  if (seasons.some((season) => season.startYear !== startYear)) {
    throw new Error(`Seasons in progress other than ${seasonLabel(startYear)}`);
  }

  const tables = new Map<string, Pick<ClubEnd, "finalRank" | "points" | "goalsFor" | "goalsAgainst">>();
  for (const season of seasons.filter((candidate) => candidate.competition.kind === "LEAGUE")) {
    for (const row of await getStandings(saveId, season.id)) {
      tables.set(getOrThrow(idOfSlug, row.club, "club of the table"), {
        finalRank: row.rank,
        points: row.points,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
      });
    }
  }

  const cupSeasonIds = seasons.filter((season) => season.competition.kind === "CUP").map((season) => season.id);
  const cupTies = await prisma.fixture.findMany({
    where: { saveId, seasonId: { in: cupSeasonIds }, played: true },
    select: { round: true, homeClubSaveId: true, awayClubSaveId: true, winnerClubSaveId: true },
  });
  const ties: PlayedTie[] = cupTies.map((tie) => {
    if (tie.winnerClubSaveId === null) {
      throw new Error("A played cup tie has no winner");
    }
    return { round: tie.round, home: tie.homeClubSaveId, away: tie.awayClubSaveId, winner: tie.winnerClubSaveId };
  });

  const fees = await feesByClub(saveId, seasonStartDate(startYear), seasonStartDate(startYear + 1));
  // Jeunesse: the most league starts of a club's players young enough on the season's first day.
  const firstDay = seasonStartDate(startYear);
  const stats = await prisma.playerSeasonStats.findMany({
    where: { saveId, season: { startYear, competition: { kind: "LEAGUE" } } },
    select: { starts: true, playerSave: { select: { clubSaveId: true, birthDate: true } } },
  });
  const youthStarts = new Map<string, number>();
  for (const row of stats) {
    const clubSaveId = row.playerSave.clubSaveId;
    if (clubSaveId !== null && ageInYears(row.playerSave.birthDate, firstDay) <= YOUTH_OBJECTIVE_MAX_AGE) {
      youthStarts.set(clubSaveId, Math.max(youthStarts.get(clubSaveId) ?? 0, row.starts));
    }
  }
  return clubs.map((club) => {
    const run = cupRunOf(ties, club.clubSaveId);
    return {
      ...club,
      ...getOrThrow(tables, club.clubSaveId, "final table row"),
      cupRound: run?.round ?? null,
      cupWinner: run?.won ?? false,
      feesReceived: fees.received.get(club.clubId) ?? 0,
      feesPaid: fees.paid.get(club.clubId) ?? 0,
      youthStarts: youthStarts.get(club.clubSaveId) ?? 0,
    };
  });
}

const emptyTally = (): FitnessTally => ({ sum: 0, count: 0, below: 0 });
const emptyLoad = (): LoadTally => ({ clubs: 0, matches: 0, rotations: 0, injuries: 0, available: 0 });

function addTo(tally: FitnessTally, values: readonly number[]): void {
  for (const value of values) {
    tally.sum += value;
    tally.count++;
    tally.below += value < ROTATION_FITNESS ? 1 : 0;
  }
}

/** The clubs of a year's European competitions, by row. */
async function europeClubsOf(saveId: string, startYear: number): Promise<Set<string>> {
  const seasons = await prisma.season.findMany({ where: { saveId, startYear, competition: { kind: "EUROPE" } }, select: { id: true } });
  const fixtures = await prisma.fixture.findMany({
    where: { saveId, seasonId: { in: seasons.map((season) => season.id) } },
    select: { homeClubSaveId: true, awayClubSaveId: true },
  });
  return new Set(fixtures.flatMap((fixture) => [fixture.homeClubSaveId, fixture.awayClubSaveId]));
}

/**
 * The national teams of a season about to be played: each nation's 23 today and its strength (rankFormations, as an AI
 * club ranks its formations), and the European clubs whose players the nations call LENDER_CALL_UPS times or more at the
 * season's first break (readCallUps, from today's squads). Empty in a save without nations.
 */
async function nationsAtStart(saveId: string, startYear: number, europeClubs: ReadonlySet<string>): Promise<NationsRecord> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true, breaksFrom: true } });
  const tier1 = await prisma.clubSave.count({ where: { saveId, competition: { kind: "LEAGUE", tier: 1 } } });
  const record: NationsRecord = {
    strength: [],
    lenders: [],
    tier1,
    breaks: [],
    byMonth: {},
    injuries: { lenders: { club: 0, breaks: 0 }, europeOthers: { club: 0, breaks: 0 }, others: { club: 0, breaks: 0 } },
  };
  if (save.breaksFrom === null || save.breaksFrom > startYear) {
    return record;
  }
  const today = await readCallUps(prisma, saveId, save.currentDate, save.currentDate);
  record.strength = [...today]
    .map(([code, players]) => {
      const [best] = rankFormations(players, 1);
      return {
        code,
        eleven: round(mean(best.lineup.starters.map(({ player }) => player.overall)), 1),
        outside: players.filter((player) => player.playerSaveId === null).length,
        points: best.points,
      };
    })
    .sort((a, b) => b.points - a.points);
  const [first] = breakWindows(startYear);
  const called = await readCallUps(prisma, saveId, first.dates[0], save.currentDate);
  const byClub = new Map<string, number>();
  for (const player of [...called.values()].flat()) {
    if (player.clubSaveId !== null) {
      byClub.set(player.clubSaveId, (byClub.get(player.clubSaveId) ?? 0) + 1);
    }
  }
  record.lenders = [...byClub].filter(([club, count]) => europeClubs.has(club) && count >= LENDER_CALL_UPS).map(([club]) => club);
  return record;
}

/** The group of a first division club: a big lender, another European club, or another. */
function lendingGroup(clubSaveId: string, nations: NationsRecord, europeClubs: ReadonlySet<string>): LendingGroup {
  return nations.lenders.includes(clubSaveId) ? "lenders" : europeClubs.has(clubSaveId) ? "europeOthers" : "others";
}

/**
 * Plays a break, the save's next step (playNextMatchday), and records it: its CPU and wall time, the players of each club
 * its nations call (readCallUps: the break's own call-up), and what it did to those of our clubs: who played, who got
 * injured (the first division clubs' injuries counted by group), their fitness on its last date.
 */
async function playBreakWatching(
  saveId: string,
  currentDate: Date,
  first: Date,
  nations: NationsRecord,
  europeClubs: ReadonlySet<string>,
  tier1Clubs: ReadonlySet<string>,
): Promise<BreakRecord> {
  const called = await readCallUps(prisma, saveId, first, currentDate);
  const calledByClub: Record<string, number> = {};
  const ids: string[] = [];
  for (const player of [...called.values()].flat()) {
    if (player.clubSaveId !== null && player.playerSaveId !== null) {
      calledByClub[player.clubSaveId] = (calledByClub[player.clubSaveId] ?? 0) + 1;
      ids.push(player.playerSaveId);
    }
  }
  const before = new Map(
    (await prisma.playerSave.findMany({ where: { saveId, id: { in: ids } }, select: { id: true, caps: true, injuredUntil: true } })).map((row) => [row.id, row]),
  );
  const cpu = process.cpuUsage();
  const wall = performance.now();
  const summary = await playNextMatchday(saveId);
  const used = process.cpuUsage(cpu);
  const wallMs = performance.now() - wall;
  if (summary === null || summary.internationalBreak === undefined) {
    throw new Error(`The step after ${first.toISOString()} was no break`);
  }
  const after = await prisma.playerSave.findMany({
    where: { saveId, id: { in: ids } },
    select: { id: true, caps: true, fitness: true, injuredUntil: true, clubSaveId: true },
  });
  const played = after.filter((row) => row.caps > (before.get(row.id)?.caps ?? 0));
  const injured = after.filter(
    (row) =>
      row.injuredUntil !== null && row.injuredUntil > summary.date && row.injuredUntil.getTime() !== before.get(row.id)?.injuredUntil?.getTime(),
  );
  for (const row of injured) {
    if (row.clubSaveId !== null && tier1Clubs.has(row.clubSaveId)) {
      nations.injuries[lendingGroup(row.clubSaveId, nations, europeClubs)].breaks++;
    }
  }
  return {
    from: first.toISOString().slice(0, 10),
    cpuMs: (used.user + used.system) / 1000,
    wallMs,
    calledByClub,
    played: played.length,
    injuryDays: injured.map((row) => Math.round(((row.injuredUntil?.getTime() ?? 0) - summary.date.getTime()) / DAY_MS)),
    fitnessAfter: round(mean(played.map((row) => row.fitness)), 1),
  };
}

/**
 * Plays a season's remaining dates as playRemainingMatchdays does, reading first each date's AI lineups of the European
 * clubs and of the other first division clubs, as the matchday picks them (aiLineupOf on the squads less the suspended,
 * their fitness recovered over the days of rest): their starters' fitness at kick-off (the other clubs' in their league
 * matches only), and over all their matches their starters rested, their injuries and their players available.
 */
async function playWatchingFitness(saveId: string, startYear: number): Promise<FitnessRecord> {
  const load = { europe: emptyLoad(), others: emptyLoad() };
  const record: FitnessRecord = {
    groups: { europeLeague: emptyTally(), europeCup: emptyTally(), europeEurope: emptyTally(), othersLeague: emptyTally() },
    byMonth: {},
    load,
  };
  const seen = { europe: new Set<string>(), others: new Set<string>() };
  const europeClubs = await europeClubsOf(saveId, startYear);
  // The national teams of the season, and its breaks played as they come, each a step of its own.
  const nations = await nationsAtStart(saveId, startYear, europeClubs);
  record.nations = nations;
  const tier1Clubs = new Set(
    (await prisma.clubSave.findMany({ where: { saveId, competition: { kind: "LEAGUE", tier: 1 } }, select: { id: true } })).map((club) => club.id),
  );
  const { competition: managed } = await prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { competition: { select: { country: true } } },
  });
  const teamSelect = { id: true, isManaged: true, formation: true, formationMonth: true, competition: { select: { tier: true, country: true } } };
  for (;;) {
    const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
    const next = await prisma.fixture.findFirst({ where: { saveId, played: false }, orderBy: { scheduledAt: "asc" }, select: { scheduledAt: true } });
    if (next === null) {
      load.europe.clubs = seen.europe.size;
      load.others.clubs = seen.others.size;
      return record;
    }
    const pendingBreak = await prisma.internationalMatch.findFirst({
      where: { saveId, played: false },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true },
    });
    if (pendingBreak !== null && pendingBreak.scheduledAt < next.scheduledAt) {
      nations.breaks.push(await playBreakWatching(saveId, save.currentDate, pendingBreak.scheduledAt, nations, europeClubs, tier1Clubs));
      continue;
    }
    const fixtures = await prisma.fixture.findMany({
      where: { saveId, played: false, scheduledAt: next.scheduledAt },
      select: { homeClubSave: { select: teamSelect }, awayClubSave: { select: teamSelect }, season: { select: { competition: { select: { kind: true } } } } },
    });
    const clubs = fixtures
      .flatMap((fixture) =>
        [fixture.homeClubSave, fixture.awayClubSave].map((club) => ({
          ...club,
          kind: fixture.season.competition.kind,
          facesManaged: fixture.homeClubSave.isManaged || fixture.awayClubSave.isManaged,
        })),
      )
      .filter((club) => !club.isManaged && (europeClubs.has(club.id) || club.competition.tier === 1));
    const rows = await prisma.playerSave.findMany({ where: { saveId, clubSaveId: { in: clubs.map((club) => club.id) } }, select: PLAYER_SELECT });
    const days = Math.round((next.scheduledAt.getTime() - save.currentDate.getTime()) / DAY_MS);
    const { squads, stateByKey } = squadsOf(rows, next.scheduledAt);
    const month = next.scheduledAt.toISOString().slice(0, 7);
    for (const club of clubs) {
      const squad = withSuspensions(squads.get(club.id) ?? [], club.kind, stateByKey).map((player) => ({
        ...player,
        fitness: recoveredFitness(player.fitness, days),
      }));
      const { formation, lineup } = aiLineupOf(club, squad, managed.country, next.scheduledAt, club.facesManaged);
      const european = europeClubs.has(club.id);
      const side = european ? "europe" : "others";
      seen[side].add(club.id);
      const plain = new Set(selectLineup(squad, formationPositions(formation)).starters.map((starter) => starter.player.id));
      load[side].matches++;
      load[side].rotations += lineup.starters.filter((starter) => !plain.has(starter.player.id)).length;
      load[side].available += squad.filter(isAvailable).length;
      if (!european && club.kind !== "LEAGUE") {
        continue; // the other clubs' fitness: their league matches only
      }
      const values = lineup.starters.map((starter) => starter.player.fitness);
      const group = european ? (club.kind === "EUROPE" ? "europeEurope" : club.kind === "CUP" ? "europeCup" : "europeLeague") : "othersLeague";
      addTo(record.groups[group], values);
      const monthly = (record.byMonth[month] ??= { europe: emptyTally(), others: emptyTally() });
      addTo(monthly[side], values);
      if (european) {
        const lending = (nations.byMonth[month] ??= { lenders: emptyTally(), europeOthers: emptyTally() });
        addTo(lending[nations.lenders.includes(club.id) ? "lenders" : "europeOthers"], values);
      }
    }
    await playNextMatchday(saveId);
    // The injuries the date gave the watched clubs' players: an injury running past it that was not there before.
    const injuredBefore = new Map(rows.map((row) => [row.id, row.injuredUntil?.getTime() ?? 0]));
    const after = await prisma.playerSave.findMany({
      where: { saveId, id: { in: rows.map((row) => row.id) } },
      select: { id: true, clubSaveId: true, injuredUntil: true },
    });
    for (const player of after) {
      const until = player.injuredUntil?.getTime() ?? 0;
      if (player.clubSaveId !== null && until > next.scheduledAt.getTime() && until !== injuredBefore.get(player.id)) {
        load[europeClubs.has(player.clubSaveId) ? "europe" : "others"].injuries++;
        if (tier1Clubs.has(player.clubSaveId)) {
          nations.injuries[lendingGroup(player.clubSaveId, nations, europeClubs)].club++;
        }
      }
    }
  }
}

/** A year's European clubs and how far each went, and its knockout ties, once every match is played. */
async function europeRecordsOf(saveId: string, startYear: number): Promise<{ europe: EuropeRecord[]; knockout: KnockoutRecord[] }> {
  const seasons = await prisma.season.findMany({ where: { saveId, startYear, competition: { kind: "EUROPE" } }, select: { id: true } });
  const europe: EuropeRecord[] = [];
  const knockout: KnockoutRecord[] = [];
  for (const season of await europeSeasonsOf(prisma, saveId, seasons.map((row) => row.id))) {
    const fixtures = await europeFixtures(prisma, saveId, season.id);
    const runs = europeRunsOf(season.entrants, fixtures);
    const idOf = new Map(fixtures.flatMap((fixture) => [[fixture.home, fixture.homeClubSaveId] as const, [fixture.away, fixture.awayClubSaveId] as const]));
    for (const entrant of season.entrants) {
      europe.push({
        clubSaveId: getOrThrow(idOf, entrant.club, "European club"),
        slug: entrant.club,
        code: season.code,
        pot: entrant.pot,
        path: entrant.path,
        reputation: entrant.reputation,
        stage: runs.get(entrant.club)?.stage ?? EUROPE_STAGES.LEAGUE,
      });
    }
    for (const fixture of fixtures.filter((candidate) => candidate.round > EUROPE_LEAGUE_ROUNDS && candidate.played)) {
      const decided = await prisma.fixture.findFirst({
        where: { saveId, seasonId: season.id, round: fixture.round, homeClubSaveId: fixture.homeClubSaveId, awayClubSaveId: fixture.awayClubSaveId },
        select: { decidedBy: true },
      });
      // The better ranked of the league phase is the home club, the final's included.
      knockout.push({ code: season.code, round: fixture.round, decidedBy: decided?.decidedBy ?? null, betterRankedWon: fixture.winner === fixture.home });
    }
  }
  return { europe, knockout };
}

/** Plays the seasons, each followed by its transition, recording every club at each start and end. */
async function playSeasons(saveId: string, seasons: number): Promise<SeasonSnapshot[]> {
  const snapshots: SeasonSnapshot[] = [];
  let start = await recordStart(saveId);
  for (let season = 1; season <= seasons; season++) {
    const began = performance.now();
    const fitness = await playWatchingFitness(saveId, start.startYear);
    const end = await recordEnd(saveId, start.startYear);
    const { europe, knockout } = await europeRecordsOf(saveId, start.startYear);
    // Nobody would renew the managed club's contracts otherwise: its squad would melt season after season.
    const transition = await advanceToNextSeason(saveId, { assistantContracts: true });
    const playSeconds = Math.round((performance.now() - began) / 1000);
    const managedObjectives = await prisma.seasonObjective.findMany({
      where: { saveId, season: { startYear: start.startYear } },
      select: { kind: true, imposed: true, chosen: true, byAssistant: true, target: true, exceed: true, outcome: true },
    });
    snapshots.push({
      season,
      startYear: start.startYear,
      start: start.clubs,
      managedBudget: start.managedBudget,
      end,
      playSeconds,
      transition,
      managedObjectives,
      europe,
      knockout,
      fitness,
    });
    console.log(
      `  season ${season} (${seasonLabel(start.startYear)}): ${playSeconds} s, ${transition.moves} clubs promoted or relegated, ${transition.preseason.wageSales} wage sales`,
    );
    start = await recordStart(saveId);
  }
  snapshots.push({
    season: seasons + 1,
    startYear: start.startYear,
    start: start.clubs,
    managedBudget: start.managedBudget,
    end: null,
    playSeconds: null,
    transition: null,
  });
  return snapshots;
}

// ------------------------------------------------------------------ Derived seasons

function rankingObjectiveOf(club: ClubState): RankingObjective {
  return rankingObjective(club.reputationRank, divisionOf(club.code, club.tier, club.clubCount, WORLD_VERSION));
}

/** An AI club's coefficient after a season (aiCoefficient): its ranking objective's alone. */
function rankingCoefficientOf(start: ClubState, finalRank: number): number {
  return budgetCoefficient({ ranking: rankingOutcome(rankingObjectiveOf(start), finalRank) });
}

function typicalSigning(overall: number, budget: number, wageRoom: number): Signing {
  const value = marketValueFor({ age: SIGNING_AGE, overall, potential: overall });
  const wage = wageFor({ age: SIGNING_AGE, overall });
  const byBudget = budget / value;
  const byWages = Math.max(0, wageRoom) / wage;
  return { overall, value, wage, byBudget, byWages, wageBound: byWages < byBudget };
}

/**
 * Every objective a club's season would have given it, judged as the game judges the managed club's (objectiveOutcome,
 * the season over): the ranking from its expected rank, the cup from its reputation third and its entry, the optional
 * ones from its squad's expected goals, its young players' starts, its transfer balance.
 */
function objectivesOf(start: ClubStart, end: ClubEnd, ranking: RankingObjective): Record<ObjectiveKind, ObjectiveOutcome | null> {
  const total = 2 * (start.clubCount - 1);
  const reached = end.cupWinner ? CUP_WON_ROUND : (end.cupRound ?? 0);
  const progress = {
    played: total,
    total,
    rank: end.finalRank,
    cup: { reached, out: !end.cupWinner },
    europe: null,
    youthStarts: end.youthStarts ?? 0,
    scored: end.goalsFor,
    conceded: end.goalsAgainst,
    balance: end.feesReceived - end.feesPaid,
    over: true,
  };
  const judge = (kind: ObjectiveKind, target: number, exceed: number | null): ObjectiveOutcome => objectiveOutcome({ kind, target, exceed }, progress);
  const cup =
    start.cupEntry === undefined || start.cupEntry === null
      ? null
      : cupObjective(start.tier, reputationThird(start.reputationRank, start.clubCount), start.cupEntry);
  const expected = start.expected;
  return {
    RANKING: judge("RANKING", ranking.target, ranking.exceed),
    CUP: cup === null ? null : judge("CUP", cup.target, cup.exceed),
    EUROPE: null,
    YOUTH: end.youthStarts === undefined ? null : judge("YOUTH", optionalTarget("YOUTH", { scored: 0, conceded: 0 }), null),
    ENTERTAINMENT: expected === undefined ? null : judge("ENTERTAINMENT", optionalTarget("ENTERTAINMENT", expected), null),
    SOLIDITY: expected === undefined ? null : judge("SOLIDITY", optionalTarget("SOLIDITY", expected), null),
    FINANCES: judge("FINANCES", 0, null),
  };
}

function seasonEnd(start: ClubStart, end: ClubEnd, next: ClubStart | undefined): ClubSeasonEnd {
  const objective = rankingObjectiveOf(start);
  const outcome = rankingOutcome(objective, end.finalRank);
  return {
    budget: end.budget,
    payroll: end.payroll,
    finalRank: end.finalRank,
    points: end.points,
    goalsFor: end.goalsFor,
    goalsAgainst: end.goalsAgainst,
    cupRound: end.cupRound,
    cupWinner: end.cupWinner,
    feesReceived: end.feesReceived,
    feesPaid: end.feesPaid,
    objective,
    outcome,
    rankingCoefficient: budgetCoefficient({ ranking: outcome }),
    move: next === undefined || next.tier === start.tier ? null : next.tier < start.tier ? "PROMOTED" : "RELEGATED",
    objectives: objectivesOf(start, end, objective),
  };
}

/**
 * Each club's seasons. The finances given at a season's start are recomputed as the transition computes them
 * (seasonFinances): an AI club's coefficient from its reputation rank at the previous season's start (its expected
 * rank) and its final rank, the managed club's read from its SeasonBudget; the unspent budget (the managed club's
 * alone: an AI club carries nothing over) and the payroll are the previous end's, the wage margin WAGE_BUDGET_MARGIN, the managed club's from its coefficient (managedWageMargin).
 */
function derive(snapshots: readonly SeasonSnapshot[]): ClubSeason[] {
  const creation = new Map(snapshots[0].start.map((club) => [club.clubSaveId, club.budget]));
  return snapshots.flatMap((snapshot, index) => {
    const previous = index === 0 ? undefined : snapshots[index - 1];
    const previousStart = new Map((previous?.start ?? []).map((club) => [club.clubSaveId, club]));
    const previousEnd = new Map((previous?.end ?? []).map((club) => [club.clubSaveId, club]));
    const ends = new Map((snapshot.end ?? []).map((club) => [club.clubSaveId, club]));
    const nextStart = new Map((snapshots[index + 1]?.start ?? []).map((club) => [club.clubSaveId, club]));
    // The rank the transition gave each club's dotation: its new reputation, equal ones ordered by the wage budget of the
    // season closed (the previous end's), which the new one, measured on the payroll, may not follow; at S1, the season's.
    const dotationRanks = new Map<string, number>();
    for (const division of Map.groupBy(snapshot.start, (club) => club.code).values()) {
      const ranks = reputationRanks(
        division.map((club) => ({
          key: club.clubSaveId,
          reputation: club.reputation,
          wageBudget: previous === undefined ? club.wageBudget : getOrThrow(previousEnd, club.clubSaveId, "previous season's end").wageBudget,
          slug: club.slug,
        })),
      );
      for (const [clubSaveId, rank] of ranks) {
        dotationRanks.set(clubSaveId, rank);
      }
    }
    return snapshot.start.map((club): ClubSeason => {
      const dotationRank = getOrThrow(dotationRanks, club.clubSaveId, "dotation rank");
      let board: SeasonFinances | null = null;
      if (previous !== undefined) {
        const closed = getOrThrow(previousEnd, club.clubSaveId, "previous season's end");
        const coefficient = club.managed
          ? (snapshot.managedBudget?.coefficient ?? NEUTRAL_BUDGET_COEFFICIENT)
          : rankingCoefficientOf(getOrThrow(previousStart, club.clubSaveId, "previous season's start"), closed.finalRank);
        board = seasonFinances({
          reputationRank: dotationRank,
          clubCount: club.clubCount,
          tier: club.tier,
          coefficient,
          unspent: club.managed ? closed.budget : 0,
          payroll: closed.payroll,
          wageMargin: club.managed ? managedWageMargin(coefficient) : WAGE_BUDGET_MARGIN,
        });
      }
      const end = ends.get(club.clubSaveId);
      const wageRoom = club.wageBudget - club.payroll;
      return {
        season: snapshot.season,
        startYear: snapshot.startYear,
        clubSaveId: club.clubSaveId,
        slug: club.slug,
        managed: club.managed,
        code: club.code,
        tier: club.tier,
        clubCount: club.clubCount,
        reputation: club.reputation,
        reputationRank: club.reputationRank,
        third: Math.ceil((3 * club.reputationRank) / club.clubCount),
        creationBudget: getOrThrow(creation, club.clubSaveId, "creation budget"),
        dotation: clubFinances(dotationRank, club.clubCount, club.tier).budget,
        board,
        budget: club.budget,
        preseasonBalance: club.preseasonBalance,
        europeParticipation: club.europeParticipation ?? 0,
        wageBudget: club.wageBudget,
        // At S1, the creation's table at its initial rank; then the transition's, at its dotation's rank.
        tableWageBudget: clubFinances(previous === undefined ? club.initialRank : dotationRank, club.clubCount, club.tier).wageBudget,
        payroll: club.payroll,
        squadSize: club.squadSize,
        wageRoom,
        signing: typicalSigning(club.topElevenMedian, club.budget, wageRoom),
        end: end === undefined ? null : seasonEnd(club, end, nextStart.get(club.clubSaveId)),
      };
    });
  });
}

// ------------------------------------------------------------------ Report

const THIRD_NAMES: Readonly<Record<number, string>> = { 1: "haut", 2: "milieu", 3: "bas" };

type Group = { label: string; tier: CompetitionTier; third: number | null };

const GROUPS: readonly Group[] = ([1, 2] as const).flatMap((tier) => [
  ...[1, 2, 3].map((third) => ({ label: `D${tier} ${THIRD_NAMES[third]}`, tier, third })),
  { label: `D${tier} (tous)`, tier, third: null },
]);

/** An AI club of the group: the managed club, played by the assistant without a transfer, is (d)'s. */
const inGroup = (row: ClubSeason, group: Group): boolean =>
  !row.managed && row.tier === group.tier && (group.third === null || row.third === group.third);

const seasonHeader = (row: { season: number; startYear: number }): string => `S${row.season} ${seasonLabel(row.startYear)}`;

/** One row per group, one column per season start. */
function pivot(
  rows: readonly ClubSeason[],
  snapshots: readonly SeasonSnapshot[],
  cell: (members: readonly ClubSeason[]) => string,
): string[][] {
  return GROUPS.map((group) => [
    group.label,
    ...snapshots.map((snapshot) => {
      const members = rows.filter((row) => row.season === snapshot.season && inGroup(row, group));
      return members.length === 0 ? "—" : cell(members);
    }),
  ]);
}

const dotationRatio = (row: ClubSeason): number => row.dotation / row.creationBudget;
const budgetRatio = (row: ClubSeason): number => row.budget / row.creationBudget;
const sumOf = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0);

/** Clubs sharing their reputation rank with another club of their league: every one of them gets the best. */
function tiedClubs(members: readonly ClubSeason[]): number {
  const counts = new Map<string, number>();
  for (const row of members) {
    const key = `${row.code}#${row.reputationRank}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return sumOf([...counts.values()].filter((count) => count > 1));
}

/** By division: the dotation pool against S1's, the AI clubs' budgets against their dotations, the tied clubs. */
function divisionTotals(rows: readonly ClubSeason[], snapshots: readonly SeasonSnapshot[]): string[][] {
  return ([1, 2] as const).flatMap((tier) => {
    const at = (season: number): ClubSeason[] => rows.filter((row) => row.season === season && row.tier === tier);
    const firstPool = sumOf(at(1).map((row) => row.dotation));
    const aiAt = (season: number): ClubSeason[] => at(season).filter((row) => !row.managed);
    return [
      [`D${tier}`, "Masse des dotations / S1", ...snapshots.map(({ season }) => fixed(sumOf(at(season).map((row) => row.dotation)) / firstPool, 3))],
      [
        `D${tier}`,
        "Budgets / dotations (clubs IA)",
        ...snapshots.map(({ season }) => fixed(sumOf(aiAt(season).map((row) => row.budget)) / sumOf(aiAt(season).map((row) => row.dotation)), 2)),
      ],
      [`D${tier}`, "Clubs à rang de réputation partagé", ...snapshots.map(({ season }) => `${tiedClubs(at(season))} / ${at(season).length}`)],
    ];
  });
}

/** A cup run in words: the last round played, or the trophy. */
function cupRunText(round: number | null, won: boolean): string {
  const names: Readonly<Record<number, string>> = { 1: "tour prélim.", 2: "16es", 3: "8es", 4: "quarts", 5: "demies", 6: "finale" };
  return round === null ? "—" : won ? "vainqueur" : (names[round] ?? `tour ${round}`);
}

/** The followed clubs of (a): top, middle and bottom of each followed league by reputation rank at the start of season 1. */
function followedClubs(rows: readonly ClubSeason[]): { label: string; first: ClubSeason }[] {
  const first = rows.filter((row) => row.season === 1);
  return FOLLOWED_DIVISIONS.flatMap((code) => {
    const division = first.filter((row) => row.code === code).sort((a, b) => a.reputationRank - b.reputationRank || bySlug(a, b));
    // Never the managed club: the next one, towards the middle.
    const pick = (index: number, step: number): ClubSeason => {
      let at = index;
      while (division[at] !== undefined && division[at].managed) {
        at += step;
      }
      if (division[at] === undefined) {
        throw new Error(`No AI club to follow in ${code}`);
      }
      return division[at];
    };
    return [
      { label: `${code}, haut`, first: pick(0, 1) },
      { label: `${code}, milieu`, first: pick(Math.floor((division.length - 1) / 2), 1) },
      { label: `${code}, bas`, first: pick(division.length - 1, -1) },
    ];
  });
}

/** The managed club's budget at a coefficient: the dotation times it, to BUDGET_STEP, plus half of what is left. */
function boardBudget(dotation: number, coefficient: number, unspent: number): number {
  return (
    Math.max(BUDGET_STEP, Math.round((dotation * coefficient) / 100 / BUDGET_STEP) * BUDGET_STEP) +
    Math.round(Math.max(0, unspent) * BUDGET_CARRY_OVER_SHARE)
  );
}

function report(snapshots: readonly SeasonSnapshot[], rows: readonly ClubSeason[], minutes: number | null, seed: string): string {
  const sections: string[] = [];
  const played = snapshots.filter((snapshot) => snapshot.end !== null).length;
  const last = snapshots[snapshots.length - 1];
  const ai = rows.filter((row) => !row.managed);

  // ---------------------------------------------------------------- Header and checks
  const outcomeCoefficient = (outcome: ObjectiveOutcome): string => coefficientText(budgetCoefficient({ ranking: outcome }));
  // Records from before the assistant managed the managed club's contracts have no count of its decisions.
  const assistantContracts = snapshots.some((snapshot) => snapshot.transition?.preseason.managed !== undefined);
  sections.push(
    `# Budgets de saison et réputation : ${played} saisons simulées (gameplay v2, V2)`,
    [
      `Jumeau worldVersion 2 de la démo (graine ${seed}, club dirigé ${DEMO_CLUB_SLUG}, coupes comprises), joué par`,
      `l'adjoint sans action du joueur${assistantContracts ? ", ses contrats compris (comme ceux d'un club IA)" : ""},`,
      `chaque saison suivie du passage de saison : ${snapshots.length} débuts de saison`,
      "relevés (S1 à la création, les suivants juste après le passage, présaison comprise) et",
      `${played} fins (tous les matchs joués, avant le passage).${minutes === null ? "" : ` Durée : ${fixed(minutes, 1)} min.`}`,
      "Montants en M€.",
    ].join(" "),
    [
      "Règle : dotation = clubFinances(rang de réputation, clubs, division de la nouvelle saison) ; budget = dotation ×",
      `coefficient (au pas de ${millions(BUDGET_STEP)} M€), + ${fixed(100 * BUDGET_CARRY_OVER_SHARE, 0)} % du budget non`,
      "dépensé pour le seul club dirigé (un club IA repart de sa dotation) ; plafond salarial = masse salariale de la fin",
      `de saison × ${fixed(WAGE_BUDGET_MARGIN, 2)} (club dirigé : de × ${fixed(managedWageMargin(BUDGET_COEFFICIENT_RANGE.worst), 2)}`,
      `à × ${fixed(managedWageMargin(BUDGET_COEFFICIENT_RANGE.best), 2)} selon son coefficient), entre ${fixed(100 * WAGE_BUDGET_FLOOR_SHARE, 0)} % et 100 % de clubFinances(…), à la`,
      "création comme à chaque passage. Réputation : elle fait",
      `${fixed(100 * REPUTATION_TARGET_SHARE, 0)} % du chemin vers sa cible, la réputation de création au rang final ; un promu`,
      "ou un relégué prend d'un coup celle du rang équivalent de sa nouvelle division. Coefficient d'un club IA, selon son classement",
      `seul : dépassé ${outcomeCoefficient("EXCEEDED")}, atteint ${outcomeCoefficient("ACHIEVED")}, manqué`,
      `${outcomeCoefficient("MISSED")}. « Création » : budget du club au début de S1.`,
    ].join(" "),
    snapshots
      .filter((snapshot) => snapshot.transition !== null)
      .map(
        (snapshot) =>
          `${seasonHeader(snapshot)} : ${snapshot.playSeconds ?? "?"} s, ${snapshot.transition?.moves ?? 0} montées et descentes, ${snapshot.transition?.preseason.wageSales ?? 0} ventes pour masse salariale à la présaison suivante.`,
      )
      .join(" "),
  );

  const checked = rows.filter((row) => row.board !== null);
  const budgetMismatches = checked.filter((row) => (row.board?.budget ?? 0) + row.preseasonBalance + row.europeParticipation !== row.budget);
  const wageMismatches = checked.filter((row) => row.board?.wageBudget !== row.wageBudget);
  const managedMismatches = rows.filter((row) => {
    const own = snapshots.find((snapshot) => snapshot.season === row.season)?.managedBudget;
    return (
      row.managed &&
      row.board !== null &&
      (own === null ||
        own === undefined ||
        own.dotation !== row.board.dotation ||
        own.carryOver !== row.board.carryOver ||
        own.budget !== row.board.budget ||
        own.wageBudget !== row.board.wageBudget)
    );
  });
  const initialOf = new Map(snapshots[0].start.map((club) => [club.clubSaveId, club]));
  const creationDiffers = rows.filter((row) => {
    if (row.season !== 1) {
      return false;
    }
    const start = getOrThrow(initialOf, row.clubSaveId, "first start");
    return clubFinances(start.initialRank, start.clubCount, start.tier).budget !== row.budget;
  });
  sections.push(
    [
      `Vérifications : budget de la direction recalculé (coefficient de l'objectif de classement recalculé, report de la fin`,
      `relevée) + ventes de la présaison + participation européenne = budget relevé pour ${checked.length - budgetMismatches.length} / ${checked.length}`,
      `clubs-saisons ; plafond recalculé = relevé pour ${checked.length - wageMismatches.length} / ${checked.length} ;`,
      `SeasonBudget du club dirigé = recalcul pour ${played - managedMismatches.length} / ${played} passages ;`,
      `${creationDiffers.length} clubs dont le budget de création diffère de clubFinances(rang initial) (ventes de la présaison`,
      "de la création).",
      ...budgetMismatches
        .slice(0, 5)
        .map((row) => `Écart : ${seasonHeader(row)} ${row.slug}, recalcul ${millions((row.board?.budget ?? 0) + row.preseasonBalance + row.europeParticipation)}, relevé ${millions(row.budget)}.`),
    ].join(" "),
  );

  // ---------------------------------------------------------------- (a) Six French clubs
  const followed = followedClubs(rows);
  sections.push(
    "## a. Six clubs IA français, haut, milieu et bas de fr.1 et fr.2",
    [
      "Choisis par rang de réputation au début de S1 (le club dirigé écarté). Dotation : clubFinances au rang de réputation",
      "de la saison, dans sa division (à S1, ce que la création aurait donné à ce rang). Coef. et report : appliqués au début",
      "de la saison, d'après la précédente (rang attendu : son rang de réputation au début de la précédente). Budget : au",
      "début de la saison, après la présaison (ses ventes pour masse salariale entre parenthèses). Marge : plafond − masse.",
    ].join(" "),
  );
  for (const { label, first } of followed) {
    const seasons = rows.filter((row) => row.clubSaveId === first.clubSaveId).sort((a, b) => a.season - b.season);
    sections.push(
      `### ${label} : ${first.slug} (au départ : rang de réputation ${first.reputationRank}/${first.clubCount}, réputation ${first.reputation}, budget ${millions(first.budget)} M€)`,
      table(
        ["Saison", "Division", "Réputation", "Rang rép.", "Rang final", "Dotation", "Coef.", "Report", "Budget", "Plafond", "Masse sal.", "Marge", "Dot. / création"],
        seasons.map((row) => [
          seasonHeader(row),
          row.code,
          String(row.reputation),
          `${row.reputationRank}/${row.clubCount}`,
          row.end === null ? "—" : String(row.end.finalRank),
          millions(row.dotation),
          row.board === null ? "—" : coefficientText(row.board.coefficient),
          row.board === null ? "—" : millions(row.board.carryOver),
          `${millions(row.budget)}${row.preseasonBalance === 0 ? "" : ` (${signedMillions(row.preseasonBalance)})`}`,
          millions(row.wageBudget),
          millions(row.payroll),
          millions(row.wageRoom),
          fixed(dotationRatio(row), 2),
        ]),
      ),
    );
  }

  // ---------------------------------------------------------------- (b) Divisions and thirds
  const seasonHeaders = ["Groupe", ...snapshots.map(seasonHeader)];
  sections.push(
    "## b. Par division et tiers de réputation (clubs IA, au début de chaque saison)",
    [
      "Tiers : ceil(3 × rang de réputation / clubs) au début de la saison ; un club change de groupe en changeant de rang ou",
      "de division. Cellule : moyenne (min–max).",
    ].join(" "),
    "### Dotation / budget de création",
    table(seasonHeaders, pivot(rows, snapshots, (members) => spread(members.map(dotationRatio)))),
    "### Budget au début de la saison / budget de création",
    table(seasonHeaders, pivot(rows, snapshots, (members) => spread(members.map(budgetRatio)))),
    "### Sommes par division",
    [
      "Masse des dotations : celles de tous les clubs de la division (club dirigé compris) sur celles de S1, invariante",
      "par construction : les mêmes montants répartis sur les rangs de réputation, un club par rang (réputation, puis",
      "plafond salarial, puis slug). Budgets / dotations : sommes des clubs IA, ce que le coefficient, les primes de coupe",
      "et les ventes de la présaison font de la dotation (sans report pour un club IA).",
    ].join(" "),
    table(["Division", "Mesure", ...snapshots.map(seasonHeader)], divisionTotals(rows, snapshots)),
    "### Réputation moyenne",
    table(seasonHeaders, pivot(rows, snapshots, (members) => fixed(mean(members.map((row) => row.reputation)), 1))),
  );
  const cohortOf = new Map(rows.filter((row) => row.season === 1).map((row) => [row.clubSaveId, row.tier]));
  const reputationAt = (season: number, keep: (row: ClubSeason) => boolean): number =>
    mean(ai.filter((row) => row.season === season && keep(row)).map((row) => row.reputation));
  const reputationScopes: readonly (readonly [string, (row: ClubSeason) => boolean])[] = [
    ["D1 (clubs en D1 cette saison)", (row) => row.tier === 1],
    ["D2 (clubs en D2 cette saison)", (row) => row.tier === 2],
    ["Clubs partis en D1", (row) => cohortOf.get(row.clubSaveId) === 1],
    ["Clubs partis en D2", (row) => cohortOf.get(row.clubSaveId) === 2],
    ["Tous les clubs IA", () => true],
  ];
  const driftRows = reputationScopes.map(([label, keep]) => {
    const values = snapshots.map((snapshot) => reputationAt(snapshot.season, keep));
    const change = values[values.length - 1] - values[0];
    return { label, values, change };
  });
  sections.push(
    "### Réputation moyenne par division : dérive",
    table(
      ["Clubs IA", ...snapshots.map(seasonHeader), `Δ S1 → S${last.season}`],
      driftRows.map(({ label, values, change }) => [label, ...values.map((value) => fixed(value, 1)), `${change > 0 ? "+" : ""}${fixed(change, 1)}`]),
    ),
  );

  // ---------------------------------------------------------------- (c) Wage cap
  sections.push(
    "## c. Le plafond salarial est-il la vraie limite des achats ?",
    [
      `Recrue type de chaque club au début de la saison : ${SIGNING_AGE} ans, note = note médiane de ses ${ELEVEN} meilleurs`,
      "joueurs, potentiel = note ; valeur = marketValueFor, salaire = wageFor. Achats permis par le budget = budget / valeur ;",
      "par la masse salariale = max(0, plafond − masse) / salaire. Les salaires lient quand le second est plus petit que le",
      "premier. Cellule : part des clubs liés par les salaires · médiane des achats permis par le budget / par les salaires.",
    ].join(" "),
    table(
      seasonHeaders,
      pivot(rows, snapshots, (members) => {
        const bound = members.filter((row) => row.signing.wageBound).length / members.length;
        return `${fixed(100 * bound, 0)} % · ${fixed(median(members.map((row) => row.signing.byBudget)), 1)} / ${fixed(median(members.map((row) => row.signing.byWages)), 1)}`;
      }),
    ),
    "### Masse salariale / plafond salarial des clubs IA : médiane (min–max)",
    table(
      seasonHeaders,
      pivot(rows, snapshots, (members) => {
        const shares = members.map((row) => row.payroll / row.wageBudget);
        return `${fixed(median(shares), 2)} (${fixed(Math.min(...shares), 2)}–${fixed(Math.max(...shares), 2)})`;
      }),
    ),
    "### Plafond salarial au plancher (la moitié de la table) / à la table : part des clubs IA",
    table(
      seasonHeaders,
      pivot(rows, snapshots, (members) => {
        const atFloor = members.filter((row) => row.wageBudget === wageBudgetFloor(row.tableWageBudget)).length / members.length;
        const atTable = members.filter((row) => row.wageBudget === row.tableWageBudget).length / members.length;
        return `${fixed(100 * atFloor, 0)} % / ${fixed(100 * atTable, 0)} %`;
      }),
    ),
    "### Les six clubs de a : achats permis par le budget / par les salaires (note de la recrue type)",
    table(
      ["Club", ...snapshots.map(seasonHeader)],
      followed.map(({ label, first }) => [
        `${label} : ${first.slug}`,
        ...snapshots.map((snapshot) => {
          const row = rows.find((candidate) => candidate.season === snapshot.season && candidate.clubSaveId === first.clubSaveId);
          return row === undefined
            ? "—"
            : `${fixed(row.signing.byBudget, 1)} / ${fixed(row.signing.byWages, 1)} (${row.signing.overall})`;
        }),
      ]),
    ),
  );

  // ---------------------------------------------------------------- (d) Managed club
  const managed = rows.filter((row) => row.managed).sort((a, b) => a.season - b.season);
  const creation = managed[0].budget;
  const dotationOf = (index: number): number => snapshots[index].managedBudget?.dotation ?? managed[index].dotation;
  const wageBudgetOf = (index: number): number => snapshots[index].managedBudget?.wageBudget ?? managed[index].wageBudget;
  const deltaOf = (row: ClubSeason): number => (row.end === null ? 0 : row.end.budget - row.budget);
  const paths = EXTREME_COEFFICIENTS.map((coefficient) => {
    const budgets = [creation];
    for (let index = 0; index + 1 < managed.length; index++) {
      budgets.push(boardBudget(dotationOf(index + 1), coefficient, budgets[index] + deltaOf(managed[index])));
    }
    return { coefficient, budgets };
  });
  // The formula, run with the game's coefficients on the actual budgets, must give the actual budgets.
  const pathMismatches = managed.slice(1).filter((row, index) => {
    const coefficient = snapshots[index + 1].managedBudget?.coefficient ?? NEUTRAL_BUDGET_COEFFICIENT;
    const before = managed[index];
    return boardBudget(dotationOf(index + 1), coefficient, before.budget + deltaOf(before)) !== row.budget;
  });
  const reachable = (pick: (values: number[]) => number): number =>
    Math.min(
      BUDGET_COEFFICIENT_RANGE.best,
      Math.max(
        BUDGET_COEFFICIENT_RANGE.worst,
        NEUTRAL_BUDGET_COEFFICIENT +
          pick(Object.values(RANKING_COEFFICIENT)) +
          pick(Object.values(CUP_COEFFICIENT)) +
          pick(Object.values(CHOSEN_COEFFICIENT)),
      ),
    );
  const lowest = reachable((values) => Math.min(...values));
  const highest = reachable((values) => Math.max(...values));
  const pathHeaders = paths.flatMap(({ coefficient }) => [`Budget ${coefficientText(coefficient)}`, "/ création"]);
  // What the transition opening a season did to the managed club's contracts: the assistant's renewals, releases and free
  // signings in its preseason, or, in records from before the assistant managed them, the contracts run out.
  const contractsText = (index: number): string => {
    const transition = index === 0 ? null : snapshots[index - 1].transition;
    if (transition === null) {
      return "—";
    }
    const own = transition.preseason.managed;
    return own === undefined ? `${transition.freeAgents} fins` : `${own.renewals} · ${own.releases} · ${own.signings}`;
  };
  const contractsRule = assistantContracts
    ? "l'adjoint les gérant comme ceux d'un club IA (planSquad) : prolongations · libérations · recrues libres"
    : "« N fins » : ses contrats arrivés à terme, que personne ne prolongeait (relevés d'avant leur gestion par l'adjoint)";
  sections.push(
    `## d. Le club dirigé (${DEMO_CLUB_SLUG}) : coefficient du jeu, puis ${paths.map(({ coefficient }) => coefficientText(coefficient)).join(" et ")}`,
    [
      "Effectif et masse salariale : au début de la saison, après la présaison. Contrats : ce qu'en a fait le passage qui",
      `ouvre la saison, ${contractsRule}.`,
      "Recalcul a posteriori (dans une partie jouée par l'adjoint, le budget du club dirigé ne rejaillit sur rien : aucun",
      "achat, et les clubs IA ne le lisent pas) : B1 = son budget réel au début de S1 ; Δn = budget réel à la fin de la",
      "saison n − au début (primes de coupe, ventes) ; Bn+1 = arrondi(Dn+1 × c, au pas de 100 000 €, au moins 100 000 €) +",
      "arrondi(50 % × max(0, Bn + Δn)), Dn+1 sa dotation réelle (SeasonBudget). Coef. du jeu : celui que le passage a",
      "appliqué (SeasonBudget), d'après la saison précédente. Achats : permis par le budget de chaque chemin (réel /",
      `${paths.map(({ coefficient }) => coefficientText(coefficient)).join(" / ")}), puis par la marge salariale du jeu (sa`,
      "marge suit le coefficient du jeu). La formule, appliquée aux budgets réels avec le coefficient du jeu, redonne le",
      `budget réel pour ${managed.length - 1 - pathMismatches.length} / ${managed.length - 1} saisons.`,
    ].join(" "),
    table(
      [
        "Saison",
        "Division",
        "Rép. (rang)",
        "Fin : rang · coupe",
        "Dotation",
        "Plafond",
        "Effectif",
        "Masse sal.",
        "Contrats",
        "Coef. du jeu",
        "Δ saison",
        "Budget réel",
        "/ création",
        ...pathHeaders,
        "Achats budget",
        "Achats salaires",
      ],
      managed.map((row, index) => [
        seasonHeader(row),
        row.code,
        `${row.reputation} (${row.reputationRank}/${row.clubCount})`,
        row.end === null ? "—" : `${row.end.finalRank} · ${cupRunText(row.end.cupRound, row.end.cupWinner)}`,
        millions(dotationOf(index)),
        millions(wageBudgetOf(index)),
        String(row.squadSize),
        millions(row.payroll),
        contractsText(index),
        coefficientText(snapshots[index].managedBudget?.coefficient ?? NEUTRAL_BUDGET_COEFFICIENT),
        row.end === null ? "—" : signedMillions(deltaOf(row)),
        millions(row.budget),
        fixed(row.budget / creation, 2),
        ...paths.flatMap(({ budgets }) => [millions(budgets[index]), fixed(budgets[index] / creation, 2)]),
        [row.budget, ...paths.map(({ budgets }) => budgets[index])].map((budget) => fixed(budget / row.signing.value, 1)).join(" / "),
        fixed(row.signing.byWages, 1),
      ]),
    ),
    [
      `${coefficientText(BUDGET_COEFFICIENT_RANGE.worst)} est la borne basse du coefficient (BUDGET_COEFFICIENT_RANGE) : avec`,
      `les valeurs du cahier, le plus bas atteignable est ${coefficientText(lowest)} (classement manqué`,
      `${coefficientText(RANKING_COEFFICIENT.MISSED)}, coupe manquée ${coefficientText(CUP_COEFFICIENT.MISSED)}, objectif choisi`,
      `manqué ${coefficientText(CHOSEN_COEFFICIENT.MISSED)}), le plus haut ${coefficientText(highest)}.`,
    ].join(" "),
  );

  // ---------------------------------------------------------------- (e) Drifts
  const thirds = GROUPS.filter((candidate) => candidate.third !== null);
  const membersAt = (season: number, group: Group): ClubSeason[] =>
    rows.filter((row) => row.season === season && inGroup(row, group));
  const boundShare = (members: readonly ClubSeason[]): number =>
    members.filter((row) => row.signing.wageBound).length / Math.max(1, members.length);
  const { low: dotationLow, high: dotationHigh } = DOTATION_RATIO_RANGE;
  const dotationOut: string[] = [];
  const budgetOver: string[] = [];
  for (const { season } of snapshots) {
    for (const group of thirds) {
      const members = membersAt(season, group);
      if (members.length === 0) {
        continue;
      }
      const dotation = mean(members.map(dotationRatio));
      if (dotation < dotationLow || dotation > dotationHigh) {
        dotationOut.push(`S${season} ${group.label} ${fixed(dotation, 2)}`);
      }
      const budget = mean(members.map(budgetRatio));
      if (budget > BUDGET_RATIO_MAX) {
        budgetOver.push(`S${season} ${group.label} ${fixed(budget, 2)}`);
      }
    }
  }
  const lastPlayed = snapshots.filter((snapshot) => snapshot.end !== null).at(-1);
  const minimumShare = `${fixed(100 * WAGE_BOUND_MIN_SHARE, 0)} %`;
  const wageLines = [lastPlayed, last].flatMap((snapshot) => {
    if (snapshot === undefined) {
      return [];
    }
    const loose = thirds.flatMap((group) => {
      const members = membersAt(snapshot.season, group);
      const share = boundShare(members);
      return members.length > 0 && share < WAGE_BOUND_MIN_SHARE
        ? [`${group.label} ${fixed(100 * share, 0)} % (S1 : ${fixed(100 * boundShare(membersAt(1, group)), 0)} %)`]
        : [];
    });
    return [
      loose.length === 0
        ? `S${snapshot.season} : au moins ${minimumShare} des clubs liés par les salaires dans chaque tiers.`
        : `S${snapshot.season}, moins de ${minimumShare} des clubs liés par les salaires : ${loose.join(", ")}.`,
    ];
  });
  const drifts = [
    dotationOut.length === 0
      ? `Dotation / création moyenne : aucun tiers hors de [${dotationLow}, ${dotationHigh}], de S1 à S${last.season}.`
      : `Dotation / création moyenne hors de [${dotationLow}, ${dotationHigh}] : ${dotationOut.join(", ")}.`,
    budgetOver.length === 0
      ? `Budget / création moyen : aucun tiers au-dessus de ${BUDGET_RATIO_MAX}.`
      : `Budget / création moyen au-dessus de ${BUDGET_RATIO_MAX} : ${budgetOver.join(", ")}.`,
    ...wageLines,
  ];

  // What drives them: budgets against dotations, ties in reputation ranks, reputation created or lost at each end.
  const totalsOf = (tier: CompetitionTier, season: number): { pool: number; budgets: number } => {
    const members = rows.filter((row) => row.season === season && row.tier === tier);
    const aiMembers = members.filter((row) => !row.managed);
    return {
      pool: sumOf(members.map((row) => row.dotation)),
      budgets: sumOf(aiMembers.map((row) => row.budget)) / sumOf(aiMembers.map((row) => row.dotation)),
    };
  };
  const coefficients = ai.flatMap((row) => (row.board === null ? [] : [row.board.coefficient]));
  const meanCoefficient = mean(coefficients);
  const next = new Map(rows.map((row) => [`${row.season}#${row.clubSaveId}`, row]));
  const reputationChange = (row: ClubSeason): number | null => {
    const after = next.get(`${row.season + 1}#${row.clubSaveId}`);
    return after === undefined ? null : after.reputation - row.reputation;
  };
  const changesBySeason = snapshots
    .filter((snapshot) => snapshot.end !== null)
    .map(({ season }) => sumOf(rows.filter((row) => row.season === season).map((row) => reputationChange(row) ?? 0)));
  // Expected first and neither promoted nor relegated: the places alone move its reputation.
  const favourites = rows.flatMap((row) => {
    const change = row.reputationRank === 1 && row.end !== null && row.end.move === null ? reputationChange(row) : null;
    return change === null ? [] : [change];
  });
  const relegated = ai.flatMap((row) => {
    const after = row.end?.move === "RELEGATED" ? next.get(`${row.season + 1}#${row.clubSaveId}`) : undefined;
    return after === undefined ? [] : [after];
  });
  const largest = [...ai].sort((a, b) => budgetRatio(b) - budgetRatio(a))[0];
  const dotationExtremes = [...ai].filter((row) => row.season > 1).sort((a, b) => dotationRatio(a) - dotationRatio(b));
  const lowestDotation = dotationExtremes[0];
  const highestDotation = dotationExtremes.at(-1);
  const signedFixed = (value: number, digits: number): string => `${value > 0 ? "+" : ""}${fixed(value, digits)}`;
  const mechanisms = [
    `Budgets des clubs IA / leurs dotations (sommes) : D1 ${fixed(totalsOf(1, 1).budgets, 2)} → ${fixed(totalsOf(1, last.season).budgets, 2)}, D2 ${fixed(totalsOf(2, 1).budgets, 2)} → ${fixed(totalsOf(2, last.season).budgets, 2)} de S1 à S${last.season} : sans report, un club IA repart chaque saison de sa dotation × son coefficient (coefficient moyen des clubs IA : ${coefficientText(meanCoefficient)}), plus les primes de coupe et les ventes de la présaison.`,
    `Clubs à rang de réputation partagé : ${tiedClubs(rows.filter((row) => row.season === 1))} à S1, ${tiedClubs(rows.filter((row) => row.season === last.season))} à S${last.season} sur ${rows.filter((row) => row.season === 1).length} (un club par rang) ; masse des dotations ×${fixed(totalsOf(1, last.season).pool / totalsOf(1, 1).pool, 3)} en D1, ×${fixed(totalsOf(2, last.season).pool / totalsOf(2, 1).pool, 3)} en D2 à S${last.season}.`,
    `Réputation totale de tous les clubs à chaque passage : ${changesBySeason.map((change) => signedFixed(change, 0)).join(", ")} points (les cibles d'une division sont ses réputations de création, un rang chacune : la somme ne bouge que par l'écart des réputations à leurs cibles).`,
    `Club attendu 1er de sa division, sans montée ni descente : ${signedFixed(mean(favourites), 2)} point de réputation par saison en moyenne (${favourites.length} cas) : sa cible est au mieux la réputation de création du premier.`,
    `Clubs IA relégués (${relegated.length}) : la saison suivante, budget / nouvelle dotation médian ${fixed(median(relegated.map((row) => row.budget / row.dotation)), 2)}, ${relegated.filter((row) => row.signing.wageBound).length} liés par les salaires, ${relegated.filter((row) => row.payroll > row.wageBudget).length} au-dessus de leur plafond.`,
    ...driftRows
      .slice(0, 4)
      .map(({ label, values, change }) => `Réputation moyenne, ${label} : ${fixed(values[0], 1)} → ${fixed(values[values.length - 1], 1)} (${signedFixed(change, 1)}) de S1 à S${last.season}.`),
    largest === undefined
      ? ""
      : `Plus grand budget / création d'un club IA : ${fixed(budgetRatio(largest), 2)} (${largest.slug}, ${largest.code}, ${seasonHeader(largest)} : ${millions(largest.budget)} M€ pour ${millions(largest.creationBudget)} M€ à la création).`,
    lowestDotation === undefined || highestDotation === undefined
      ? ""
      : `Dotation / création d'un club IA, de S2 à S${last.season} : de ${fixed(dotationRatio(lowestDotation), 2)} (${lowestDotation.slug}, ${lowestDotation.code}, ${seasonHeader(lowestDotation)}) à ${fixed(dotationRatio(highestDotation), 2)} (${highestDotation.slug}, ${highestDotation.code}, ${seasonHeader(highestDotation)}).`,
  ].filter((line) => line !== "");
  sections.push(
    "## e. Dérives",
    [
      `Seuils : dotation / création moyenne d'un tiers hors de [${dotationLow}, ${dotationHigh}], budget / création moyen`,
      `au-dessus de ${BUDGET_RATIO_MAX}, moins de ${minimumShare} des clubs d'un tiers liés par les salaires à la dernière`,
      `saison jouée (S${lastPlayed?.season ?? "?"}) ou au dernier début relevé (S${last.season}), avec la part de S1.`,
    ].join(" "),
    drifts.map((line) => `- ${line}`).join("\n"),
    "### Ce qui les fait",
    mechanisms.map((line) => `- ${line}`).join("\n"),
  );

  sections.push(...spreadSections(snapshots, rows));
  sections.push(...objectivesSections(snapshots, rows));
  sections.push(...europeSections(snapshots, rows));
  sections.push(...nationsSections(snapshots, rows));
  return sections.join("\n\n");
}

/** The population standard deviation of some values. */
function standardDeviation(values: readonly number[]): number {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

/**
 * Each club's reputation at the next season's start, recomputed from its season as the transition computes it: a share of
 * the way to its target, the creation's reputation at its rank in the division it plays next (rankInNextDivision), against
 * the one recorded.
 */
function reputationRecomputed(
  rows: readonly ClubSeason[],
  snapshots: readonly SeasonSnapshot[] = [],
): { row: ClubSeason; expected: number; actual: number }[] {
  const at = new Map(rows.map((row) => [`${row.season}#${row.clubSaveId}`, row]));
  // What a European run adds to a club's target (europeReputationBonus), within 99.
  const bonusOf = new Map(
    snapshots.flatMap((snapshot) =>
      (snapshot.europe ?? []).map((record) => [`${snapshot.season}#${record.clubSaveId}`, europeReputationBonus(record.code, record.stage)] as const),
    ),
  );
  const nextCodeOf = (row: ClubSeason): string | undefined => at.get(`${row.season + 1}#${row.clubSaveId}`)?.code;
  return rows.flatMap((row) => {
    const next = at.get(`${row.season + 1}#${row.clubSaveId}`);
    if (row.end === null || next === undefined) {
      return [];
    }
    // Its country's exchange: the clubs of its division going where it goes.
    const moving =
      row.end.move === null
        ? 0
        : rows.filter((other) => other.season === row.season && other.code === row.code && nextCodeOf(other) === next.code).length;
    const rank = rankInNextDivision({
      finalRank: row.end.finalRank,
      clubCount: row.clubCount,
      move: row.end.move,
      moving,
      nextClubCount: next.clubCount,
    });
    const target = Math.min(99, reputationTarget(rank, next.clubCount, next.tier) + (bonusOf.get(`${row.season}#${row.clubSaveId}`) ?? 0));
    return [{ row, expected: reputationAfterSeason(row.reputation, target, row.end.move), actual: next.reputation }];
  });
}

/**
 * g. Each division's spread of reputations at each season's start (every club of it, the managed one included): its
 * standard deviation, against the first season's, which must stay within SPREAD_TOLERANCE.
 */
function spreadSections(snapshots: readonly SeasonSnapshot[], rows: readonly ClubSeason[]): string[] {
  const codes = [...new Set(rows.map((row) => row.code))].sort((a, b) => a.localeCompare(b));
  const tierOf = new Map(rows.map((row) => [row.code, row.tier]));
  const deviationAt = (season: number, code: string): number =>
    standardDeviation(rows.filter((row) => row.season === season && row.code === code).map((row) => row.reputation));
  const lines = codes.map((code) => {
    const values = snapshots.map(({ season }) => deviationAt(season, code));
    return { label: code, tier: tierOf.get(code), values, drift: Math.max(...values.map((value) => Math.abs(value / values[0] - 1))) };
  });
  const byTier = ([1, 2] as const).map((tier) => {
    const members = lines.filter((line) => line.tier === tier);
    const values = snapshots.map((_, index) => mean(members.map((line) => line.values[index])));
    return { label: `D${tier} (moyenne)`, tier, values, drift: Math.max(...values.map((value) => Math.abs(value / values[0] - 1))) };
  });
  const outside = lines.filter((line) => line.drift > SPREAD_TOLERANCE);
  const tolerance = `±${fixed(100 * SPREAD_TOLERANCE, 0)} %`;
  const recomputed = reputationRecomputed(rows, snapshots);
  const mismatches = recomputed.filter(({ expected, actual }) => expected !== actual);
  const signedPercent = (value: number): string => `${value > 0 ? "+" : ""}${fixed(100 * value, 1)} %`;
  const last = snapshots[snapshots.length - 1];
  return [
    "## g. Étalement des réputations",
    [
      `Écart-type des réputations de chaque division au début de chaque saison (tous ses clubs, le club dirigé compris), puis`,
      `l'écart le plus grand à celui de S1 et celui de S${last.season}. Stable : à ${tolerance} de S1 à chaque saison. Règle :`,
      `${fixed(100 * REPUTATION_TARGET_SHARE, 0)} % du chemin vers la réputation de création au rang final ; un promu ou un`,
      "relégué prend d'un coup celle du rang équivalent de sa nouvelle division. Vérification : réputation recalculée ainsi =",
      "relevée au début de la saison suivante",
      `pour ${recomputed.length - mismatches.length} / ${recomputed.length} clubs-saisons.`,
      ...mismatches
        .slice(0, 5)
        .map(({ row, expected, actual }) => `Écart : ${seasonHeader(row)} ${row.slug}, recalcul ${expected}, relevée ${actual}.`),
    ].join(" "),
    table(
      ["Division", ...snapshots.map(seasonHeader), "Écart max / S1", `S${last.season} / S1`],
      [...lines, ...byTier].map(({ label, values, drift }) => [
        label,
        ...values.map((value) => fixed(value, 2)),
        `${fixed(100 * drift, 1)} %`,
        signedPercent(values[values.length - 1] / values[0] - 1),
      ]),
    ),
    outside.length === 0
      ? `Toutes les divisions restent à ${tolerance} de leur écart-type de S1, de S1 à S${last.season}.`
      : `Hors de ${tolerance} : ${outside.map((line) => `${line.label} (${fixed(100 * line.drift, 1)} %)`).join(", ")}.`,
  ];
}

const OBJECTIVE_NAMES: Readonly<Record<ObjectiveKind, string>> = {
  RANKING: "Classement",
  CUP: "Coupe",
  EUROPE: "Europe",
  YOUTH: "Jeunesse",
  ENTERTAINMENT: "Spectacle",
  SOLIDITY: "Solidité",
  FINANCES: "Bonne gestion",
};
const OUTCOME_NAMES: Readonly<Record<ObjectiveOutcome, string>> = { EXCEEDED: "dépassé", ACHIEVED: "atteint", MISSED: "manqué" };

/**
 * f. The objectives: for each kind, how often the AI clubs' seasons exceed, achieve or miss it, by division and
 * reputation third (the objective every club's season would have given it, judged with the game's rules); then the
 * managed club's own objectives, season by season, as the transitions closed them.
 */
function objectivesSections(snapshots: readonly SeasonSnapshot[], rows: readonly ClubSeason[]): string[] {
  const played = rows.filter((row) => !row.managed && row.end !== null);
  if (played.length === 0 || played.every((row) => row.end?.objectives === undefined)) {
    return [];
  }
  const groups: { label: string; keep: (row: ClubSeason) => boolean }[] = [
    ...([1, 2] as const).flatMap((tier) => [
      ...[1, 2, 3].map((third) => ({ label: `D${tier} ${THIRD_NAMES[third]}`, keep: (row: ClubSeason) => row.tier === tier && row.third === third })),
      { label: `D${tier} (tous)`, keep: (row: ClubSeason) => row.tier === tier },
    ]),
    { label: "Tous", keep: () => true },
  ];
  const share = (count: number, total: number): string => (total === 0 ? "—" : `${fixed((100 * count) / total, 0)} %`);
  const kinds: ObjectiveKind[] = ["RANKING", "CUP", "YOUTH", "ENTERTAINMENT", "SOLIDITY", "FINANCES"];
  const tables = kinds.flatMap((kind) => {
    const lines = groups.map(({ label, keep }) => {
      const outcomes = played.filter(keep).flatMap((row) => {
        const outcome = row.end?.objectives?.[kind];
        return outcome === null || outcome === undefined ? [] : [outcome];
      });
      const count = (outcome: ObjectiveOutcome) => outcomes.filter((candidate) => candidate === outcome).length;
      return [label, share(count("EXCEEDED"), outcomes.length), share(count("ACHIEVED"), outcomes.length), share(count("MISSED"), outcomes.length), share(count("EXCEEDED") + count("ACHIEVED"), outcomes.length), String(outcomes.length)];
    });
    return [`### ${OBJECTIVE_NAMES[kind]}`, table(["Groupe", "Dépassé", "Atteint", "Manqué", "Atteint ou dépassé", "Clubs-saisons"], lines)];
  });
  const managedLines = snapshots.flatMap((snapshot) =>
    snapshot.end === null || snapshot.managedObjectives === undefined
      ? []
      : [
          [
            `S${snapshot.season} ${seasonLabel(snapshot.startYear)}`,
            snapshot.managedObjectives
              .filter((objective) => objective.imposed || objective.chosen)
              .map((objective) => `${OBJECTIVE_NAMES[objective.kind]} ${objective.target}${objective.exceed === null ? "" : ` (${objective.exceed})`} : ${objective.outcome === null ? "—" : OUTCOME_NAMES[objective.outcome]}${objective.byAssistant ? ", choisi par l'adjoint" : ""}`)
              .join(" · "),
            coefficientText(snapshots[snapshot.season]?.managedBudget?.coefficient ?? Number.NaN),
          ],
        ],
  );
  return [
    "## f. Objectifs de saison (gameplay v2, V3)",
    [
      "L'objectif que la saison de chaque club IA lui aurait donné, jugé avec les règles du jeu (objectiveOutcome, la saison finie) :",
      "le classement d'après son rang attendu ; la coupe d'après son tiers de réputation et son tour d'entrée ; Jeunesse d'après",
      "les titularisations de ses joueurs de 21 ans ou moins ; Spectacle et Solidité d'après les buts attendus de son effectif au",
      "départ (dans le dispositif qu'il choisit) face à l'adversaire moyen de sa division ; Bonne gestion d'après son solde des",
      "transferts. Groupes : division et tiers de réputation au début de la saison. Cible du classement : environ une saison sur",
      "deux ; la coupe un peu moins souvent.",
    ].join(" "),
    ...tables,
    "### Le club dirigé, ses objectifs fermés par chaque passage",
    "Cible (dépassement) et issue ; coefficient de la dotation suivante.",
    table(["Saison", "Objectifs", "Coefficient suivant"], managedLines),
  ];
}

const EUROPE_NAMES: Readonly<Record<EuropeCode, string>> = { "eu.1": "Coupe des Lauriers", "eu.2": "Coupe des Fanions" };
const KNOCKOUT_ROUND_NAMES: Readonly<Record<number, string>> = { 7: "Barrages", 8: "Quarts", 9: "Demi-finales", 10: "Finales" };

/**
 * h. The European competitions (docs/design/europe.md): who qualifies, qualifies again and goes down; the budgets and
 * reputations of their clubs against the other first division clubs; the European objective each club's run would have
 * met, by its reputation third among its competition's clubs; the knockout ties; the starters' fitness at kick-off.
 */
function europeSections(snapshots: readonly SeasonSnapshot[], rows: readonly ClubSeason[]): string[] {
  const played = snapshots.filter((snapshot) => snapshot.end !== null && (snapshot.europe ?? []).length > 0);
  if (played.length === 0) {
    return [];
  }
  const share = (count: number, total: number): string => (total === 0 ? "—" : `${fixed((100 * count) / total, 0)} %`);
  const rowAt = new Map(rows.map((row) => [`${row.season}#${row.clubSaveId}`, row]));
  const codes = ["eu.1", "eu.2"] as const;
  const seasonName = (snapshot: SeasonSnapshot): string => `S${snapshot.season} ${seasonLabel(snapshot.startYear)}`;

  // Qualified, qualified again the season after (any European competition, then the same), relegated, mean final rank.
  const qualification = played.map((snapshot) => {
    const next = snapshots.find((candidate) => candidate.season === snapshot.season + 1);
    const nextCodes = new Map((next?.europe ?? []).map((record) => [record.clubSaveId, record.code]));
    const known = next?.europe !== undefined && next.europe.length > 0;
    return [
      seasonName(snapshot),
      ...codes.flatMap((code) => {
        const clubs = (snapshot.europe ?? []).filter((record) => record.code === code);
        const ends = clubs.flatMap((record) => {
          const end = rowAt.get(`${snapshot.season}#${record.clubSaveId}`)?.end;
          return end === null || end === undefined ? [] : [end];
        });
        return [
          String(clubs.length),
          known ? share(clubs.filter((record) => nextCodes.has(record.clubSaveId)).length, clubs.length) : "—",
          known ? share(clubs.filter((record) => nextCodes.get(record.clubSaveId) === code).length, clubs.length) : "—",
          String(ends.filter((end) => end.move === "RELEGATED").length),
          fixed(mean(ends.map((end) => end.finalRank)), 1),
        ];
      }),
    ];
  });

  // Budgets (start, end) and reputation at the start: each competition's AI clubs against the other first division ones.
  const groupsOf = (snapshot: SeasonSnapshot) => {
    const codeOf = new Map((snapshot.europe ?? []).map((record) => [record.clubSaveId, record.code]));
    const members = rows.filter((row) => row.season === snapshot.season && !row.managed);
    return {
      "eu.1": members.filter((row) => codeOf.get(row.clubSaveId) === "eu.1"),
      "eu.2": members.filter((row) => codeOf.get(row.clubSaveId) === "eu.2"),
      others: members.filter((row) => row.tier === 1 && !codeOf.has(row.clubSaveId)),
    };
  };
  const money = played.map((snapshot) => {
    const groups = groupsOf(snapshot);
    return [
      seasonName(snapshot),
      ...(["eu.1", "eu.2", "others"] as const).flatMap((group) => [
        millions(mean(groups[group].map((row) => row.budget))),
        millions(mean(groups[group].flatMap((row) => (row.end === null ? [] : [row.end.budget])))),
        fixed(mean(groups[group].map((row) => row.reputation)), 1),
      ]),
    ];
  });

  // The European objective each run would have met: by its reputation third among its competition's clubs at the opening.
  type Outcome = "EXCEEDED" | "ACHIEVED" | "MISSED";
  const outcomes: { code: EuropeCode; third: 1 | 2 | 3; outcome: Outcome }[] = played.flatMap((snapshot) =>
    codes.flatMap((code) => {
      const clubs = (snapshot.europe ?? [])
        .filter((record) => record.code === code)
        .sort((a, b) => b.reputation - a.reputation || (a.slug < b.slug ? -1 : 1));
      return clubs.map((record, index) => {
        const third = reputationThird(index + 1, clubs.length);
        const { target, exceed } = europeObjective(third);
        const outcome: Outcome = record.stage >= exceed ? "EXCEEDED" : record.stage >= target ? "ACHIEVED" : "MISSED";
        return { code, third, outcome };
      });
    }),
  );
  const objectiveRows = codes.flatMap((code) =>
    ([1, 2, 3] as const).map((third) => {
      const ofGroup = outcomes.filter((entry) => entry.code === code && entry.third === third);
      const count = (outcome: Outcome) => ofGroup.filter((entry) => entry.outcome === outcome).length;
      return [
        `${EUROPE_NAMES[code]}, ${THIRD_NAMES[third]}`,
        share(count("EXCEEDED"), ofGroup.length),
        share(count("ACHIEVED"), ofGroup.length),
        share(count("MISSED"), ofGroup.length),
        share(count("EXCEEDED") + count("ACHIEVED"), ofGroup.length),
        String(ofGroup.length),
      ];
    }),
  );
  const allMet = outcomes.filter((entry) => entry.outcome !== "MISSED").length;

  // Knockout ties: how they were decided, and how often the better ranked of the league phase went through.
  const ties = played.flatMap((snapshot) => snapshot.knockout ?? []);
  const knockoutRows = [7, 8, 9, 10].map((round) => {
    const ofRound = ties.filter((tie) => tie.round === round);
    return [
      KNOCKOUT_ROUND_NAMES[round] ?? String(round),
      String(ofRound.length),
      share(ofRound.filter((tie) => tie.decidedBy === "REGULATION").length, ofRound.length),
      share(ofRound.filter((tie) => tie.decidedBy === "EXTRA_TIME").length, ofRound.length),
      share(ofRound.filter((tie) => tie.decidedBy === "PENALTIES").length, ofRound.length),
      share(ofRound.filter((tie) => tie.betterRankedWon).length, ofRound.length),
    ];
  });

  // Fitness of the starters at kick-off: the European clubs' against the other first division clubs'.
  const fitness = played.flatMap((snapshot) => (snapshot.fitness === undefined ? [] : [snapshot.fitness]));
  const sumGroup = (group: keyof FitnessRecord["groups"]): FitnessTally =>
    fitness.reduce(
      (total, record) => ({
        sum: total.sum + record.groups[group].sum,
        count: total.count + record.groups[group].count,
        below: total.below + record.groups[group].below,
      }),
      emptyTally(),
    );
  const tallyCells = (tally: FitnessTally): string[] => [
    String(tally.count),
    fixed(tally.count === 0 ? Number.NaN : tally.sum / tally.count, 1),
    share(tally.below, tally.count),
  ];
  const fitnessRows = (
    [
      ["Clubs européens, championnat", "europeLeague"],
      ["Clubs européens, coupe", "europeCup"],
      ["Clubs européens, Europe", "europeEurope"],
      ["Autres clubs de D1, championnat", "othersLeague"],
    ] as const
  ).map(([label, group]) => [label, ...tallyCells(sumGroup(group))]);
  const months = [...new Set(fitness.flatMap((record) => Object.keys(record.byMonth)))].sort();
  const monthRows = months.map((month) => {
    const total = (group: "europe" | "others"): FitnessTally =>
      fitness.reduce(
        (sum, record) => {
          const tally = record.byMonth[month]?.[group];
          return tally === undefined ? sum : { sum: sum.sum + tally.sum, count: sum.count + tally.count, below: sum.below + tally.below };
        },
        emptyTally(),
      );
    const europe = total("europe");
    const others = total("others");
    return [month, ...tallyCells(europe).slice(1), ...tallyCells(others).slice(1)];
  });

  // Season by season, every match: the European clubs' starters' fitness, starters rested, injuries and players available,
  // against the other first division clubs' (their fitness in the league only, as above).
  const perClub = (count: number, clubs: number): string => fixed(clubs === 0 ? Number.NaN : count / clubs, 1);
  const loadRows = played.flatMap((snapshot) => {
    const record = snapshot.fitness;
    if (record?.load === undefined) {
      return [];
    }
    const { europe, others } = record.load;
    const europeFitness = (["europeLeague", "europeCup", "europeEurope"] as const).reduce(
      (total, group) => ({
        sum: total.sum + record.groups[group].sum,
        count: total.count + record.groups[group].count,
        below: total.below + record.groups[group].below,
      }),
      emptyTally(),
    );
    const cells = (tally: FitnessTally, load: LoadTally): string[] => [
      String(load.clubs),
      ...tallyCells(tally).slice(1),
      perClub(load.rotations, load.clubs),
      perClub(load.injuries, load.clubs),
      fixed(load.matches === 0 ? Number.NaN : load.available / load.matches, 1),
    ];
    const ratio = europe.clubs === 0 || others.clubs === 0 || others.injuries === 0 ? Number.NaN : europe.injuries / europe.clubs / (others.injuries / others.clubs);
    return [[seasonName(snapshot), ...cells(europeFitness, europe), ...cells(record.groups.othersLeague, others), fixed(ratio, 2)]];
  });

  return [
    "## h. Compétitions européennes",
    [
      "Coupe des Lauriers (les 4 premiers de chaque pays) et Coupe des Fanions (5e, 6e, vainqueur de la coupe ou 7e),",
      "jouées par les clubs IA et par le club dirigé, l'adjoint aux commandes. Requalifiés : qualifiés la saison suivante, pour",
      "l'une ou l'autre, puis pour la même ; relégués : descendus en D2 à la fin de la saison.",
    ].join(" "),
    table(
      [
        "Saison",
        ...codes.flatMap((code) => [
          `${EUROPE_NAMES[code]} : clubs`,
          "requalifiés",
          "même compétition",
          "relégués",
          "rang final moyen",
        ]),
      ],
      qualification,
    ),
    "### Budgets et réputations (clubs IA ; M€ au début, M€ à la fin, réputation au début)",
    table(
      [
        "Saison",
        "Lauriers : budget début",
        "fin",
        "réputation",
        "Fanions : budget début",
        "fin",
        "réputation",
        "Autres D1 : budget début",
        "fin",
        "réputation",
      ],
      money,
    ),
    "### Objectif européen qu'aurait reçu chaque club, par tiers de réputation dans sa compétition",
    `Cible : environ une fois sur deux, comme la coupe. Ensemble : ${share(allMet, outcomes.length)} atteints ou dépassés (${outcomes.length} clubs-saisons).`,
    table(["Groupe", "Dépassé", "Atteint", "Manqué", "Atteint ou dépassé", "Clubs-saisons"], objectiveRows),
    "### Élimination directe",
    table(["Tour", "Matchs", "En 90 min", "Après prolongation", "Aux tirs au but", "Le mieux classé passe"], knockoutRows),
    `### Condition des titulaires au coup d'envoi (clubs IA, sous ${ROTATION_FITNESS} : seuil de rotation)`,
    table(["Groupe", "Titularisations", "Moyenne", `Sous ${ROTATION_FITNESS}`], fitnessRows),
    table(["Mois", "Européens : moyenne", `sous ${ROTATION_FITNESS}`, "Autres D1 : moyenne", `sous ${ROTATION_FITNESS}`], monthRows),
    "### Charge de chaque saison (clubs IA, tous leurs matchs ; la condition des autres clubs en championnat seulement)",
    [
      "Reposés : titulaires que selectRestedLineup remplace par un joueur plus frais ; blessures : nouvelles blessures au fil",
      "des matchs ; disponibles : joueurs ni blessés ni suspendus au coup d'envoi. Cible des blessures : au plus 1,3 fois celles",
      "des autres clubs.",
    ].join(" "),
    table(
      [
        "Saison",
        "Européens : clubs",
        "condition",
        `sous ${ROTATION_FITNESS}`,
        "reposés / club",
        "blessures / club",
        "disponibles / match",
        "Autres D1 : clubs",
        "condition",
        `sous ${ROTATION_FITNESS}`,
        "reposés / club",
        "blessures / club",
        "disponibles / match",
        "Blessures : rapport",
      ],
      loadRows,
    ),
  ];
}

// ------------------------------------------------------------------ National teams

/**
 * The national teams (docs/design/selections.md): each season's breaks, whom they took and what they did to them, their
 * cost; the nations' strength at each season's start; the starters' fitness at kick-off of the European clubs lending the
 * most players against the others; the injuries per club by group.
 */
function nationsSections(snapshots: readonly SeasonSnapshot[], rows: readonly ClubSeason[]): string[] {
  const played = snapshots.filter((snapshot) => snapshot.fitness?.nations !== undefined && snapshot.fitness.nations.breaks.length > 0);
  if (played.length === 0) {
    return [];
  }
  const tierOf = new Map(rows.map((row) => [`${row.season}|${row.clubSaveId}`, row.tier]));
  const seasonName = (snapshot: SeasonSnapshot): string => `S${snapshot.season} (${seasonLabel(snapshot.startYear)})`;
  const breakRows = played.map((snapshot) => {
    const nations = snapshot.fitness?.nations as NationsRecord;
    const perBreak = nations.breaks.map((entry) => {
      const counts = Object.entries(entry.calledByClub);
      const ofTier = (tier: number) => counts.filter(([club]) => tierOf.get(`${snapshot.season}|${club}`) === tier).map(([, count]) => count);
      return { total: counts.reduce((sum, [, count]) => sum + count, 0), d1: ofTier(1), d2: ofTier(2) };
    });
    const tier1Clubs = nations.tier1;
    const d1Mean = mean(perBreak.map((entry) => entry.d1.reduce((sum, count) => sum + count, 0) / Math.max(1, tier1Clubs)));
    const d1Max = Math.max(...perBreak.flatMap((entry) => entry.d1));
    const d2Mean = mean(perBreak.map((entry) => entry.d2.reduce((sum, count) => sum + count, 0) / Math.max(1, 102)));
    const injuries = nations.breaks.flatMap((entry) => entry.injuryDays);
    const cpu = nations.breaks.map((entry) => entry.cpuMs);
    return [
      seasonName(snapshot),
      String(nations.breaks.length),
      fixed(mean(perBreak.map((entry) => entry.total)), 0),
      fixed(d1Mean, 2),
      String(d1Max),
      fixed(d2Mean, 2),
      fixed(mean(nations.breaks.map((entry) => entry.played)), 0),
      `${injuries.length} (${fixed(mean(injuries), 0)} j)`,
      fixed(mean(nations.breaks.map((entry) => entry.fitnessAfter)), 1),
      `${fixed(mean(cpu), 0)} / ${fixed(Math.max(...cpu), 0)}`,
      fixed(mean(nations.breaks.map((entry) => entry.wallMs)), 0),
    ];
  });
  const strengthRows = played.map((snapshot) => {
    const nations = snapshot.fitness?.nations as NationsRecord;
    return [seasonName(snapshot), nations.strength.map((nation, index) => `${index + 1}. ${nation.code} ${fixed(nation.eleven, 1)} (${nation.outside})`).join(" · ")];
  });
  const rankOf = (code: string) =>
    played.map((snapshot) => {
      const index = (snapshot.fitness?.nations as NationsRecord).strength.findIndex((nation) => nation.code === code);
      return index === -1 ? "—" : String(index + 1);
    });
  const watched = ["BRA", "ARG", "POR"];
  const share = (count: number, total: number): string => (total === 0 ? "—" : `${fixed((100 * count) / total, 0)} %`);
  const monthCells = (tally: FitnessTally | undefined): string[] =>
    tally === undefined || tally.count === 0 ? ["—", "—"] : [fixed(tally.sum / tally.count, 1), share(tally.below, tally.count)];
  const octoberRows = played.map((snapshot) => {
    const month = `${snapshot.startYear}-10`;
    const nations = snapshot.fitness?.nations as NationsRecord;
    const lending = nations.byMonth[month];
    return [
      seasonName(snapshot),
      String(nations.lenders.length),
      ...monthCells(lending?.lenders),
      ...monthCells(lending?.europeOthers),
      ...monthCells(snapshot.fitness?.byMonth[month]?.others),
    ];
  });
  const injuryRows = played.map((snapshot) => {
    const nations = snapshot.fitness?.nations as NationsRecord;
    const europeClubs = (snapshot.fitness?.load?.europe.clubs ?? 0);
    const clubs: Record<LendingGroup, number> = {
      lenders: nations.lenders.length,
      europeOthers: Math.max(0, europeClubs - nations.lenders.length),
      others: Math.max(0, nations.tier1 - europeClubs),
    };
    const cells = (group: LendingGroup): string[] => {
      const { club, breaks } = nations.injuries[group];
      const per = (count: number) => fixed(clubs[group] === 0 ? Number.NaN : count / clubs[group], 1);
      return [per(club), per(breaks), per(club + breaks)];
    };
    return [seasonName(snapshot), ...cells("lenders"), ...cells("europeOthers"), ...cells("others")];
  });
  return [
    "## i. Sélections nationales (docs/design/selections.md)",
    [
      "Quatre trêves par saison, deux matchs amicaux chacune, en simulation légère ; chaque trêve jouée comme une étape de la",
      "partie. Appelés : joueurs de nos clubs dans les 23 de leur nation ; par club : moyenne des clubs de D1 (et de D2), et le",
      "plus grand nombre d'un club. Condition au retour : celle, au dernier jour de la trêve, des joueurs de nos clubs qui ont",
      "joué. CPU : ms de calcul de l'étape de la trêve (moyenne / max), durée en ms, base comprise.",
    ].join(" "),
    table(
      ["Saison", "Trêves", "Appelés / trêve", "Par club de D1", "Max d'un club", "Par club de D2", "Ont joué / trêve", "Blessés (jours)", "Condition au retour", "CPU (ms)", "Durée (ms)"],
      breakRows,
    ),
    "### Force des sélections au début de chaque saison (moyenne du onze, entre parenthèses ses joueurs hors championnats)",
    table(["Saison", "Ordre"], strengthRows),
    table(["Nation", ...played.map(seasonName)], watched.map((code) => [code, ...rankOf(code)])),
    `### Condition des titulaires en octobre (clubs IA de D1, tous leurs matchs pour les européens ; sous ${ROTATION_FITNESS} : seuil de rotation)`,
    [
      `Gros prêteurs : clubs européens dont les nations appellent ${LENDER_CALL_UPS} joueurs ou plus à la première trêve de la`,
      "saison. Cible : moins de 15 % de titulaires sous le seuil.",
    ].join(" "),
    table(["Saison", "Gros prêteurs", "moyenne", `sous ${ROTATION_FITNESS}`, "Autres européens : moyenne", `sous ${ROTATION_FITNESS}`, "Autres D1 : moyenne", `sous ${ROTATION_FITNESS}`], octoberRows),
    "### Blessures par club et par saison (clubs de D1 : en club, en sélection, total)",
    table(
      ["Saison", "Gros prêteurs : en club", "en sélection", "total", "Autres européens : en club", "en sélection", "total", "Autres D1 : en club", "en sélection", "total"],
      injuryRows,
    ),
  ];
}

// ------------------------------------------------------------------ Main

function parseOptions(argv: readonly string[]): Options {
  const value = (name: string): string | undefined =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const seasons = Number(value("seasons") ?? 6);
  if (!Number.isInteger(seasons) || seasons < 1) {
    throw new Error(`--seasons must be a positive integer, got ${value("seasons")}`);
  }
  return { seasons, seed: value("seed") ?? DEMO_SEED, out: value("out"), from: value("from") };
}

type Records = { seed: string; managedClub: string; worldVersion: WorldVersion; minutes: number | null; snapshots: SeasonSnapshot[] };

async function simulate(seasons: number, seed: string): Promise<Records> {
  // The client already refuses any database but a local one (assertLocalDatabase), ALLOW_REMOTE_DB=1 aside: this
  // script writes, so it refuses even that.
  const url = process.env.DATABASE_URL ?? "";
  if (url === "" || !isLocalDatabase(url)) {
    throw new Error("Refusing to write anywhere else than the local database");
  }
  console.log(`Database: ${new URL(url).pathname.slice(1)} (local), seed ${seed}`);
  const started = performance.now();
  // A crashed run's owner and twin first; then a throwaway owner of our own, one per seed.
  const owner = seed === DEMO_SEED ? OWNER : `${OWNER}-${seed}`;
  await prisma.user.deleteMany({ where: { id: owner } });
  await prisma.user.createMany({ data: [{ id: owner, kind: "REGISTERED", lastSeenAt: new Date() }], skipDuplicates: true });
  try {
    const club = await prisma.club.findUniqueOrThrow({ where: { slug: DEMO_CLUB_SLUG }, select: { id: true } });
    const { id: saveId } = await createSave({
      name: "Mesure budgets de saison",
      managerName: "Test",
      clubId: club.id,
      seed,
      ownerId: owner,
      worldVersion: WORLD_VERSION,
    });
    const snapshots = await playSeasons(saveId, seasons);
    return {
      seed,
      managedClub: DEMO_CLUB_SLUG,
      worldVersion: WORLD_VERSION,
      minutes: (performance.now() - started) / 60_000,
      snapshots,
    };
  } finally {
    // The throwaway owner and, by cascade, the twin.
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const records: Records =
    options.from === undefined
      ? await simulate(options.seasons, options.seed)
      : (JSON.parse(readFileSync(options.from, "utf8")) as Records);
  const json = options.out === undefined ? undefined : `${options.out.replace(/\.md$/, "")}.json`;
  // The raw records first: a report that fails must not cost the seasons played.
  if (json !== undefined && options.from === undefined) {
    writeFileSync(json, JSON.stringify(records));
  }
  const clubSeasons = derive(records.snapshots);
  const text = report(records.snapshots, clubSeasons, records.minutes, records.seed);
  console.log(`\n${text}`);
  if (options.out !== undefined && json !== undefined) {
    writeFileSync(options.out, `${text}\n`);
    writeFileSync(json, JSON.stringify({ ...records, clubSeasons }));
    console.log(`\nWritten: ${options.out} and ${json}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
