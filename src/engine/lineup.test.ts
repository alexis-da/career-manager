import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import {
  ROTATION_FITNESS,
  YOUTH_OBJECTIVE_MAX_AGE,
  YOUTH_OBJECTIVE_STARTS,
  YOUTH_POLICY_MAX_AGE,
  YOUTH_POLICY_MAX_RATING_GAP,
  YOUTH_POLICY_MIN_ROOM,
  YOUTH_POLICY_PER_MATCH,
  YOUTH_POLICY_STARTS,
} from "./balance";
import { FORMATION_NAMES, formationPositions } from "./formations";
import {
  autoFilledSlots,
  averageStarterRating,
  BENCH_SIZE,
  changeFormation,
  DEFAULT_FORMATION,
  isAvailable,
  managedLineup,
  maxRotationGap,
  resolveLineup,
  restedLineups,
  selectAssistantLineup,
  selectLineup,
  selectRestedLineup,
  youthCandidate,
  YOUTH_STARTER_MAX_GAP,
  type AssistantYouth,
  type Formation,
  type Lineup,
  type LineupSlot,
  type SavedLineup,
  type SquadPlayer,
  type YouthProspect,
  type YouthStarter,
} from "./lineup";
import { POSITIONS, ratingAt, secondaryPositions, type Position } from "./positions";

function player(id: string, position: Position, overall: number, overrides: Partial<SquadPlayer> = {}): SquadPlayer {
  return {
    id,
    position,
    overall,
    pace: overall,
    shooting: overall,
    passing: overall,
    dribbling: overall,
    defending: overall,
    physical: overall,
    goalkeeping: position === "GK" ? overall : 10,
    form: 50,
    morale: 50,
    fitness: 100,
    injured: false,
    ...overrides,
  };
}

const range = (prefix: string, position: Position, overalls: number[]): SquadPlayer[] =>
  overalls.map((overall, index) => player(`${prefix}-${index + 1}`, position, overall));

// The 23 of the squad template: 2 GK, 2 RB, 4 CB, 2 LB, 2 CDM, 3 CM, 2 CAM, RM + RW, LM + LW, 2 ST.
const squad: SquadPlayer[] = [
  ...range("gk", "GK", [70, 75]),
  ...range("rb", "RB", [66, 62]),
  ...range("cb", "CB", [71, 68, 65, 60]),
  ...range("lb", "LB", [64, 59]),
  ...range("cdm", "CDM", [69, 61]),
  ...range("cm", "CM", [72, 67, 58]),
  ...range("cam", "CAM", [73, 63]),
  player("rm-1", "RM", 65),
  player("rw-1", "RW", 70),
  player("lm-1", "LM", 64),
  player("lw-1", "LW", 68),
  ...range("st", "ST", [74, 66]),
];

const startersOf = (lineup: Lineup): [Position, string][] =>
  lineup.starters.map(({ slot, player: starter }) => [slot, starter.id]);

describe("selectLineup", () => {
  it("fills the 11 slots of the 4-3-3 in order, the best rated player in each, nobody twice", () => {
    const lineup = selectLineup(squad);
    const ids = lineup.starters.map((starter) => starter.player.id);

    expect(lineup.starters.map((starter) => starter.slot)).toEqual(DEFAULT_FORMATION);
    expect(new Set(ids).size).toBe(11);
    expect(startersOf(lineup)).toEqual([
      ["GK", "gk-2"],
      ["RB", "rb-1"],
      ["CB", "cb-1"],
      ["CB", "cb-2"],
      ["LB", "lb-1"],
      ["CDM", "cdm-1"],
      ["CM", "cm-1"],
      // cam-1 (73 × 0.92 = 67.16) edges cm-2 (67): another midfield position, still the better player here.
      ["CM", "cam-1"],
      // st-1 has right wing among his secondary positions: 74 × 0.97 = 71.78 edges rw-1 (70), and st-2 plays up front.
      ["RW", "st-1"],
      ["ST", "st-2"],
      ["LW", "lw-1"],
    ]);
    expect(secondaryPositions("st-1", "ST")).toContain("RW");
  });

  it("prefers a right-back rated 70 to a centre-back rated 74 at right-back", () => {
    const lineup = selectLineup([player("dc", "CB", 74), player("dd", "RB", 70)], ["RB"]);

    expect(startersOf(lineup)).toEqual([["RB", "dd"]]);
  });

  it("names 7 substitutes, the backup goalkeeper first, none of them starting", () => {
    const lineup = selectLineup(squad);
    const starterIds = new Set(lineup.starters.map((starter) => starter.player.id));

    expect(lineup.bench).toHaveLength(BENCH_SIZE);
    expect(lineup.bench[0].id).toBe("gk-1");
    expect(lineup.bench.some((substitute) => starterIds.has(substitute.id))).toBe(false);
  });

  it("leaves injured players out of the lineup and the bench", () => {
    const injured = new Set(["gk-2", "st-1", "rb-1"]);
    const lineup = selectLineup(squad.map((member) => ({ ...member, injured: injured.has(member.id) })));
    const selected = [...lineup.starters.map((starter) => starter.player.id), ...lineup.bench.map((sub) => sub.id)];

    expect(selected.some((id) => injured.has(id))).toBe(false);
    expect(startersOf(lineup)).toContainEqual(["GK", "gk-1"]);
    // At right-back, the best centre-back (71 × 0.92 = 65.32) beats the other right-back (62).
    expect(startersOf(lineup)[1]).toEqual(["RB", "cb-1"]);
    expect(startersOf(lineup)).toContainEqual(["ST", "st-2"]);
  });

  it("puts the best rated outfield player in goal when every goalkeeper is injured", () => {
    const lineup = selectLineup(squad.map((member) => (member.position === "GK" ? { ...member, injured: true } : member)));

    expect(lineup.starters).toHaveLength(11);
    expect(startersOf(lineup)[0]).toEqual(["GK", "st-1"]);
  });

  it("breaks rating ties by id and does not depend on the order of the squad", () => {
    const twins = [player("b", "ST", 70), player("a", "ST", 70)];

    expect(startersOf(selectLineup(twins, ["ST"]))).toEqual([["ST", "a"]]);
    expect(selectLineup([...squad].reverse())).toEqual(selectLineup(squad));
    expect(selectLineup(squad)).toEqual(selectLineup(squad));
  });
});

describe("selectRestedLineup", () => {
  const tired = (id: string, position: Position, overall: number, fitness: number) => player(id, position, overall, { fitness });

  it("picks selectLineup's eleven when nobody is below 75 of fitness", () => {
    const fit = squad.map((member, index) => ({ ...member, fitness: 75 + (index % 26) }));

    expect(selectRestedLineup(fit)).toEqual(selectLineup(fit));
  });

  it("gives way for 5 points at 75 of fitness, 2 more for each point below", () => {
    expect([75, 74, 70, 65, 60, 100].map(maxRotationGap)).toEqual([5, 7, 15, 25, 35, 5]);
  });

  it("rests a player below 75 for a rested one at most that much worse in his slot, and only then", () => {
    // At 74, 7 points.
    expect(startersOf(selectRestedLineup([tired("a", "ST", 80, 74), player("b", "ST", 73)], ["ST"]))).toEqual([["ST", "b"]]);
    expect(startersOf(selectRestedLineup([tired("a", "ST", 80, 74), player("b", "ST", 72)], ["ST"]))).toEqual([["ST", "a"]]);
    // At 70, 15 points.
    expect(startersOf(selectRestedLineup([tired("a", "ST", 80, 70), player("b", "ST", 76)], ["ST"]))).toEqual([["ST", "b"]]);
    expect(startersOf(selectRestedLineup([tired("a", "ST", 80, 70), player("b", "ST", 65)], ["ST"]))).toEqual([["ST", "b"]]);
    // More than that worse, tired as well, or the player not tired enough: he plays.
    expect(startersOf(selectRestedLineup([tired("a", "ST", 80, 70), player("b", "ST", 64)], ["ST"]))).toEqual([["ST", "a"]]);
    expect(startersOf(selectRestedLineup([tired("a", "ST", 80, 70), tired("b", "ST", 79, 60)], ["ST"]))).toEqual([["ST", "a"]]);
    expect(startersOf(selectRestedLineup([tired("a", "ST", 80, 75), player("b", "ST", 79)], ["ST"]))).toEqual([["ST", "a"]]);
  });

  it("may still start a tired player in a later slot, or sit him on the bench", () => {
    const players = [tired("a", "ST", 80, 70), player("b", "ST", 76), player("c", "ST", 60)];

    expect(startersOf(selectRestedLineup(players, ["ST", "ST"]))).toEqual([["ST", "b"], ["ST", "a"]]);
    const rested = selectRestedLineup([...players, player("d", "ST", 78)], ["ST", "ST"]);
    expect(startersOf(rested)).toEqual([["ST", "d"], ["ST", "b"]]);
    expect(rested.bench.map((substitute) => substitute.id)).toContain("a");
  });

  it("rests the goalkeeper too, and does not depend on the order of the squad", () => {
    const weary = squad.map((member) => (member.id === "gk-2" ? { ...member, fitness: 60 } : member));

    // gk-1 (70) is 5 points below gk-2 (75), at 60 of fitness: he plays, gk-2 is the backup on the bench.
    expect(startersOf(selectRestedLineup(weary))[0]).toEqual(["GK", "gk-1"]);
    expect(selectRestedLineup(weary).bench[0].id).toBe("gk-2");
    expect(selectRestedLineup([...weary].reverse())).toEqual(selectRestedLineup(weary));
  });
});

describe("restedLineups", () => {
  // Squads drawn from a fixed seed: any position, overalls close enough to tie, a third of the players tired, some
  // injured or suspended, a few squads too short for an eleven.
  const drawnSquad = (seed: number): SquadPlayer[] => {
    const rng = makeRng(`rested-lineups:${seed}`);
    return Array.from({ length: 6 + Math.floor(rng() * 24) }, (_, index) => {
      const roll = rng();
      const position = POSITIONS[Math.floor(rng() * POSITIONS.length)];
      return player(`p${seed}-${index}`, position, 60 + Math.floor(rng() * 8), {
        fitness: rng() < 0.33 ? 55 + Math.floor(rng() * 20) : 75 + Math.floor(rng() * 26),
        injured: roll < 0.05,
        suspended: roll > 0.95,
      });
    });
  };

  it("picks selectRestedLineup's eleven and bench in every formation, for any squad", () => {
    for (let seed = 0; seed < 200; seed++) {
      const players = drawnSquad(seed);
      const lineupIn = restedLineups(players);
      for (const formation of FORMATION_NAMES) {
        const positions = formationPositions(formation);
        expect(lineupIn(positions)).toEqual(selectRestedLineup(players, positions));
      }
    }
  });
});

/** The first key « young-{position}-N » whose secondary positions are wanted: they come from the key alone. */
function keyWith(position: Position, wanted: (secondary: readonly Position[]) => boolean): string {
  for (let n = 0; n < 1000; n++) {
    const key = `young-${position}-${n}`;
    if (wanted(secondaryPositions(key, position))) {
      return key;
    }
  }
  throw new Error(`No key of a ${position} draws such secondary positions`);
}

/** The bench a lineup's starters leave: the backup goalkeeper first, then the best available by overall, then id. */
function benchLeftBy(players: readonly SquadPlayer[], lineup: Lineup): string[] {
  const starting = new Set(lineup.starters.map(({ player: starter }) => starter.id));
  const left = players
    .filter((member) => !member.injured && member.suspended !== true && !starting.has(member.id))
    .sort((a, b) => b.overall - a.overall || (a.id < b.id ? -1 : 1));
  const keeper = left.find((member) => member.position === "GK");
  return (keeper === undefined ? left : [keeper, ...left.filter((member) => member !== keeper)]).slice(0, BENCH_SIZE).map(({ id }) => id);
}

/** What « Meilleur onze » knows of the young players of a league match: the Jeunesse objective's, if any. */
const best = (starter: YouthStarter | null): AssistantYouth => ({ policy: "BEST", starter, prospects: [] });

describe("selectAssistantLineup", () => {
  // A centre-back with no secondary position: he plays at centre-back alone.
  const youngKey = keyWith("CB", (secondary) => secondary.length === 0);
  const young = (overall: number, overrides: Partial<SquadPlayer> = {}) => player(youngKey, "CB", overall, overrides);
  const starting = (starts: number): AssistantYouth => best({ id: youngKey, leagueStarts: starts });

  it("is the AI clubs' rested eleven, its bench with it, without the Jeunesse objective's young player", () => {
    const weary = squad.map((member) => (member.id === "cb-1" ? { ...member, fitness: 60 } : member));
    for (const formation of FORMATION_NAMES) {
      const positions = formationPositions(formation);
      expect(selectAssistantLineup(weary, positions)).toEqual(selectRestedLineup(weary, positions));
      expect(selectAssistantLineup(weary, positions, null)).toEqual(selectRestedLineup(weary, positions));
      expect(selectAssistantLineup(weary, positions, best(null))).toEqual(selectRestedLineup(weary, positions));
    }
  });

  it("starts the young player at his position in place of a starter at most 4 points better, who goes to the bench", () => {
    // cb-2 (68) holds the second centre-back slot: one point better than him; cb-1 (71), four.
    const players = [...squad, young(67)];
    const rested = selectRestedLineup(players);
    expect(startersOf(rested)[3]).toEqual(["CB", "cb-2"]);
    const lineup = selectAssistantLineup(players, DEFAULT_FORMATION, starting(0));

    expect(startersOf(lineup)).toEqual(startersOf(rested).map((entry, index) => (index === 3 ? ["CB", youngKey] : entry)));
    expect(lineup.bench.map(({ id }) => id)).toEqual(benchLeftBy(players, lineup));
    expect(lineup.bench.map(({ id }) => id)).toContain("cb-2");
    expect(lineup.bench[0].id).toBe("gk-1");
    expect(YOUTH_STARTER_MAX_GAP).toBe(4);
  });

  it("starts him 4 points below a starter, never 5", () => {
    const four = [...squad, young(64)];
    expect(startersOf(selectAssistantLineup(four, DEFAULT_FORMATION, starting(0)))[3]).toEqual(["CB", youngKey]);
    const five = [...squad, young(63)];
    expect(selectAssistantLineup(five, DEFAULT_FORMATION, starting(0))).toEqual(selectRestedLineup(five));
  });

  it("starts him until his 15th league start, then leaves him to the rating", () => {
    const players = [...squad, young(67)];
    const keys = (starts: number) => startersOf(selectAssistantLineup(players, DEFAULT_FORMATION, starting(starts))).map(([, id]) => id);

    expect(keys(YOUTH_OBJECTIVE_STARTS - 1)).toContain(youngKey);
    expect(keys(YOUTH_OBJECTIVE_STARTS)).not.toContain(youngKey);
    expect(selectAssistantLineup(players, DEFAULT_FORMATION, starting(YOUTH_OBJECTIVE_STARTS))).toEqual(selectRestedLineup(players));
  });

  it("never starts him injured, suspended or tired, and leaves him be when he starts on his own", () => {
    for (const overrides of [{ injured: true }, { suspended: true }, { fitness: ROTATION_FITNESS - 1 }]) {
      const players = [...squad, young(67, overrides)];
      expect(selectAssistantLineup(players, DEFAULT_FORMATION, starting(0))).toEqual(selectRestedLineup(players));
    }
    expect(startersOf(selectAssistantLineup([...squad, young(67, { fitness: ROTATION_FITNESS })], DEFAULT_FORMATION, starting(0)))[3]).toEqual([
      "CB",
      youngKey,
    ]);
    // Better than cb-2: the rested eleven has him already, and nothing else moves.
    const better = [...squad, young(70)];
    expect(startersOf(selectRestedLineup(better))).toContainEqual(["CB", youngKey]);
    expect(selectAssistantLineup(better, DEFAULT_FORMATION, starting(0))).toEqual(selectRestedLineup(better));
  });

  it("takes the slot of his positions where he gives up the least, the first of equal ones, never another position's", () => {
    const twoBacks: Position[] = ["CB", "CB"];
    const backs = [player("cb-a", "CB", 71), player("cb-b", "CB", 70)];
    expect(startersOf(selectAssistantLineup([...backs, young(68)], twoBacks, starting(0)))).toEqual([
      ["CB", "cb-a"],
      ["CB", youngKey],
    ]);
    const level = [player("cb-a", "CB", 70), player("cb-b", "CB", 70)];
    expect(startersOf(selectAssistantLineup([...level, young(68)], twoBacks, starting(0)))).toEqual([
      ["CB", youngKey],
      ["CB", "cb-b"],
    ]);
    // At right-back he would give up 1.6 points only (70 × 0.92 = 64.4 against 66): not one of his positions.
    const right = [player("rb-a", "RB", 66), young(70)];
    expect(selectAssistantLineup(right, ["RB"], starting(0))).toEqual(selectRestedLineup(right, ["RB"]));
  });

  it("starts him at one of his secondary positions, at its rating", () => {
    const midfielder = keyWith("CM", (secondary) => secondary.includes("CDM"));
    const players = [player("cdm-a", "CDM", 70), player("st-a", "ST", 70), player(midfielder, "CM", 70)];
    // 70 × 0.97 = 67.9 at defensive midfield: 2.1 points below its starter.
    expect(ratingAt(players[2], "CDM")).toBeCloseTo(67.9, 10);
    const lineup = selectAssistantLineup(players, ["CDM", "ST"], best({ id: midfielder, leagueStarts: 0 }));

    expect(startersOf(lineup)).toEqual([
      ["CDM", midfielder],
      ["ST", "st-a"],
    ]);
    expect(lineup.bench.map(({ id }) => id)).toEqual(["cdm-a"]);
  });

  it("is deterministic and does not depend on the order of the squad", () => {
    const players = [...squad, young(66)];

    expect(selectAssistantLineup([...players].reverse(), DEFAULT_FORMATION, starting(3))).toEqual(
      selectAssistantLineup(players, DEFAULT_FORMATION, starting(3)),
    );
  });
});

/** `count` keys « young-{position}-N », each with the secondary positions wanted: they come from the key alone. */
function keysWith(position: Position, count: number, wanted: (secondary: readonly Position[]) => boolean): string[] {
  const keys: string[] = [];
  for (let n = 0; keys.length < count && n < 10_000; n++) {
    const key = `young-${position}-${n}`;
    if (wanted(secondaryPositions(key, position))) {
      keys.push(key);
    }
  }
  if (keys.length < count) {
    throw new Error(`Not ${count} keys of a ${position} drawing such secondary positions`);
  }
  return keys;
}

describe("selectAssistantLineup under « Lancer les jeunes »", () => {
  // Young players with no secondary position: each plays at his own alone. The 4-3-3 of `squad`, rested: GK gk-2,
  // RB rb-1 66, CB cb-1 71 and cb-2 68 (slots 2 and 3), LB lb-1 64 (4), CDM cdm-1 69, CM cm-1 72 (6) and cam-1 67.16 (7,
  // 73 × 0.92), RW st-1, ST st-2 66 (9), LW lw-1.
  const alone = (secondary: readonly Position[]): boolean => secondary.length === 0;
  const [cbKey, cbKey2, cbKey3] = keysWith("CB", 3, alone);
  const [cmKey] = keysWith("CM", 1, alone);
  const [lbKey] = keysWith("LB", 1, alone);
  const [stKey] = keysWith("ST", 1, alone);

  /** A young player the policy reads: 19 on 1 July, ten points of room, no league start yet, unless told otherwise. */
  const prospectOf = (member: SquadPlayer, overrides: Partial<YouthProspect> = {}): YouthProspect => ({
    id: member.id,
    seasonAge: 19,
    potential: member.overall + 10,
    leagueStarts: 0,
    ...overrides,
  });
  const youthOf = (prospects: readonly YouthProspect[], starter: YouthStarter | null = null): AssistantYouth => ({
    policy: "YOUTH",
    starter,
    prospects,
  });
  /** The rested eleven with some of its slots given to other players. */
  const restedWith = (players: readonly SquadPlayer[], given: Record<number, string>): [Position, string][] =>
    startersOf(selectRestedLineup(players)).map(([slot, id], index) => [slot, given[index] ?? id]);

  const midfielder = player(cmKey, "CM", 65); // 2.16 below cam-1 at slot 7, 7 below cm-1
  const back = player(cbKey, "CB", 63); // 5 below cb-2 at slot 3, 8 below cb-1
  const leftBack = player(lbKey, "LB", 60); // 4 below lb-1
  const striker = player(stKey, "ST", 58); // 8 below st-2
  const four = [...squad, midfielder, back, leftBack, striker];
  const fourProspects = [midfielder, back, leftBack, striker].map((member) => prospectOf(member));

  it("starts three young players at most in a league match, the best rated first, each where he gives up the least", () => {
    const lineup = selectAssistantLineup(four, DEFAULT_FORMATION, youthOf(fourProspects));

    expect(startersOf(lineup)).toEqual(restedWith(four, { 3: cbKey, 4: lbKey, 7: cmKey }));
    // The fourth, 8 points below the striker he would replace, waits: three a match.
    expect(startersOf(lineup).map(([, id]) => id)).not.toContain(stKey);
    // The starters they replace join the others for the bench.
    expect(lineup.bench.map(({ id }) => id)).toEqual(benchLeftBy(four, lineup));
    expect(lineup.bench.map(({ id }) => id)).toEqual(expect.arrayContaining(["cam-1", "cb-2"]));
    expect(lineup.bench[0].id).toBe("gk-1");
    expect([YOUTH_POLICY_PER_MATCH, YOUTH_POLICY_MAX_RATING_GAP, YOUTH_POLICY_MIN_ROOM, YOUTH_POLICY_STARTS, YOUTH_POLICY_MAX_AGE]).toEqual([
      3, 10, 5, 25, 21,
    ]);
  });

  it("starts a young player 10 points below the starter, never 11", () => {
    const ten = player(stKey, "ST", 56);
    expect(startersOf(selectAssistantLineup([...squad, ten], DEFAULT_FORMATION, youthOf([prospectOf(ten)])))[9]).toEqual(["ST", stKey]);
    const eleven = player(stKey, "ST", 55);
    const players = [...squad, eleven];
    expect(selectAssistantLineup(players, DEFAULT_FORMATION, youthOf([prospectOf(eleven)]))).toEqual(selectRestedLineup(players));
  });

  it("starts only the young enough, with room to grow and short of 25 league starts, available and rested", () => {
    const players = [...squad, back];
    const fielded = (prospect: YouthProspect, member: SquadPlayer = back): boolean =>
      startersOf(selectAssistantLineup([...squad, member], DEFAULT_FORMATION, youthOf([prospect]))).some(([, id]) => id === cbKey);

    expect(fielded(prospectOf(back, { seasonAge: YOUTH_POLICY_MAX_AGE }))).toBe(true);
    expect(fielded(prospectOf(back, { seasonAge: YOUTH_POLICY_MAX_AGE + 1 }))).toBe(false);
    expect(fielded(prospectOf(back, { potential: back.overall + YOUTH_POLICY_MIN_ROOM }))).toBe(true);
    expect(fielded(prospectOf(back, { potential: back.overall + YOUTH_POLICY_MIN_ROOM - 1 }))).toBe(false);
    expect(fielded(prospectOf(back, { leagueStarts: YOUTH_POLICY_STARTS - 1 }))).toBe(true);
    expect(fielded(prospectOf(back, { leagueStarts: YOUTH_POLICY_STARTS }))).toBe(false);
    for (const overrides of [{ injured: true }, { suspended: true }, { fitness: ROTATION_FITNESS - 1 }]) {
      expect(fielded(prospectOf(back), { ...back, ...overrides })).toBe(false);
    }
    expect(fielded(prospectOf(back), { ...back, fitness: ROTATION_FITNESS })).toBe(true);
    // Nothing read of him: no start ahead of the rating.
    expect(selectAssistantLineup(players, DEFAULT_FORMATION, youthOf([]))).toEqual(selectRestedLineup(players));
  });

  it("gives each slot once: the next young player takes another of his slots within the gap, or none", () => {
    const first = player(cbKey, "CB", 66); // 2 below cb-2, 5 below cb-1
    const second = player(cbKey2, "CB", 65); // cb-2's slot taken: 6 below cb-1
    const third = player(cbKey3, "CB", 64); // no centre-back slot left
    const players = [...squad, first, second, third];
    const lineup = selectAssistantLineup(players, DEFAULT_FORMATION, youthOf([third, second, first].map((member) => prospectOf(member))));

    expect(startersOf(lineup)).toEqual(restedWith(players, { 2: cbKey2, 3: cbKey }));
    expect(lineup.bench.map(({ id }) => id)).toEqual(benchLeftBy(players, lineup));
    expect(lineup.bench.map(({ id }) => id)).toEqual(expect.arrayContaining(["cb-1", "cb-2"]));
  });

  it("considers the Jeunesse objective's young player first, at the policy's gap, until his 15th league start", () => {
    // 6 below cb-2: beyond the 4 points of « Meilleur onze », within the 10 of the policy; no room left to grow.
    const objective = player(cbKey, "CB", 62);
    const players = [...squad, objective, midfielder, leftBack, striker];
    const prospects = [objective, midfielder, leftBack, striker].map((member) => prospectOf(member, member === objective ? { potential: 62 } : {}));
    const starter = (starts: number): YouthStarter => ({ id: cbKey, leagueStarts: starts });

    // First of the three, ahead of better rated ones: the striker waits.
    expect(startersOf(selectAssistantLineup(players, DEFAULT_FORMATION, youthOf(prospects, starter(3))))).toEqual(
      restedWith(players, { 3: cbKey, 4: lbKey, 7: cmKey }),
    );
    // His 15th league start reached, nothing for him: no room to grow, he is no young player of the policy's.
    expect(startersOf(selectAssistantLineup(players, DEFAULT_FORMATION, youthOf(prospects, starter(YOUTH_OBJECTIVE_STARTS))))).toEqual(
      restedWith(players, { 4: lbKey, 7: cmKey, 9: stKey }),
    );
    // « Meilleur onze » leaves him out: 6 points are too many there.
    expect(selectAssistantLineup(players, DEFAULT_FORMATION, best(starter(3)))).toEqual(selectRestedLineup(players));
  });

  it("counts nothing for a young player who starts on his own: the others still come in", () => {
    const good = player(cbKey, "CB", 70); // better than cb-2: the rested eleven has him
    const players = [...squad, good, midfielder, leftBack, striker];
    const lineup = selectAssistantLineup(players, DEFAULT_FORMATION, youthOf([good, midfielder, leftBack, striker].map((member) => prospectOf(member))));

    expect(startersOf(selectRestedLineup(players))[3]).toEqual(["CB", cbKey]);
    expect(startersOf(lineup)).toEqual(restedWith(players, { 4: lbKey, 7: cmKey, 9: stKey }));
  });

  it("reads none of them under « Meilleur onze », and is deterministic whatever the order of the squad and of the young", () => {
    const starter = { id: cbKey, leagueStarts: 0 };
    expect(selectAssistantLineup(four, DEFAULT_FORMATION, { policy: "BEST", starter: null, prospects: fourProspects })).toEqual(selectRestedLineup(four));
    expect(selectAssistantLineup(four, DEFAULT_FORMATION, { policy: "BEST", starter, prospects: fourProspects })).toEqual(
      selectAssistantLineup(four, DEFAULT_FORMATION, best(starter)),
    );
    expect(selectAssistantLineup([...four].reverse(), DEFAULT_FORMATION, youthOf([...fourProspects].reverse()))).toEqual(
      selectAssistantLineup(four, DEFAULT_FORMATION, youthOf(fourProspects)),
    );
  });

  it("gives the managed club's line-up its eleven, the saved instruction kept", () => {
    const youth = youthOf(fourProspects);
    const positions = formationPositions("4-4-2");

    expect(managedLineup("4-4-2", { starters: [], benchOrder: [], instruction: "ATTACK" }, four, { youth })).toEqual({
      ...selectAssistantLineup(four, positions, youth),
      instruction: "ATTACK",
    });
    // Never the player's own eleven.
    expect(managedLineup("4-4-2", null, four, null)).toEqual(selectLineup(four, positions));
  });
});

// The assistant's eleven against its references, on squads drawn from a fixed seed: any position, ratings close enough to
// tie, a third of the players tired, some injured or suspended, ages around the policy's, every amount of room and starts.
describe("selectAssistantLineup against its references", () => {
  const byRating = (a: SquadPlayer, b: SquadPlayer): number => b.overall - a.overall || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  /** The bench of a lineup's starters: available players out of it, the backup goalkeeper first, then by rating. */
  const benchOf = (players: readonly SquadPlayer[], starting: ReadonlySet<string>): SquadPlayer[] => {
    const rest = players.filter((member) => isAvailable(member) && !starting.has(member.id)).sort(byRating);
    const keeper = rest.find((member) => member.position === "GK");
    return (keeper === undefined ? rest : [keeper, ...rest.filter((member) => member !== keeper)]).slice(0, BENCH_SIZE);
  };

  /** selectAssistantLineup as it was before the policies (25/11), but for its helpers: « Meilleur onze » fields its eleven. */
  function assistantLineupBefore(squadOf: readonly SquadPlayer[], formation: Formation, youth: YouthStarter | null): Lineup {
    const rested = selectRestedLineup(squadOf, formation);
    if (youth === null || youth.leagueStarts >= YOUTH_OBJECTIVE_STARTS) {
      return rested;
    }
    const young = squadOf.find((member) => member.id === youth.id);
    if (young === undefined || !isAvailable(young) || young.fitness < ROTATION_FITNESS || rested.starters.some(({ player: starter }) => starter === young)) {
      return rested;
    }
    const positions = [young.position, ...secondaryPositions(young.id, young.position)];
    let replaced: LineupSlot | undefined;
    let replacedGap = Number.POSITIVE_INFINITY;
    for (const starter of rested.starters) {
      if (!positions.includes(starter.slot)) {
        continue;
      }
      const gap = ratingAt(starter.player, starter.slot) - ratingAt(young, starter.slot);
      if (gap <= YOUTH_STARTER_MAX_GAP && gap < replacedGap) {
        replaced = starter;
        replacedGap = gap;
      }
    }
    if (replaced === undefined) {
      return rested;
    }
    const index = replaced.index;
    const starters = rested.starters.map((starter) => (starter.index === index ? { ...starter, player: young } : starter));
    return { starters, bench: benchOf(squadOf, new Set(starters.map(({ player: starter }) => starter.id))) };
  }

  /**
   * « Lancer les jeunes » as measured (docs/design/effectif-adjoint.md § 2.3 and § 5: rule « youthplus » of the working
   * script, never committed), its numbers written out: the game's fields its very eleven.
   */
  function measuredYouthLineup(players: readonly SquadPlayer[], formation: Formation, info: ReadonlyMap<string, YouthProspect>): Lineup {
    const rested = selectRestedLineup(players, formation);
    const assigned = new Map(rested.starters.map((starter) => [starter.index, starter]));
    const starting = new Set(rested.starters.map((starter) => starter.player.id));
    const given = new Set<number>();
    const candidates = players
      .filter((member) => {
        const data = info.get(member.id);
        return (
          data !== undefined &&
          data.seasonAge <= 21 &&
          data.potential - member.overall >= 5 &&
          data.leagueStarts < 25 &&
          isAvailable(member) &&
          member.fitness >= ROTATION_FITNESS &&
          !starting.has(member.id)
        );
      })
      .sort(byRating);
    let youngStarts = 0;
    for (const young of candidates) {
      if (youngStarts >= 3) {
        break;
      }
      const positions = [young.position, ...secondaryPositions(young.id, young.position)];
      let chosen: { index: number; gap: number } | null = null;
      for (const [index, starter] of assigned) {
        if (given.has(index) || !positions.includes(starter.slot)) {
          continue;
        }
        const gap = ratingAt(starter.player, starter.slot) - ratingAt(young, starter.slot);
        if (gap <= 10 && (chosen === null || gap < chosen.gap || (gap === chosen.gap && index < chosen.index))) {
          chosen = { index, gap };
        }
      }
      const replaced = chosen === null ? undefined : assigned.get(chosen.index);
      if (chosen === null || replaced === undefined) {
        continue;
      }
      starting.delete(replaced.player.id);
      starting.add(young.id);
      assigned.set(chosen.index, { ...replaced, player: young });
      given.add(chosen.index);
      youngStarts++;
    }
    const starters = [...assigned.values()].sort((a, b) => a.index - b.index);
    return { starters, bench: benchOf(players, starting) };
  }

  const drawn = (seed: number) => {
    const rng = makeRng(`assistant-lineup:${seed}`);
    const players = Array.from({ length: 12 + Math.floor(rng() * 18) }, (_, index) => {
      const roll = rng();
      const position = POSITIONS[Math.floor(rng() * POSITIONS.length)];
      return player(`p${seed}-${index}`, position, 55 + Math.floor(rng() * 20), {
        fitness: rng() < 0.33 ? 60 + Math.floor(rng() * 15) : 75 + Math.floor(rng() * 26),
        injured: roll < 0.05,
        suspended: roll > 0.95,
      });
    });
    const prospects = players.map((member) => ({
      id: member.id,
      seasonAge: 17 + Math.floor(rng() * 8),
      potential: member.overall - 2 + Math.floor(rng() * 22),
      leagueStarts: Math.floor(rng() * 32),
    }));
    const pick = players[Math.floor(rng() * players.length)];
    const starter = rng() < 0.2 ? null : { id: pick.id, leagueStarts: Math.floor(rng() * 20) };
    const formation = formationPositions(FORMATION_NAMES[Math.floor(rng() * FORMATION_NAMES.length)]);
    return { players, prospects, starter, formation };
  };

  it("fields under « Meilleur onze » the very eleven of the assistant before the policies, whatever the young players", () => {
    for (let seed = 0; seed < 300; seed++) {
      const { players, prospects, starter, formation } = drawn(seed);
      const before = assistantLineupBefore(players, formation, starter);
      expect(selectAssistantLineup(players, formation, best(starter))).toEqual(before);
      expect(selectAssistantLineup(players, formation, { policy: "BEST", starter, prospects })).toEqual(before);
    }
  });

  it("fields under « Lancer les jeunes » the very eleven of the measured rule, without a Jeunesse objective", () => {
    let started = 0;
    for (let seed = 0; seed < 300; seed++) {
      const { players, prospects, formation } = drawn(seed);
      const measured = measuredYouthLineup(players, formation, new Map(prospects.map((prospect) => [prospect.id, prospect])));
      const lineup = selectAssistantLineup(players, formation, { policy: "YOUTH", starter: null, prospects });
      expect(lineup).toEqual(measured);
      const rested = selectRestedLineup(players, formation);
      started += lineup.starters.filter((slot, index) => slot.player !== rested.starters[index]?.player).length;
    }
    // The draws do start young players, often.
    expect(started).toBeGreaterThan(100);
  });
});

describe("youthCandidate", () => {
  it("is the best rated player young enough on 1 July, ties broken by id, whether he can play or not", () => {
    expect(
      youthCandidate([
        { id: "b", overall: 70, seasonAge: YOUTH_OBJECTIVE_MAX_AGE },
        { id: "a", overall: 70, seasonAge: 19 },
        { id: "c", overall: 75, seasonAge: YOUTH_OBJECTIVE_MAX_AGE + 1 },
        { id: "d", overall: 64, seasonAge: 17 },
      ])?.id,
    ).toBe("a");
    expect(youthCandidate([{ id: "e", overall: 61, seasonAge: YOUTH_OBJECTIVE_MAX_AGE }])?.id).toBe("e");
    expect(youthCandidate([{ id: "c", overall: 75, seasonAge: YOUTH_OBJECTIVE_MAX_AGE + 1 }])).toBeNull();
    expect(youthCandidate([])).toBeNull();
  });
});

describe("managedLineup", () => {
  // A 4-4-2 the manager saved, with the backup goalkeeper in goal, and his starting instruction.
  const saved: SavedLineup = {
    starters: ["gk-1", "rb-2", "cb-3", "cb-4", "lb-2", "rm-1", "cm-2", "cm-3", "lm-1", "st-2", "cam-2"].map((playerKey, slot) => ({ slot, playerKey })),
    benchOrder: ["st-1", "gk-2"],
    instruction: "DEFEND",
  };
  const positions = formationPositions("4-4-2");
  const weary = squad.map((member) => (member.id === "cm-1" ? { ...member, fitness: 65 } : member));

  it("plays the player's saved line-up when he makes it", () => {
    expect(managedLineup("4-4-2", saved, weary, null)).toEqual(resolveLineup("4-4-2", saved, weary));
    expect(managedLineup("4-4-2", null, weary, null)).toEqual(selectLineup(weary, positions));
  });

  it("plays the assistant's eleven when he makes it, the saved starters unread, the saved instruction kept", () => {
    const lineup = managedLineup("4-4-2", saved, weary, { youth: null });

    expect(lineup).toEqual({ ...selectAssistantLineup(weary, positions), instruction: "DEFEND" });
    expect(lineup.starters[0].player.id).toBe("gk-2");
    expect(lineup.starters.map(({ player: starter }) => starter.id)).not.toContain("cm-1");
    // Équilibré without one: the lineup as the engine always had it.
    expect(managedLineup("4-4-2", null, weary, { youth: null })).toEqual(selectRestedLineup(weary, positions));
    expect(managedLineup("4-4-2", { starters: [], benchOrder: [] }, weary, { youth: null })).not.toHaveProperty("instruction");
  });

  it("gives the assistant's eleven the Jeunesse objective's young player", () => {
    const youngKey = keyWith("CB", (secondary) => secondary.length === 0);
    const players = [...squad, player(youngKey, "CB", 67)];
    const youth = best({ id: youngKey, leagueStarts: 2 });

    expect(managedLineup("4-4-2", null, players, { youth })).toEqual(selectAssistantLineup(players, positions, youth));
    expect(managedLineup("4-4-2", null, players, { youth }).starters.map(({ player: starter }) => starter.id)).toContain(youngKey);
    // Never the player's own eleven.
    expect(managedLineup("4-4-2", null, players, null).starters.map(({ player: starter }) => starter.id)).not.toContain(youngKey);
  });
});

describe("resolveLineup", () => {
  // A 4-4-2 picked by the manager: the backup goalkeeper, second choices, a playmaker up front.
  const saved: SavedLineup = {
    starters: ["gk-1", "rb-2", "cb-3", "cb-4", "lb-2", "rm-1", "cm-2", "cm-3", "lm-1", "st-2", "cam-2"].map(
      (playerKey, slot) => ({ slot, playerKey }),
    ),
    benchOrder: ["st-1", "gk-2"],
  };
  const savedKeys = saved.starters.map((starter) => starter.playerKey);
  const keysOf = (lineup: Lineup): string[] => lineup.starters.map((starter) => starter.player.id);
  const withSlots = (changes: Record<number, string>): SavedLineup => ({
    ...saved,
    starters: saved.starters.map((starter) => ({ ...starter, playerKey: changes[starter.slot] ?? starter.playerKey })),
  });

  it("plays a complete saved lineup as saved, with the saved substitutes first on the bench", () => {
    const lineup = resolveLineup("4-4-2", saved, squad);

    expect(keysOf(lineup)).toEqual(savedKeys);
    expect(lineup.starters.map((starter) => starter.slot)).toEqual(formationPositions("4-4-2"));
    expect(lineup.starters.map((starter) => starter.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(lineup.bench.slice(0, 2).map((player) => player.id)).toEqual(["st-1", "gk-2"]);
    expect(lineup.bench).toHaveLength(BENCH_SIZE);
  });

  it("refills only the slot of an injured starter, with the best rated available player", () => {
    const lineup = resolveLineup(
      "4-4-2",
      saved,
      squad.map((member) => (member.id === "cb-3" ? { ...member, injured: true } : member)),
    );

    // cb-1 (71) is the best centre-back left; every other slot keeps its saved player.
    expect(keysOf(lineup)).toEqual(savedKeys.map((key) => (key === "cb-3" ? "cb-1" : key)));
  });

  it("refills the slot of a player who left the squad", () => {
    const lineup = resolveLineup(
      "4-4-2",
      saved,
      squad.filter((member) => member.id !== "st-2"),
    );

    expect(keysOf(lineup)).toEqual(savedKeys.map((key) => (key === "st-2" ? "st-1" : key)));
    expect(lineup.bench.map((player) => player.id)).not.toContain("st-1");
  });

  it("keeps a player saved twice in his first slot only and refills the other", () => {
    const lineup = resolveLineup("4-4-2", withSlots({ 10: "st-2" }), squad);

    expect(keysOf(lineup)).toEqual([...savedKeys.slice(0, 10), "st-1"]);
    expect(new Set(keysOf(lineup)).size).toBe(11);
  });

  it("picks everything automatically without a saved lineup, as selectLineup does", () => {
    expect(resolveLineup("4-3-3", null, squad)).toEqual(selectLineup(squad));
    expect(resolveLineup("4-4-2", null, squad)).toEqual(selectLineup(squad, formationPositions("4-4-2")));
    expect(resolveLineup("3-5-2", { starters: [], benchOrder: [] }, squad)).toEqual(
      selectLineup(squad, formationPositions("3-5-2")),
    );
  });

  it("ignores saved slots outside the formation and substitutes who start or left", () => {
    const lineup = resolveLineup(
      "4-4-2",
      { starters: [...saved.starters, { slot: 11, playerKey: "st-1" }], benchOrder: ["cam-2", "gone", "st-1"] },
      squad,
    );

    expect(keysOf(lineup)).toEqual(savedKeys);
    expect(lineup.bench[0].id).toBe("st-1");
  });

  it("counts the starters picked automatically in place of the saved ones", () => {
    const injuredCentreBack = squad.map((member) => (member.id === "cb-3" ? { ...member, injured: true } : member));
    const withoutStriker = injuredCentreBack.filter((member) => member.id !== "st-2");

    expect(autoFilledSlots(saved, resolveLineup("4-4-2", saved, squad))).toBe(0);
    expect(autoFilledSlots(saved, resolveLineup("4-4-2", saved, injuredCentreBack))).toBe(1);
    expect(autoFilledSlots(saved, resolveLineup("4-4-2", saved, withoutStriker))).toBe(2);
    expect(autoFilledSlots(withSlots({ 10: "st-2" }), resolveLineup("4-4-2", withSlots({ 10: "st-2" }), squad))).toBe(1);
    const nineSaved = { ...saved, starters: saved.starters.slice(0, 9) };
    expect(autoFilledSlots(nineSaved, resolveLineup("4-4-2", nineSaved, squad))).toBe(2);
  });

  it("counts nothing for an eleven picked automatically by choice", () => {
    expect(autoFilledSlots(null, resolveLineup("4-3-3", null, squad))).toBe(0);
    expect(autoFilledSlots({ starters: [], benchOrder: [] }, selectLineup(squad))).toBe(0);
  });

  it("is deterministic and does not depend on the order of the squad", () => {
    const injured = squad.map((member) => (member.id === "rm-1" ? { ...member, injured: true } : member));

    expect(resolveLineup("4-4-2", saved, injured)).toEqual(resolveLineup("4-4-2", saved, injured));
    expect(resolveLineup("4-4-2", saved, [...injured].reverse())).toEqual(resolveLineup("4-4-2", saved, injured));
  });
});

describe("changeFormation", () => {
  const starters = selectLineup(squad).starters.map((starter) => starter.player.id);

  it("keeps the starters whose position or line still has a slot, and fills the rest automatically", () => {
    const next = changeFormation("4-3-3", "4-4-2", starters, squad);

    // GK, back four and the two central midfielders keep their position; the striker stays up front.
    expect(next.slice(0, 5)).toEqual(starters.slice(0, 5));
    expect(next.slice(6, 8)).toEqual([starters[6], starters[7]]);
    expect(next[9]).toBe(starters[9]);
    expect(new Set(next).size).toBe(11);
    expect(next.every((key) => key !== null)).toBe(true);
  });

  it("is deterministic and leaves the starters unchanged when the formation stays", () => {
    expect(changeFormation("4-3-3", "4-3-3", starters, squad)).toEqual(starters);
    expect(changeFormation("4-3-3", "3-5-2", starters, squad)).toEqual(changeFormation("4-3-3", "3-5-2", starters, squad));
  });
});

describe("averageStarterRating", () => {
  it("averages the starters' ratings in the slots they play, out of position included", () => {
    const lineup = selectLineup(squad);
    const expected = lineup.starters.reduce((sum, { player: starter, slot }) => sum + ratingAt(starter, slot), 0) / 11;

    expect(averageStarterRating(lineup)).toBeCloseTo(expected, 10);
    // A centre-back moved to the right-back slot counts at 92 % of his rating.
    const moved: Lineup = { ...lineup, starters: [{ ...lineup.starters[0], player: player("cb", "CB", 80), slot: "RB" }] };
    expect(averageStarterRating(moved)).toBeCloseTo(80 * 0.92, 10);
  });

  it("is 0 for an empty eleven", () => {
    expect(averageStarterRating({ starters: [], bench: [] })).toBe(0);
  });
});
