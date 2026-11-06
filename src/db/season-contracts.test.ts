import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTRACT_YEARS_WEIGHTS, MIN_GOALKEEPERS, SQUAD_SIZE_MAX, SQUAD_SIZE_MIN } from "../engine/balance";
import { contractEndDate, wageFor } from "../engine/economy";
import { seasonEndDate, seasonStartDate, WORLD_START_YEAR } from "../engine/world";
import { youthKeyPrefix } from "../engine/youth";
import { ageInYears } from "../lib/dates";
import type { prisma as prismaClient } from "./client";
import type { SeasonTransition } from "./season";

const LAST_CONTRACT_DAY = seasonEndDate(WORLD_START_YEAR);
const TRANSITION_DATE = seasonStartDate(WORLD_START_YEAR + 1);
const YOUTH_PREFIX = youthKeyPrefix(WORLD_START_YEAR + 1);

/** A player of the managed club, as read before and after the transition. */
type ManagedPlayer = {
  key: string;
  position: string;
  birthDate: Date;
  overall: number;
  wage: number;
  contractUntil: string | null;
};

/** A transfer of the transition's day: comparable between two saves, Club ids being the world's. */
type DayTransfer = { key: string; from: string | null; to: string | null; type: string; fee: number };

type Outcome = {
  transition: SeasonTransition;
  clubId: string; // the managed club's Club.id
  before: ManagedPlayer[];
  after: ManagedPlayer[]; // the preseason included
  transfers: DayTransfer[];
};

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const transferOrder = (move: DayTransfer): string => `${move.key}|${move.type}|${move.from}|${move.to}`;

/** Its wage at its rating and age on the transition's day: a free signing's, or a renewal's at least. */
const currentWage = (player: ManagedPlayer): number =>
  wageFor({ age: ageInYears(player.birthDate, TRANSITION_DATE), overall: player.overall });

// The managed club's expiring contracts at the season transition, on three throwaway worldVersion 1 twins of the demo
// save whose first season is marked over (every fixture a 1-1 draw: the transition needs the season finished, not its
// matches) and whose managed club's contracts all end with it. By default its player manages them, and they run out at
// the transition; when the assistant manages them (assistantContracts, the measurement scripts' mode), the preseason
// renews or releases them and signs free agents as for an AI club, the same in two saves of the same seed. Runs against
// DATABASE_URL and is skipped without it; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the managed club's expiring contracts at the season transition", () => {
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
    const [{ prisma }, support, season] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./season"),
    ]);
    db = prisma;
    saveIds.push(
      ...(await Promise.all([
        support.createDemoTwin("Test contrats, joueur", 1),
        support.createDemoTwin("Test contrats, adjoint", 1),
        support.createDemoTwin("Test contrats, adjoint bis", 1),
      ])),
    );

    const readManaged = async (saveId: string): Promise<ManagedPlayer[]> => {
      const rows = await prisma.playerSave.findMany({
        where: { saveId, clubSave: { isManaged: true } },
        select: { playerKey: true, position: true, birthDate: true, overall: true, wage: true, contractUntil: true },
      });
      return rows
        .map(({ playerKey, contractUntil, ...row }) => ({
          ...row,
          key: playerKey,
          contractUntil: contractUntil?.toISOString() ?? null,
        }))
        .sort((a, b) => compare(a.key, b.key));
    };

    const advance = async (saveId: string, assistantContracts: boolean): Promise<Outcome> => {
      await prisma.fixture.updateMany({
        where: { saveId },
        data: { played: true, status: "PLAYED", homeGoals: 1, awayGoals: 1, homeHalfTimeGoals: 0, awayHalfTimeGoals: 0 },
      });
      await prisma.playerSave.updateMany({
        where: { saveId, clubSave: { isManaged: true } },
        data: { contractUntil: LAST_CONTRACT_DAY },
      });
      const { clubId } = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { clubId: true } });
      const before = await readManaged(saveId);
      const transition = await season.advanceToNextSeason(saveId, assistantContracts ? { assistantContracts } : undefined);
      const transfers = await prisma.transfer.findMany({
        where: { saveId, date: TRANSITION_DATE },
        select: { fromClubId: true, toClubId: true, type: true, fee: true, playerSave: { select: { playerKey: true } } },
      });
      return {
        transition,
        clubId,
        before,
        after: await readManaged(saveId),
        transfers: transfers
          .map((row) => ({ key: row.playerSave.playerKey, from: row.fromClubId, to: row.toClubId, type: row.type, fee: row.fee }))
          .sort((a, b) => compare(transferOrder(a), transferOrder(b))),
      };
    };

    // One after the other: each transition rewrites thousands of rows.
    outcomes.push(await advance(saveIds[0], false));
    outcomes.push(await advance(saveIds[1], true));
    outcomes.push(await advance(saveIds[2], true));
  }, 600_000);

  // Deleting a save cascades to thousands of rows: allow more than the hook default.
  afterAll(async () => {
    for (const saveId of saveIds) {
      await db?.save.deleteMany({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 120_000);

  /** The managed club's players of before the transition who did not retire at it, and its FREE transfers that day. */
  const read = ({ before, transfers, clubId }: Outcome) => {
    const keysOf = (keep: (move: DayTransfer) => boolean): Set<string> => new Set(transfers.filter(keep).map((move) => move.key));
    const retired = keysOf((move) => move.type === "RETIREMENT" && move.from === clubId);
    return {
      staying: before.filter((player) => !retired.has(player.key)),
      releasedKeys: keysOf((move) => move.type === "FREE" && move.from === clubId && move.to === null),
      signedKeys: keysOf((move) => move.type === "FREE" && move.from === null && move.to === clubId),
    };
  };

  it("lets the managed club's expiring contracts run out by default: free agents at the transition, none renewed", () => {
    const state = outcome(0);
    const { staying, releasedKeys, signedKeys } = read(state);

    expect(staying.length).toBeGreaterThan(SQUAD_SIZE_MIN);
    expect(state.transition.freeAgents).toBe(staying.length);
    expect(staying.filter((player) => !releasedKeys.has(player.key))).toEqual([]);
    // Only its young players are left, and nobody signed: the preseason plans no squad of a club its player manages.
    expect(state.transition.preseason.managed).toBeUndefined();
    expect(state.after.length).toBeGreaterThan(0);
    expect(state.after.filter((player) => !player.key.startsWith(YOUTH_PREFIX))).toEqual([]);
    expect(signedKeys.size).toBe(0);
  });

  it("lets the assistant renew or release every expiring contract as an AI club, and sign free agents", () => {
    const state = outcome(1);
    const { staying, releasedKeys, signedKeys } = read(state);
    const afterByKey = new Map(state.after.map((player) => [player.key, player]));
    const renewed = staying.filter((player) => afterByKey.has(player.key));
    const released = staying.filter((player) => !afterByKey.has(player.key));
    const formerKeys = new Set(state.before.map((player) => player.key));
    const signed = state.after.filter((player) => !player.key.startsWith(YOUTH_PREFIX) && !formerKeys.has(player.key));
    const renewalEnds = CONTRACT_YEARS_WEIGHTS.map((_, index) => contractEndDate(TRANSITION_DATE, index + 1).toISOString());

    // Nothing ran out at the transition: every expiring contract was renewed or released in the preseason.
    expect(state.transition.freeAgents).toBe(0);
    expect(renewed.length).toBeGreaterThan(0);
    expect(released.length).toBeGreaterThan(0);
    expect(released.filter((player) => !releasedKeys.has(player.key))).toEqual([]);
    expect(state.transition.preseason.managed?.renewals).toBe(renewed.length);
    // Its releases may go beyond its expiring contracts: players under a running contract over SQUAD_SIZE_MAX.
    expect(state.transition.preseason.managed?.releases).toBeGreaterThanOrEqual(released.length);
    // A renewed contract runs one to five more seasons, at its old wage or at the one its new rating and age earn.
    const renewals = renewed.map((player) => ({ player, now: afterByKey.get(player.key) ?? player }));
    expect(renewals.map(({ player, now }) => ({ key: player.key, ends: now.contractUntil, wage: now.wage }))).toEqual(
      renewals.map(({ player, now }) => ({
        key: player.key,
        ends: expect.toBeOneOf(renewalEnds),
        wage: Math.max(player.wage, currentWage(now)),
      })),
    );
    // Free signings at the wage their rating and age earn.
    expect(signed.length).toBeGreaterThan(0);
    expect(state.transition.preseason.managed?.signings).toBe(signed.length);
    expect(signed.filter((player) => !signedKeys.has(player.key) || player.wage !== currentWage(player))).toEqual([]);
    // A squad as an AI club's: 20 to 25 players, two goalkeepers at least, every one under a running contract.
    expect(state.after.length).toBeGreaterThanOrEqual(SQUAD_SIZE_MIN);
    expect(state.after.length).toBeLessThanOrEqual(SQUAD_SIZE_MAX);
    expect(state.after.filter((player) => player.position === "GK").length).toBeGreaterThanOrEqual(MIN_GOALKEEPERS);
    expect(
      state.after.filter((player) => (player.contractUntil ?? "") <= LAST_CONTRACT_DAY.toISOString() || player.wage <= 0),
    ).toEqual([]);
  });

  it("gives the same decisions to two saves of the same seed", () => {
    const [first, second] = [outcome(1), outcome(2)];

    expect({ ...second.transition, completedSeasonId: null }).toEqual({ ...first.transition, completedSeasonId: null });
    expect(second.after).toEqual(first.after);
    expect(second.transfers).toEqual(first.transfers);
  });
});
