import type { ContractChoice, ContractIntention } from "../engine/assistant-contracts";
import { displayClubName } from "../engine/club-name";
import type { AttributeName } from "../engine/generation";
import type { Position } from "../engine/positions";
import { seasonEndDate, seasonStartDate, seasonStartYear } from "../engine/world";
import { youthKeyPrefix } from "../engine/youth";
import type { Prisma } from "../generated/prisma/client";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { prisma } from "./client";
import { contractChoiceOf, managedContractForecasts } from "./contracts";
import type { NationCode } from "../engine/nations";
import { parseTitleKey, type TournamentCode } from "../engine/tournaments";
import { getManagedBreak, internationalInjuries } from "./nations-view";
import { DISCIPLINE_SELECT, disciplineStatus, matchesAhead, type DisciplineStatus, type MatchesAhead } from "./discipline-view";
import { fitnessAtKickOff } from "./fitness-view";
import { progressionHistory, summerOutlook, type PlayerProgression } from "./progression-view";
import { parseSeasonHighlights } from "./season-highlights";

/**
 * What the managed club still has to play: its next match, its day and competition, null once it has none left, and the
 * competitions it still has a match in. What its players are picked for, and judged on: fitness, injuries, suspensions.
 * Its fixtures are read by its id, on the home and away indexes (a filter on its ClubSave row would read every fixture
 * of the save); the caller who already has its id passes it.
 */
export async function managedMatchesAhead(saveId: string, managedClubSaveId?: string): Promise<MatchesAhead> {
  const clubSaveId =
    managedClubSaveId ??
    (await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } })).id;
  const fixtures = await prisma.fixture.findMany({
    where: { saveId, played: false, OR: [{ homeClubSaveId: clubSaveId }, { awayClubSaveId: clubSaveId }] },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true, season: { select: { competition: { select: { kind: true } } } } },
  });
  return matchesAhead(fixtures.map(({ scheduledAt, season }) => ({ date: scheduledAt, competition: season.competition.kind })));
}

export type TransferKind = "TRANSFER" | "LOAN" | "FREE" | "RETIREMENT";

export type SeasonStatsView = {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
};

export type TransferHistoryItem = {
  id: string;
  date: Date;
  type: TransferKind;
  fee: number;
  fromClubName: string | null;
  toClubName: string | null;
};

/** What the player sheet shows of a player, wherever he plays. */
export type PlayerProfile = {
  id: string;
  playerKey: string;
  firstName: string;
  lastName: string;
  nationality: string;
  birthDate: Date;
  age: number;
  position: Position;
  clubName: string | null; // current club; null for a free agent or a retired player
  clubColors: ClubColors | null; // colors of the current club, for the shirt of his face
  overall: number;
  potential: number;
  form: number;
  // 0–100: a player of the managed club's at the kick-off of its next match (fitnessAtKickOff), the lineup page's figure;
  // anyone else's, or once the club has no match left, today's. Morale is no screen's: it is not read.
  fitness: number;
  fitnessAtNextMatch: boolean; // the fitness is the next match's
  // A player of the managed club's suspensions and yellow cards at risk, against its next match and the competitions it
  // still plays (disciplineStatus); null for anyone else's, whose club's matches are not read.
  discipline: DisciplineStatus | null;
  marketValue: number; // euros, as stored: set when the player enters the save, recomputed at each season transition
  wage: number; // euros per season: never shown, only a release's cost reads it (docs/design/simplification.md § 1.2)
  contractUntil: Date | null;
  injuredUntil: Date | null; // only while still injured at the current date
  contractExpiring: boolean; // the contract ends with the current season
  managed: boolean; // a player of the managed club: an AI club decides its own players' contracts
  // A contract of the managed club ending with the season (docs/design/simplification.md § 2.3), null for anyone else's:
  // its player's choice for it, what the season's turn will do with it (the choice, the assistant's rule, or a free
  // departure: contractForecasts), and what the assistant's rule would do without the choice, null when its player keeps
  // the contracts. From the squad and the free agents of today: the turn's come after a season of progress.
  contractChoice: ContractChoice | null;
  contractIntention: ContractIntention | null;
  assistantIntention: ContractIntention | null;
  arrivedThisSeason: boolean; // young player who joined at this season's preseason
  // The summer passed and, for a player of the managed club, the summer to come and his rating season by season at the
  // club (docs/design/effectif-adjoint.md § 3): the squad's « 71 ↑+4 » and « +3 expected », the sheet's curve.
  progression: PlayerProgression;
  attributes: Record<AttributeName, number>;
  seasonStats: SeasonStatsView; // every competition's
  transfers: TransferHistoryItem[]; // most recent first
  // His national team (docs/design/selections.md): caps and goals over his career; for a player of the managed club, the
  // break his nation calls him for (from the club's last match before it) and the injury he came back with from one.
  international: {
    caps: number;
    goals: number;
    calledFor: { nation: NationCode; from: Date; to: Date } | null;
    injuredWith: { nation: NationCode; on: Date } | null;
    titles: { tournament: TournamentCode; year: number }[]; // the summer tournaments he won with his nation, oldest first
  };
};

const EMPTY_STATS: SeasonStatsView = { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };

/** The injury a player came back with from a break, while it is the one he is out with: its end is his injury's. */
function injuredWithOf(
  player: { injuredUntil: Date | null },
  abroad: { nation: NationCode; on: Date; until: Date } | undefined,
  currentDate: Date,
): PlayerProfile["international"]["injuredWith"] {
  return abroad !== undefined && player.injuredUntil !== null && player.injuredUntil > currentDate && player.injuredUntil.getTime() === abroad.until.getTime()
    ? { nation: abroad.nation, on: abroad.on }
    : null;
}

/**
 * Profiles of the save's players matching `where`: identity, ratings, condition, contract, what the season's turn will do
 * with a contract of the managed club ending with the season, statistics of the current season and transfer history. The
 * save's id always scopes the query, whatever `where` says.
 */
export async function getPlayerProfiles(saveId: string, where: Prisma.PlayerSaveWhereInput): Promise<PlayerProfile[]> {
  const save = await prisma.save.findUniqueOrThrow({
    where: { id: saveId },
    select: { currentDate: true, contractsByAssistant: true },
  });
  const startYear = seasonStartYear(save.currentDate);
  const lastContractDay = seasonEndDate(startYear);

  const players = await prisma.playerSave.findMany({
    where: { ...where, saveId },
    select: {
      id: true,
      playerKey: true,
      firstName: true,
      lastName: true,
      nationality: true,
      birthDate: true,
      position: true,
      clubSaveId: true,
      overall: true,
      previousOverall: true,
      potential: true,
      pace: true,
      shooting: true,
      passing: true,
      dribbling: true,
      defending: true,
      physical: true,
      goalkeeping: true,
      form: true,
      fitness: true,
      marketValue: true,
      wage: true,
      contractUntil: true,
      contractChoice: true,
      injuredUntil: true,
      caps: true,
      internationalGoals: true,
      internationalTitles: true,
      ...DISCIPLINE_SELECT,
      clubSave: {
        select: { isManaged: true, club: { select: { slug: true, name: true, primaryColor: true, secondaryColor: true } } },
      },
    },
  });
  const playerIds = players.map((player) => player.id);

  // The managed club's players are picked for its next match: their fitness and their suspensions are that match's. Read
  // only when one of them is among the players.
  const managedAmong = players.some((player) => player.clubSave?.isManaged === true);
  const ahead = managedAmong ? await managedMatchesAhead(saveId) : null;
  const nextMatchDay = ahead?.next?.date ?? null;
  // Their international break, about to be played, and the injuries they came back with from the season's.
  const managedBreak = managedAmong ? await getManagedBreak(saveId) : null;
  const injuriesAbroad = managedAmong ? await internationalInjuries(saveId, startYear) : new Map<string, { nation: NationCode; on: Date; until: Date }>();
  const calledFor = new Map(
    managedBreak?.state === "upcoming"
      ? managedBreak.players.map((player) => [player.playerKey, { nation: player.nation, from: managedBreak.from, to: managedBreak.to }] as const)
      : [],
  );
  // What the season's turn will do with their contracts ending on 30 June, read from the whole squad and the free agents
  // only when one of them is among the players.
  const expiring = (player: (typeof players)[number]): boolean =>
    player.contractUntil !== null && player.contractUntil <= lastContractDay;
  const forecasts = players.some((player) => player.clubSave?.isManaged === true && expiring(player))
    ? await managedContractForecasts(saveId, { startYear, byAssistant: save.contractsByAssistant })
    : null;

  // Their progression (docs/design/effectif-adjoint.md § 3), for the managed club's players only: their league minutes of
  // the season, every club's, as the season's turn counts them (the cup and Europe never); their club's league matches
  // of the season, played and in all, to prorate them; its completed seasons' highlights (SeasonResult), the curve's points.
  const managedIds = players.flatMap((player) => (player.clubSave?.isManaged === true ? [player.id] : []));
  const managedClubSaveId = players.find((player) => player.clubSave?.isManaged === true)?.clubSaveId ?? null;
  const ofTheLeague = { startYear, competition: { kind: "LEAGUE" as const } };

  const [stats, transfers, leagueStats, clubLeagueFixtures, results] = await Promise.all([
    prisma.playerSeasonStats.groupBy({
      by: ["playerSaveId"],
      where: { saveId, playerSaveId: { in: playerIds }, season: { startYear } },
      _sum: { appearances: true, minutes: true, goals: true, assists: true, yellowCards: true, redCards: true },
    }),
    prisma.transfer.findMany({
      where: { saveId, playerSaveId: { in: playerIds } },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      select: { id: true, playerSaveId: true, date: true, type: true, fee: true, fromClubId: true, toClubId: true },
    }),
    managedIds.length === 0
      ? []
      : prisma.playerSeasonStats.groupBy({
          by: ["playerSaveId"],
          where: { saveId, playerSaveId: { in: managedIds }, season: ofTheLeague },
          _sum: { minutes: true },
        }),
    // By the club's id, on the home and away indexes.
    managedClubSaveId === null
      ? []
      : prisma.fixture.findMany({
          where: { saveId, OR: [{ homeClubSaveId: managedClubSaveId }, { awayClubSaveId: managedClubSaveId }], season: ofTheLeague },
          select: { played: true },
        }),
    managedIds.length === 0
      ? []
      : prisma.seasonResult.findMany({ where: { saveId }, select: { highlights: true, season: { select: { startYear: true } } } }),
  ]);
  const leagueMinutesOf = new Map(leagueStats.map((row) => [row.playerSaveId, row._sum.minutes ?? 0]));
  const clubLeague = { played: clubLeagueFixtures.filter((fixture) => fixture.played).length, matches: clubLeagueFixtures.length };
  const highlightSeasons = results.flatMap((result) => {
    const highlights = parseSeasonHighlights(result.highlights);
    return highlights === null ? [] : [{ startYear: result.season.startYear, squad: highlights.squad }];
  });
  // Until a career turns a season with previousOverall, its last season's highlights give the managed club's players their
  // rating of before: those who ended it at the club.
  const lastHighlights = highlightSeasons.find((season) => season.startYear === startYear - 1);
  const nextFirstJuly = seasonStartDate(startYear + 1);

  const progressionOf = (player: (typeof players)[number], managed: boolean): PlayerProgression => {
    const previous =
      player.previousOverall ??
      (managed ? (lastHighlights?.squad.find((squadPlayer) => squadPlayer.playerKey === player.playerKey)?.overall ?? null) : null);
    return {
      last: previous === null ? null : player.overall - previous,
      outlook: managed
        ? summerOutlook(player, ageInYears(player.birthDate, nextFirstJuly), leagueMinutesOf.get(player.id) ?? 0, clubLeague)
        : null,
      history: managed
        ? progressionHistory(player.playerKey, highlightSeasons, { startYear, overall: player.overall, potential: player.potential })
        : [],
    };
  };

  const clubIds = [...new Set(transfers.flatMap((transfer) => [transfer.fromClubId, transfer.toClubId]))].filter(
    (id): id is string => id !== null,
  );
  const clubs = await prisma.club.findMany({ where: { id: { in: clubIds } }, select: { id: true, slug: true, name: true } });
  const clubName = new Map(clubs.map((row) => [row.id, displayClubName(row)]));
  const statsByPlayer = new Map(stats.map((row) => [row.playerSaveId, row._sum]));
  const youthPrefix = youthKeyPrefix(startYear);

  return players.map((player) => {
    const playerStats = statsByPlayer.get(player.id);
    const managed = player.clubSave?.isManaged === true;
    const atNextMatch = managed && nextMatchDay !== null;
    const forecast = managed ? forecasts?.get(player.playerKey) : undefined;
    return {
      id: player.id,
      playerKey: player.playerKey,
      firstName: player.firstName,
      lastName: player.lastName,
      nationality: player.nationality,
      birthDate: player.birthDate,
      age: ageInYears(player.birthDate, save.currentDate),
      position: player.position,
      clubName: player.clubSave === null ? null : displayClubName(player.clubSave.club),
      clubColors: player.clubSave === null ? null : clubColorsOf(player.clubSave.club),
      overall: player.overall,
      potential: player.potential,
      form: player.form,
      fitness: atNextMatch ? fitnessAtKickOff(player.fitness, save.currentDate, nextMatchDay) : player.fitness,
      fitnessAtNextMatch: atNextMatch,
      discipline: managed && ahead !== null ? disciplineStatus(player, ahead) : null,
      marketValue: player.marketValue,
      wage: player.wage,
      contractUntil: player.contractUntil,
      injuredUntil: player.injuredUntil !== null && player.injuredUntil > save.currentDate ? player.injuredUntil : null,
      contractExpiring: expiring(player),
      managed,
      contractChoice: forecast === undefined ? null : contractChoiceOf(player.contractChoice),
      contractIntention: forecast?.outcome.intention ?? null,
      assistantIntention: forecast?.assistant ?? null,
      arrivedThisSeason: player.playerKey.startsWith(youthPrefix),
      progression: progressionOf(player, managed),
      attributes: {
        pace: player.pace,
        shooting: player.shooting,
        passing: player.passing,
        dribbling: player.dribbling,
        defending: player.defending,
        physical: player.physical,
        goalkeeping: player.goalkeeping,
      },
      international: {
        caps: player.caps,
        goals: player.internationalGoals,
        calledFor: managed ? (calledFor.get(player.playerKey) ?? null) : null,
        injuredWith: injuredWithOf(player, injuriesAbroad.get(player.playerKey), save.currentDate),
        titles: player.internationalTitles
          .flatMap((key) => {
            const title = parseTitleKey(key);
            return title === null ? [] : [title];
          })
          .sort((a, b) => a.year - b.year),
      },
      seasonStats:
        playerStats === undefined
          ? EMPTY_STATS
          : {
              appearances: playerStats.appearances ?? 0,
              minutes: playerStats.minutes ?? 0,
              goals: playerStats.goals ?? 0,
              assists: playerStats.assists ?? 0,
              yellowCards: playerStats.yellowCards ?? 0,
              redCards: playerStats.redCards ?? 0,
            },
      transfers: transfers
        .filter((transfer) => transfer.playerSaveId === player.id)
        .map((transfer) => ({
          id: transfer.id,
          date: transfer.date,
          type: transfer.type,
          fee: transfer.fee,
          fromClubName: transfer.fromClubId === null ? null : (clubName.get(transfer.fromClubId) ?? null),
          toClubName: transfer.toClubId === null ? null : (clubName.get(transfer.toClubId) ?? null),
        })),
    };
  });
}
