// The managed club's season highlights (chantier « historique », docs/design/historique.md § 7.4 A): what the end of a
// season keeps of it before the event cleanup or the archiving takes its matches' events away: the club's exact
// scorers and hat-tricks, its squad's ratings and values, its budget. Pure: src/db/season-highlights.ts reads the rows
// and writes the result on SeasonResult.highlights.

/** The format of SeasonResult.highlights: a reader refuses another. */
export const SEASON_HIGHLIGHTS_VERSION = 1;
/** The club's scorers kept, the most goals first. */
export const HIGHLIGHT_SCORERS = 5;
/** Goals of a player in a match that make a hat-trick. */
export const HAT_TRICK_GOALS = 3;

/** One of the managed club's matches of the season, played. */
export type HighlightMatch = {
  id: string; // its fixture
  date: Date;
  competitionCode: string;
  round: number;
  opponentClubSaveId: string;
};

/** A goal of the managed club: its match, its scorer and its assister (PlayerSave ids). */
export type HighlightGoal = { fixtureId: string; scorerId: string; assisterId: string | null };

/** A player named by the highlights. */
export type HighlightPlayer = { id: string; playerKey: string; name: string };

export type HighlightScorer = { playerKey: string; name: string; goals: number; assists: number };

export type HighlightHatTrick = {
  playerKey: string;
  name: string;
  goals: number; // 3 or more
  date: string; // YYYY-MM-DD, UTC
  competitionCode: string;
  round: number;
  opponentClubSaveId: string;
};

export type HighlightSquadPlayer = { playerKey: string; overall: number; value: number };

export type SeasonHighlights = {
  version: number;
  budget: number; // euros: the club's transfer budget at the season's end, before the next dotation
  scorers: HighlightScorer[]; // its top HIGHLIGHT_SCORERS, every competition
  hatTricks: HighlightHatTrick[]; // by date
  squad: HighlightSquadPlayer[]; // its players at the season's end, by key
};

const byKey = (a: { playerKey: string }, b: { playerKey: string }): number => (a.playerKey < b.playerKey ? -1 : a.playerKey > b.playerKey ? 1 : 0);

/**
 * A season's highlights from the managed club's goals of the season (every competition), its matches, the players
 * they name, its squad and its budget at the season's end. Scorers: the most goals, then assists, then key; a scorer
 * needs a goal. Hat-tricks: HAT_TRICK_GOALS goals or more by a player in a match.
 */
export function seasonHighlights(input: {
  budget: number;
  goals: readonly HighlightGoal[];
  matches: readonly HighlightMatch[];
  players: readonly HighlightPlayer[];
  squad: readonly HighlightSquadPlayer[];
}): SeasonHighlights {
  const players = new Map(input.players.map((player) => [player.id, player]));
  const player = (id: string): HighlightPlayer => {
    const found = players.get(id);
    if (found === undefined) {
      throw new Error(`Player ${id} of a goal is not among the highlights' players`);
    }
    return found;
  };
  const goals = new Map<string, number>();
  const assists = new Map<string, number>();
  const inMatch = new Map<string, number>(); // `${fixtureId}|${scorerId}`
  for (const goal of input.goals) {
    goals.set(goal.scorerId, (goals.get(goal.scorerId) ?? 0) + 1);
    if (goal.assisterId !== null) {
      assists.set(goal.assisterId, (assists.get(goal.assisterId) ?? 0) + 1);
    }
    const key = `${goal.fixtureId}|${goal.scorerId}`;
    inMatch.set(key, (inMatch.get(key) ?? 0) + 1);
  }
  const scorers = [...goals]
    .map(([id, count]) => ({ ...player(id), goals: count, assists: assists.get(id) ?? 0 }))
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || byKey(a, b))
    .slice(0, HIGHLIGHT_SCORERS)
    .map(({ playerKey, name, goals: count, assists: passes }) => ({ playerKey, name, goals: count, assists: passes }));
  const matches = new Map(input.matches.map((match) => [match.id, match]));
  const hatTricks = [...inMatch]
    .filter(([, count]) => count >= HAT_TRICK_GOALS)
    .map(([key, count]) => {
      const [fixtureId, scorerId] = key.split("|");
      const match = matches.get(fixtureId);
      if (match === undefined) {
        throw new Error(`Match ${fixtureId} of a goal is not among the highlights' matches`);
      }
      const { playerKey, name } = player(scorerId);
      return {
        playerKey,
        name,
        goals: count,
        date: match.date.toISOString().slice(0, 10),
        competitionCode: match.competitionCode,
        round: match.round,
        opponentClubSaveId: match.opponentClubSaveId,
      };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || byKey(a, b));
  return {
    version: SEASON_HIGHLIGHTS_VERSION,
    budget: input.budget,
    scorers,
    hatTricks,
    squad: [...input.squad].sort(byKey),
  };
}
