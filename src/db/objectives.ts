import { NEUTRAL_BUDGET_COEFFICIENT, YOUTH_OBJECTIVE_MAX_AGE } from "../engine/balance";
import { averageOpponent } from "../engine/formation-choice";
import { formationPositions } from "../engine/formations";
import { selectLineup, type SquadPlayer } from "../engine/lineup";
import {
  assistantObjective,
  boardConfidence,
  budgetCoefficient,
  CUP_WON_ROUND,
  cupObjective,
  divisionOf,
  expectedSeasonGoals,
  objectiveOutcome,
  objectiveProgress,
  objectivesRngSeed,
  OPTIONAL_OBJECTIVES,
  optionalTarget,
  proposedObjectives,
  rankingObjective,
  reputationThird,
  type ObjectiveKind,
  type ObjectiveOutcome,
  type ObjectiveProgress,
  type OptionalObjective,
  type RankingVariant,
  type SeasonProgress,
} from "../engine/objectives";
import { countryOf } from "../engine/promotion";
import { reputationRanks } from "../engine/reputation";
import { computeStandings } from "../engine/standings";
import { formationStrength } from "../engine/strength";
import { competitionTier } from "../engine/tiers";
import { seasonStartDate } from "../engine/world";
import { worldVersionOf } from "../engine/world-version";
import type { Prisma } from "../generated/prisma/client";
import { ageInYears } from "../lib/dates";
import { makeRng } from "../lib/rng";
import { prisma } from "./client";
import { parseFormation } from "./lineup";

// The managed club's objectives for each season (docs/design/gameplay-v2.md, V3): opened with the season, the optional
// one chosen before the first match (by the player, or by the assistant at kick-off), followed match after match (the
// president's confidence), closed at the transition, where they give the next dotation its coefficient. The rules are
// pure (src/engine/objectives.ts); this module reads and writes SeasonObjective.

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

/** An objective as stored. */
type ObjectiveRow = {
  kind: ObjectiveKind;
  imposed: boolean;
  chosen: boolean;
  byAssistant: boolean;
  variant: string | null;
  target: number;
  exceed: number | null;
  outcome: ObjectiveOutcome | null;
};

const OBJECTIVE_SELECT = {
  kind: true,
  imposed: true,
  chosen: true,
  byAssistant: true,
  variant: true,
  target: true,
  exceed: true,
  outcome: true,
} as const;

/** Imposed first (the ranking, then the cup), then the optional ones in OPTIONAL_OBJECTIVES order. */
const KIND_ORDER: readonly ObjectiveKind[] = ["RANKING", "CUP", ...OPTIONAL_OBJECTIVES];
const byKind = (a: { kind: ObjectiveKind }, b: { kind: ObjectiveKind }): number => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);

const isOptional = (kind: ObjectiveKind): kind is OptionalObjective => kind !== "RANKING" && kind !== "CUP";

/** The managed club, as its objectives read it. */
async function managedClubOf(db: Db, saveId: string) {
  return db.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { id: true, clubId: true, competitionId: true, reputation: true, formation: true },
  });
}

/** The cup season of a country's league in a year, when the save has it. */
async function cupSeasonOf(db: Db, saveId: string, leagueCode: string, startYear: number) {
  return db.season.findFirst({
    where: { saveId, startYear, competition: { kind: "CUP", code: `${countryOf(leagueCode)}.cup` } },
    select: { id: true },
  });
}

/**
 * Opens the managed club's objectives for a league season, at the creation of a save and at each transition, once the
 * season's fixtures and cups exist and the preseason has run: the ranking (rankingObjective on its reputation rank in
 * its division), the cup when its country has one this season (cupObjective on its reputation third and the round it
 * enters at), and three of the four optional objectives (proposedObjectives, the season's own stream), their targets
 * from its squad's expected goals against its division's average opponent. Sets the president's confidence of a season
 * that begins.
 */
export async function openSeasonObjectives(
  tx: Tx,
  saveId: string,
  season: { id: string; startYear: number },
): Promise<void> {
  const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { seed: true, worldVersion: true } });
  const managed = await managedClubOf(tx, saveId);
  const competition = await tx.competition.findUniqueOrThrow({ where: { id: managed.competitionId }, select: { code: true, tier: true } });
  const rivals = await tx.clubSave.findMany({
    where: { saveId, competitionId: managed.competitionId },
    select: { id: true, reputation: true, wageBudget: true, club: { select: { slug: true } } },
  });
  const tier = competitionTier(competition.tier);
  const clubCount = rivals.length;
  const reputationRank =
    reputationRanks(
      rivals.map((club) => ({ key: club.id, reputation: club.reputation, wageBudget: club.wageBudget, slug: club.club.slug })),
    ).get(managed.id) ?? clubCount;
  const division = divisionOf(competition.code, tier, clubCount, worldVersionOf(save.worldVersion));
  const ranking = rankingObjective(reputationRank, division);

  // The cup: the round the club enters at, 1 when it plays the preliminary round.
  const cupSeason = await cupSeasonOf(tx, saveId, competition.code, season.startYear);
  let cup: { target: number; exceed: number } | null = null;
  if (cupSeason !== null) {
    const preliminary = await tx.fixture.count({
      where: { saveId, seasonId: cupSeason.id, round: 1, OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }] },
    });
    cup = cupObjective(tier, reputationThird(reputationRank, clubCount), preliminary > 0 ? 1 : 2);
  }

  // The squad's expected goals over the league season, in its formation, against its division's average opponent.
  const start = seasonStartDate(season.startYear);
  const players = await tx.playerSave.findMany({
    where: { saveId, clubSaveId: managed.id },
    select: {
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
  const squad = players.map(({ playerKey, injuredUntil, ...player }): SquadPlayer => ({
    ...player,
    id: playerKey,
    injured: injuredUntil !== null && injuredUntil > start,
  }));
  const formation = parseFormation(managed.formation);
  const strength = formationStrength(selectLineup(squad, formationPositions(formation)), formation);
  const expected = expectedSeasonGoals(strength, averageOpponent(tier), 2 * (clubCount - 1));
  const proposed = proposedObjectives(makeRng(objectivesRngSeed(save.seed, season.startYear)));

  await tx.seasonObjective.createMany({
    data: [
      { saveId, seasonId: season.id, kind: "RANKING", imposed: true, variant: ranking.variant, target: ranking.target, exceed: ranking.exceed },
      ...(cup === null ? [] : [{ saveId, seasonId: season.id, kind: "CUP" as const, imposed: true, target: cup.target, exceed: cup.exceed }]),
      ...proposed.map((kind) => ({ saveId, seasonId: season.id, kind, imposed: false, target: optionalTarget(kind, expected) })),
    ],
  });
  await tx.clubSave.update({
    where: { id: managed.id, saveId },
    data: { boardConfidence: boardConfidence({ ranking: "ON_TRACK", cup: cup === null ? undefined : "ON_TRACK" }) },
    select: { id: true },
  });
}

/** The managed club's league season in progress and its objectives, or null in a save from before the objectives. */
async function currentObjectives(db: Db, saveId: string) {
  const managed = await managedClubOf(db, saveId);
  const season = await db.season.findFirst({
    where: { saveId, competitionId: managed.competitionId, completed: false },
    select: { id: true, startYear: true, competition: { select: { code: true } } },
  });
  if (season === null) {
    return null;
  }
  const objectives = await db.seasonObjective.findMany({ where: { saveId, seasonId: season.id }, select: OBJECTIVE_SELECT });
  return objectives.length === 0 ? null : { managed, season, objectives: objectives.sort(byKind) };
}

/**
 * What a league season has given the managed club so far (SeasonProgress): its place and goals in the league table,
 * its matches played, its cup run, the most league starts of its players aged YOUTH_OBJECTIVE_MAX_AGE or less on the
 * season's first day, its transfer balance over the season. `over` once its league matches and its cup run are done.
 */
export async function readSeasonProgress(
  db: Db,
  saveId: string,
  managed: { id: string; clubId: string },
  season: { id: string; startYear: number; competition: { code: string } },
): Promise<SeasonProgress> {
  const fixtures = await db.fixture.findMany({
    where: { saveId, seasonId: season.id },
    select: {
      played: true,
      homeGoals: true,
      awayGoals: true,
      homeClubSaveId: true,
      awayClubSaveId: true,
      homeClubSave: { select: { club: { select: { slug: true } } } },
      awayClubSave: { select: { club: { select: { slug: true } } } },
    },
  });
  const own = fixtures.filter((fixture) => fixture.homeClubSaveId === managed.id || fixture.awayClubSaveId === managed.id);
  const slugs = [...new Set(fixtures.flatMap((fixture) => [fixture.homeClubSave.club.slug, fixture.awayClubSave.club.slug]))];
  const table = computeStandings(
    fixtures.flatMap((fixture) =>
      fixture.played && fixture.homeGoals !== null && fixture.awayGoals !== null
        ? [{ home: fixture.homeClubSave.club.slug, away: fixture.awayClubSave.club.slug, homeGoals: fixture.homeGoals, awayGoals: fixture.awayGoals }]
        : [],
    ),
    slugs,
  );
  const ownSlug = own[0]?.homeClubSaveId === managed.id ? own[0].homeClubSave.club.slug : own[0]?.awayClubSave.club.slug;
  const row = table.find((line) => line.club === ownSlug);

  // The cup run: the furthest round it is in (drawn or played), out after a tie lost, CUP_WON_ROUND after the final won.
  const cupSeason = await cupSeasonOf(db, saveId, season.competition.code, season.startYear);
  let cup: SeasonProgress["cup"] = null;
  let cupDone = true;
  if (cupSeason !== null) {
    const ties = await db.fixture.findMany({
      where: { saveId, seasonId: cupSeason.id, OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }] },
      select: { round: true, played: true, winnerClubSaveId: true },
    });
    const lost = ties.some((tie) => tie.played && tie.winnerClubSaveId !== managed.id);
    const won = ties.some((tie) => tie.played && tie.round === 6 && tie.winnerClubSaveId === managed.id);
    const furthest = Math.max(0, ...ties.map((tie) => tie.round));
    if (ties.length > 0) {
      cup = { reached: won ? CUP_WON_ROUND : furthest, out: lost };
    }
    cupDone = lost || won;
  }

  // Jeunesse: the most league starts of a player of the club young enough on the season's first day.
  const start = seasonStartDate(season.startYear);
  const youngStats = await db.playerSeasonStats.findMany({
    where: { saveId, seasonId: season.id, playerSave: { clubSaveId: managed.id } },
    select: { starts: true, playerSave: { select: { birthDate: true } } },
  });
  const youthStarts = Math.max(
    0,
    ...youngStats.filter((stats) => ageInYears(stats.playerSave.birthDate, start) <= YOUTH_OBJECTIVE_MAX_AGE).map((stats) => stats.starts),
  );

  // Bonne gestion: fees received less fees paid by the club over the season.
  const transfers = await db.transfer.findMany({
    where: {
      saveId,
      date: { gte: start, lt: seasonStartDate(season.startYear + 1) },
      OR: [{ fromClubId: managed.clubId }, { toClubId: managed.clubId }],
    },
    select: { fromClubId: true, toClubId: true, fee: true },
  });
  const balance = transfers.reduce(
    (sum, transfer) => sum + (transfer.fromClubId === managed.clubId ? transfer.fee : 0) - (transfer.toClubId === managed.clubId ? transfer.fee : 0),
    0,
  );

  const played = own.filter((fixture) => fixture.played).length;
  return {
    played,
    total: own.length,
    rank: row?.rank ?? table.length,
    cup,
    youthStarts,
    scored: row?.goalsFor ?? 0,
    conceded: row?.goalsAgainst ?? 0,
    balance,
    over: played === own.length && cupDone,
  };
}

/** Where each objective stands, and the president's confidence that follows. */
function standingOf(objectives: readonly ObjectiveRow[], progress: SeasonProgress) {
  const statuses = new Map(objectives.map((objective) => [objective.kind, objectiveProgress(objective, progress)]));
  const chosen = objectives.find((objective) => objective.chosen);
  const confidence = boardConfidence({
    ranking: statuses.get("RANKING") ?? "ON_TRACK",
    cup: statuses.get("CUP"),
    chosen: chosen === undefined ? undefined : statuses.get(chosen.kind),
  });
  return { statuses, confidence };
}

/**
 * Before the managed club's first match of the season, inside the transaction that plays it: when the player chose no
 * optional objective, the assistant does (assistantObjective). Nothing in a save from before the objectives.
 */
export async function ensureObjectiveChosen(tx: Tx, saveId: string): Promise<void> {
  const current = await currentObjectives(tx, saveId);
  if (current === null || current.objectives.some((objective) => objective.chosen)) {
    return;
  }
  const proposed = current.objectives.map((objective) => objective.kind).filter(isOptional);
  await tx.seasonObjective.update({
    where: { seasonId_kind: { seasonId: current.season.id, kind: assistantObjective(proposed) } },
    data: { chosen: true, byAssistant: true },
    select: { id: true },
  });
}

/** After a match of the managed club, inside its transaction: the president's confidence follows its objectives. */
export async function refreshBoardConfidence(tx: Tx, saveId: string): Promise<void> {
  const current = await currentObjectives(tx, saveId);
  if (current === null) {
    return;
  }
  const progress = await readSeasonProgress(tx, saveId, current.managed, current.season);
  await tx.clubSave.update({
    where: { id: current.managed.id, saveId },
    data: { boardConfidence: standingOf(current.objectives, progress).confidence },
    select: { id: true },
  });
}

/**
 * Closes the objectives of the managed club's league season at the transition, before anything progresses or leaves:
 * each imposed objective and the chosen one get their outcome (objectiveOutcome, the season over), the others stay
 * without. Returns the budget coefficient of the next dotation (budgetCoefficient): NEUTRAL_BUDGET_COEFFICIENT for a
 * season without objectives, a save from before them.
 */
export async function closeSeasonObjectives(tx: Tx, saveId: string, seasonId: string | null): Promise<number> {
  if (seasonId === null) {
    return NEUTRAL_BUDGET_COEFFICIENT;
  }
  const objectives = (await tx.seasonObjective.findMany({ where: { saveId, seasonId }, select: OBJECTIVE_SELECT })).sort(byKind);
  if (objectives.length === 0) {
    return NEUTRAL_BUDGET_COEFFICIENT;
  }
  const managed = await managedClubOf(tx, saveId);
  const season = await tx.season.findUniqueOrThrow({
    where: { id: seasonId, saveId },
    select: { id: true, startYear: true, competition: { select: { code: true } } },
  });
  const progress = { ...(await readSeasonProgress(tx, saveId, managed, season)), over: true };
  const outcomes = new Map<ObjectiveKind, ObjectiveOutcome>();
  for (const objective of objectives.filter((candidate) => candidate.imposed || candidate.chosen)) {
    const outcome = objectiveOutcome(objective, progress);
    outcomes.set(objective.kind, outcome);
    await tx.seasonObjective.update({
      where: { seasonId_kind: { seasonId, kind: objective.kind } },
      data: { outcome },
      select: { id: true },
    });
  }
  const chosen = objectives.find((objective) => objective.chosen);
  return budgetCoefficient({
    ranking: outcomes.get("RANKING"),
    cup: outcomes.get("CUP"),
    chosen: chosen === undefined ? undefined : outcomes.get(chosen.kind),
  });
}

/** Why the player cannot choose an objective. */
export type ObjectiveChoiceRefusal = "no-objectives" | "not-proposed" | "already-chosen" | "season-started";

export class ObjectiveChoiceError extends Error {
  constructor(readonly reason: ObjectiveChoiceRefusal) {
    super(`Objective choice refused: ${reason}`);
    this.name = "ObjectiveChoiceError";
  }
}

/**
 * The player's choice of the season's optional objective, on the season's start screen: one of the three proposed,
 * once, before the managed club's first match of the season. Refused otherwise (ObjectiveChoiceError).
 */
export async function chooseObjective(saveId: string, kind: OptionalObjective): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // The save locked, as a matchday locks it (lockSave): a choice and a kick-off never cross.
    await tx.$queryRaw`SELECT "id" FROM "Save" WHERE "id" = ${saveId} FOR UPDATE`;
    const current = await currentObjectives(tx, saveId);
    if (current === null) {
      throw new ObjectiveChoiceError("no-objectives");
    }
    if (current.objectives.some((objective) => objective.chosen)) {
      throw new ObjectiveChoiceError("already-chosen");
    }
    if (!current.objectives.some((objective) => objective.kind === kind && !objective.imposed)) {
      throw new ObjectiveChoiceError("not-proposed");
    }
    const played = await tx.fixture.count({
      where: {
        saveId,
        played: true,
        season: { startYear: current.season.startYear },
        OR: [{ homeClubSaveId: current.managed.id }, { awayClubSaveId: current.managed.id }],
      },
    });
    if (played > 0) {
      throw new ObjectiveChoiceError("season-started");
    }
    await tx.seasonObjective.update({
      where: { seasonId_kind: { seasonId: current.season.id, kind } },
      data: { chosen: true },
      select: { id: true },
    });
    await tx.clubSave.update({
      where: { id: current.managed.id, saveId },
      data: { boardConfidence: standingOf(
        current.objectives.map((objective) => (objective.kind === kind ? { ...objective, chosen: true } : objective)),
        await readSeasonProgress(tx, saveId, current.managed, current.season),
      ).confidence },
      select: { id: true },
    });
  });
}

/** An objective as the screens show it: what it asks, where it stands, and the figure it is judged on. */
export type ObjectiveView = {
  kind: ObjectiveKind;
  imposed: boolean;
  chosen: boolean;
  byAssistant: boolean;
  variant: RankingVariant | null; // the ranking's
  target: number;
  exceed: number | null;
  status: ObjectiveProgress; // where it stands, or its outcome once decided
  current: number | null; // the rank, the cup round reached, the starts, the goals scored or conceded, the balance
};

/** The managed club's objectives of the season in progress, as the dashboard, the Club screen and the season start show them. */
export type SeasonObjectivesView = {
  startYear: number;
  objectives: ObjectiveView[]; // imposed, then the chosen one, or the three proposed while none is chosen
  choiceOpen: boolean; // none chosen, the club's first match of the season still to come
  confidence: number; // ClubSave.boardConfidence
  over: boolean;
};

const RANKING_VARIANTS: readonly RankingVariant[] = ["TOP", "PROMOTION", "SURVIVAL", "FINISH"];
const rankingVariant = (value: string | null): RankingVariant | null =>
  RANKING_VARIANTS.find((variant) => variant === value) ?? null;

/** The figure an objective is judged on, from the season's progress. */
function currentFigure(kind: ObjectiveKind, progress: SeasonProgress): number | null {
  switch (kind) {
    case "RANKING":
      return progress.played === 0 ? null : progress.rank;
    case "CUP":
      return progress.cup?.reached ?? null;
    case "YOUTH":
      return progress.youthStarts;
    case "ENTERTAINMENT":
      return progress.scored;
    case "SOLIDITY":
      return progress.conceded;
    case "FINANCES":
      return progress.balance;
  }
}

/** The managed club's objectives of the season in progress, or null in a save from before them. */
export async function getSeasonObjectives(saveId: string): Promise<SeasonObjectivesView | null> {
  const current = await currentObjectives(prisma, saveId);
  if (current === null) {
    return null;
  }
  const progress = await readSeasonProgress(prisma, saveId, current.managed, current.season);
  const { statuses } = standingOf(current.objectives, progress);
  const anyChosen = current.objectives.some((objective) => objective.chosen);
  const club = await prisma.clubSave.findUniqueOrThrow({ where: { id: current.managed.id }, select: { boardConfidence: true } });
  const started = await prisma.fixture.count({
    where: {
      saveId,
      played: true,
      season: { startYear: current.season.startYear },
      OR: [{ homeClubSaveId: current.managed.id }, { awayClubSaveId: current.managed.id }],
    },
  });
  return {
    startYear: current.season.startYear,
    objectives: current.objectives
      .filter((objective) => objective.imposed || objective.chosen || !anyChosen)
      .map((objective) => ({
        kind: objective.kind,
        imposed: objective.imposed,
        chosen: objective.chosen,
        byAssistant: objective.byAssistant,
        variant: rankingVariant(objective.variant),
        target: objective.target,
        exceed: objective.exceed,
        status: statuses.get(objective.kind) ?? "ON_TRACK",
        current: currentFigure(objective.kind, progress),
      })),
    choiceOpen: !anyChosen && started === 0,
    confidence: club.boardConfidence,
    over: progress.over,
  };
}

/** A season's objectives once it is over, as its review and its card show them: those that counted, with their outcome. */
export type ClosedObjectivesView = {
  objectives: { kind: ObjectiveKind; variant: RankingVariant | null; target: number; exceed: number | null; outcome: ObjectiveOutcome; byAssistant: boolean }[];
  met: number; // achieved or exceeded
  total: number;
};

/**
 * The objectives of the managed club's last completed season, the ones its current dotation's coefficient came from, and
 * that season's first year; null when that season had none (the first season of a save, a save from before them).
 */
export async function getLastClosedObjectives(saveId: string): Promise<(ClosedObjectivesView & { startYear: number }) | null> {
  const last = await prisma.seasonObjective.findFirst({
    where: { saveId, outcome: { not: null }, season: { completed: true } },
    orderBy: { season: { startYear: "desc" } },
    select: { seasonId: true, season: { select: { startYear: true } } },
  });
  if (last === null) {
    return null;
  }
  const closed = await getClosedObjectives(saveId, last.seasonId);
  return closed === null ? null : { ...closed, startYear: last.season.startYear };
}

/** The objectives of a completed season of the managed club, or null for a season without them. */
export async function getClosedObjectives(saveId: string, seasonId: string): Promise<ClosedObjectivesView | null> {
  const rows = await prisma.seasonObjective.findMany({
    where: { saveId, seasonId, outcome: { not: null } },
    select: OBJECTIVE_SELECT,
  });
  const objectives = rows.sort(byKind).flatMap((row) =>
    row.outcome === null
      ? []
      : [{ kind: row.kind, variant: rankingVariant(row.variant), target: row.target, exceed: row.exceed, outcome: row.outcome, byAssistant: row.byAssistant }],
  );
  if (objectives.length === 0) {
    return null;
  }
  return { objectives, met: objectives.filter((objective) => objective.outcome !== "MISSED").length, total: objectives.length };
}
