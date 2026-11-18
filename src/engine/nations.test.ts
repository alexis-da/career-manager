import { describe, expect, it } from "vitest";
import { ageInYears } from "../lib/dates";
import { CALL_UP_SIZE, NATION_RESERVE_AGE, NATION_RESERVE_LEVELS, NATION_RESERVE_RETIREMENT_AGE } from "./balance";
import { overallFor } from "./generation";
import { playLightFriendly, internationalMatchRngSeed, nationFormation, type NationTeam } from "./international";
import type { SquadPlayer } from "./lineup";
import { NAME_BANK } from "./names";
import {
  callUp,
  friendliesOfRound,
  friendlyRoundOf,
  generateReserve,
  NATION_CODES,
  NATIONS,
  nationByCode,
  nationOfNationality,
  reserveAfterSeason,
  type CallUpCandidate,
} from "./nations";
import { positionGroup, squadTemplate, type Position } from "./positions";
import { seasonStartDate } from "./world";

const ageOf = (birthDate: string, startYear: number): number => ageInYears(new Date(`${birthDate}T00:00:00.000Z`), seasonStartDate(startYear));

describe("the nations", () => {
  it("are the 14 nationalities of the name lists, each with its code and zone", () => {
    expect(NATIONS).toHaveLength(14);
    expect([...NAME_BANK.keys()].sort()).toEqual(NATIONS.map((nation) => nation.nationality).sort());
    expect(NATIONS.filter((nation) => nation.zone === "EUROPE").map((nation) => nation.code)).toEqual([
      "GER", "ENG", "ESP", "FRA", "ITA", "POR", "NED", "BEL", "CRO",
    ]);
    expect(nationOfNationality("Sénégal")?.code).toBe("SEN");
    expect(nationOfNationality("Danemark")).toBeUndefined();
  });
});

describe("generateReserve", () => {
  const brazil = nationByCode("BRA");
  const reserve = generateReserve(brazil, NAME_BANK, "seed-a", 2026);

  it("draws 23 players of the squad template, of the nation's range and ages, named from its list", () => {
    expect(reserve).toHaveLength(CALL_UP_SIZE);
    expect(reserve.map((player) => player.position)).toEqual(squadTemplate(CALL_UP_SIZE));
    const { worst, best } = NATION_RESERVE_LEVELS.BRA;
    expect(reserve.every((player) => player.overall >= worst && player.overall <= best)).toBe(true);
    expect(reserve.every((player) => player.potential >= player.overall && player.potential <= best)).toBe(true);
    expect(reserve.every((player) => overallFor(player.position, player) === player.overall)).toBe(true);
    const ages = reserve.map((player) => ageOf(player.birthDate, 2026));
    expect(ages.every((age) => age >= NATION_RESERVE_AGE.worst && age <= NATION_RESERVE_AGE.best)).toBe(true);
    const list = NAME_BANK.get("Brésil");
    expect(reserve.every((player) => list?.firstNames.includes(player.firstName) && list.lastNames.includes(player.lastName))).toBe(true);
    expect(new Set(reserve.map((player) => `${player.firstName} ${player.lastName}`)).size).toBe(CALL_UP_SIZE);
    expect(reserve.map((player) => player.key)).toEqual(Array.from({ length: CALL_UP_SIZE }, (_, index) => `reserve:BRA:${index + 1}`));
  });

  it("is the same for the same save and another for another seed", () => {
    expect(generateReserve(brazil, NAME_BANK, "seed-a", 2026)).toEqual(reserve);
    expect(generateReserve(brazil, NAME_BANK, "seed-b", 2026)).not.toEqual(reserve);
  });

  it("ages a season: each player progressed, the oldest retired and replaced at his position by a young one", () => {
    // Some seasons later, every player drawn at 33 or less has crossed the retirement age.
    let current = reserve;
    for (let startYear = 2027; startYear <= 2040; startYear++) {
      const next = reserveAfterSeason(brazil, current, NAME_BANK, "seed-a", startYear);
      expect(next.map((player) => player.position)).toEqual(current.map((player) => player.position));
      next.forEach((player, index) => {
        const before = current[index];
        if (player.key === before.key) {
          expect(player.birthDate).toBe(before.birthDate);
          expect(ageOf(player.birthDate, startYear)).toBeLessThan(NATION_RESERVE_RETIREMENT_AGE);
        } else {
          expect(ageOf(before.birthDate, startYear)).toBeGreaterThanOrEqual(NATION_RESERVE_RETIREMENT_AGE);
          expect(player.key).toBe(`reserve:BRA:${index + 1}:${startYear}`);
          expect(ageOf(player.birthDate, startYear)).toBe(NATION_RESERVE_AGE.worst);
        }
      });
      current = next;
    }
    expect(current.every((player, index) => player.key !== reserve[index].key)).toBe(true);
    expect(reserveAfterSeason(brazil, reserve, NAME_BANK, "seed-a", 2027)).toEqual(reserveAfterSeason(brazil, reserve, NAME_BANK, "seed-a", 2027));
  });
});

describe("callUp", () => {
  const player = (id: string, position: Position, overall: number, reserve = false): CallUpCandidate => ({ id, position, overall, reserve });

  it("calls the best of each line, then the best outfield players left, 23 in all", () => {
    const candidates = [
      ...["GK", "GK", "GK", "GK"].map((position, index) => player(`gk${index}`, position as Position, 80 - index)),
      ...Array.from({ length: 10 }, (_, index) => player(`df${index}`, "CB", 70 + index)),
      ...Array.from({ length: 10 }, (_, index) => player(`mf${index}`, "CM", 60 + index)),
      ...Array.from({ length: 6 }, (_, index) => player(`fw${index}`, "ST", 75 + index)),
    ];
    const called = callUp(candidates);
    expect(called).toHaveLength(23);
    const groups = called.map((candidate) => positionGroup(candidate.position));
    expect(groups.filter((group) => group === "GK")).toHaveLength(3);
    // 3 goalkeepers, 7 defenders, 7 midfielders, 4 forwards, then the two best outfield players left: two forwards.
    expect(groups.filter((group) => group === "FW")).toHaveLength(6);
    expect(called.map((candidate) => candidate.id)).not.toContain("gk3");
    expect(called.map((candidate) => candidate.id)).toContain("mf3");
    expect(called.map((candidate) => candidate.id)).not.toContain("mf2");
  });

  it("takes a reserve player only where he is better than a player of our clubs, or where one is missing", () => {
    const called = callUp([player("ours", "GK", 70), player("reserve-better", "GK", 75, true), player("reserve-equal", "GK", 70, true), player("reserve-worse", "GK", 60, true)]);
    expect(called.map((candidate) => candidate.id)).toEqual(["reserve-better", "ours", "reserve-equal"]);
  });
});

describe("friendliesOfRound", () => {
  it("makes every nation play once a date, and each pair meet once in 13 dates, venues swapped the 13 after", () => {
    const pairs = new Map<string, number>();
    for (let round = 0; round < NATION_CODES.length - 1; round++) {
      const matches = friendliesOfRound("seed-a", round);
      expect(matches).toHaveLength(7);
      expect(matches.flatMap((match) => [match.home, match.away]).sort()).toEqual([...NATION_CODES].sort());
      for (const { home, away } of matches) {
        const key = [home, away].sort().join("-");
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
      const next = friendliesOfRound("seed-a", round + 13);
      expect(next).toEqual(matches.map(({ home, away }) => ({ home: away, away: home })));
    }
    expect(pairs.size).toBe((14 * 13) / 2);
    expect([...pairs.values()].every((count) => count === 1)).toBe(true);
  });

  it("goes on from season to season: a season's first date follows the last one's", () => {
    expect(friendlyRoundOf(2026, 2026, 0)).toBe(0);
    expect(friendlyRoundOf(2026, 2027, 0)).toBe(8);
    expect(friendlyRoundOf(2027, 2028, 7)).toBe(15);
  });
});

describe("playLightFriendly", () => {
  /** A nation's 23 of the template, every player rated `level`, rested. */
  const squad = (code: string, level: number): SquadPlayer[] =>
    squadTemplate(23).map((position, index) => ({
      id: `${code}#${index + 1}`,
      position,
      overall: level,
      injured: false,
      pace: level,
      shooting: level,
      passing: level,
      dribbling: level,
      defending: level,
      physical: level,
      goalkeeping: position === "GK" ? level : 20,
      form: 50,
      morale: 50,
      fitness: 100,
    }));
  const team = (code: string, level: number): NationTeam => {
    const players = squad(code, level);
    return { code, players, formation: nationFormation(players) };
  };

  it("is the same match for the same seed", () => {
    const seed = internationalMatchRngSeed("save", new Date(Date.UTC(2026, 8, 4)), "FRA", "BRA");
    expect(playLightFriendly(team("FRA", 80), team("BRA", 78), seed)).toEqual(playLightFriendly(team("FRA", 80), team("BRA", 78), seed));
  });

  it("plays 16 a side, its 11 and 5 substitutes at the hour, who lose fitness as in a match, and draws goals and injuries at the engine's rates", () => {
    let goals = 0;
    let injuries = 0;
    let strongerWins = 0;
    const matches = 600;
    for (let index = 0; index < matches; index++) {
      const match = playLightFriendly(team("FRA", 80), team("SEN", 72), `test:${index}`);
      goals += match.homeGoals + match.awayGoals;
      injuries += match.appearances.filter((appearance) => appearance.injuryDays !== null).length;
      strongerWins += match.homeGoals > match.awayGoals ? 1 : 0;
      for (const side of ["home", "away"] as const) {
        const ofSide = match.appearances.filter((appearance) => appearance.side === side);
        expect(ofSide).toHaveLength(16);
        expect(ofSide.filter((appearance) => appearance.from === 0)).toHaveLength(11);
        for (const appearance of ofSide) {
          expect(appearance.fitness).toBeLessThan(100);
          expect(appearance.fitness).toBeGreaterThanOrEqual(100 - (appearance.to - appearance.from) / 3);
        }
      }
      expect(match.goals.every((goal) => goal.minute >= 1 && goal.minute <= 90)).toBe(true);
    }
    // About 2.5 to 3.5 goals a match between a strong and a weaker nation, about 0.12 injuries a side, the stronger
    // winning most of its home matches.
    expect(goals / matches).toBeGreaterThan(2.2);
    expect(goals / matches).toBeLessThan(3.8);
    expect(injuries / (2 * matches)).toBeGreaterThan(0.07);
    expect(injuries / (2 * matches)).toBeLessThan(0.18);
    expect(strongerWins / matches).toBeGreaterThan(0.55);
  });

  it("leaves out the injured, and plays fewer substitutes when the bench is short", () => {
    const players = squad("CRO", 75).slice(0, 13).map((player, index) => (index === 1 ? { ...player, injured: true } : player));
    const match = playLightFriendly({ code: "CRO", players, formation: nationFormation(players) }, team("NED", 75), "short");
    const croatia = match.appearances.filter((appearance) => appearance.side === "home");
    expect(croatia.map((appearance) => appearance.playerId)).not.toContain("CRO#2");
    expect(croatia.length).toBeLessThanOrEqual(12);
  });
});
