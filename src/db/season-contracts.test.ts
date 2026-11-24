import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTRACT_YEARS_WEIGHTS, MIN_GOALKEEPERS, SQUAD_LIMIT, SQUAD_SIZE_MIN } from "../engine/balance";
import { contractEndDate, marketValueFor, signingBonus, wageFor } from "../engine/economy";
import { seasonEndDate, seasonStartDate, WORLD_START_YEAR } from "../engine/world";
import { youthKeyPrefix } from "../engine/youth";
import { ageInYears } from "../lib/dates";
import type { prisma as prismaClient } from "./client";
import type { ContractMoves } from "./contracts";
import type { SeasonTransition } from "./season";

const LAST_CONTRACT_DAY = seasonEndDate(WORLD_START_YEAR);
const RUNNING_CONTRACT_DAY = seasonEndDate(WORLD_START_YEAR + 3);
const TRANSITION_DATE = seasonStartDate(WORLD_START_YEAR + 1);
const YOUTH_PREFIX = youthKeyPrefix(WORLD_START_YEAR + 1);
const BUDGET = 100_000_000;

/** A player of the managed club, as read before and after the transition. */
type ManagedPlayer = {
  key: string;
  position: string;
  birthDate: Date;
  overall: number;
  potential: number;
  wage: number;
  contractUntil: string | null;
};

/** A transfer of the transition's day: comparable between two saves, Club ids being the world's. */
type DayTransfer = { key: string; from: string | null; to: string | null; type: string; fee: number };

/** The players chosen for, by key: their choice, and those whose contract runs past the season. */
type Setup = { leave: string[]; renew: string; running: string[] };

type Outcome = {
  transition: SeasonTransition;
  clubId: string; // the managed club's Club.id
  setup: Setup;
  before: ManagedPlayer[];
  after: ManagedPlayer[]; // the preseason included
  transfers: DayTransfer[];
  moves: ContractMoves | null; // SeasonBudget.contractMoves of the season opened
  seasonBudget: number; // its dotation: the budget the club starts the preseason with
  budget: number; // ClubSave.budget once the preseason is over
  choicesLeft: number; // PlayerSave.contractChoice still set in the save
};

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const transferOrder = (move: DayTransfer): string => `${move.key}|${move.type}|${move.from}|${move.to}`;

/** Its wage at its rating and age on the transition's day: a free signing's, or a renewal's at least. */
const currentWage = (player: ManagedPlayer): number =>
  wageFor({ age: ageInYears(player.birthDate, TRANSITION_DATE), overall: player.overall });

/** A turn's moves without the saves' own ids (PlayerSave.id): comparable between two saves. */
const withoutId = (entry: { id: string }) => Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "id"));
const movesWithoutIds = (moves: ContractMoves | null) =>
  moves === null
    ? null
    : { ...moves, renewed: moves.renewed.map(withoutId), left: moves.left.map(withoutId), signed: moves.signed.map(withoutId) };

// The managed club's contracts ending on 30 June at the season's turn (docs/design/simplification.md § 2.1), on three
// throwaway worldVersion 1 twins of the demo save whose first season is marked over (every fixture a 1-1 draw: the turn
// needs the season finished, not its matches) and set up alike: its five best outfield players under contracts running
// past the season, every other one's ending with it; its player's choices made through setContractChoice: eight good
// outfield players and every goalkeeper let go, a weak one renewed; a budget of 100 M€. The first plays its player's
// rule (the option false over the career's default), the second its assistant's (the career's default), the third its
// assistant's again by the option over a career set to its player's. Runs against DATABASE_URL and is skipped without
// it; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the managed club's contracts at the season's turn", () => {
  let db: typeof prismaClient | undefined;
  const saveIds: string[] = [];
  const outcomes: Outcome[] = [];

  const outcome = (index: number): Outcome => {
    const found = outcomes[index];
    if (found === undefined) {
      throw new Error("The transitions did not run");
    }
    return found;
  };

  beforeAll(async () => {
    const [{ prisma }, support, season, contracts] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./season"),
      import("./contracts"),
    ]);
    db = prisma;
    saveIds.push(
      ...(await Promise.all([
        support.createDemoTwin("Test contrats, joueur", 1),
        support.createDemoTwin("Test contrats, adjoint", 1),
        support.createDemoTwin("Test contrats, option", 1),
      ])),
    );

    const readManaged = async (saveId: string): Promise<ManagedPlayer[]> => {
      const rows = await prisma.playerSave.findMany({
        where: { saveId, clubSave: { isManaged: true } },
        select: { playerKey: true, position: true, birthDate: true, overall: true, potential: true, wage: true, contractUntil: true },
      });
      return rows
        .map(({ playerKey, contractUntil, ...row }) => ({ ...row, key: playerKey, contractUntil: contractUntil?.toISOString() ?? null }))
        .sort((a, b) => compare(a.key, b.key));
    };

    /** The season marked over, the contracts and the choices set up, the budget given. */
    const setUp = async (saveId: string): Promise<Setup> => {
      await prisma.fixture.updateMany({
        where: { saveId },
        data: { played: true, status: "PLAYED", homeGoals: 1, awayGoals: 1, homeHalfTimeGoals: 0, awayHalfTimeGoals: 0 },
      });
      const club = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
      await prisma.clubSave.update({ where: { id: club.id, saveId }, data: { budget: BUDGET } });
      const players = await prisma.playerSave.findMany({
        where: { saveId, clubSaveId: club.id },
        orderBy: [{ overall: "desc" }, { playerKey: "asc" }],
        select: { id: true, playerKey: true, position: true, birthDate: true },
      });
      const outfield = players.filter((player) => player.position !== "GK");
      const running = outfield.slice(0, 5);
      const leave = [...outfield.slice(5, 13), ...players.filter((player) => player.position === "GK")];
      // The weakest outfield player aged 25 to 32 on the turn's day: no prospect, whom the rule would not keep, nor an age
      // to retire at (from 34).
      const renew = outfield
        .slice(13)
        .filter((player) => ageInYears(player.birthDate, TRANSITION_DATE) > 24 && ageInYears(player.birthDate, TRANSITION_DATE) < 33)
        .at(-1);
      if (renew === undefined) {
        throw new Error("No player to renew");
      }
      await prisma.playerSave.updateMany({ where: { saveId, clubSaveId: club.id }, data: { contractUntil: LAST_CONTRACT_DAY } });
      await prisma.playerSave.updateMany({
        where: { saveId, id: { in: running.map((player) => player.id) } },
        data: { contractUntil: RUNNING_CONTRACT_DAY },
      });
      for (const player of leave) {
        expect(await contracts.setContractChoice({ saveId, playerSaveId: player.id, choice: "LEAVE" })).toMatchObject({ ok: true });
      }
      expect(await contracts.setContractChoice({ saveId, playerSaveId: renew.id, choice: "RENEW" })).toMatchObject({ ok: true });
      // A contract running past the season: no choice to make for it.
      expect(await contracts.setContractChoice({ saveId, playerSaveId: running[0].id, choice: "LEAVE" })).toEqual({ ok: false });
      return {
        leave: leave.map((player) => player.playerKey),
        renew: renew.playerKey,
        running: running.map((player) => player.playerKey),
      };
    };

    const advance = async (saveId: string, assistantContracts: boolean | undefined): Promise<Outcome> => {
      const setup = await setUp(saveId);
      const { clubId } = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { clubId: true } });
      const before = await readManaged(saveId);
      const transition = await season.advanceToNextSeason(saveId, assistantContracts === undefined ? undefined : { assistantContracts });
      const transfers = await prisma.transfer.findMany({
        where: { saveId, date: TRANSITION_DATE },
        select: { fromClubId: true, toClubId: true, type: true, fee: true, playerSave: { select: { playerKey: true } } },
      });
      const seasonBudget = await prisma.seasonBudget.findFirstOrThrow({
        where: { saveId, season: { startYear: WORLD_START_YEAR + 1 } },
        select: { budget: true, contractMoves: true },
      });
      const { budget } = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { budget: true } });
      return {
        transition,
        clubId,
        setup,
        before,
        after: await readManaged(saveId),
        transfers: transfers
          .map((row) => ({ key: row.playerSave.playerKey, from: row.fromClubId, to: row.toClubId, type: row.type, fee: row.fee }))
          .sort((a, b) => compare(transferOrder(a), transferOrder(b))),
        moves: contracts.parseContractMoves(seasonBudget.contractMoves),
        seasonBudget: seasonBudget.budget,
        budget,
        choicesLeft: await prisma.playerSave.count({ where: { saveId, contractChoice: { not: null } } }),
      };
    };

    // One after the other: each transition rewrites thousands of rows. The third career keeps its contracts itself.
    await prisma.save.update({ where: { id: saveIds[2] }, data: { contractsByAssistant: false } });
    outcomes.push(await advance(saveIds[0], false));
    outcomes.push(await advance(saveIds[1], undefined));
    outcomes.push(await advance(saveIds[2], true));
  }, 900_000);

  // Deleting a save cascades to thousands of rows: allow more than the hook default.
  afterAll(async () => {
    for (const saveId of saveIds) {
      await db?.save.deleteMany({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 120_000);

  /** The managed club's players of before the turn who did not retire at it, and its FREE transfers that day. */
  const read = ({ before, after, transfers, clubId }: Outcome) => {
    const keysOf = (keep: (move: DayTransfer) => boolean): Set<string> => new Set(transfers.filter(keep).map((move) => move.key));
    const retired = keysOf((move) => move.type === "RETIREMENT" && move.from === clubId);
    const afterByKey = new Map(after.map((player) => [player.key, player]));
    const formerKeys = new Set(before.map((player) => player.key));
    const staying = before.filter((player) => !retired.has(player.key));
    return {
      afterByKey,
      staying,
      retired,
      releasedKeys: keysOf((move) => move.type === "FREE" && move.from === clubId && move.to === null),
      signings: transfers.filter((move) => move.type === "FREE" && move.from === null && move.to === clubId),
      youths: after.filter((player) => player.key.startsWith(YOUTH_PREFIX)),
      signed: after.filter((player) => !player.key.startsWith(YOUTH_PREFIX) && !formerKeys.has(player.key)),
    };
  };

  const renewalEnds = CONTRACT_YEARS_WEIGHTS.map((_, index) => contractEndDate(TRANSITION_DATE, index + 1).toISOString());

  it("lets its player's contracts go free but for his choice to renew, signs nobody, and never touches a running one", () => {
    const state = outcome(0);
    const { afterByKey, staying, releasedKeys, signings, youths } = read(state);
    const moves = state.moves;
    if (moves === null) {
      throw new Error("No moves kept");
    }
    const running = new Set(state.setup.running);
    const expiring = staying.filter((player) => !running.has(player.key));

    // Every expiring contract gone free, but the one he chose to renew; the running ones as they were.
    expect(expiring.filter((player) => player.key !== state.setup.renew && afterByKey.has(player.key))).toEqual([]);
    expect(expiring.filter((player) => player.key !== state.setup.renew && !releasedKeys.has(player.key))).toEqual([]);
    expect(afterByKey.get(state.setup.renew)?.contractUntil).toBeOneOf(renewalEnds);
    for (const key of state.setup.running.filter((key) => staying.some((player) => player.key === key))) {
      expect(afterByKey.get(key)?.contractUntil).toBe(RUNNING_CONTRACT_DAY.toISOString());
      expect(releasedKeys.has(key)).toBe(false);
    }
    // Nobody signed, however thin the squad: its player recruits himself.
    expect(signings).toEqual([]);
    expect(state.after.length).toBeLessThan(SQUAD_SIZE_MIN);
    expect(state.transition.preseason.managed).toBeUndefined();
    expect(state.transition.freeAgents).toBe(releasedKeys.size);
    expect(state.budget).toBe(state.seasonBudget);
    // What the turn did, kept for the season's start.
    expect(moves.byAssistant).toBe(false);
    expect(moves.renewed.map(({ by }) => by)).toEqual(["player"]);
    expect(moves.left).toHaveLength(releasedKeys.size);
    expect(new Set(moves.left.map(({ by }) => by))).toEqual(new Set(["player", "default"]));
    expect(moves.signed).toEqual([]);
    expect(moves.youths).toBe(youths.length);
    expect(moves.squad).toBe(state.after.length);
    expect(state.choicesLeft).toBe(0);
  });

  it("lets the assistant renew or let go every contract his player chose nothing for, the choices first, the running ones untouched", () => {
    const state = outcome(1);
    const { afterByKey, staying, releasedKeys } = read(state);
    const moves = state.moves;
    if (moves === null) {
      throw new Error("No moves kept");
    }
    const running = new Set(state.setup.running);
    const leave = new Set(state.setup.leave);
    const expiring = staying.filter((player) => !running.has(player.key));
    const renewed = expiring.filter((player) => afterByKey.has(player.key));
    const gone = expiring.filter((player) => !afterByKey.has(player.key));

    // His choices first: every one he let go is gone, the one he renewed is renewed.
    expect(staying.filter((player) => leave.has(player.key) && !releasedKeys.has(player.key))).toEqual([]);
    expect(afterByKey.has(state.setup.renew)).toBe(true);
    // The others, the assistant's rule: some renewed, some gone free; nobody under a running contract released.
    expect(moves.renewed.some(({ by }) => by === "assistant")).toBe(true);
    expect(moves.left.some(({ by }) => by === "assistant")).toBe(true);
    expect(gone.filter((player) => !releasedKeys.has(player.key))).toEqual([]);
    expect(staying.filter((player) => running.has(player.key) && afterByKey.get(player.key)?.contractUntil !== RUNNING_CONTRACT_DAY.toISOString())).toEqual([]);
    expect(staying.filter((player) => running.has(player.key) && releasedKeys.has(player.key))).toEqual([]);
    // A renewed contract runs one to five more seasons, at its old wage or at the one its new rating and age earn.
    const renewals = renewed.map((player) => ({ player, now: afterByKey.get(player.key) ?? player }));
    expect(renewals.map(({ player, now }) => ({ key: player.key, ends: now.contractUntil, wage: now.wage }))).toEqual(
      renewals.map(({ player, now }) => ({
        key: player.key,
        ends: expect.toBeOneOf(renewalEnds),
        wage: Math.max(player.wage, currentWage(now)),
      })),
    );
    // Who decided each, kept for the season's start.
    expect(moves.byAssistant).toBe(true);
    expect(moves.renewed).toHaveLength(renewed.length);
    expect(moves.left).toHaveLength(gone.length);
    expect(moves.renewed.filter(({ by }) => by === "player")).toHaveLength(1);
    expect(moves.left.filter(({ by }) => by === "player")).toHaveLength(staying.filter((player) => leave.has(player.key)).length);
    expect(moves.left.some(({ by }) => by === "default")).toBe(false);
    expect(state.transition.freeAgents).toBe(gone.length);
    expect(state.choicesLeft).toBe(0);
  });

  it("signs free agents only to bring a thinned squad back to twenty and two goalkeepers, each paying his bonus", () => {
    const state = outcome(1);
    const { signings, signed, youths } = read(state);
    const moves = state.moves;
    if (moves === null) {
      throw new Error("No moves kept");
    }
    const goalkeepers = (players: readonly ManagedPlayer[]) => players.filter((player) => player.position === "GK").length;

    expect(signed.length).toBeGreaterThan(0);
    // Never one of the players just let go, by his player or by himself: each signing a newcomer.
    expect(signings).toHaveLength(signed.length);
    expect(signings.filter((move) => state.before.some((player) => player.key === move.key))).toEqual([]);
    // Never one more than needed: the goalkeepers missing, then up to twenty, no further.
    const beforeSignings = state.after.filter((player) => !signed.includes(player));
    expect(beforeSignings.length < SQUAD_SIZE_MIN || goalkeepers(beforeSignings) < MIN_GOALKEEPERS).toBe(true);
    const missingKeepers = Math.max(0, MIN_GOALKEEPERS - goalkeepers(beforeSignings));
    expect(state.after.length).toBe(Math.max(SQUAD_SIZE_MIN, beforeSignings.length + missingKeepers));
    expect(state.after.length).toBeLessThanOrEqual(SQUAD_LIMIT);
    expect(goalkeepers(state.after)).toBeGreaterThanOrEqual(MIN_GOALKEEPERS);
    // Each bonus a quarter of his value on the day, at least 50 000 €, the FREE transfer's fee, out of the budget.
    const bonusOf = (player: ManagedPlayer): number =>
      signingBonus(marketValueFor({ age: ageInYears(player.birthDate, TRANSITION_DATE), overall: player.overall, potential: player.potential }));
    const fees = new Map(signings.map((move) => [move.key, move.fee]));
    expect(signed.map((player) => ({ key: player.key, fee: fees.get(player.key), wage: player.wage }))).toEqual(
      signed.map((player) => ({ key: player.key, fee: bonusOf(player), wage: currentWage(player) })),
    );
    const paid = signings.reduce((sum, move) => sum + move.fee, 0);
    expect(state.budget).toBe(state.seasonBudget - paid);
    // The season's start reads them: who signed, the young players, the squad.
    expect(moves.signed.map(({ bonus }) => bonus).sort()).toEqual([...fees.values()].sort());
    expect(moves.youths).toBe(youths.length);
    expect(moves.squad).toBe(state.after.length);
    expect(state.transition.preseason.managed).toEqual({ renewals: moves.renewed.length, releases: moves.left.length, signings: signed.length });
  });

  it("plays the assistant's rule when the option asks for it, whatever the career's setting: the same turn, to the transfer", () => {
    const [assistant, option] = [outcome(1), outcome(2)];
    const comparable = ({ transition }: Outcome) => ({
      ...transition,
      completedSeasonId: null,
      preseason: { ...transition.preseason, contractMoves: movesWithoutIds(transition.preseason.contractMoves) },
    });

    expect(comparable(option)).toEqual(comparable(assistant));
    expect(option.after).toEqual(assistant.after);
    expect(option.transfers).toEqual(assistant.transfers);
    expect(movesWithoutIds(option.moves)).toEqual(movesWithoutIds(assistant.moves));
  });
});
