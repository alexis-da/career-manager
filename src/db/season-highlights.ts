import * as z from "zod";
import { NATION_CODES } from "../engine/nations";
import { SEASON_HIGHLIGHTS_VERSION, seasonHighlights, type SeasonHighlights } from "../engine/season-highlights";
import type { Prisma } from "../generated/prisma/client";

type Db = Prisma.TransactionClient;

const scorerSchema = z.object({ playerKey: z.string(), name: z.string(), goals: z.number().int(), assists: z.number().int() });
const hatTrickSchema = z.object({
  playerKey: z.string(),
  name: z.string(),
  goals: z.number().int(),
  date: z.string(),
  competitionCode: z.string(),
  round: z.number().int(),
  opponentClubSaveId: z.string(),
});
const squadPlayerSchema = z.object({ playerKey: z.string(), overall: z.number().int(), value: z.number().int() });
const titleSchema = z.object({
  tournament: z.enum(["int.eu", "int.world"]),
  year: z.number().int(),
  nation: z.enum(NATION_CODES),
  players: z.array(z.object({ playerKey: z.string(), name: z.string() })),
});

export const seasonHighlightsSchema = z.object({
  version: z.literal(SEASON_HIGHLIGHTS_VERSION),
  budget: z.number().int(),
  scorers: z.array(scorerSchema),
  hatTricks: z.array(hatTrickSchema),
  squad: z.array(squadPlayerSchema),
  internationalTitles: z.array(titleSchema).optional(),
});

/** SeasonResult.highlights read back: null for a season without them, or written in another format. */
export function parseSeasonHighlights(value: unknown): SeasonHighlights | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = seasonHighlightsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The managed club's highlights of the seasons closing (its league season, and the cup and European seasons of the
 * same year), inside advanceToNextSeason's transaction, before anything of the season is completed: its goals from
 * its matches' events (every competition, its side only), the players they name, its squad and its budget now.
 */
export async function seasonHighlightsOf(tx: Db, saveId: string, managedId: string, seasonIds: readonly string[]): Promise<SeasonHighlights> {
  const fixtures = await tx.fixture.findMany({
    where: { saveId, seasonId: { in: [...seasonIds] }, played: true, OR: [{ homeClubSaveId: managedId }, { awayClubSaveId: managedId }] },
    select: {
      id: true,
      scheduledAt: true,
      round: true,
      homeClubSaveId: true,
      awayClubSaveId: true,
      season: { select: { competition: { select: { code: true } } } },
    },
  });
  // The events of the save's own fixtures: MatchEvent has no saveId, its fixtures are the save's.
  const events = await tx.matchEvent.findMany({
    where: { fixtureId: { in: fixtures.map((fixture) => fixture.id) }, type: "GOAL" },
    select: { fixtureId: true, side: true, playerSaveId: true, relatedPlayerSaveId: true },
  });
  const sideOf = new Map(fixtures.map((fixture) => [fixture.id, fixture.homeClubSaveId === managedId ? "HOME" : "AWAY"]));
  const goals = events.flatMap((event) =>
    event.side === sideOf.get(event.fixtureId) && event.playerSaveId !== null
      ? [{ fixtureId: event.fixtureId, scorerId: event.playerSaveId, assisterId: event.relatedPlayerSaveId }]
      : [],
  );
  const named = [...new Set(goals.flatMap((goal) => (goal.assisterId === null ? [goal.scorerId] : [goal.scorerId, goal.assisterId])))];
  const players = await tx.playerSave.findMany({ where: { saveId, id: { in: named } }, select: { id: true, playerKey: true, firstName: true, lastName: true } });
  const squad = await tx.playerSave.findMany({ where: { saveId, clubSaveId: managedId }, select: { playerKey: true, overall: true, marketValue: true } });
  const { budget } = await tx.clubSave.findUniqueOrThrow({ where: { id: managedId, saveId }, select: { budget: true } });
  return seasonHighlights({
    budget,
    goals,
    matches: fixtures.map((fixture) => ({
      id: fixture.id,
      date: fixture.scheduledAt,
      competitionCode: fixture.season.competition.code,
      round: fixture.round,
      opponentClubSaveId: fixture.homeClubSaveId === managedId ? fixture.awayClubSaveId : fixture.homeClubSaveId,
    })),
    players: players.map((player) => ({ id: player.id, playerKey: player.playerKey, name: `${player.firstName} ${player.lastName}` })),
    squad: squad.map((player) => ({ playerKey: player.playerKey, overall: player.overall, value: player.marketValue })),
  });
}
