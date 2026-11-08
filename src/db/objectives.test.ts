import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assistantObjective,
  boardConfidence,
  cupObjective,
  divisionOf,
  objectivesRngSeed,
  OPTIONAL_OBJECTIVES,
  proposedObjectives,
  rankingObjective,
  reputationThird,
  type OptionalObjective,
} from "../engine/objectives";
import { creationReputationRanks } from "../engine/reputation";
import { competitionTier } from "../engine/tiers";
import { WORLD_START_YEAR } from "../engine/world";
import { makeRng } from "../lib/rng";
import type { prisma as prismaClient } from "./client";

// The managed club's season objectives (gameplay v2, V3) on two throwaway twins of the demo save, a worldVersion 2 one
// (with its cup) and a worldVersion 1 one: opened with the save, chosen once by the player, or by the assistant at the
// first match, the president's confidence following. Runs against DATABASE_URL and is skipped without it; modules are
// imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the managed club's season objectives", () => {
  let db: typeof prismaClient | undefined;
  let worldTwo = "";
  let worldOne = "";
  let proposed: OptionalObjective[] = [];

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  beforeAll(async () => {
    const [{ prisma }, support] = await Promise.all([import("./client"), import("./test-support")]);
    db = prisma;
    worldTwo = await support.createDemoTwin("Test objectifs", 2);
    worldOne = await support.createDemoTwin("Test objectifs, monde 1", 1);
    // Both twins have the demo's seed: the same three proposals for the first season.
    proposed = proposedObjectives(makeRng(objectivesRngSeed(support.DEMO_SEED, WORLD_START_YEAR)));
  }, 120_000);

  afterAll(async () => {
    for (const saveId of [worldTwo, worldOne].filter((id) => id !== "")) {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 120_000);

  it("opens the ranking, the cup and three proposed objectives with the save, none chosen, and its first dotation", async () => {
    const managed = await database().clubSave.findFirstOrThrow({
      where: { saveId: worldTwo, isManaged: true },
      select: {
        id: true,
        clubId: true,
        reputation: true,
        budget: true,
        wageBudget: true,
        boardConfidence: true,
        competitionId: true,
        competition: { select: { code: true, tier: true } },
      },
    });
    const rivals = await database().clubSave.findMany({
      where: { saveId: worldTwo, competitionId: managed.competitionId },
      select: { id: true, club: { select: { slug: true, initialRank: true } } },
    });
    const tier = competitionTier(managed.competition.tier);
    // The creation's rank: the reputations and wage budgets given at the source ranks, never the payrolls drawn after.
    const rank =
      creationReputationRanks(
        rivals.map((club) => ({ key: club.id, initialRank: club.club.initialRank, slug: club.club.slug })),
        tier,
      ).get(managed.id) ?? NaN;
    const season = await database().season.findFirstOrThrow({ where: { saveId: worldTwo, competitionId: managed.competitionId }, select: { id: true } });
    const preliminary = await database().fixture.count({
      where: { saveId: worldTwo, round: 1, season: { competition: { kind: "CUP" } }, OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }] },
    });
    const objectives = await database().seasonObjective.findMany({
      where: { saveId: worldTwo, seasonId: season.id },
      select: { kind: true, imposed: true, chosen: true, variant: true, target: true, exceed: true, outcome: true },
    });
    const ranking = rankingObjective(rank, divisionOf(managed.competition.code, tier, rivals.length, 2));
    const cup = cupObjective(tier, reputationThird(rank, rivals.length), preliminary > 0 ? 1 : 2);

    expect(objectives.find((objective) => objective.kind === "RANKING")).toMatchObject({ imposed: true, ...ranking });
    // What the creation form's card of the club announced.
    const { listClubsByCompetition } = await import("./clubs");
    const card = (await listClubsByCompetition(2)).flatMap((competition) => competition.clubs).find((club) => club.id === managed.clubId);
    expect(card?.objective).toEqual(ranking);
    expect(objectives.find((objective) => objective.kind === "CUP")).toMatchObject({ imposed: true, target: cup.target, exceed: cup.exceed });
    const optional = objectives.filter((objective) => !objective.imposed);
    expect(optional.map((objective) => objective.kind).sort()).toEqual([...proposed].sort());
    expect(objectives.every((objective) => !objective.chosen && objective.outcome === null)).toBe(true);
    for (const objective of optional) {
      const expected = { YOUTH: [15, 15], FINANCES: [0, 0], ENTERTAINMENT: [20, 120], SOLIDITY: [10, 100] }[objective.kind as OptionalObjective];
      expect(objective.target).toBeGreaterThanOrEqual(expected[0]);
      expect(objective.target).toBeLessThanOrEqual(expected[1]);
    }
    expect(managed.boardConfidence).toBe(boardConfidence({ ranking: "ON_TRACK", cup: "ON_TRACK" }));

    const dotation = await database().seasonBudget.findUniqueOrThrow({ where: { seasonId: season.id } });
    expect(dotation).toMatchObject({
      saveId: worldTwo,
      reputation: managed.reputation,
      reputationRank: rank,
      dotation: managed.budget,
      coefficient: 100,
      carryOver: 0,
      budget: managed.budget,
      wageBudget: managed.wageBudget,
    });
  });

  it("gives a worldVersion 1 save no cup objective", async () => {
    const kinds = await database().seasonObjective.findMany({ where: { saveId: worldOne }, select: { kind: true } });

    expect(kinds.map((row) => row.kind).sort()).toEqual(["RANKING", ...proposed].sort());
  });

  it("shows the choice open before the first match, then takes the player's choice once", async () => {
    const { chooseObjective, getSeasonObjectives } = await import("./objectives");
    const before = await getSeasonObjectives(worldTwo);
    const missing = OPTIONAL_OBJECTIVES.find((kind) => !proposed.includes(kind)) ?? "YOUTH";
    const [first, second] = proposed;

    expect(before).toMatchObject({ startYear: WORLD_START_YEAR, choiceOpen: true, over: false });
    expect(before?.objectives.map((objective) => objective.kind)).toEqual(["RANKING", "CUP", ...proposed]);
    expect(before?.objectives.every((objective) => objective.status === "ON_TRACK")).toBe(true);
    await expect(chooseObjective(worldTwo, missing)).rejects.toMatchObject({ reason: "not-proposed" });

    await chooseObjective(worldTwo, second);
    await expect(chooseObjective(worldTwo, first)).rejects.toMatchObject({ reason: "already-chosen" });
    const after = await getSeasonObjectives(worldTwo);
    expect(after?.choiceOpen).toBe(false);
    expect(after?.objectives.map((objective) => [objective.kind, objective.chosen, objective.byAssistant])).toEqual([
      ["RANKING", false, false],
      ["CUP", false, false],
      [second, true, false],
    ]);
  });

  it("lets the assistant choose at the club's first match, then the president's confidence follows the objectives", async () => {
    const [{ playNextMatchday }, { chooseObjective, getSeasonObjectives }] = await Promise.all([import("./matchday"), import("./objectives")]);
    for (let summary = await playNextMatchday(worldOne); summary !== null && summary.managed === null; ) {
      summary = await playNextMatchday(worldOne);
    }
    const view = await getSeasonObjectives(worldOne);
    const chosen = view?.objectives.find((objective) => objective.chosen);
    const ranking = view?.objectives.find((objective) => objective.kind === "RANKING");

    expect(chosen).toMatchObject({ kind: assistantObjective(proposed), byAssistant: true });
    expect(view?.choiceOpen).toBe(false);
    expect(ranking?.current).toBeGreaterThan(0);
    expect(view?.confidence).toBe(boardConfidence({ ranking: ranking?.status ?? "ON_TRACK", chosen: chosen?.status }));
    await expect(chooseObjective(worldOne, proposed[0])).rejects.toMatchObject({ reason: "already-chosen" });
  });
});
