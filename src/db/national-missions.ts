import {
  COACH_STAGES,
  federationObjective,
  managerPrestige,
  NATIONAL_COACH_ENABLED,
  nationalOffers,
  objectiveVerdict,
  qualifiesFrom,
  stageReached,
  type CoachStage,
  type ObjectiveVerdict,
  type PrestigeSeason,
} from "../engine/national-coach";
import { isNationCode, nationByCode, type NationCode } from "../engine/nations";
import { cycleOf, FINAL_ROUND, QUALIFIER_EUROPE, QUALIFIER_WORLD, SEMI_FINAL_ROUND, tournamentEnding } from "../engine/tournaments";
import { Prisma } from "../generated/prisma/client";
import { readQualifierTables, readStrengths } from "./nations";
import type { NationalSession } from "./national-team";

// The national coach's missions (docs/design/selections.md § 5): the federations' offers at a season's transition, the
// objective of each cycle, the end of a mission when its nation does not qualify or its tournament falls short of the
// objective. Never anything for his club: neither confidence, nor budget, nor reputation. The player's own moves (accept,
// decline, leave, his list and his lineup) are in national-coach.ts.

type Transaction = Prisma.TransactionClient;

/** The managed club's prestige for the federations: its reputation, its last two seasons' trophies, his tournaments past the objective. */
export async function coachPrestige(db: Transaction, saveId: string): Promise<number> {
  const club = await db.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { reputation: true } });
  const results = await db.seasonResult.findMany({
    where: { saveId },
    orderBy: { season: { startYear: "desc" } },
    take: 2,
    select: { trophies: true, promoted: true, rank: true, competition: { select: { tier: true } } },
  });
  const spells = await db.coachSpell.findMany({ where: { saveId }, select: { exceeded: true } });
  const seasons: PrestigeSeason[] = results.map((result) => ({
    tier: result.competition.tier,
    champion: result.trophies.includes("champion"),
    cup: result.trophies.includes("cup"),
    europe: result.trophies.includes("europe"),
    promoted: result.promoted,
  }));
  return managerPrestige({ reputation: club.reputation, seasons, exceededTournaments: spells.reduce((sum, spell) => sum + spell.exceeded, 0) });
}

/**
 * The federations' offers at the transition to the season starting in startYear (§ 5.1), once the season's nations are
 * open (their strengths at a cycle's opening): last season's offers withdrawn; then, for a player who coaches no nation in
 * a save with nations, never a challenge's, up to two federations whose threshold his prestige reaches, the nation he has
 * just left aside. Returns the nations offering.
 */
export async function openCoachOffers(
  tx: Transaction,
  save: { id: string; seed: string; nationCode: string | null; challengeId: string | null },
  startYear: number,
): Promise<NationCode[]> {
  await tx.nationSave.updateMany({ where: { saveId: save.id, offeredIn: { not: null } }, data: { offeredIn: null } });
  if (!NATIONAL_COACH_ENABLED || save.challengeId !== null || save.nationCode !== null) {
    return [];
  }
  const strengths = await readStrengths(tx, save.id);
  const recent = await tx.coachSpell.findMany({ where: { saveId: save.id, toYear: { gte: startYear - 1 } }, select: { code: true } });
  const offers = nationalOffers({
    prestige: await coachPrestige(tx, save.id),
    strengths,
    excluded: new Set(recent.flatMap((spell) => (isNationCode(spell.code) ? [spell.code] : []))),
    saveSeed: save.seed,
    startYear,
  });
  if (offers.length > 0) {
    await tx.nationSave.updateMany({ where: { saveId: save.id, code: { in: offers } }, data: { offeredIn: startYear } });
  }
  return offers;
}

/** The mission in progress of a save, its last if none. */
export async function currentSpell(db: Transaction, saveId: string) {
  return db.coachSpell.findFirst({ where: { saveId, toYear: null }, orderBy: { createdAt: "desc" } });
}

/** Ends the mission in progress: its last season, how it ended; the save coaches no nation any more. */
export async function endSpell(tx: Transaction, saveId: string, toYear: number, outcome: "RESIGNED" | "NOT_QUALIFIED" | "MISSED"): Promise<void> {
  const spell = await currentSpell(tx, saveId);
  if (spell !== null) {
    await tx.coachSpell.update({ where: { id: spell.id, saveId }, data: { toYear, outcome } });
    await tx.nationSave.updateMany({ where: { saveId, code: spell.code }, data: { callUp: Prisma.DbNull, squad: Prisma.DbNull } });
  }
  await tx.save.update({ where: { id: saveId }, data: { nationCode: null } });
}

/** The federation's objective for the cycle of a season, by the nation's strength among those aiming at its tournament. */
export async function objectiveFor(tx: Transaction, saveId: string, code: NationCode, cyclesFrom: number | null, startYear: number) {
  const cycle = cycleOf(cyclesFrom, startYear);
  if (cycle === null) {
    return { objective: null, objectiveYear: null };
  }
  const strengths = await readStrengths(tx, saveId);
  return { objective: federationObjective(code, cycle.tournament, strengths), objectiveYear: cycle.tournamentYear };
}

/** How a coached nation ended a tournament: the stage reached against the objective. */
export type CoachTournament = { code: NationCode; tournament: string; year: number; objective: CoachStage | null; stage: CoachStage; verdict: ObjectiveVerdict | null };

/**
 * At the transition that closes the season starting in completedStartYear: when it ended a cycle and the player coaches
 * a nation aiming at its tournament, the stage it reached against the objective (§ 5.3): below it, the end of the
 * mission (MISSED); past it, one more tournament exceeded (+5 of prestige). Returns how it went, null without.
 */
export async function closeCoachSeason(tx: Transaction, saveId: string, completedStartYear: number, cyclesFrom: number | null): Promise<CoachTournament | null> {
  const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { nationCode: true } });
  const cycle = tournamentEnding(cyclesFrom, completedStartYear);
  const spell = await currentSpell(tx, saveId);
  if (cycle === null || save.nationCode === null || !isNationCode(save.nationCode) || spell === null || spell.objective === null) {
    return null;
  }
  const code = save.nationCode;
  const matches = await tx.internationalMatch.findMany({
    where: { saveId, competition: cycle.tournament, startYear: completedStartYear, played: true },
    select: { round: true, home: true, away: true, winner: true },
  });
  const stage = stageReached(
    code,
    matches.flatMap((match) =>
      isNationCode(match.home) && isNationCode(match.away)
        ? [{ round: match.round, home: match.home, away: match.away, winner: match.winner !== null && isNationCode(match.winner) ? match.winner : null }]
        : [],
    ),
    SEMI_FINAL_ROUND,
    FINAL_ROUND,
  );
  const objective = spell.objective as CoachStage;
  const verdict = objectiveVerdict(objective, stage);
  if (verdict === "MISSED") {
    await endSpell(tx, saveId, completedStartYear, "MISSED");
  } else if (verdict === "EXCEEDED") {
    await tx.coachSpell.update({ where: { id: spell.id, saveId }, data: { exceeded: { increment: 1 } } });
  }
  return { code, tournament: cycle.tournament, year: cycle.tournamentYear, objective, stage, verdict };
}

/** At a new cycle's opening, the coached nation's new objective, from its strength at that opening. */
export async function refreshCoachObjective(tx: Transaction, saveId: string, cyclesFrom: number | null, startYear: number): Promise<void> {
  const cycle = cycleOf(cyclesFrom, startYear);
  const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { nationCode: true } });
  const spell = await currentSpell(tx, saveId);
  if (cycle === null || cycle.season !== 0 || save.nationCode === null || !isNationCode(save.nationCode) || spell === null) {
    return;
  }
  await tx.coachSpell.update({ where: { id: spell.id, saveId }, data: await objectiveFor(tx, saveId, save.nationCode, cyclesFrom, startYear) });
}

/**
 * Once a break of the coach ends: when it played the last qualifiers of his cycle and his nation aims at its tournament
 * without qualifying, the federation ends his mission (§ 5.3, « La fédération met fin à ta mission »). Returns whether.
 */
export async function checkCoachQualification(
  tx: Transaction,
  save: { id: string; nationCode: NationCode; cyclesFrom: number | null },
  session: NationalSession,
): Promise<boolean> {
  if (session.kind !== "break") {
    return false;
  }
  const cycle = cycleOf(save.cyclesFrom, session.startYear);
  const spell = await currentSpell(tx, save.id);
  if (cycle === null || cycle.season !== 1 || spell === null || spell.objective === null) {
    return false;
  }
  const left = await tx.internationalMatch.count({
    where: { saveId: save.id, played: false, competition: { in: [QUALIFIER_EUROPE, QUALIFIER_WORLD] }, startYear: { in: [cycle.startYear, cycle.startYear + 1] } },
  });
  if (left > 0) {
    return false;
  }
  const strengths = await readStrengths(tx, save.id);
  const tables = await readQualifierTables(tx, save.id, cycle, strengths);
  const table = nationByCode(save.nationCode).zone === "EUROPE" ? tables.europe : tables.world;
  if (qualifiesFrom(save.nationCode, cycle.tournament, table)) {
    return false;
  }
  await endSpell(tx, save.id, session.startYear, "NOT_QUALIFIED");
  return true;
}

/** Whether the season's offers are still open: the managed club has not played its first match of the season. */
export async function offersStillOpen(db: Transaction, saveId: string, startYear: number): Promise<boolean> {
  const managed = await db.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
  const played = await db.fixture.count({
    where: { saveId, played: true, season: { startYear }, OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }] },
  });
  return played === 0;
}

export { COACH_STAGES };
