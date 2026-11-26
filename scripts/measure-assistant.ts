/**
 * The assistant of the chantier « simplification » (docs/design/simplification.md § 11), on twins of a worldVersion 2
 * save: npm run measure:assistant -- [--seasons=N] [--seed=S] [--club=slug] [--lineup=rested|game|select]
 * [--contracts=option|game] [--sales=off|game] [--policy=BEST|YOUTH] [--greedy-clubs=slugA,slugB]
 * [--sections=composition,contracts,greedy,sales] [--out=file.md] [--from=file.json].
 *
 * Every twin has the same seed (the demo's unless --seed) and a throwaway owner of its own, and plays N seasons (default
 * 3) date by date as « Simuler » plays them (playNextMatchday: every match in full, the assistant deciding the choice
 * events), each season followed by advanceToNextSeason. Four sections, printed in markdown:
 * - « Composition », the club of --club (the demo's by default): twin A plays selectLineup (no saved line-up, today's
 *   eleven of a player who never saves one); twin B the rested eleven: today (--lineup=rested), before each match of its
 *   club, the eleven and bench selectRestedLineup fields in its formation, as AI clubs pick theirs, saved as the player
 *   saves his; after the change (--lineup=game), the game's own assistant. Both with the assistant's contracts. Points per
 *   league match, rank, goals, cup and European runs, injuries, starters under ROTATION_FITNESS at kick-off, minutes of
 *   the players aged 21 or less, their progression at the season's turn, and the Jeunesse objective when it was the
 *   season's.
 * - « Contrats »: two twins playing selectLineup, the managed club's contracts left to end (today's game) or decided by
 *   its assistant: squad on 1 July, contracts ended, renewals, releases and signings, final rank.
 * - « Club gourmand »: for two clubs (--greedy-clubs; by default the first division club of England ranked 10th by
 *   reputation at the creation and the second division club of France ranked 12th), a twin that signs at each summer
 *   window's opening (the creation's date, then each 1 July after the transition) the best free agents it can, by
 *   overall then key, until it has 30 players or nobody else can be signed, through quoteTransfer and signFreeAgent as
 *   « Recruter » does; against a passive twin of the same club: squad, best eleven, rank, budget, fees paid.
 * - « Ventes proposées » (--sales=game, the game after the change only): at each window, the sales the assistant
 *   proposes, their offers against their values, all accepted, and what they do to the budget and the squad.
 *
 * --policy (docs/design/effectif-adjoint.md § 2, § 7): every twin's assistant follows « Meilleur onze » (BEST, the
 * default, the game before the policies) or « Lancer les jeunes » (YOUTH), for the line-up and the contracts he takes
 * care of; run the same seeds with each and compare twin B (--lineup=game --contracts=game) of the two reports.
 *
 * Run with the same seeds before the change and after it. What the game will only have after it goes through
 * scripts/simplification-hooks.ts: against today's game, such a mode throws « not available before the
 * simplification » before anything is played. --out writes the markdown there and the raw records beside it (the same
 * name, .json); --from reads such a JSON instead of playing, to print the report again without the database. Each twin
 * is deleted with its owner once played, a crashed run's at the start. Writes to a dedicated local database only
 * (DATABASE_URL), refusing any other even with ALLOW_REMOTE_DB=1, and the development one, latewinner_dev.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { prisma } from "../src/db/client";
import { assertLocalDatabase, isLocalDatabase } from "../src/db/database-url";
import { fitnessAtKickOff } from "../src/db/fitness-view";
import { setAssistantPolicy } from "../src/db/assistant-settings";
import { getLineupEditor, parseFormation, saveManagedLineup } from "../src/db/lineup";
import { playNextMatchday } from "../src/db/matchday";
import { createSave } from "../src/db/saves";
import { advanceToNextSeason, type SeasonTransition } from "../src/db/season";
import { createTestOwner, DEMO_CLUB_SLUG, DEMO_SEED, TEST_OWNER_PREFIX } from "../src/db/test-support";
import { freeAgentWhere, quoteTransfer, signFreeAgent, type TransferQuote } from "../src/db/transfers";
import { ASSISTANT_POLICIES, DEFAULT_ASSISTANT_POLICY, type AssistantPolicy } from "../src/engine/assistant-policy";
import { ROTATION_FITNESS, YOUTH_OBJECTIVE_MAX_AGE, YOUTH_OBJECTIVE_STARTS } from "../src/engine/balance";
import { formationPositions } from "../src/engine/formations";
import { averageStarterRating, selectLineup, selectRestedLineup } from "../src/engine/lineup";
import { creationReputationRanks } from "../src/engine/reputation";
import { competitionTier } from "../src/engine/tiers";
import { seasonLabel, seasonStartDate, seasonStartYear, transferWindowAt, transferWindowOpenDate } from "../src/engine/world";
import type { WorldVersion } from "../src/engine/world-version";
import { ageInYears } from "../src/lib/dates";
import {
  acceptProposedSale,
  contractMovesOf,
  isStub,
  NotAvailableBeforeSimplification,
  requireHook,
  saleProposalsOf,
  setContractsByAssistant,
  setLineupByAssistant,
  simplificationLanded,
  type ContractMoves,
} from "./simplification-hooks";

const WORLD_VERSION: WorldVersion = 2;
const DAY_MS = 86_400_000;

/** The simplification's squad limit (docs/design/simplification.md § 1.4): a greedy twin signs up to it. */
const SQUAD_LIMIT = 30;

/** A signing's length as « Recruter » signs (DEFAULT_CONTRACT_LENGTH, app/saves/[id]/_components/contract-fields.tsx). */
const CONTRACT_YEARS = 3;

/** The greedy clubs of § 11 by default: their league, and their reputation rank in it at the creation. */
const DEFAULT_GREEDY_CLUBS = [
  { code: "en.1", rank: 10 },
  { code: "fr.2", rank: 12 },
] as const;

/** How many times a date's proposed sales are read again once the ones read are sold (three at a time, § 5.1). */
const MAX_SALE_ROUNDS = 10;

/** The twins' saves are named with it and the seed: a crashed run's are found again, and deleted. */
const SAVE_NAME = "Mesure adjoint · ";
const SEED_IN_NAME = 40;

/** The local development database (.env), which the measures never use (docs/design/simplification.md § 11). */
const DEVELOPMENT_DATABASE = "latewinner_dev";

// ------------------------------------------------------------------ Options and twins

type LineupMode = "select" | "rested" | "game";
type ContractsMode = "option" | "game";
type SalesMode = "off" | "game";
type Section = "composition" | "contracts" | "greedy" | "sales";

const LINEUP_MODES: readonly LineupMode[] = ["select", "rested", "game"];
const CONTRACTS_MODES: readonly ContractsMode[] = ["option", "game"];
const SALES_MODES: readonly SalesMode[] = ["off", "game"];
const SECTIONS: readonly Section[] = ["composition", "contracts", "greedy", "sales"];

type Options = {
  seasons: number;
  seed: string;
  club: string; // slug of the managed club of the composition, contracts and sales twins
  lineup: LineupMode; // twin B's, and the sales twin's; twin A always plays selectLineup
  contracts: ContractsMode; // the measurement option of advanceToNextSeason (today), or the save's setting (after)
  sales: SalesMode;
  policy: AssistantPolicy; // every twin's assistant's (Save.assistantPolicy)
  greedyClubs: string[] | null; // null: DEFAULT_GREEDY_CLUBS
  sections: Section[];
  out: string | undefined;
  from: string | undefined;
};

/** A twin: its club, who fields its eleven, who decides its contracts, and what it does at the windows. */
type TwinSpec = {
  club: string; // slug
  lineup: LineupMode;
  assistantContracts: boolean;
  greedy: boolean; // signs the best free agents it can at each summer window's opening
  sales: boolean; // accepts every sale its assistant proposes
  policy: AssistantPolicy; // its assistant's, for the line-up and the contracts he takes care of
};

/** A twin being played. */
type Twin = { key: string; spec: TwinSpec; saveId: string; clubSaveId: string; clubId: string };

/** Twins with the same spec are one: the composition's twin A is the contracts' twin with the assistant, for instance. */
const twinKey = (spec: TwinSpec): string =>
  `${spec.club} · ${spec.lineup} · contrats ${spec.assistantContracts ? "adjoint" : "joueur"}${spec.greedy ? " · gourmand" : ""}${spec.sales ? " · ventes" : ""}${spec.policy === DEFAULT_ASSISTANT_POLICY ? "" : ` · consigne ${spec.policy}`}`;

function parseOptions(argv: readonly string[]): Options {
  const value = (name: string): string | undefined => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const list = (name: string): string[] | null => {
    const given = value(name);
    return given === undefined ? null : given.split(",").map((item) => item.trim()).filter((item) => item !== "");
  };
  const oneOf = <T extends string>(name: string, modes: readonly T[], fallback: T): T => {
    const given = value(name);
    if (given === undefined) {
      return fallback;
    }
    const mode = modes.find((candidate) => candidate === given);
    if (mode === undefined) {
      throw new Error(`Unknown --${name}=${given}: one of ${modes.join(", ")}`);
    }
    return mode;
  };
  const seasons = Number(value("seasons") ?? 3);
  if (!Number.isInteger(seasons) || seasons < 1) {
    throw new Error(`--seasons must be a positive integer, got ${value("seasons")}`);
  }
  const sections = list("sections");
  const unknown = (sections ?? []).filter((section) => !SECTIONS.some((known) => known === section));
  if (unknown.length > 0) {
    throw new Error(`Unknown --sections: ${unknown.join(", ")} (one or more of ${SECTIONS.join(", ")})`);
  }
  const greedyClubs = list("greedy-clubs");
  if (greedyClubs !== null && greedyClubs.length === 0) {
    throw new Error("--greedy-clubs needs at least one club slug");
  }
  return {
    seasons,
    seed: value("seed") ?? DEMO_SEED,
    club: value("club") ?? DEMO_CLUB_SLUG,
    lineup: oneOf("lineup", LINEUP_MODES, "rested"),
    contracts: oneOf("contracts", CONTRACTS_MODES, "option"),
    sales: oneOf("sales", SALES_MODES, "off"),
    policy: oneOf("policy", ASSISTANT_POLICIES, DEFAULT_ASSISTANT_POLICY),
    greedyClubs,
    sections: sections === null ? [...SECTIONS] : SECTIONS.filter((section) => sections.includes(section)),
    out: value("out"),
    from: value("from"),
  };
}

/** The twins the sections need, one per distinct spec, and which twin plays each role of the report. */
function twinPlan(options: Options, greedySlugs: readonly string[]): { twins: { key: string; spec: TwinSpec }[]; roles: Record<string, string> } {
  const wanted: [string, TwinSpec][] = [];
  const own = { club: options.club, greedy: false, sales: false, policy: options.policy };
  if (options.sections.includes("composition")) {
    wanted.push(["composition-A", { ...own, lineup: "select", assistantContracts: true }]);
    wanted.push(["composition-B", { ...own, lineup: options.lineup, assistantContracts: true }]);
  }
  if (options.sections.includes("contracts")) {
    wanted.push(["contracts-off", { ...own, lineup: "select", assistantContracts: false }]);
    wanted.push(["contracts-on", { ...own, lineup: "select", assistantContracts: true }]);
  }
  if (options.sections.includes("greedy")) {
    for (const club of greedySlugs) {
      const greedySpec = { club, lineup: "select", assistantContracts: true, sales: false, policy: options.policy } as const;
      wanted.push([`greedy:${club}`, { ...greedySpec, greedy: true }]);
      wanted.push([`passive:${club}`, { ...greedySpec, greedy: false }]);
    }
  }
  if (options.sections.includes("sales") && options.sales === "game") {
    wanted.push(["sales", { ...own, lineup: options.lineup, assistantContracts: true, sales: true }]);
  }
  const twins = new Map<string, TwinSpec>();
  const roles: Record<string, string> = {};
  for (const [role, spec] of wanted) {
    const key = twinKey(spec);
    twins.set(key, spec);
    roles[role] = key;
  }
  return { twins: [...twins].map(([key, spec]) => ({ key, spec })), roles };
}

/**
 * Refuses, before anything is played, a mode the game does not have: a mode of the game after the change against
 * today's game (« not available before the simplification »), or, against the game after it, a mode whose hook is still
 * a stub. The player's line-up (select, rested) is today's only mode; after the change it is a setting to put the twin in.
 */
function checkModes(options: Options, specs: readonly TwinSpec[]): void {
  if (specs.some((spec) => spec.lineup === "game") && !simplificationLanded()) {
    throw new NotAvailableBeforeSimplification("--lineup=game");
  }
  if (specs.some((spec) => spec.lineup !== "game") && simplificationLanded()) {
    requireHook(setLineupByAssistant, "--lineup=select and --lineup=rested (the player's line-up)");
  }
  if (options.contracts === "game") {
    requireHook(setContractsByAssistant, "--contracts=game");
  }
  if (specs.some((spec) => spec.sales)) {
    requireHook(saleProposalsOf, "--sales=game");
  }
  if (simplificationLanded() && options.contracts === "option") {
    console.warn(
      "The game has the simplification: --contracts=option still asks advanceToNextSeason for its measurement option " +
        "(assistantContracts); --contracts=game measures the game's own assistant.",
    );
  }
}

/** Puts a new twin in its modes: after the change, who fields its eleven and who decides its contracts are its settings. */
async function applyModes(saveId: string, spec: TwinSpec, options: Options): Promise<void> {
  if (spec.lineup !== "game" && simplificationLanded()) {
    await setLineupByAssistant(saveId, false);
  }
  if (spec.lineup === "game" && !isStub(setLineupByAssistant)) {
    await setLineupByAssistant(saveId, true); // a new career's default, said anyway
  }
  if (options.contracts === "game") {
    await setContractsByAssistant(saveId, spec.assistantContracts);
  }
  if (spec.policy !== DEFAULT_ASSISTANT_POLICY) {
    await setAssistantPolicy(saveId, spec.policy);
  }
}

/**
 * A twin's transition: with --contracts=option, today's measurement option, the assistant deciding the managed club's
 * contracts as an AI club's (planSquad) or nobody, every one of them ending; with --contracts=game, the save's own
 * setting (setContractsByAssistant at its creation). The one place to change if the option goes with the change.
 */
function advance(saveId: string, spec: TwinSpec, options: Options): Promise<SeasonTransition> {
  return options.contracts === "option" ? advanceToNextSeason(saveId, { assistantContracts: spec.assistantContracts }) : advanceToNextSeason(saveId);
}

// ------------------------------------------------------------------ Records

/** What the transition opening a season did to the managed club's contracts. */
type ContractsRecord = {
  ended: number; // its contracts that ended, its players gone free (none when its assistant decides them)
  moves: ContractMoves | null; // its assistant's renewals, releases and signings; null when none decided them
};

/** A greedy twin's signings at a summer window's opening. */
type GreedyRecord = {
  asked: number; // free agents asked to sign: those whose reputation demand the club meets
  signed: { overall: number; age: number; value: number; fee: number }[];
  refusals: Record<string, number>; // by reason; « reputation »: he asks more than the club's, not asked
  budgetBefore: number;
  budgetAfter: number;
  squadBefore: number;
  squadAfter: number;
};

/** The managed club at a moment: its league, its squad, its budget, its best eleven. */
type ClubRecord = {
  code: string;
  clubCount: number; // of its league
  reputation: number;
  squad: number; // its players under contract
  goalkeepers: number;
  budget: number;
  eleven: number; // mean rating in their slots of selectLineup in its formation, everyone available
};

/** A season's 1 July: its preseason played, and a greedy twin's signings. */
type StartRecord = ClubRecord & { startYear: number; contracts: ContractsRecord | null; greedy: GreedyRecord | null };

/** New injuries and the days they keep the players out. */
type Tally = { count: number; days: number };

/** A sale the assistant proposed, as its window saw it. */
type ProposalRecord = {
  playerSaveId: string;
  playerKey: string;
  overall: number;
  age: number;
  offer: number;
  value: number;
  starter: boolean; // in the eleven selectLineup fields in the club's formation, everyone available
  bench: boolean; // on that eleven's bench
  sold: boolean;
  fee: number;
};

/** A window of a sales twin: what its assistant proposed, sold, and what was left. */
type SaleWindowRecord = {
  opens: string; // its first day: « 2027-07-01 », « 2028-01-01 »
  proposals: ProposalRecord[];
  squadBefore: number;
  squadAfter: number;
  goalkeepersAfter: number;
  budgetBefore: number;
  budgetAfter: number;
};

/** What a season's play recorded. */
type PlayRecord = {
  matches: number; // the managed club's, every competition
  starters: number; // their starts
  tired: number; // of them under ROTATION_FITNESS at kick-off
  unexpected: number; // steps that did not play what the script foresaw (none expected)
  injuries: { club: Tally; breaks: Tally };
  sales: SaleWindowRecord[];
  seconds: number;
};

/** A season over, every match played, its transition still to come. */
type EndRecord = ClubRecord &
  PlayRecord & {
    // Aged 21 or less on 1 July: how many, their minutes, the club's, the most league starts of one of them, and who
    // they are (PlayerSave.id), whose progression the season's turn then gives (readYouthGrowth).
    youth: { players: number; minutes: number; clubMinutes: number; bestLeagueStarts: number; ids?: string[] };
    feesPaid: number; // transfer fees and signing fees the club paid over the season, its 1 July included
  };

/** What the transition closing a season wrote of it. */
type ClosedRecord = {
  rank: number;
  points: number;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
  cupRound: number | null; // last round played; null without a cup
  cupWon: boolean;
  europe: { code: string; stage: number; won: boolean } | null;
  objectives: { kind: string; imposed: boolean; chosen: boolean; byAssistant: boolean; outcome: string | null }[];
};

/** The progression its turn gave the season's young players (EndRecord.youth.ids), wherever they went: how many, in all. */
type GrowthRecord = { players: number; total: number };

type SeasonRecord = { season: number; start: StartRecord; end: EndRecord; closed: ClosedRecord; growth?: GrowthRecord };

type TwinRecord = { key: string; spec: TwinSpec; seasons: SeasonRecord[]; next: StartRecord; minutes: number };

type GreedyClub = { slug: string; code: string; rank: number };

type Records = {
  seed: string;
  club: string;
  seasons: number;
  modes: { lineup: LineupMode; contracts: ContractsMode; sales: SalesMode; policy?: AssistantPolicy };
  landed: boolean; // the game had the simplification
  sections: Section[];
  greedyClubs: GreedyClub[];
  roles: Record<string, string>; // a role of the report: the key of the twin that plays it
  twins: TwinRecord[];
  minutes: number;
};

// ------------------------------------------------------------------ Reading the managed club

async function readClub(saveId: string): Promise<ClubRecord> {
  const club = await prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { id: true, budget: true, reputation: true, formation: true, competitionId: true, competition: { select: { code: true } } },
  });
  const players = await prisma.playerSave.findMany({
    where: { saveId, clubSaveId: club.id },
    select: { playerKey: true, position: true, overall: true },
  });
  const clubCount = await prisma.clubSave.count({ where: { saveId, competitionId: club.competitionId } });
  const lineup = selectLineup(
    players.map((player) => ({ id: player.playerKey, position: player.position, overall: player.overall, injured: false })),
    formationPositions(parseFormation(club.formation)),
  );
  return {
    code: club.competition.code,
    clubCount,
    reputation: club.reputation,
    squad: players.length,
    goalkeepers: players.filter((player) => player.position === "GK").length,
    budget: club.budget,
    eleven: averageStarterRating(lineup),
  };
}

/** The managed club's players as a step watches them: fitness and injury. */
type WatchedPlayer = { id: string; fitness: number; injuredUntil: Date | null };

const watchedPlayers = (saveId: string, clubSaveId: string): Promise<WatchedPlayer[]> =>
  prisma.playerSave.findMany({ where: { saveId, clubSaveId }, select: { id: true, fitness: true, injuredUntil: true } });

/** Each player's starts over the seasons given, every competition: a match's starters are those it adds one to. */
async function startsOf(saveId: string, seasonIds: readonly string[], playerSaveIds: readonly string[]): Promise<Map<string, number>> {
  const rows = await prisma.playerSeasonStats.groupBy({
    by: ["playerSaveId"],
    where: { saveId, seasonId: { in: [...seasonIds] }, playerSaveId: { in: [...playerSaveIds] } },
    _sum: { starts: true },
  });
  return new Map(rows.map((row) => [row.playerSaveId, row._sum.starts ?? 0]));
}

/** The injuries a step gave: an injury running past its date that was not there before it. */
function addInjuries(tally: Tally, before: readonly WatchedPlayer[], after: readonly WatchedPlayer[], date: Date): void {
  const was = new Map(before.map((player) => [player.id, player.injuredUntil?.getTime() ?? 0]));
  for (const player of after) {
    const until = player.injuredUntil?.getTime() ?? 0;
    if (until > date.getTime() && until !== (was.get(player.id) ?? 0)) {
      tally.count++;
      tally.days += Math.round((until - date.getTime()) / DAY_MS);
    }
  }
}

/** The save's next step, as playNextMatchday plays it without a national coach: a break, or a date of the clubs. */
async function nextStep(saveId: string, clubSaveId: string): Promise<{ date: Date; isBreak: boolean; managed: boolean } | null> {
  const next = await prisma.fixture.findFirst({ where: { saveId, played: false }, orderBy: { scheduledAt: "asc" }, select: { scheduledAt: true } });
  const pendingBreak = await prisma.internationalMatch.findFirst({
    where: { saveId, played: false },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true },
  });
  if (pendingBreak !== null && (next === null || pendingBreak.scheduledAt < next.scheduledAt)) {
    return { date: pendingBreak.scheduledAt, isBreak: true, managed: false };
  }
  if (next === null) {
    return null;
  }
  const managed = await prisma.fixture.count({
    where: { saveId, played: false, scheduledAt: next.scheduledAt, OR: [{ homeClubSaveId: clubSaveId }, { awayClubSaveId: clubSaveId }] },
  });
  return { date: next.scheduledAt, isBreak: false, managed: managed > 0 };
}

// ------------------------------------------------------------------ What a twin does

/**
 * Twin B's line-up before a match of its club, today (--lineup=rested): the eleven and bench the assistant gives the AI
 * clubs, selectRestedLineup in the club's formation, from its players as its line-up editor reads them for that match
 * (getLineupEditor: injured on its day, suspended for its competition, fitness at kick-off), saved as the player saves
 * his (saveManagedLineup), without a starting instruction: Équilibré, as twin A's. « Composition automatique »
 * (automaticState) is this very call; the script makes it on the engine, so that twin B stays the AI clubs' rested eleven
 * whatever the screen's helper becomes with the change.
 */
async function saveRestedLineup(saveId: string): Promise<void> {
  const editor = await getLineupEditor(saveId);
  const lineup = selectRestedLineup(editor.players, formationPositions(editor.formation));
  await saveManagedLineup(saveId, {
    formation: editor.formation,
    lineup: {
      starters: lineup.starters.map(({ index, player }) => ({ slot: index, playerKey: player.id })),
      benchOrder: lineup.bench.map((player) => player.id),
    },
  });
}

/**
 * What « Recruter » sends for a free agent: the wage he asks (TransferQuote.minimumWage, which the change may drop with the
 * wages, § 1.2) for CONTRACT_YEARS seasons. Built apart rather than as a literal: it still type-checks against a signing
 * input without the wage.
 */
function signingInput(saveId: string, playerSaveId: string, quote: TransferQuote) {
  const input = { saveId, playerSaveId, wage: "minimumWage" in quote ? Number(quote.minimumWage) : 0, years: CONTRACT_YEARS };
  return input;
}

/**
 * A greedy twin at a summer window's opening: every free agent by overall, then key, signed as « Recruter » signs him
 * (quoteTransfer, then signFreeAgent at his asked wage for CONTRACT_YEARS seasons), until the squad has SQUAD_LIMIT
 * players or each has been tried. One who asks more reputation than the club has is not asked; any other refusal (the
 * wage budget today, the budget for his signing fee after the change) goes on to the next.
 */
async function signGreedily(twin: Twin): Promise<GreedyRecord> {
  const { saveId, clubSaveId } = twin;
  const club = await prisma.clubSave.findFirstOrThrow({ where: { saveId, id: clubSaveId }, select: { budget: true, reputation: true } });
  const { currentDate } = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
  let squad = await prisma.playerSave.count({ where: { saveId, clubSaveId } });
  const record: GreedyRecord = {
    asked: 0,
    signed: [],
    refusals: {},
    budgetBefore: club.budget,
    budgetAfter: club.budget,
    squadBefore: squad,
    squadAfter: squad,
  };
  const refuse = (reason: string): void => {
    record.refusals[reason] = (record.refusals[reason] ?? 0) + 1;
  };
  // Sorted here rather than by the database, whose collation would order the keys its own way.
  const freeAgents = (
    await prisma.playerSave.findMany({
      where: freeAgentWhere(saveId),
      select: { id: true, playerKey: true, overall: true, birthDate: true, marketValue: true },
    })
  ).sort((a, b) => b.overall - a.overall || (a.playerKey < b.playerKey ? -1 : a.playerKey > b.playerKey ? 1 : 0));
  for (const player of freeAgents) {
    if (squad >= SQUAD_LIMIT) {
      break;
    }
    const quote = await quoteTransfer({ saveId, playerSaveId: player.id });
    if (quote.minimumReputation > club.reputation) {
      refuse("reputation");
      continue;
    }
    record.asked++;
    const outcome = await signFreeAgent(signingInput(saveId, player.id, quote));
    if (!outcome.ok) {
      refuse(outcome.reason);
      continue;
    }
    squad++;
    record.signed.push({ overall: player.overall, age: ageInYears(player.birthDate, currentDate), value: player.marketValue, fee: outcome.fee });
  }
  const after = await prisma.clubSave.findFirstOrThrow({ where: { saveId, id: clubSaveId }, select: { budget: true } });
  return { ...record, budgetAfter: after.budget, squadAfter: squad };
}

/**
 * A sales twin on a date of a window (--sales=game): every sale its assistant proposes (saleProposalsOf), accepted
 * (acceptProposedSale), then read again until none is left that the window has not seen; each with the player's overall,
 * age and value, and whether he was in the eleven or on the bench selectLineup fields with everyone available.
 */
async function sellProposed(twin: Twin, currentDate: Date, windows: SaleWindowRecord[]): Promise<void> {
  const { saveId, clubSaveId } = twin;
  const opens = (transferWindowOpenDate(currentDate) ?? currentDate).toISOString().slice(0, 10);
  let record = windows.find((candidate) => candidate.opens === opens);
  if (record === undefined) {
    const club = await readClub(saveId);
    record = {
      opens,
      proposals: [],
      squadBefore: club.squad,
      squadAfter: club.squad,
      goalkeepersAfter: club.goalkeepers,
      budgetBefore: club.budget,
      budgetAfter: club.budget,
    };
    windows.push(record);
  }
  for (let round = 0; round < MAX_SALE_ROUNDS; round++) {
    const seen = new Set(record.proposals.map((proposal) => proposal.playerSaveId));
    const proposals = (await saleProposalsOf(saveId)).filter((proposal) => !seen.has(proposal.playerSaveId));
    if (proposals.length === 0) {
      break;
    }
    const { formation } = await prisma.clubSave.findFirstOrThrow({ where: { saveId, id: clubSaveId }, select: { formation: true } });
    const players = await prisma.playerSave.findMany({
      where: { saveId, clubSaveId },
      select: { id: true, playerKey: true, position: true, overall: true, birthDate: true, marketValue: true },
    });
    const full = selectLineup(
      players.map((player) => ({ id: player.playerKey, position: player.position, overall: player.overall, injured: false })),
      formationPositions(parseFormation(formation)),
    );
    const starters = new Set(full.starters.map(({ player }) => player.id));
    const bench = new Set(full.bench.map((player) => player.id));
    for (const proposal of proposals) {
      const player = players.find((candidate) => candidate.id === proposal.playerSaveId);
      const sold = player === undefined ? { ok: false, fee: 0 } : await acceptProposedSale(saveId, proposal);
      record.proposals.push({
        playerSaveId: proposal.playerSaveId,
        playerKey: player?.playerKey ?? "?",
        overall: player?.overall ?? 0,
        age: player === undefined ? 0 : ageInYears(player.birthDate, currentDate),
        offer: proposal.offer,
        value: player?.marketValue ?? 0,
        starter: player !== undefined && starters.has(player.playerKey),
        bench: player !== undefined && bench.has(player.playerKey),
        sold: sold.ok,
        fee: sold.fee,
      });
    }
    const club = await readClub(saveId);
    record.squadAfter = club.squad;
    record.goalkeepersAfter = club.goalkeepers;
    record.budgetAfter = club.budget;
  }
}

/**
 * Plays a twin's season to its last date, step by step as playNextMatchday plays it. Before a step where its club plays,
 * twin B (rested) saves its eleven; a sales twin sells, on each date of a window, what its assistant proposes. Each step
 * of its club and each break are watched: its players' new injuries (the club's matches and the breaks apart), and, for
 * its matches, the starters (the players whose starts the match adds one to) with their fitness at kick-off.
 */
async function playSeason(twin: Twin): Promise<PlayRecord> {
  const { saveId, clubSaveId } = twin;
  const began = performance.now();
  const record: PlayRecord = {
    matches: 0,
    starters: 0,
    tired: 0,
    unexpected: 0,
    injuries: { club: { count: 0, days: 0 }, breaks: { count: 0, days: 0 } },
    sales: [],
    seconds: 0,
  };
  const seasonIds = (await prisma.season.findMany({ where: { saveId, completed: false }, select: { id: true } })).map((season) => season.id);
  for (;;) {
    const { currentDate } = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
    if (twin.spec.sales && transferWindowAt(currentDate) !== null) {
      await sellProposed(twin, currentDate, record.sales);
    }
    const step = await nextStep(saveId, clubSaveId);
    if (step === null) {
      break;
    }
    if (step.managed && twin.spec.lineup === "rested") {
      await saveRestedLineup(saveId);
    }
    const watched = step.managed || step.isBreak;
    const before = watched ? await watchedPlayers(saveId, clubSaveId) : [];
    const startsBefore = step.managed ? await startsOf(saveId, seasonIds, before.map((player) => player.id)) : new Map<string, number>();
    const summary = await playNextMatchday(saveId);
    if (summary === null) {
      break;
    }
    if ((summary.managed !== null) !== step.managed || (summary.internationalBreak !== undefined) !== step.isBreak) {
      record.unexpected++;
      console.warn(`  ${twin.key}: the step of ${summary.date.toISOString().slice(0, 10)} was not the one foreseen`);
    }
    if (!watched) {
      continue;
    }
    const after = await watchedPlayers(saveId, clubSaveId);
    addInjuries(step.isBreak ? record.injuries.breaks : record.injuries.club, before, after, summary.date);
    if (step.managed && summary.managed !== null) {
      const startsAfter = await startsOf(saveId, seasonIds, before.map((player) => player.id));
      record.matches++;
      for (const player of before) {
        if ((startsAfter.get(player.id) ?? 0) > (startsBefore.get(player.id) ?? 0)) {
          record.starters++;
          record.tired += fitnessAtKickOff(player.fitness, currentDate, summary.date) < ROTATION_FITNESS ? 1 : 0;
        }
      }
    }
  }
  return { ...record, seconds: Math.round((performance.now() - began) / 1000) };
}

/**
 * The season's end, every match played: the club, the minutes of its players aged YOUTH_OBJECTIVE_MAX_AGE or less on its
 * 1 July (every competition, against all of its players'), the most league starts of one of them, and the fees it paid.
 */
async function readEnd(twin: Twin, startYear: number): Promise<Omit<EndRecord, keyof PlayRecord>> {
  const { saveId, clubSaveId, clubId } = twin;
  const firstDay = seasonStartDate(startYear);
  const seasons = await prisma.season.findMany({ where: { saveId, completed: false }, select: { id: true, competition: { select: { kind: true } } } });
  const league = new Set(seasons.filter((season) => season.competition.kind === "LEAGUE").map((season) => season.id));
  const players = await prisma.playerSave.findMany({ where: { saveId, clubSaveId }, select: { id: true, birthDate: true } });
  const young = new Set(players.filter((player) => ageInYears(player.birthDate, firstDay) <= YOUTH_OBJECTIVE_MAX_AGE).map((player) => player.id));
  const stats = await prisma.playerSeasonStats.findMany({
    where: { saveId, seasonId: { in: seasons.map((season) => season.id) }, playerSaveId: { in: players.map((player) => player.id) } },
    select: { playerSaveId: true, seasonId: true, minutes: true, starts: true },
  });
  const youngStats = stats.filter((row) => young.has(row.playerSaveId));
  const paid = await prisma.transfer.aggregate({
    where: { saveId, toClubId: clubId, date: { gte: firstDay, lt: seasonStartDate(startYear + 1) } },
    _sum: { fee: true },
  });
  return {
    ...(await readClub(saveId)),
    youth: {
      players: young.size,
      minutes: youngStats.reduce((sum, row) => sum + row.minutes, 0),
      clubMinutes: stats.reduce((sum, row) => sum + row.minutes, 0),
      bestLeagueStarts: Math.max(0, ...youngStats.filter((row) => league.has(row.seasonId)).map((row) => row.starts)),
      ids: [...young],
    },
    feesPaid: paid._sum.fee ?? 0,
  };
}

/**
 * The progression the season's turn gave its young players (PlayerSave.previousOverall, the overall before it,
 * docs/design/effectif-adjoint.md § 3), wherever they are now, the retired included.
 */
async function readYouthGrowth(saveId: string, ids: readonly string[]): Promise<GrowthRecord> {
  const players = await prisma.playerSave.findMany({
    where: { saveId, id: { in: [...ids] }, previousOverall: { not: null } },
    select: { overall: true, previousOverall: true },
  });
  return { players: players.length, total: sumOf(players.map((player) => player.overall - (player.previousOverall ?? player.overall))) };
}

/** What the transition closing a season wrote of the managed club's: its result (SeasonResult) and its objectives. */
async function readClosed(saveId: string, startYear: number): Promise<ClosedRecord> {
  const result = await prisma.seasonResult.findFirstOrThrow({
    where: { saveId, season: { startYear } },
    select: { rank: true, points: true, played: true, goalsFor: true, goalsAgainst: true, cupRound: true, trophies: true, europeCode: true, europeStage: true },
  });
  const objectives = await prisma.seasonObjective.findMany({
    where: { saveId, season: { startYear } },
    select: { kind: true, imposed: true, chosen: true, byAssistant: true, outcome: true },
  });
  return {
    rank: result.rank,
    points: result.points,
    played: result.played,
    goalsFor: result.goalsFor,
    goalsAgainst: result.goalsAgainst,
    cupRound: result.cupRound,
    cupWon: result.trophies.includes("cup"),
    europe:
      result.europeCode === null || result.europeStage === null
        ? null
        : { code: result.europeCode, stage: result.europeStage, won: result.trophies.includes("europe") },
    objectives,
  };
}

/** A season's 1 July: a greedy twin's signings first, then the club, and what the transition did to its contracts. */
async function openSeason(twin: Twin, transition: SeasonTransition | null): Promise<StartRecord> {
  const { currentDate } = await prisma.save.findUniqueOrThrow({ where: { id: twin.saveId }, select: { currentDate: true } });
  const startYear = seasonStartYear(currentDate);
  const greedy = twin.spec.greedy ? await signGreedily(twin) : null;
  const contracts =
    transition === null
      ? null
      : { ended: transition.freeAgents, moves: transition.preseason.managed ?? (await contractMovesOf(twin.saveId, startYear)) };
  return { ...(await readClub(twin.saveId)), startYear, contracts, greedy };
}

/** Creates a twin, plays its seasons, and deletes it with its owner. */
async function runTwin(key: string, spec: TwinSpec, options: Options): Promise<TwinRecord> {
  const began = performance.now();
  // A throwaway owner of its own (src/db/test-support.ts): an anonymous player owns one save.
  const ownerId = await createTestOwner();
  try {
    const club = await prisma.club.findUniqueOrThrow({ where: { slug: spec.club }, select: { id: true } });
    const { id: saveId } = await createSave({
      name: `${SAVE_NAME}${options.seed.slice(0, SEED_IN_NAME)} · ${key}`.slice(0, 100),
      managerName: "Test",
      clubId: club.id,
      seed: options.seed,
      ownerId,
      worldVersion: WORLD_VERSION,
    });
    await applyModes(saveId, spec, options);
    const managed = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, clubId: true } });
    const twin: Twin = { key, spec, saveId, clubSaveId: managed.id, clubId: managed.clubId };
    let start = await openSeason(twin, null);
    const seasons: SeasonRecord[] = [];
    for (let season = 1; season <= options.seasons; season++) {
      const play = await playSeason(twin);
      const end = { ...(await readEnd(twin, start.startYear)), ...play };
      const transition = await advance(saveId, spec, options);
      const closed = await readClosed(saveId, start.startYear);
      const growth = await readYouthGrowth(saveId, end.youth.ids ?? []);
      seasons.push({ season, start, end, closed, growth });
      console.log(`  ${key}, S${season} (${seasonLabel(start.startYear)}): ${play.seconds} s, rank ${closed.rank}, squad ${start.squad} → ${end.squad}`);
      start = await openSeason(twin, transition);
    }
    return { key, spec, seasons, next: start, minutes: (performance.now() - began) / 60_000 };
  } finally {
    // The twin goes with its owner (cascade): the next one starts from a lighter database.
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
}

/** A crashed run's twins of this seed, and their throwaway owners. */
async function deleteTwins(seed: string): Promise<void> {
  const saves = await prisma.save.findMany({
    where: { name: { startsWith: `${SAVE_NAME}${seed.slice(0, SEED_IN_NAME)} · ` } },
    select: { id: true, ownerId: true },
  });
  const owners = saves.flatMap((save) => (save.ownerId !== null && save.ownerId.startsWith(TEST_OWNER_PREFIX) ? [save.ownerId] : []));
  await prisma.user.deleteMany({ where: { id: { in: owners } } });
  await prisma.save.deleteMany({ where: { id: { in: saves.map((save) => save.id) } } });
}

/** A club and its reputation rank in its league at the creation (creationReputationRanks, on the world's clubs). */
async function greedyClubOf(slug: string): Promise<GreedyClub> {
  const club = await prisma.club.findUniqueOrThrow({ where: { slug }, select: { competition: { select: { code: true } } } });
  const code = club.competition?.code;
  if (code === undefined) {
    throw new Error(`Club ${slug} has no league`);
  }
  const rank = (await creationRanks(code)).get(slug);
  if (rank === undefined) {
    throw new Error(`No reputation rank for ${slug} in ${code}`);
  }
  return { slug, code, rank };
}

/** The reputation ranks of a league's clubs at a save's creation, as createSave gives them: by slug. */
async function creationRanks(code: string): Promise<Map<string, number>> {
  const clubs = await prisma.club.findMany({
    where: { competition: { code } },
    select: { slug: true, initialRank: true, competition: { select: { tier: true } } },
  });
  const tier = clubs[0]?.competition?.tier;
  if (tier === undefined) {
    throw new Error(`No club in ${code}`);
  }
  return creationReputationRanks(
    clubs.map((club) => ({ key: club.slug, initialRank: club.initialRank, slug: club.slug })),
    competitionTier(tier),
  );
}

/** The greedy clubs: those of --greedy-clubs, or the club at each default rank (its slug breaking equal reputations). */
async function greedyClubs(options: Options): Promise<GreedyClub[]> {
  if (options.greedyClubs !== null) {
    const clubs: GreedyClub[] = [];
    for (const slug of options.greedyClubs) {
      clubs.push(await greedyClubOf(slug));
    }
    return clubs;
  }
  const clubs: GreedyClub[] = [];
  for (const { code, rank } of DEFAULT_GREEDY_CLUBS) {
    const slug = [...(await creationRanks(code))].find(([, at]) => at === rank)?.[0];
    if (slug === undefined) {
      throw new Error(`No club ranked ${rank} by reputation in ${code}`);
    }
    clubs.push({ slug, code, rank });
  }
  return clubs;
}

async function simulate(options: Options): Promise<Records> {
  // The client already refuses any database but a local one (assertLocalDatabase), ALLOW_REMOTE_DB=1 aside: this script
  // writes, so it refuses even that.
  const url = process.env.DATABASE_URL;
  assertLocalDatabase(url, "DATABASE_URL");
  if (url === undefined || url === "" || !isLocalDatabase(url)) {
    throw new Error("Refusing to write anywhere else than the local database");
  }
  const database = new URL(url).pathname.slice(1);
  // The measures run on a dedicated local database, never the development one (docs/design/simplification.md § 11).
  if (database === DEVELOPMENT_DATABASE) {
    throw new Error(`Refusing ${DEVELOPMENT_DATABASE}: point DATABASE_URL at a dedicated local database for the measures`);
  }
  console.log(`Database: ${database} (local), seed ${options.seed}`);
  const started = performance.now();
  let playing = false;
  try {
    const greedy = options.sections.includes("greedy") ? await greedyClubs(options) : [];
    const plan = twinPlan(options, greedy.map((club) => club.slug));
    // A refused mode writes nothing, not even the cleanup of a crashed run.
    checkModes(options, plan.twins.map((twin) => twin.spec));
    playing = true;
    await deleteTwins(options.seed);
    const twins: TwinRecord[] = [];
    for (const { key, spec } of plan.twins) {
      console.log(`Twin ${key}…`);
      twins.push(await runTwin(key, spec, options));
    }
    return {
      seed: options.seed,
      club: options.club,
      seasons: options.seasons,
      modes: { lineup: options.lineup, contracts: options.contracts, sales: options.sales, policy: options.policy },
      landed: simplificationLanded(),
      sections: options.sections,
      greedyClubs: greedy,
      roles: plan.roles,
      twins,
      minutes: (performance.now() - started) / 60_000,
    };
  } finally {
    if (playing) {
      await deleteTwins(options.seed);
    }
    await prisma.$disconnect();
  }
}

// ------------------------------------------------------------------ Report

const fixed = (value: number, digits = 1): string => (Number.isFinite(value) ? value.toFixed(digits) : "—");
const millions = (euros: number): string => fixed(euros / 1_000_000, 1);
const sumOf = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0);
const mean = (values: readonly number[]): number => (values.length === 0 ? Number.NaN : sumOf(values) / values.length);
const percent = (part: number, whole: number): string => (whole === 0 ? "—" : `${fixed((100 * part) / whole, 0)} %`);
const signed = (value: number, digits: number): string => `${value > 0 ? "+" : ""}${fixed(value, digits)}`;

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}

const seasonName = (season: number, startYear: number): string => `S${season} ${seasonLabel(startYear)}`;

const CUP_ROUND_NAMES: Readonly<Record<number, string>> = { 1: "tour prélim.", 2: "16es", 3: "8es", 4: "quarts", 5: "demies", 6: "finale" };
const EUROPE_NAMES: Readonly<Record<string, string>> = { "eu.1": "Lauriers", "eu.2": "Fanions" };
const EUROPE_STAGE_NAMES: Readonly<Record<number, string>> = { 1: "phase de ligue", 2: "barrages", 3: "quarts", 4: "demies", 5: "finale" };
const OBJECTIVE_NAMES: Readonly<Record<string, string>> = {
  RANKING: "Classement",
  CUP: "Coupe",
  EUROPE: "Europe",
  YOUTH: "Jeunesse",
  ENTERTAINMENT: "Spectacle",
  SOLIDITY: "Solidité",
  FINANCES: "Bonne gestion",
};
const OUTCOME_NAMES: Readonly<Record<string, string>> = { EXCEEDED: "dépassé", ACHIEVED: "atteint", MISSED: "manqué" };
const POLICY_NAMES: Readonly<Record<AssistantPolicy, string>> = {
  BEST: "« Meilleur onze » (BEST, le jeu d'avant les consignes)",
  YOUTH: "« Lancer les jeunes » (YOUTH)",
};
const LINEUP_NAMES: Readonly<Record<LineupMode, string>> = {
  select: "selectLineup, aucune composition enregistrée (le meilleur onze, sans repos)",
  rested: "le onze reposé des clubs IA (selectRestedLineup dans son dispositif), enregistré avant chaque match",
  game: "le onze de l'adjoint, celui du jeu",
};

const cupText = (closed: ClosedRecord): string =>
  closed.cupRound === null ? "—" : closed.cupWon ? "vainqueur" : (CUP_ROUND_NAMES[closed.cupRound] ?? `tour ${closed.cupRound}`);

const europeText = (closed: ClosedRecord): string =>
  closed.europe === null
    ? "—"
    : `${EUROPE_NAMES[closed.europe.code] ?? closed.europe.code} : ${closed.europe.won ? "vainqueur" : (EUROPE_STAGE_NAMES[closed.europe.stage] ?? `étape ${closed.europe.stage}`)}`;

/** The Jeunesse objective's outcome when it was the season's chosen one; otherwise the one chosen. */
function youthText(closed: ClosedRecord): string {
  const chosen = closed.objectives.find((objective) => objective.chosen);
  if (chosen === undefined) {
    return "—";
  }
  if (chosen.kind !== "YOUTH") {
    return `— (choisi : ${OBJECTIVE_NAMES[chosen.kind] ?? chosen.kind})`;
  }
  return `${chosen.outcome === null ? "—" : (OUTCOME_NAMES[chosen.outcome] ?? chosen.outcome)}${chosen.byAssistant ? " (choisi par l'adjoint)" : ""}`;
}

const injuriesOf = (end: EndRecord): Tally => ({ count: end.injuries.club.count + end.injuries.breaks.count, days: end.injuries.club.days + end.injuries.breaks.days });

const twinOf = (records: Records, role: string): TwinRecord | undefined => records.twins.find((twin) => twin.key === records.roles[role]);

/** Composition: twin A's seasons against twin B's, then their means. */
function compositionSection(records: Records): string[] {
  const a = twinOf(records, "composition-A");
  const b = twinOf(records, "composition-B");
  if (a === undefined || b === undefined) {
    return [];
  }
  const labels = [
    ["A", a],
    ["B", b],
  ] as const;
  const growthText = (growth: GrowthRecord | undefined): string =>
    growth === undefined || growth.players === 0 ? "—" : `${signed(growth.total / growth.players, 2)} (${growth.players})`;
  const seasonCells = (label: string, { season, start, end, closed, growth }: SeasonRecord): string[] => {
    const injuries = injuriesOf(end);
    return [
      seasonName(season, start.startYear),
      label,
      start.code,
      fixed(closed.points / Math.max(1, closed.played), 2),
      `${closed.rank}/${start.clubCount}`,
      `${closed.goalsFor} · ${closed.goalsAgainst}`,
      cupText(closed),
      europeText(closed),
      `${injuries.count} (${injuries.days} j)${end.injuries.breaks.count > 0 ? `, ${end.injuries.breaks.count} en sélection` : ""}`,
      `${percent(end.tired, end.starters)} (${end.tired}/${end.starters})`,
      `${end.youth.minutes} (${percent(end.youth.minutes, end.youth.clubMinutes)})`,
      String(end.youth.bestLeagueStarts),
      growthText(growth),
      youthText(closed),
    ];
  };
  const rows = a.seasons.flatMap((_, index) =>
    labels.flatMap(([label, twin]) => {
      const record = twin.seasons[index];
      return record === undefined ? [] : [seasonCells(label, record)];
    }),
  );
  const totals = (twin: TwinRecord) => {
    const seasons = twin.seasons;
    const youth = seasons.flatMap(({ closed }) => {
      const chosen = closed.objectives.find((objective) => objective.chosen && objective.kind === "YOUTH");
      return chosen === undefined ? [] : [chosen.outcome];
    });
    return {
      points: sumOf(seasons.map(({ closed }) => closed.points)) / Math.max(1, sumOf(seasons.map(({ closed }) => closed.played))),
      rank: mean(seasons.map(({ closed }) => closed.rank)),
      goalsFor: mean(seasons.map(({ closed }) => closed.goalsFor)),
      goalsAgainst: mean(seasons.map(({ closed }) => closed.goalsAgainst)),
      injuries: mean(seasons.map(({ end }) => injuriesOf(end).count)),
      days: mean(seasons.map(({ end }) => injuriesOf(end).days)),
      tired: sumOf(seasons.map(({ end }) => end.tired)),
      starters: sumOf(seasons.map(({ end }) => end.starters)),
      youthMinutes: mean(seasons.map(({ end }) => end.youth.minutes)),
      // Per young player and per season: every turn's progression over every young player it counted.
      youthGrowth:
        sumOf(seasons.map(({ growth }) => growth?.total ?? 0)) / Math.max(1, sumOf(seasons.map(({ growth }) => growth?.players ?? 0))),
      youthChosen: youth.length,
      youthMet: youth.filter((outcome) => outcome === "ACHIEVED" || outcome === "EXCEEDED").length,
    };
  };
  const [ta, tb] = [totals(a), totals(b)];
  const summaryRow = (label: string, t: ReturnType<typeof totals>): string[] => [
    label,
    fixed(t.points, 2),
    fixed(t.rank, 1),
    `${fixed(t.goalsFor, 1)} · ${fixed(t.goalsAgainst, 1)}`,
    `${fixed(t.injuries, 1)} (${fixed(t.days, 0)} j)`,
    percent(t.tired, t.starters),
    fixed(t.youthMinutes, 0),
    signed(t.youthGrowth, 2),
    `${t.youthMet} / ${t.youthChosen}`,
  ];
  const unexpected = sumOf([a, b].flatMap((twin) => twin.seasons.map(({ end }) => end.unexpected)));
  return [
    "## Composition : le club dirigé passif, son onze par l'adjoint",
    [
      `Club ${records.club}. Jumeau A : ${LINEUP_NAMES.select}. Jumeau B : ${LINEUP_NAMES[b.spec.lineup]}.`,
      `Consigne de l'adjoint : ${POLICY_NAMES[records.modes.policy ?? DEFAULT_ASSISTANT_POLICY]}.`,
      `${a.key === b.key ? "Les deux jumeaux n'en font qu'un (--lineup=select). " : ""}Les deux : contrats à l'adjoint, aucune`,
      "action du joueur. Pts / match : points par match de championnat ; buts : championnat, pour · contre ; blessures :",
      "nouvelles blessures des joueurs du club, matchs et trêves (en sélection), et les jours d'absence qu'elles donnent ;",
      `titulaires sous ${ROTATION_FITNESS} : titularisations de tous ses matchs à moins de ${ROTATION_FITNESS} de condition au coup`,
      `d'envoi ; minutes des ${YOUTH_OBJECTIVE_MAX_AGE} ans ou moins au 1er juillet, toutes compétitions (part des minutes du`,
      `club) ; titularisations en championnat du meilleur d'entre eux (Jeunesse : ${YOUTH_OBJECTIVE_STARTS}) ; progression : la`,
      "note qu'ils gagnent au passage de saison, en moyenne par jeune (combien) ; Jeunesse : son",
      "issue quand c'était l'objectif choisi de la saison. Cible du cahier : B au moins aussi bon que A, moins de blessures et",
      "de titulaires fatigués.",
    ].join(" "),
    table(
      [
        "Saison",
        "Jumeau",
        "Division",
        "Pts / match",
        "Rang",
        "Buts",
        "Coupe",
        "Europe",
        "Blessures (jours)",
        `Titulaires sous ${ROTATION_FITNESS}`,
        `Minutes des ${YOUTH_OBJECTIVE_MAX_AGE} ans ou moins`,
        "Titularisations du meilleur jeune",
        "Progression des jeunes",
        "Jeunesse",
      ],
      rows,
    ),
    `### Sur ${records.seasons} saisons (moyennes par saison)`,
    table(
      [
        "Jumeau",
        "Pts / match",
        "Rang",
        "Buts pour · contre",
        "Blessures (jours)",
        `Titulaires sous ${ROTATION_FITNESS}`,
        `Minutes des ${YOUTH_OBJECTIVE_MAX_AGE} ans ou moins`,
        "Progression par jeune",
        "Jeunesse tenue / choisie",
      ],
      [summaryRow("A", ta), summaryRow("B", tb)],
    ),
    [
      `B − A : ${signed(tb.points - ta.points, 2)} point par match, ${signed(tb.rank - ta.rank, 1)} place au rang moyen,`,
      `${signed(tb.injuries - ta.injuries, 1)} blessure par saison (${signed(tb.days - ta.days, 0)} jours),`,
      `${signed(tb.starters === 0 || ta.starters === 0 ? Number.NaN : (100 * tb.tired) / tb.starters - (100 * ta.tired) / ta.starters, 1)} points de titulaires sous ${ROTATION_FITNESS},`,
      `${signed(tb.youthMinutes - ta.youthMinutes, 0)} minutes des jeunes par saison, ${signed(tb.youthGrowth - ta.youthGrowth, 2)} de`,
      "progression par jeune et par saison.",
      unexpected === 0 ? "" : `Attention : ${unexpected} étapes n'ont pas joué ce que le script attendait.`,
    ]
      .filter((part) => part !== "")
      .join(" "),
  ];
}

/** Contracts: the managed club's squad on each 1 July, what each transition did to its contracts, its rank. */
function contractsSection(records: Records): string[] {
  const off = twinOf(records, "contracts-off");
  const on = twinOf(records, "contracts-on");
  if (off === undefined || on === undefined) {
    return [];
  }
  const labels = [
    ["joueur", off],
    ["adjoint", on],
  ] as const;
  const starts = (twin: TwinRecord): { season: number; start: StartRecord; rank: string }[] => [
    ...twin.seasons.map(({ season, start, closed }) => ({ season, start, rank: `${closed.rank}/${start.clubCount}` })),
    { season: twin.seasons.length + 1, start: twin.next, rank: "—" },
  ];
  const rows = starts(off).flatMap((_, index) =>
    labels.flatMap(([label, twin]) => {
      const entry = starts(twin)[index];
      if (entry === undefined) {
        return [];
      }
      const { contracts } = entry.start;
      return [
        [
          seasonName(entry.season, entry.start.startYear),
          label,
          `${entry.start.squad} (${entry.start.goalkeepers} gardiens)`,
          contracts === null ? "— (création)" : String(contracts.ended),
          contracts === null || contracts.moves === null ? "—" : `${contracts.moves.renewals} · ${contracts.moves.releases} · ${contracts.moves.signings}`,
          entry.rank,
        ],
      ];
    }),
  );
  const summers = (twin: TwinRecord): number[] => starts(twin).slice(1).map(({ start }) => start.squad);
  return [
    "## Contrats : le club dirigé passif, ses fins de contrat",
    [
      `Club ${records.club}, onze par selectLineup. Jumeau « joueur » : personne ne décide de ses contrats qui finissent, tous`,
      "partent libres au passage de saison (le jeu d'aujourd'hui) ; jumeau « adjoint » :",
      records.modes.contracts === "option"
        ? "l'adjoint en décide comme un club IA (advanceToNextSeason avec assistantContracts : planSquad prolonge, libère et recrute)."
        : "l'adjoint du jeu en décide (son réglage « Contrats »).",
      "Effectif au 1er juillet : après le passage et sa présaison (deux jeunes par club). Fins de contrat : ses joueurs partis",
      "libres au passage ; prolongés · libérés · recrues : les décisions de l'adjoint à la présaison ; rang final de la saison.",
      "Cible du cahier : l'effectif ne fond plus, 20 à 25 joueurs chaque été.",
    ].join(" "),
    table(["1er juillet", "Contrats", "Effectif", "Fins de contrat", "Prolongés · libérés · recrues", "Rang final"], rows),
    `Effectif des étés suivants : joueur ${summers(off).join(", ")} ; adjoint ${summers(on).join(", ")}.`,
  ];
}

/** Greedy clubs: each greedy twin against the passive twin of its club, season by season, then over the seasons. */
function greedySection(records: Records): string[] {
  const parts: string[] = [];
  for (const club of records.greedyClubs) {
    const greedy = twinOf(records, `greedy:${club.slug}`);
    const passive = twinOf(records, `passive:${club.slug}`);
    if (greedy === undefined || passive === undefined) {
      continue;
    }
    const labels = [
      ["gourmand", greedy],
      ["passif", passive],
    ] as const;
    const signingCells = (start: StartRecord): string[] => {
      const summer = start.greedy;
      if (summer === null) {
        return ["—", "—", "—", "—"];
      }
      const refusals = Object.entries(summer.refusals)
        .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1))
        .map(([reason, count]) => `${reason} ${count}`)
        .join(", ");
      return [
        `${summer.signed.length} (${summer.squadBefore} → ${summer.squadAfter})`,
        fixed(mean(summer.signed.map((signing) => signing.overall)), 1),
        millions(sumOf(summer.signed.map((signing) => signing.fee))),
        refusals === "" ? "—" : refusals,
      ];
    };
    const rows = greedy.seasons.flatMap((_, index) =>
      labels.flatMap(([label, twin]) => {
        const record = twin.seasons[index];
        if (record === undefined) {
          return [];
        }
        const { season, start, end, closed } = record;
        return [
          [
            seasonName(season, start.startYear),
            label,
            ...signingCells(start),
            fixed(start.eleven, 1),
            `${start.squad} → ${end.squad}`,
            `${millions(start.budget)} → ${millions(end.budget)}`,
            millions(end.feesPaid),
            `${closed.rank}/${start.clubCount} (${start.code})`,
          ],
        ];
      }),
    );
    const total = (twin: TwinRecord) => ({
      signed: sumOf(twin.seasons.map(({ start }) => start.greedy?.signed.length ?? 0)) + (twin.next.greedy?.signed.length ?? 0),
      fees: sumOf(twin.seasons.map(({ end }) => end.feesPaid)),
      eleven: mean(twin.seasons.map(({ start }) => start.eleven)),
      rank: mean(twin.seasons.map(({ closed }) => closed.rank)),
      points: sumOf(twin.seasons.map(({ closed }) => closed.points)) / Math.max(1, sumOf(twin.seasons.map(({ closed }) => closed.played))),
      budget: twin.seasons.at(-1)?.end.budget ?? Number.NaN,
    });
    const [g, p] = [total(greedy), total(passive)];
    parts.push(
      `### ${club.code}, ${club.rank}e de réputation à la création : ${club.slug}`,
      table(
        [
          "Saison",
          "Jumeau",
          "Signés au 1er juillet (effectif avant → après)",
          "Note moy. des signés",
          "Primes (M€)",
          "Refus",
          "Onze au 1er juillet",
          "Effectif 1er juillet → fin",
          "Budget 1er juillet → fin (M€)",
          "Payé sur la saison (M€)",
          "Rang",
        ],
        rows,
      ),
      [
        `Sur ${records.seasons} saisons : le gourmand signe ${g.signed} joueurs libres (le dernier été compris) et paie ${millions(g.fees)} M€`,
        `(passif : ${millions(p.fees)} M€) ; son onze au 1er juillet ${signed(g.eleven - p.eleven, 1)} de note en moyenne,`,
        `${signed(g.points - p.points, 2)} point par match, ${signed(g.rank - p.rank, 1)} place au rang moyen ; budget à la fin de`,
        `la dernière saison ${millions(g.budget)} M€ contre ${millions(p.budget)} M€.`,
      ].join(" "),
    );
  }
  if (parts.length === 0) {
    return [];
  }
  return [
    "## Club gourmand : les meilleurs joueurs libres à chaque été",
    [
      "À chaque ouverture du mercato d'été (la date de la création, puis chaque 1er juillet après le passage), le jumeau",
      "gourmand signe les meilleurs joueurs libres qu'il peut, par note puis par clé, comme « Recruter » (quoteTransfer, puis",
      `signFreeAgent au salaire demandé, ${CONTRACT_YEARS} saisons), jusqu'à ${SQUAD_LIMIT} joueurs ou faute de candidat ; un joueur`,
      "qui demande plus de réputation que le club n'est pas sollicité (refus « reputation »), les autres refus sont ceux du jeu",
      "(wage_budget_exceeded : le plafond salarial d'aujourd'hui). Le jumeau passif du même club ne signe personne. Les deux :",
      "onze par selectLineup, contrats à l'adjoint. Onze : note moyenne au poste du meilleur onze de l'effectif, tous disponibles ;",
      "payé sur la saison : indemnités et primes des transferts vers le club, du 1er juillet au 30 juin. Cible du cahier : un gain",
      "réel mais borné, la prime et les 30 joueurs mordent.",
    ].join(" "),
    ...parts,
  ];
}

/** Proposed sales: each window of the sales twin, what its assistant proposed and what selling it all did. */
function salesSection(records: Records): string[] {
  const heading = "## Ventes proposées par l'adjoint";
  if (!records.sections.includes("sales")) {
    return [];
  }
  if (records.modes.sales === "off") {
    return [
      heading,
      records.landed
        ? "Non mesurées (--sales=off) : --sales=game les mesure."
        : "Non mesurées avant la simplification (not measured before the simplification) : --sales=game, une fois les ventes proposées dans le jeu (scripts/simplification-hooks.ts, saleProposalsOf).",
    ];
  }
  const twin = twinOf(records, "sales");
  if (twin === undefined) {
    return [heading, "Aucun jumeau des ventes."];
  }
  const windows = twin.seasons.flatMap(({ season, start, end }) => end.sales.map((sale) => ({ season, startYear: start.startYear, sale })));
  const rows = windows.map(({ season, startYear, sale }) => {
    const sold = sale.proposals.filter((proposal) => proposal.sold);
    return [
      seasonName(season, startYear),
      `${sale.opens.slice(5) === "07-01" ? "été" : "hiver"} (${sale.opens})`,
      String(sale.proposals.length),
      fixed(mean(sale.proposals.filter((proposal) => proposal.value > 0).map((proposal) => proposal.offer / proposal.value)), 2),
      String(sale.proposals.filter((proposal) => proposal.starter).length),
      String(sale.proposals.filter((proposal) => proposal.bench).length),
      `${sold.length} · ${millions(sumOf(sold.map((proposal) => proposal.fee)))}`,
      `${sale.squadBefore} → ${sale.squadAfter} (${sale.goalkeepersAfter} gardiens)`,
      `${millions(sale.budgetBefore)} → ${millions(sale.budgetAfter)}`,
    ];
  });
  const all = windows.flatMap(({ sale }) => sale.proposals);
  return [
    heading,
    [
      `Club ${records.club}, ${LINEUP_NAMES[twin.spec.lineup]}, contrats à l'adjoint. À chaque date d'un mercato, le jumeau accepte`,
      "toutes les ventes que propose son adjoint (lues de nouveau jusqu'à ce qu'il n'en propose plus de nouvelle). Offre / valeur :",
      "moyenne des offres sur la valeur des joueurs ; titulaires et remplaçants : joueurs proposés qui étaient dans le onze ou",
      "sur le banc de selectLineup, effectif complet et disponible. Cible du cahier : 0 à 3 par mercato, jamais un titulaire,",
      "22 joueurs au moins.",
    ].join(" "),
    table(["Saison", "Mercato", "Proposés", "Offre / valeur", "Titulaires", "Remplaçants", "Vendus · M€", "Effectif avant → après", "Budget avant → après (M€)"], rows),
    `Sur ${windows.length} mercatos : ${all.length} ventes proposées, ${all.filter((proposal) => proposal.sold).length} faites pour ${millions(sumOf(all.map((proposal) => proposal.fee)))} M€, ${all.filter((proposal) => proposal.starter).length} titulaires proposés ; effectif le plus bas après un mercato : ${windows.length === 0 ? "—" : Math.min(...windows.map(({ sale }) => sale.squadAfter))}.`,
  ];
}

function report(records: Records): string {
  const contractsRule =
    records.modes.contracts === "option"
      ? "l'option de mesure d'advanceToNextSeason (assistantContracts)"
      : "le réglage « Contrats » de chaque partie";
  return [
    "# L'adjoint : jumeaux d'une partie 2 (chantier « simplification », § 11)",
    [
      `Graine ${records.seed}, club dirigé ${records.club}, ${records.seasons} saisons par jumeau : chaque date simulée comme`,
      "« Simuler » la joue (l'adjoint décide des événements à choix), chaque saison suivie du passage de saison. Jeu",
      `${records.landed ? "après" : "avant"} la simplification ; composition du jumeau B : ${records.modes.lineup} ; contrats : ${contractsRule} ;`,
      `ventes proposées : ${records.modes.sales}. ${records.twins.length} jumeaux, ${fixed(records.minutes, 1)} min. Montants en M€.`,
    ].join(" "),
    ...compositionSection(records),
    ...contractsSection(records),
    ...greedySection(records),
    ...salesSection(records),
  ].join("\n\n");
}

// ------------------------------------------------------------------ Main

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const records: Records = options.from === undefined ? await simulate(options) : (JSON.parse(readFileSync(options.from, "utf8")) as Records);
  const json = options.out === undefined ? undefined : `${options.out.replace(/\.md$/, "")}.json`;
  // The raw records first: a report that fails must not cost the seasons played.
  if (json !== undefined && options.from === undefined) {
    writeFileSync(json, JSON.stringify(records));
  }
  const text = report(records);
  console.log(`\n${text}`);
  if (options.out !== undefined) {
    writeFileSync(options.out, `${text}\n`);
    console.log(`\nWritten: ${options.out}${json === undefined || options.from !== undefined ? "" : ` and ${json}`}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
