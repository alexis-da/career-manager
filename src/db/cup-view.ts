import { displayClubName } from "../engine/club-name";
import { CUP_ROUNDS } from "../engine/balance";
import { cupCode, cupDates } from "../engine/cup";
import { countryOf } from "../engine/promotion";
import { FIXTURE_SELECT, toFixtureView, type FixtureView, type TeamView } from "./calendar";
import { prisma } from "./client";
import { clubOf, clubsOfSave, readArchivedSeason } from "./season-archive";

// What the screens show of a cup: the bracket of the managed club's country, and a season's line on it. Reads only.

/** A tie of a cup, with the club through once it is played. */
export type CupTieView = FixtureView & { winnerClubSaveId: string | null };

export type CupRoundView = {
  round: number; // 1 preliminary … 6 final
  date: Date;
  ties: CupTieView[]; // empty until the round is drawn; the managed club's tie first
};

/** The managed club in its cup: entering at a round, still in, out at a round, or the winner. */
export type ManagedCupRun = {
  firstRound: number; // 1 from the preliminary round, 2 when exempt from it
  lastRound: number; // the last round it played or is drawn in
  status: "in" | "out" | "won";
};

export type CupBracket = {
  seasonId: string;
  startYear: number;
  competitionCode: string; // « fr.cup », named by the screens
  rounds: CupRoundView[]; // all CUP_ROUNDS, drawn or not
  winner: TeamView | null; // once the final is played
  managedRun: ManagedCupRun | null; // null before the club is drawn
};

/** The managed club's cup code: its country's, whichever division it plays in. */
async function managedCup(saveId: string): Promise<{ clubSaveId: string; code: string }> {
  const managed = await prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { id: true, competition: { select: { code: true } } },
  });
  return { clubSaveId: managed.id, code: cupCode(countryOf(managed.competition.code)) };
}

const TIE_SELECT = { ...FIXTURE_SELECT, winnerClubSaveId: true } as const;

function runOf(ties: readonly CupTieView[], clubSaveId: string): ManagedCupRun | null {
  const own = ties.filter((tie) => tie.home.clubSaveId === clubSaveId || tie.away.clubSaveId === clubSaveId);
  const last = own.at(-1);
  const first = own.at(0);
  if (last === undefined || first === undefined) {
    return null;
  }
  const lost = own.some((tie) => tie.played && tie.winnerClubSaveId !== clubSaveId);
  const won = last.round === CUP_ROUNDS && last.played && last.winnerClubSaveId === clubSaveId;
  return { firstRound: first.round, lastRound: last.round, status: won ? "won" : lost ? "out" : "in" };
}

/**
 * The latest cup of the managed club's country, round by round, with the dates of the rounds still to draw; null when
 * the save has none (a worldVersion 1 save, or a save without cups).
 */
export async function getCupBracket(saveId: string): Promise<CupBracket | null> {
  const { clubSaveId, code } = await managedCup(saveId);
  const season = await prisma.season.findFirst({
    where: { saveId, competition: { code } },
    orderBy: { startYear: "desc" },
    select: { id: true, startYear: true, competition: { select: { code: true } } },
  });
  if (season === null) {
    return null;
  }
  const rows = await prisma.fixture.findMany({
    where: { saveId, seasonId: season.id },
    orderBy: [{ round: "asc" }, { scheduledAt: "asc" }],
    select: TIE_SELECT,
  });
  const ties = rows.map((row): CupTieView => ({ ...toFixtureView(row), winnerClubSaveId: row.winnerClubSaveId }));
  const involves = (tie: FixtureView): boolean => tie.home.clubSaveId === clubSaveId || tie.away.clubSaveId === clubSaveId;
  const dates = cupDates(season.startYear);

  const rounds = dates.map((date, index): CupRoundView => {
    const round = index + 1;
    const ofRound = ties
      .filter((tie) => tie.round === round)
      .sort((a, b) => Number(involves(b)) - Number(involves(a)) || a.home.name.localeCompare(b.home.name, "fr"));
    return { round, date, ties: ofRound };
  });
  const final = ties.find((tie) => tie.round === CUP_ROUNDS && tie.played);
  const winner =
    final === undefined ? null : final.winnerClubSaveId === final.home.clubSaveId ? final.home : final.winnerClubSaveId === final.away.clubSaveId ? final.away : null;

  return {
    seasonId: season.id,
    startYear: season.startYear,
    competitionCode: season.competition.code,
    rounds,
    winner,
    managedRun: runOf(ties, clubSaveId),
  };
}

/** Whether the save has a cup: its navigation shows « Coupe » then. */
export async function hasCup(saveId: string): Promise<boolean> {
  return (await prisma.season.count({ where: { saveId, competition: { kind: "CUP" } } })) > 0;
}

/**
 * The winner of the managed club's country's cup of a season, by its displayed name; null without a final played. A
 * completed season's from its archive once it has one (src/db/season-archive.ts).
 */
export async function getCupWinnerName(saveId: string, startYear: number): Promise<string | null> {
  const { code } = await managedCup(saveId);
  const season = await prisma.season.findFirst({ where: { saveId, startYear, competition: { code } }, select: { id: true } });
  if (season === null) {
    return null;
  }
  const archived = await readArchivedSeason(prisma, saveId, season.id);
  if (archived !== null) {
    const winnerId = archived.fixtures.find((fixture) => fixture.round === CUP_ROUNDS && fixture.played)?.winnerClubSaveId ?? null;
    if (winnerId === null) {
      return null;
    }
    const clubs = await clubsOfSave(prisma, saveId, [winnerId]);
    return displayClubName(clubOf(clubs, winnerId).club);
  }
  const final = await prisma.fixture.findFirst({
    where: { saveId, seasonId: season.id, round: CUP_ROUNDS, played: true },
    select: { winnerClubSave: { select: { club: { select: { slug: true, name: true } } } } },
  });
  return final?.winnerClubSave === null || final === null ? null : displayClubName(final.winnerClubSave.club);
}
