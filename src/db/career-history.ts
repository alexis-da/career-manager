import { CUP_ROUNDS } from "../engine/balance";
import {
  attributedLines,
  careerHistory,
  type CareerHistory,
  type CurrentSeason,
  type HistoryContext,
  type HistoryKind,
  type HistoryLine,
  type HistoryMatch,
  type HistoryPlayer,
  type HistorySeason,
  type HistoryTier,
  type HistoryTransfer,
  type PlayerTimeline,
  type StatsRow,
} from "../engine/career-history";
import { displayClubName } from "../engine/club-name";
import { CUPS_ENABLED } from "../engine/cup";
import { EUROPE_ENABLED, EUROPE_STAGES, isEuropeCode } from "../engine/europe";
import type { ClubMove } from "../engine/season-result";
import { computeStandings } from "../engine/standings";
import { seasonEndDate } from "../engine/world";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { ageInYears } from "../lib/dates";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { clubEuropeRun } from "./europe";
import { readArchivedSeasonsOfClub } from "./season-archive";
import type { HighlightTitle } from "../engine/season-highlights";
import { parseSeasonHighlights } from "./season-highlights";
import { ensureSeasonResults } from "./season-results";

// The managed club's career history (chantier « historique », docs/design/historique.md): what the History tab, the
// season's review and the career card read. Two parts: the completed seasons (readCompletedCareer), which never change
// once over and which the page keeps in the server's cache by the last completed year; and what moves with the season
// in progress (readLiveCareer): its matches and lines, the players as they are now, the transfers. Scoped by saveId.

type Db = PrismaClient | Prisma.TransactionClient;

const tierOf = (tier: number): HistoryTier => (tier === 2 ? 2 : 1);

const KINDS: Record<string, HistoryKind> = { LEAGUE: "LEAGUE", CUP: "CUP", EUROPE: "EUROPE" };

/** The managed club, as the history reads it. */
async function managedOf(db: Db, saveId: string) {
  return db.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: {
      id: true,
      clubId: true,
      club: { select: { slug: true, primaryColor: true, secondaryColor: true } },
      competition: { select: { code: true, tier: true } },
    },
  });
}

/** The players who were ever at the club: its squad, and every player with a move to or from it. */
async function careerPlayerIds(db: Db, saveId: string, managed: { id: string; clubId: string }): Promise<{ ids: string[]; moves: { playerSaveId: string; fee: number; date: Date; fromClubId: string | null; toClubId: string | null; type: string }[] }> {
  const [squad, moves] = [
    await db.playerSave.findMany({ where: { saveId, clubSaveId: managed.id }, select: { id: true } }),
    await db.transfer.findMany({
      where: { saveId, OR: [{ toClubId: managed.clubId }, { fromClubId: managed.clubId }] },
      select: { playerSaveId: true, fee: true, date: true, fromClubId: true, toClubId: true, type: true },
    }),
  ];
  return { ids: [...new Set([...squad.map((player) => player.id), ...moves.map((move) => move.playerSaveId)])], moves };
}

/**
 * Each player as the history reads him: his key, his identity and his club now (a Club.id), and every move of his,
 * what attributedLines needs.
 */
async function timelinesOf(db: Db, saveId: string, playerIds: readonly string[]) {
  const players = await db.playerSave.findMany({
    where: { saveId, id: { in: [...playerIds] } },
    select: {
      id: true,
      playerKey: true,
      firstName: true,
      lastName: true,
      position: true,
      overall: true,
      birthDate: true,
      clubSaveId: true,
      clubSave: { select: { clubId: true } },
    },
  });
  const moves = await db.transfer.findMany({
    where: { saveId, playerSaveId: { in: [...playerIds] } },
    select: { playerSaveId: true, date: true, fromClubId: true, toClubId: true },
  });
  const movesOf = Map.groupBy(moves, (move) => move.playerSaveId);
  const keyOf = new Map(players.map((player) => [player.id, player.playerKey]));
  const timelines = new Map<string, PlayerTimeline>(
    players.map((player) => [
      player.playerKey,
      {
        currentClubId: player.clubSave?.clubId ?? null,
        moves: (movesOf.get(player.id) ?? []).map(({ date, fromClubId, toClubId }): ClubMove => ({ date, fromClubId, toClubId })),
      },
    ]),
  );
  return { keyOf, timelines, players };
}

/** A fixture of the managed club, played, as the history keeps it. */
function historyMatch(
  fixture: {
    scheduledAt: Date;
    round: number;
    homeClubSaveId: string;
    awayClubSaveId: string;
    homeGoals: number | null;
    awayGoals: number | null;
    decidedBy: string | null;
  },
  managedId: string,
  season: { startYear: number; kind: HistoryKind; code: string },
): HistoryMatch {
  const home = fixture.homeClubSaveId === managedId;
  return {
    date: fixture.scheduledAt.getTime(),
    startYear: season.startYear,
    kind: season.kind,
    competitionCode: season.code,
    round: fixture.round,
    opponentClubSaveId: home ? fixture.awayClubSaveId : fixture.homeClubSaveId,
    home,
    goalsFor: (home ? fixture.homeGoals : fixture.awayGoals) ?? 0,
    goalsAgainst: (home ? fixture.awayGoals : fixture.homeGoals) ?? 0,
    penalties: fixture.decidedBy === "PENALTIES",
  };
}

/** The completed part of a career: its seasons, its matches and its players' lines for the club. JSON throughout. */
export type CompletedCareer = { seasons: HistorySeason[]; matches: HistoryMatch[]; lines: HistoryLine[] };

/** The last completed year of a save, the key of its completed career in the server's cache; null before any. */
export async function lastCompletedYear(db: Db, saveId: string): Promise<number | null> {
  const season = await db.season.findFirst({ where: { saveId, completed: true }, orderBy: { startYear: "desc" }, select: { startYear: true } });
  return season?.startYear ?? null;
}

/**
 * The managed club's completed seasons (cahier § 2, § 7): each SeasonResult (rebuilt first if missing) with its closed
 * objectives, its budget and its highlights; its matches of every completed competition season, from their rows or
 * their archive; its players' lines of those seasons, attributed to the club (attributedLines) from the rows or the
 * archive's statistics. Never changes once its seasons are over.
 */
export async function readCompletedCareer(db: Db, saveId: string): Promise<CompletedCareer> {
  await ensureSeasonResults(db as Prisma.TransactionClient, saveId);
  const managed = await managedOf(db, saveId);
  const results = await db.seasonResult.findMany({
    where: { saveId },
    select: {
      seasonId: true,
      rank: true,
      points: true,
      played: true,
      won: true,
      drawn: true,
      lost: true,
      goalsFor: true,
      goalsAgainst: true,
      trophies: true,
      cupRound: true,
      europeCode: true,
      europeStage: true,
      promoted: true,
      relegated: true,
      bestPlayerKey: true,
      bestPlayerName: true,
      bestPlayerPosition: true,
      bestPlayerGoals: true,
      bestPlayerAssists: true,
      bestPlayerRating: true,
      highlights: true,
      season: { select: { startYear: true } },
      competition: { select: { code: true, tier: true } },
    },
  });
  const objectives = await db.seasonObjective.findMany({ where: { saveId, outcome: { not: null } }, select: { seasonId: true, outcome: true } });
  const budgets = await db.seasonBudget.findMany({ where: { saveId }, select: { seasonId: true, budget: true } });
  const bestPlayerBirth = await db.playerSave.findMany({
    where: { saveId, playerKey: { in: results.flatMap((row) => (row.bestPlayerKey === null ? [] : [row.bestPlayerKey])) } },
    select: { playerKey: true, birthDate: true },
  });
  const birthOf = new Map(bestPlayerBirth.map((player) => [player.playerKey, player.birthDate]));
  const objectivesOf = Map.groupBy(objectives, (objective) => objective.seasonId);
  const budgetOf = new Map(budgets.map((budget) => [budget.seasonId, budget.budget]));

  const seasons: HistorySeason[] = results.map((row) => {
    const closed = objectivesOf.get(row.seasonId) ?? [];
    const birth = row.bestPlayerKey === null ? undefined : birthOf.get(row.bestPlayerKey);
    return {
      seasonId: row.seasonId,
      startYear: row.season.startYear,
      competitionCode: row.competition.code,
      tier: tierOf(row.competition.tier),
      rank: row.rank,
      points: row.points,
      played: row.played,
      won: row.won,
      drawn: row.drawn,
      lost: row.lost,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      champion: row.trophies.includes("champion"),
      promoted: row.promoted,
      relegated: row.relegated,
      cupRound: row.cupRound,
      cupWinner: row.trophies.includes("cup"),
      europeCode: row.europeCode !== null && isEuropeCode(row.europeCode) ? row.europeCode : null,
      europeStage: row.europeStage,
      europeWinner: row.trophies.includes("europe"),
      bestPlayer:
        row.bestPlayerKey === null || row.bestPlayerName === null || row.bestPlayerPosition === null
          ? null
          : {
              playerKey: row.bestPlayerKey,
              name: row.bestPlayerName,
              position: row.bestPlayerPosition,
              rating: row.bestPlayerRating ?? 0,
              goals: row.bestPlayerGoals ?? 0,
              assists: row.bestPlayerAssists ?? 0,
              age: birth === undefined ? 25 : ageInYears(birth, seasonEndDate(row.season.startYear)),
            },
      objectives: closed.length === 0 ? null : { met: closed.filter((objective) => objective.outcome !== "MISSED").length, total: closed.length },
      budget: budgetOf.get(row.seasonId) ?? null,
      highlights: parseSeasonHighlights(row.highlights),
    };
  });

  // The club's competition seasons that are over: its matches from their archive, or their rows.
  const completed = await db.season.findMany({
    where: { saveId, completed: true },
    select: { id: true, startYear: true, competition: { select: { code: true, kind: true } } },
  });
  const seasonOf = new Map(completed.map((season) => [season.id, { startYear: season.startYear, kind: KINDS[season.competition.kind], code: season.competition.code }]));
  const archived = await readArchivedSeasonsOfClub(db, saveId, managed.id, { stats: true });
  const archivedIds = new Set(archived.map((archive) => archive.seasonId));
  const rows = await db.fixture.findMany({
    where: {
      saveId,
      played: true,
      seasonId: { in: completed.map((season) => season.id).filter((id) => !archivedIds.has(id)) },
      OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }],
    },
    select: { seasonId: true, scheduledAt: true, round: true, homeClubSaveId: true, awayClubSaveId: true, homeGoals: true, awayGoals: true, decidedBy: true },
  });
  const matches: HistoryMatch[] = [];
  const clubSeasonIds = new Set<string>();
  for (const row of rows) {
    const season = seasonOf.get(row.seasonId);
    if (season !== undefined) {
      matches.push(historyMatch(row, managed.id, season));
      clubSeasonIds.add(row.seasonId);
    }
  }
  for (const archive of archived) {
    const season = seasonOf.get(archive.seasonId);
    if (season === undefined) {
      continue;
    }
    for (const fixture of archive.season.fixtures) {
      if (fixture.played && (fixture.homeClubSaveId === managed.id || fixture.awayClubSaveId === managed.id)) {
        matches.push(historyMatch(fixture, managed.id, season));
        clubSeasonIds.add(archive.seasonId);
      }
    }
  }

  // The clubs of the club's league each year (Club.ids): the club and the opponents of its league matches.
  const leagueOpponents = new Map<number, Set<string>>();
  for (const match of matches) {
    if (match.kind === "LEAGUE") {
      leagueOpponents.set(match.startYear, (leagueOpponents.get(match.startYear) ?? new Set()).add(match.opponentClubSaveId));
    }
  }
  const clubIds = new Map(
    (
      await db.clubSave.findMany({
        where: { saveId, id: { in: [...new Set([...leagueOpponents.values()].flatMap((ids) => [...ids]))] } },
        select: { id: true, clubId: true },
      })
    ).map((club) => [club.id, club.clubId]),
  );
  const leagueClubIds = new Map(
    [...leagueOpponents].map(([year, ids]) => [year, new Set([managed.clubId, ...[...ids].flatMap((id) => clubIds.get(id) ?? [])])]),
  );

  // The players' lines of those seasons, from the archive's statistics or the rows.
  const { ids } = await careerPlayerIds(db, saveId, managed);
  const { keyOf, timelines } = await timelinesOf(db, saveId, ids);
  const statRows: StatsRow[] = [];
  const pushRow = (seasonId: string, stat: { playerSaveId: string; appearances: number; goals: number; assists: number }) => {
    const season = seasonOf.get(seasonId);
    const playerKey = keyOf.get(stat.playerSaveId);
    if (season !== undefined && playerKey !== undefined) {
      statRows.push({ playerKey, startYear: season.startYear, kind: season.kind, appearances: stat.appearances, goals: stat.goals, assists: stat.assists });
    }
  };
  for (const archive of archived) {
    if (clubSeasonIds.has(archive.seasonId)) {
      for (const stat of archive.season.stats) {
        pushRow(archive.seasonId, stat);
      }
    }
  }
  const stats = await db.playerSeasonStats.findMany({
    where: { saveId, seasonId: { in: [...clubSeasonIds].filter((id) => !archivedIds.has(id)) }, playerSaveId: { in: ids } },
    select: { seasonId: true, playerSaveId: true, appearances: true, goals: true, assists: true },
  });
  for (const stat of stats) {
    pushRow(stat.seasonId, stat);
  }
  const lines = attributedLines({ managedClubId: managed.clubId, rows: statRows, timelines, leagueClubIds, endOf: seasonEndDate });
  return { seasons, matches, lines };
}

/** What moves with the season in progress, read on each display. */
export type LiveCareer = {
  managedSlug: string;
  clubColors: ClubColors;
  challenge: boolean;
  context: HistoryContext;
  current: CurrentSeason | null;
  matches: HistoryMatch[];
  lines: HistoryLine[];
  players: (HistoryPlayer & { age: number })[];
  transfers: HistoryTransfer[];
  clubNames: Map<string, string>; // by ClubSave.id and by Club.id: the opponents and the other clubs of the transfers
};

/**
 * The season in progress and what changes with it (cahier § 8): its league table for the club's place, its cup and
 * European runs, its matches and its players' lines for the club, every player who was at the club as he is now, the
 * club's transfers with a fee, and the names of the clubs the history shows.
 */
export async function readLiveCareer(db: Db, saveId: string, completedMatches: readonly HistoryMatch[]): Promise<LiveCareer> {
  const save = await db.save.findUniqueOrThrow({ where: { id: saveId }, select: { worldVersion: true, currentDate: true, challengeId: true } });
  const managed = await managedOf(db, saveId);
  const inProgress = await db.season.findMany({
    where: { saveId, completed: false },
    select: { id: true, startYear: true, competition: { select: { code: true, kind: true } } },
  });
  const seasonOf = new Map(inProgress.map((season) => [season.id, { startYear: season.startYear, kind: KINDS[season.competition.kind], code: season.competition.code }]));
  const fixtures = await db.fixture.findMany({
    where: { saveId, seasonId: { in: inProgress.map((season) => season.id) }, OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }] },
    select: {
      seasonId: true,
      scheduledAt: true,
      round: true,
      played: true,
      homeClubSaveId: true,
      awayClubSaveId: true,
      homeGoals: true,
      awayGoals: true,
      decidedBy: true,
      winnerClubSaveId: true,
    },
  });
  const matches = fixtures.flatMap((fixture) => {
    const season = seasonOf.get(fixture.seasonId);
    return fixture.played && season !== undefined ? [historyMatch(fixture, managed.id, season)] : [];
  });

  // The season in progress: the club's league, its place, its cup and its European run.
  const league = inProgress.find((season) => season.competition.code === managed.competition.code);
  const table =
    league === undefined
      ? []
      : await db.fixture.findMany({
          where: { saveId, seasonId: league.id, played: true },
          select: { homeClubSaveId: true, awayClubSaveId: true, homeGoals: true, awayGoals: true },
        });
  // Every club the history ranks or names, read once: the league's, and every opponent of the career.
  const clubs = await db.clubSave.findMany({
    where: {
      saveId,
      id: {
        in: [
          ...new Set([
            ...table.flatMap((fixture) => [fixture.homeClubSaveId, fixture.awayClubSaveId]),
            ...completedMatches.map((match) => match.opponentClubSaveId),
            ...matches.map((match) => match.opponentClubSaveId),
          ]),
        ],
      },
    },
    select: { id: true, clubId: true, club: { select: { slug: true, name: true } } },
  });
  const clubOf = new Map(clubs.map((club) => [club.id, club]));
  const slugOf = (id: string): string => clubOf.get(id)?.club.slug ?? id;
  let current: CurrentSeason | null = null;
  if (league !== undefined) {
    const standings = computeStandings(
      table.map((fixture) => ({
        home: slugOf(fixture.homeClubSaveId),
        away: slugOf(fixture.awayClubSaveId),
        homeGoals: fixture.homeGoals ?? 0,
        awayGoals: fixture.awayGoals ?? 0,
      })),
    );
    const own = standings.find((row) => row.club === managed.club.slug);
    const cupTies = fixtures.filter((fixture) => seasonOf.get(fixture.seasonId)?.kind === "CUP");
    const lastTie = [...cupTies].sort((a, b) => b.round - a.round)[0];
    // Its own European season only, the one of its European fixtures.
    const europe = await clubEuropeRun(db as Prisma.TransactionClient, saveId, managed.id, [
      ...new Set(fixtures.filter((fixture) => seasonOf.get(fixture.seasonId)?.kind === "EUROPE").map((fixture) => fixture.seasonId)),
    ]);
    current = {
      startYear: league.startYear,
      competitionCode: league.competition.code,
      tier: tierOf(managed.competition.tier),
      rank: own?.rank ?? null,
      points: own?.points ?? 0,
      played: own?.played ?? 0,
      cup:
        lastTie === undefined
          ? null
          : {
              round: lastTie.round,
              out: cupTies.some((tie) => tie.played && tie.winnerClubSaveId !== managed.id),
              won: lastTie.round === CUP_ROUNDS && lastTie.played && lastTie.winnerClubSaveId === managed.id,
            },
      europe: europe === null ? null : { code: europe.code, stage: Math.min(europe.stage, EUROPE_STAGES.WON), out: europe.out, won: europe.won },
    };
  }

  // Every player who was at the club, as he is now; the lines of the season in progress; the transfers with a fee.
  const { ids, moves } = await careerPlayerIds(db, saveId, managed);
  const { keyOf, timelines, players: people } = await timelinesOf(db, saveId, ids);
  const stats = await db.playerSeasonStats.findMany({
    where: { saveId, seasonId: { in: [...new Set(fixtures.map((fixture) => fixture.seasonId))] }, playerSaveId: { in: ids } },
    select: { seasonId: true, playerSaveId: true, appearances: true, goals: true, assists: true },
  });
  // The other clubs of the transfers, by Club.id: a club of the save, or one abroad.
  const transferClubIds = [...new Set(moves.flatMap((move) => [move.fromClubId, move.toClubId]).filter((id): id is string => id !== null && id !== managed.clubId))];
  const transferClubs = await db.club.findMany({ where: { id: { in: transferClubIds } }, select: { id: true, slug: true, name: true } });
  const clubNames = new Map<string, string>([
    ...clubs.map((club): [string, string] => [club.id, displayClubName(club.club)]),
    ...transferClubs.map((club): [string, string] => [club.id, displayClubName(club)]),
  ]);
  const leagueClubIds = new Map(
    league === undefined
      ? []
      : [
          [
            league.startYear,
            new Set([managed.clubId, ...table.flatMap((fixture) => [fixture.homeClubSaveId, fixture.awayClubSaveId]).flatMap((id) => clubOf.get(id)?.clubId ?? [])]),
          ],
        ],
  );
  const lines = attributedLines({
    managedClubId: managed.clubId,
    rows: stats.flatMap((stat) => {
      const season = seasonOf.get(stat.seasonId);
      const playerKey = keyOf.get(stat.playerSaveId);
      return season === undefined || playerKey === undefined
        ? []
        : [{ playerKey, startYear: season.startYear, kind: season.kind, appearances: stat.appearances, goals: stat.goals, assists: stat.assists }];
    }),
    timelines,
    leagueClubIds,
    endOf: () => save.currentDate,
  });

  return {
    managedSlug: managed.club.slug,
    clubColors: clubColorsOf(managed.club),
    challenge: save.challengeId !== null,
    context: {
      currentTier: tierOf(managed.competition.tier),
      secondDivisions: save.worldVersion === 2,
      cups: save.worldVersion === 2 && CUPS_ENABLED,
      europe: save.worldVersion === 2 && save.challengeId === null && EUROPE_ENABLED,
    },
    current,
    matches,
    lines,
    players: people.map((player) => ({
      playerKey: player.playerKey,
      name: `${player.firstName} ${player.lastName}`,
      position: player.position,
      overall: player.overall,
      atClub: player.clubSaveId === managed.id,
      age: ageInYears(player.birthDate, save.currentDate),
    })),
    transfers: moves.flatMap((move) => {
      const playerKey = keyOf.get(move.playerSaveId);
      const incoming = move.toClubId === managed.clubId;
      return move.type === "TRANSFER" && move.fee > 0 && playerKey !== undefined
        ? [{ playerKey, fee: move.fee, date: move.date.getTime(), incoming, otherClubId: incoming ? move.fromClubId : move.toClubId }]
        : [];
    }),
    clubNames,
  };
}

export type CareerHistoryView = CareerHistory & {
  managedSlug: string;
  clubColors: ClubColors;
  challenge: boolean;
  players: Map<string, HistoryPlayer & { age: number }>;
  clubNames: Map<string, string>;
  internationalTitles: HighlightTitle[]; // the summer tournaments the club's players won, from the completed seasons, oldest first
};

/** The history from its two parts. */
export function careerHistoryView(completed: CompletedCareer, live: LiveCareer): CareerHistoryView {
  const history = careerHistory({
    managedSlug: live.managedSlug,
    context: live.context,
    seasons: completed.seasons,
    current: live.current,
    matches: [...completed.matches, ...live.matches],
    lines: [...completed.lines, ...live.lines],
    players: live.players,
    transfers: live.transfers,
  });
  return {
    ...history,
    managedSlug: live.managedSlug,
    clubColors: live.clubColors,
    challenge: live.challenge,
    players: new Map(live.players.map((player) => [player.playerKey, player])),
    clubNames: live.clubNames,
    internationalTitles: completed.seasons
      .flatMap((season) => season.highlights?.internationalTitles ?? [])
      .sort((a, b) => a.year - b.year),
  };
}

/** The whole history, read without any cache: tests and measures (the page caches the completed part). */
export async function getCareerHistory(db: Db, saveId: string): Promise<CareerHistoryView> {
  const completed = await readCompletedCareer(db, saveId);
  return careerHistoryView(completed, await readLiveCareer(db, saveId, completed.matches));
}
