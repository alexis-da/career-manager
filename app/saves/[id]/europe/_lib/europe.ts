import type { FixtureView, TeamView } from "@/src/db/calendar";
import type { EuropeCompetitionView, EuropeTableRowView, EuropeTieView, EuropeView } from "@/src/db/europe-view";
import {
  europeMatchPrize,
  europePrizes,
  europeRunOf,
  stageOfRound,
  EUROPE_DIRECT_PLACES,
  EUROPE_FINAL_ROUND,
  EUROPE_LEAGUE_ROUNDS,
  EUROPE_PLAYOFF_PLACES,
  EUROPE_PLAYOFF_ROUND,
  EUROPE_QUARTER_FINAL_ROUND,
  EUROPE_SEMI_FINAL_ROUND,
  EUROPE_STAGES,
  type EuropeCode,
} from "@/src/engine/europe";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { formatMoney } from "@/src/lib/format";

// The European screen read from the European view (src/db/europe-view.ts): the competition shown, where the managed club
// stands in its own and what comes next for it, and a competition's knockout bracket, known from the end of its league
// phase. Pure.

// ------------------------------------------------------------------ The competition shown

type Competitions = Pick<EuropeView, "competitions" | "managedCode">;

/** The competition a screen shows: the one its address asks for, else the managed club's, else the year's first (eu.1). */
export function shownCompetition(view: Competitions, requested: string | undefined): EuropeCompetitionView {
  const find = (code: string | null | undefined) => view.competitions.find((competition) => competition.code === code);
  const shown = find(requested) ?? find(view.managedCode) ?? view.competitions.at(0);
  if (shown === undefined) {
    throw new Error("A European year has its competitions");
  }
  return shown;
}

/** The competition the managed club plays this year; null when it did not qualify. */
export function managedCompetition(view: Competitions): EuropeCompetitionView | null {
  return view.competitions.find((competition) => competition.code === view.managedCode) ?? null;
}

// ------------------------------------------------------------------ The league phase's table

/** Where a league phase rank leads: the first four to the quarter-finals, the next eight to the play-offs. */
export type RankTone = "direct" | "playoff";

/** A league phase rank's tone, the blue of the quarter-finals or the play-offs' neutral; null below, out. */
export function rankTone(rank: number): RankTone | null {
  return rank <= EUROPE_DIRECT_PLACES ? "direct" : rank <= EUROPE_PLAYOFF_PLACES ? "playoff" : null;
}

/** The managed club's line of a competition's table; null when it does not play it. */
export function managedRow(competition: EuropeCompetitionView): EuropeTableRowView | null {
  return competition.table.find((row) => row.isManaged) ?? null;
}

// ------------------------------------------------------------------ The knockout bracket

/** A club on the bracket. */
export type BracketClub = Pick<TeamView, "clubSaveId" | "name" | "isManaged">;

/** A side of a knockout tie: its club once known, the two clubs of the tie it comes from while that is to play, or neither. */
export type BracketSide =
  | { kind: "club"; club: BracketClub }
  | { kind: "winnerOf"; clubs: readonly [BracketClub, BracketClub] }
  | { kind: "unknown" };

export type BracketTie = {
  home: BracketSide; // the better ranked of the league phase once both are known: it plays at home, but in the final
  away: BracketSide;
  venueKnown: boolean; // whether home and away are settled: until then, either may turn out the better ranked
  match: EuropeTieView | null; // once scheduled: its score once played, and the club through
};

export type BracketRound = {
  round: number; // 7 the play-offs, 8 the quarter-finals, 9 the semi-finals, 10 the final
  date: Date;
  neutral: boolean; // the final, on neutral ground
  ties: BracketTie[]; // in the bracket's order
};

/** The play-offs by league phase rank (knockoutTies, src/engine/europe.ts): 5th-12th, 6th-11th, 7th-10th, 8th-9th. */
const PLAYOFF_RANKS = [
  [5, 12],
  [6, 11],
  [7, 10],
  [8, 9],
] as const;

const UNKNOWN: BracketSide = { kind: "unknown" };

const clubSide = (club: BracketClub): BracketSide => ({
  kind: "club",
  club: { clubSaveId: club.clubSaveId, name: club.name, isManaged: club.isManaged },
});

/** Whether a scheduled match is between two clubs, whichever at home. */
const between = (match: EuropeTieView, a: BracketClub, b: BracketClub): boolean =>
  (match.home.clubSaveId === a.clubSaveId && match.away.clubSaveId === b.clubSaveId) ||
  (match.home.clubSaveId === b.clubSaveId && match.away.clubSaveId === a.clubSaveId);

/**
 * A round's ties as the bracket draws them; its scheduled matches as they are should the bracket not hold them all (never
 * expected: each round is scheduled from the same fixed bracket, knockoutTies).
 */
function withScheduled(knockout: readonly EuropeTieView[], round: number, ties: BracketTie[]): BracketTie[] {
  const held = new Set(ties.flatMap((tie) => (tie.match === null ? [] : [tie.match.id])));
  const scheduled = knockout.filter((match) => match.round === round);
  return scheduled.every((match) => held.has(match.id))
    ? ties
    : scheduled.map((match) => ({ home: clubSide(match.home), away: clubSide(match.away), venueKnown: true, match }));
}

/**
 * A competition's knockout bracket, round by round, from the play-offs to the final: before the end of the league phase,
 * nothing but the rounds' dates; then the fixed bracket (5th-12th … 8th-9th; the 1st against the winner of 8th-9th, the
 * 2nd of 7th-10th, the 3rd of 6th-11th, the 4th of 5th-12th; the 1st's side against the 4th's, the 2nd's against the
 * 3rd's), each tie with its match once scheduled, a side still to come named by the tie it comes from.
 */
export function bracketRounds(competition: EuropeCompetitionView): BracketRound[] {
  const rankOf = new Map(competition.table.map((row) => [row.clubSaveId, row.rank]));
  /** The best and the worst league phase rank a side may have; null while it is not known. */
  const ranks = (side: BracketSide): readonly [number, number] | null => {
    const clubs = side.kind === "club" ? [side.club] : side.kind === "winnerOf" ? side.clubs : [];
    const known = clubs.flatMap((club) => {
      const rank = rankOf.get(club.clubSaveId);
      return rank === undefined ? [] : [rank];
    });
    return known.length === 0 || known.length < clubs.length ? null : [Math.min(...known), Math.max(...known)];
  };
  const atRank = (rank: number): BracketSide => {
    const row = competition.leaguePhaseOver ? competition.table.at(rank - 1) : undefined;
    return row === undefined ? UNKNOWN : clubSide(row);
  };
  const tieOf = (round: number, a: BracketSide, b: BracketSide): BracketTie => {
    const match =
      a.kind === "club" && b.kind === "club" ? competition.knockout.find((candidate) => candidate.round === round && between(candidate, a.club, b.club)) : undefined;
    if (match !== undefined) {
      return { home: clubSide(match.home), away: clubSide(match.away), venueKnown: true, match };
    }
    // The better ranked at home, once no outcome of the ties before can change which it is.
    const [first, second] = [ranks(a), ranks(b)];
    if (first !== null && second !== null && second[1] < first[0]) {
      return { home: b, away: a, venueKnown: true, match: null };
    }
    return { home: a, away: b, venueKnown: first !== null && second !== null && first[1] < second[0], match: null };
  };
  const through = ({ home, away, match }: BracketTie): BracketSide => {
    if (match !== null && match.played && match.winnerClubSaveId !== null) {
      return clubSide(match.winnerClubSaveId === match.home.clubSaveId ? match.home : match.away);
    }
    return home.kind === "club" && away.kind === "club" ? { kind: "winnerOf", clubs: [home.club, away.club] } : UNKNOWN;
  };

  const playoffs = PLAYOFF_RANKS.map(([a, b]) => tieOf(EUROPE_PLAYOFF_ROUND, atRank(a), atRank(b)));
  // The 1st against the winner of the last play-off (8th-9th), … the 4th against the first's (5th-12th).
  const quarterFinals = playoffs.map((_, index) =>
    tieOf(EUROPE_QUARTER_FINAL_ROUND, atRank(index + 1), through(playoffs[playoffs.length - 1 - index])),
  );
  const semiFinals = [
    tieOf(EUROPE_SEMI_FINAL_ROUND, through(quarterFinals[0]), through(quarterFinals[3])),
    tieOf(EUROPE_SEMI_FINAL_ROUND, through(quarterFinals[1]), through(quarterFinals[2])),
  ];
  const final = tieOf(EUROPE_FINAL_ROUND, through(semiFinals[0]), through(semiFinals[1]));
  const rounds: [number, BracketTie[]][] = [
    [EUROPE_PLAYOFF_ROUND, playoffs],
    [EUROPE_QUARTER_FINAL_ROUND, quarterFinals],
    [EUROPE_SEMI_FINAL_ROUND, semiFinals],
    [EUROPE_FINAL_ROUND, [final]],
  ];
  return rounds.map(([round, ties]) => ({
    round,
    date: competition.dates[round - 1],
    neutral: round === EUROPE_FINAL_ROUND,
    ties: withScheduled(competition.knockout, round, ties),
  }));
}

/** Whether nothing of a round is known yet: none of its clubs, not even the ties they will come from. */
export function isUndecided(round: BracketRound): boolean {
  return round.ties.every((tie) => tie.home.kind === "unknown" && tie.away.kind === "unknown");
}

/** A side of a tie as the bracket names it: its club, « Vainqueur Lyon – Porto », or « À déterminer ». */
export function sideLabel(side: BracketSide, t: Translator<"europe">): string {
  switch (side.kind) {
    case "club":
      return side.club.name;
    case "winnerOf":
      return t("bracket.winnerOf", { home: side.clubs[0].name, away: side.clubs[1].name });
    case "unknown":
      return t("bracket.toCome");
  }
}

// ------------------------------------------------------------------ Where the managed club stands

const REACHED_STAGES = [
  EUROPE_STAGES.LEAGUE,
  EUROPE_STAGES.PLAYOFF,
  EUROPE_STAGES.QUARTER_FINAL,
  EUROPE_STAGES.SEMI_FINAL,
  EUROPE_STAGES.FINAL,
] as const;

/** A stage a club reaches short of the title (EUROPE_STAGES): 1 the league phase, 2 the play-offs … 5 the final. */
export type ReachedStage = (typeof REACHED_STAGES)[number];

/** A knockout stage: the play-offs, the quarter-finals, the semi-finals or the final. */
export type KnockoutStage = Exclude<ReachedStage, typeof EUROPE_STAGES.LEAGUE>;

/** The round each knockout stage is played in. */
const ROUND_OF_STAGE: Readonly<Record<KnockoutStage, number>> = {
  [EUROPE_STAGES.PLAYOFF]: EUROPE_PLAYOFF_ROUND,
  [EUROPE_STAGES.QUARTER_FINAL]: EUROPE_QUARTER_FINAL_ROUND,
  [EUROPE_STAGES.SEMI_FINAL]: EUROPE_SEMI_FINAL_ROUND,
  [EUROPE_STAGES.FINAL]: EUROPE_FINAL_ROUND,
};

const reachedStage = (stage: number): ReachedStage =>
  REACHED_STAGES.find((candidate) => candidate === stage) ?? (stage > EUROPE_STAGES.FINAL ? EUROPE_STAGES.FINAL : EUROPE_STAGES.LEAGUE);

/**
 * The managed club in this year's European competitions: not in them, in its league phase (its rank and points), through
 * to a knockout round still to play, out at a stage (with its league phase rank), or the winner.
 */
export type ManagedStanding =
  | { kind: "none" }
  | { kind: "league"; rank: number; points: number; played: number }
  | { kind: "through"; stage: KnockoutStage }
  | { kind: "out"; stage: ReachedStage; rank: number }
  | { kind: "won" };

/** Where the managed club stands in its competition (europeRunOf); « none » without one. */
export function managedStanding(competition: EuropeCompetitionView | null): ManagedStanding {
  const row = competition === null ? null : managedRow(competition);
  if (competition === null || row === null) {
    return { kind: "none" };
  }
  const ranking = competition.leaguePhaseOver ? competition.table.map((line) => line.clubSaveId) : null;
  const knockout = competition.knockout.map((match) => ({
    round: match.round,
    home: match.home.clubSaveId,
    away: match.away.clubSaveId,
    winner: match.played ? match.winnerClubSaveId : null,
  }));
  const run = europeRunOf(row.clubSaveId, ranking, knockout);
  if (run.stage === EUROPE_STAGES.WON) {
    return { kind: "won" };
  }
  if (run.out) {
    return { kind: "out", stage: reachedStage(run.stage), rank: row.rank };
  }
  // A tie won before its next round is scheduled (others of its date still to play) takes the club through all the same.
  const stage = reachedStage(
    Math.max(run.stage, ...knockout.filter((match) => match.winner === row.clubSaveId).map((match) => stageOfRound(match.round + 1))),
  );
  return stage === EUROPE_STAGES.LEAGUE
    ? { kind: "league", rank: row.rank, points: row.points, played: row.played }
    : { kind: "through", stage };
}

/** The card's badge: still in, out, the winner; none without a competition. */
export type EuropeStatus = "in" | "out" | "won";

export function standingStatus(standing: ManagedStanding): EuropeStatus | null {
  switch (standing.kind) {
    case "none":
      return null;
    case "out":
      return "out";
    case "won":
      return "won";
    default:
      return "in";
  }
}

/**
 * Each stage for the managed club: passed, skipped (the play-offs, for the league phase's first four), the one it is at,
 * lost, further ahead (upcoming), or out of reach once it went out (unreached).
 */
export type StepState = "passed" | "exempt" | "current" | "lost" | "upcoming" | "unreached";

export type EuropeStep = { stage: ReachedStage; state: StepState };

/** The managed club's five stages, from the league phase to the final; null without a competition. */
export function europeSteps(competition: EuropeCompetitionView | null, standing: ManagedStanding): EuropeStep[] | null {
  const row = competition === null ? null : managedRow(competition);
  if (competition === null || row === null || standing.kind === "none") {
    return null;
  }
  const exempt = competition.leaguePhaseOver && row.rank <= EUROPE_DIRECT_PLACES;
  const current = standing.kind === "won" ? EUROPE_STAGES.WON : standing.kind === "league" ? EUROPE_STAGES.LEAGUE : standing.stage;
  const out = standing.kind === "out";
  return REACHED_STAGES.map((stage): EuropeStep => {
    if (stage === EUROPE_STAGES.PLAYOFF && exempt) {
      return { stage, state: "exempt" };
    }
    if (stage !== current) {
      return { stage, state: stage < current ? "passed" : out ? "unreached" : "upcoming" };
    }
    return { stage, state: out ? "lost" : "current" };
  });
}

// ------------------------------------------------------------------ What comes next for it

/** The managed club's next opponent: a club, the winner of a tie still to play, or not known yet. */
export type EuropeOpponent = { kind: "club"; name: string } | { kind: "winnerOf"; home: string; away: string } | { kind: "unknown" };

export type Venue = "home" | "away" | "neutral";

/**
 * What comes next for the managed club: a match, its venue null while it depends on who goes through; or, its league
 * phase matches played before the others' (a club of three pots rests at two dates), the date of the table's end.
 */
export type EuropeNext =
  | { kind: "match"; round: number; date: Date; opponent: EuropeOpponent; venue: Venue | null }
  | { kind: "tableEnd"; date: Date };

const isManagedSide = (side: BracketSide): boolean => side.kind === "club" && side.club.isManaged;

function opponentOf(side: BracketSide): EuropeOpponent {
  switch (side.kind) {
    case "club":
      return { kind: "club", name: side.club.name };
    case "winnerOf":
      return { kind: "winnerOf", home: side.clubs[0].name, away: side.clubs[1].name };
    case "unknown":
      return { kind: "unknown" };
  }
}

/**
 * The managed club's next European match, from its own (`matches`, by date): the first not played; else, still in, its
 * tie of the bracket's next round (the league phase's first four wait for the play-offs). Null without a competition,
 * once it is out or the winner.
 */
export function europeNext(competition: EuropeCompetitionView | null, matches: readonly FixtureView[]): EuropeNext | null {
  if (competition === null) {
    return null;
  }
  const scheduled = matches.find((match) => !match.played);
  if (scheduled !== undefined) {
    const atHome = scheduled.home.isManaged;
    return {
      kind: "match",
      round: scheduled.round,
      date: scheduled.scheduledAt,
      opponent: { kind: "club", name: (atHome ? scheduled.away : scheduled.home).name },
      venue: scheduled.round === EUROPE_FINAL_ROUND ? "neutral" : atHome ? "home" : "away",
    };
  }
  const standing = managedStanding(competition);
  if (standing.kind === "league") {
    return { kind: "tableEnd", date: competition.dates[EUROPE_LEAGUE_ROUNDS - 1] };
  }
  if (standing.kind !== "through") {
    return null;
  }
  const round = ROUND_OF_STAGE[standing.stage];
  const date = competition.dates[round - 1];
  const tie = bracketRounds(competition)
    .find((candidate) => candidate.round === round)
    ?.ties.find((candidate) => isManagedSide(candidate.home) || isManagedSide(candidate.away));
  if (tie === undefined) {
    return { kind: "match", round, date, opponent: { kind: "unknown" }, venue: round === EUROPE_FINAL_ROUND ? "neutral" : null };
  }
  const atHome = isManagedSide(tie.home);
  return {
    kind: "match",
    round,
    date,
    opponent: opponentOf(atHome ? tie.away : tie.home),
    venue: round === EUROPE_FINAL_ROUND ? "neutral" : tie.venueKnown ? (atHome ? "home" : "away") : null,
  };
}

/** Its next match's opponent and venue: « vs Lyon · domicile », « vs le vainqueur de Porto – Roma · domicile ». */
export function nextMatchSentence(next: Extract<EuropeNext, { kind: "match" }>, t: Translator<"europe">): string {
  const { opponent, venue } = next;
  if (opponent.kind === "unknown") {
    return t("next.toCome");
  }
  const club = opponent.kind === "club" ? opponent.name : t("next.winnerOf", { home: opponent.home, away: opponent.away });
  return venue === null ? t("next.undecided", { club }) : t(`next.${venue}`, { club });
}

/**
 * The next prize the managed club can earn (europePrizes): in the league phase, each win and a place in the first four;
 * then the round it is through to, the final paying its loser too. Null once it is out or the winner.
 */
export type EuropePrize =
  | { kind: "league"; win: number; topFour: number }
  | { kind: "playoff" | "quarter" | "semi"; amount: number }
  | { kind: "final"; win: number; loss: number };

const KNOCKOUT_PRIZES: Readonly<Record<Exclude<KnockoutStage, typeof EUROPE_STAGES.FINAL>, "playoff" | "quarter" | "semi">> = {
  [EUROPE_STAGES.PLAYOFF]: "playoff",
  [EUROPE_STAGES.QUARTER_FINAL]: "quarter",
  [EUROPE_STAGES.SEMI_FINAL]: "semi",
};

export function nextPrize(code: EuropeCode, standing: ManagedStanding): EuropePrize | null {
  if (standing.kind === "league") {
    return { kind: "league", win: europeMatchPrize(code, 1, true), topFour: europePrizes(code).quarterFinalQualification };
  }
  if (standing.kind !== "through") {
    return null;
  }
  const round = ROUND_OF_STAGE[standing.stage];
  if (standing.stage === EUROPE_STAGES.FINAL) {
    return { kind: "final", win: europeMatchPrize(code, round, true), loss: europeMatchPrize(code, round, false) };
  }
  return { kind: KNOCKOUT_PRIZES[standing.stage], amount: europeMatchPrize(code, round, true) };
}

/** The prize at stake in words: « Prime en jeu : 3 M€ pour une victoire en quarts ». */
export function prizeSentence(prize: EuropePrize, t: Translator<"europe">, locale: Locale): string {
  const money = (amount: number): string => formatMoney(amount, locale);
  switch (prize.kind) {
    case "league":
      return t("prize.league", { win: money(prize.win), topFour: money(prize.topFour) });
    case "final":
      return t("prize.final", { win: money(prize.win), loss: money(prize.loss) });
    default:
      return t(`prize.${prize.kind}`, { amount: money(prize.amount) });
  }
}

/**
 * Where the managed club stands in one sentence: « Phase de ligue : 7e, 7 pts », « Qualifié pour les quarts », « Éliminé
 * en barrages », « Vainqueur », or why it plays none (« Pas qualifié cette saison… »). Before its first match, what its
 * league phase is.
 */
export function standingSentence(standing: ManagedStanding, leagueMatches: number, t: Translator<"europe">): string {
  switch (standing.kind) {
    case "none":
      return t("standing.none");
    case "league":
      return standing.played === 0
        ? t("standing.leagueStart", { matches: leagueMatches })
        : t("standing.league", { rank: standing.rank, points: standing.points });
    case "through":
      return t(`standing.through.${standing.stage}`);
    case "out":
      return standing.stage === EUROPE_STAGES.LEAGUE
        ? t("standing.outLeague", { rank: standing.rank })
        : t(`standing.out.${standing.stage}`);
    case "won":
      return t("standing.won");
  }
}
