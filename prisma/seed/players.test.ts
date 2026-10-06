import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { attributeRngSeed, clubLevelFromRank, generateAttributes } from "../../src/engine/generation";
import { ageInYears } from "../../src/lib/dates";
import { makeRng } from "../../src/lib/rng";
import { NAME_BANK } from "../../src/engine/names";
import type { Position } from "../../src/engine/positions";
import {
  FREE_AGENT_MAX_AGE,
  FREE_AGENT_MIN_AGE,
  FREE_AGENT_POOL_TEMPLATE,
  generateFreeAgentPool,
  generateSquad,
  HOME_NATIONALITY_SHARE,
  MAX_AGE,
  MIN_AGE,
  SQUAD_TEMPLATE,
  WORLD_REFERENCE_DATE,
} from "./players";
import { buildWorldPlan, type ClubPlan } from "./seed";

const names = NAME_BANK;
const plan = buildWorldPlan();
const clubs = plan.flatMap(({ competition, clubs }) => clubs.map((club) => ({ ...club, country: competition.country })));
const players = clubs.flatMap((club) => club.players.map((player) => ({ ...player, country: club.country })));

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

describe("world players", () => {
  it("are identical on every run", () => {
    expect(buildWorldPlan()).toEqual(plan);
  });

  // Pinned values: a failure here means the fixed world changed (generator, name lists or template).
  it("keep the same identities for the fixed world seed", () => {
    expect(generateSquad({ slug: "arsenal-fc", country: "Angleterre" }, names).slice(0, 2)).toMatchInlineSnapshot(`
      [
        {
          "birthDate": 1997-02-25T00:00:00.000Z,
          "firstName": "Kieran",
          "lastName": "Williams",
          "nationality": "Angleterre",
          "position": "GK",
          "squadSlot": 1,
        },
        {
          "birthDate": 2000-07-29T00:00:00.000Z,
          "firstName": "Thiago",
          "lastName": "Pereyra",
          "nationality": "Argentine",
          "position": "GK",
          "squadSlot": 2,
        },
      ]
    `);
  });

  it("fill every squad with the 23 of the template under distinct names", () => {
    const count = (positions: Position[], ...wanted: Position[]) =>
      positions.filter((position) => wanted.includes(position)).length;

    expect(clubs).toHaveLength(96);
    for (const club of clubs) {
      const positions = club.players.map((player) => player.position);
      expect([
        count(positions, "GK"),
        count(positions, "RB"),
        count(positions, "CB"),
        count(positions, "LB"),
        count(positions, "CDM"),
        count(positions, "CM"),
        count(positions, "CAM"),
        count(positions, "RM", "RW"),
        count(positions, "LM", "LW"),
        count(positions, "ST"),
      ]).toEqual([2, 2, 4, 2, 2, 3, 2, 2, 2, 2]);
      expect(club.players.map((player) => player.position)).toEqual(SQUAD_TEMPLATE);
      expect(club.players.map((player) => player.squadSlot)).toEqual(SQUAD_TEMPLATE.map((_, index) => index + 1));
      expect(new Set(club.players.map((player) => `${player.firstName} ${player.lastName}`)).size).toBe(
        SQUAD_TEMPLATE.length,
      );
    }
  });

  it("are 17 to 36 years old on the day every save starts", () => {
    const ages = players.map((player) => ageInYears(player.birthDate, WORLD_REFERENCE_DATE));

    expect(Math.min(...ages)).toBe(MIN_AGE);
    expect(Math.max(...ages)).toBe(MAX_AGE);
  });

  // Pinned digest of every world player's age on the day saves start, taken when the game moved from 2024-25 to
  // 2026-27: a change of WORLD_START_YEAR moves birth dates, never ages.
  it("keep the ages they had before the game moved to a later season", () => {
    const pool = generateFreeAgentPool(names);
    const ages = [
      ...clubs.flatMap((club) => club.players.map((player) => `${club.slug}#${player.squadSlot}:${ageInYears(player.birthDate, WORLD_REFERENCE_DATE)}`)),
      ...pool.map((player) => `free-agents#${player.squadSlot}:${ageInYears(player.birthDate, WORLD_REFERENCE_DATE)}`),
    ];

    expect(ages).toHaveLength(2328);
    expect(createHash("sha256").update(ages.join("\n")).digest("hex")).toBe(
      "881a3a27b522b716476ea405437d4f65c8f69403dc1eb76111bab81bc834153e",
    );
  });

  it("hold their club's nationality about 70 % of the time, with names from that nationality", () => {
    const homeShare = players.filter((player) => player.nationality === player.country).length / players.length;

    expect(homeShare).toBeGreaterThan(HOME_NATIONALITY_SHARE - 0.03);
    expect(homeShare).toBeLessThan(HOME_NATIONALITY_SHARE + 0.03);
    for (const player of players) {
      const list = names.get(player.nationality);
      expect(list?.firstNames).toContain(player.firstName);
      expect(list?.lastNames).toContain(player.lastName);
    }
  });
});

describe("free agent pool", () => {
  const pool = generateFreeAgentPool(names);
  const countOf = (position: string) => pool.filter((player) => player.position === position).length;

  it("is identical on every run", () => {
    expect(generateFreeAgentPool(names)).toEqual(pool);
  });

  // Pinned values: a failure here means the fixed pool changed (generator, name lists or template).
  it("keeps the same identities for the fixed seed world-2024-25:free-agents", () => {
    expect(pool.slice(0, 2)).toMatchInlineSnapshot(`
      [
        {
          "birthDate": 1998-08-21T00:00:00.000Z,
          "firstName": "Leonardo",
          "lastName": "Batista",
          "nationality": "Brésil",
          "position": "GK",
          "squadSlot": 1,
        },
        {
          "birthDate": 2002-02-07T00:00:00.000Z,
          "firstName": "Archie",
          "lastName": "Hughes",
          "nationality": "Angleterre",
          "position": "GK",
          "squadSlot": 2,
        },
      ]
    `);
  });

  it("holds 120 players in the squad's position shares, numbered from 1, under distinct names", () => {
    expect(pool).toHaveLength(FREE_AGENT_POOL_TEMPLATE.length);
    expect(pool).toHaveLength(120);
    expect([
      countOf("GK"),
      countOf("RB"),
      countOf("CB"),
      countOf("LB"),
      countOf("CDM"),
      countOf("CM"),
      countOf("CAM"),
      countOf("RM") + countOf("RW"),
      countOf("LM") + countOf("LW"),
      countOf("ST"),
    ]).toEqual([11, 11, 21, 11, 10, 16, 10, 10, 10, 10]);
    expect(pool.map((player) => player.squadSlot)).toEqual(pool.map((_, index) => index + 1));
    expect(new Set(pool.map((player) => `${player.firstName} ${player.lastName}`)).size).toBe(pool.length);
  });

  it("are 24 to 34 years old on the day every save starts, with names from their nationality", () => {
    const ages = pool.map((player) => ageInYears(player.birthDate, WORLD_REFERENCE_DATE));

    expect(Math.min(...ages)).toBe(FREE_AGENT_MIN_AGE);
    expect(Math.max(...ages)).toBe(FREE_AGENT_MAX_AGE);
    for (const player of pool) {
      const list = names.get(player.nationality);
      expect(list?.firstNames).toContain(player.firstName);
      expect(list?.lastNames).toContain(player.lastName);
    }
    expect(new Set(pool.map((player) => player.nationality)).size).toBeGreaterThan(8);
  });
});

describe("club level from the source season rank", () => {
  it("gives every club its final rank, computed from the fixture scores", () => {
    for (const competition of plan) {
      const ranks = competition.clubs.map((club) => club.initialRank).sort((a, b) => a - b);
      expect(ranks).toEqual(competition.clubs.map((_, index) => index + 1));
    }
    const rankOf = (slug: string) => clubs.find((club) => club.slug === slug)?.initialRank;

    expect(rankOf("liverpool-fc")).toBe(1);
    expect(rankOf("southampton-fc")).toBe(20);
    expect(rankOf("paris-saint-germain-fc")).toBe(1);
  });

  it.each<[string, ClubPlan[]]>(plan.map(({ competition, clubs }) => [competition.code, clubs]))(
    "%s: the champion's squad has a higher average overall than the last club's",
    (_, competitionClubs) => {
      const averageOverallAtRank = (rank: number): number => {
        const club = competitionClubs.find((candidate) => candidate.initialRank === rank);
        if (club === undefined) {
          throw new Error(`No club at rank ${rank}`);
        }
        const clubLevel = clubLevelFromRank(club.initialRank, competitionClubs.length);
        return mean(
          club.players.map(
            (player) =>
              generateAttributes(
                { position: player.position, age: ageInYears(player.birthDate, WORLD_REFERENCE_DATE) },
                clubLevel,
                makeRng(attributeRngSeed("test-save", club.slug, player.squadSlot)),
              ).overall,
          ),
        );
      };

      expect(averageOverallAtRank(1)).toBeGreaterThan(averageOverallAtRank(competitionClubs.length));
    },
  );

  it("gives the same attributes to the same player for the same save seed", () => {
    const [player] = clubs[0].players;
    const generate = (saveSeed: string) =>
      generateAttributes(
        { position: player.position, age: ageInYears(player.birthDate, WORLD_REFERENCE_DATE) },
        70,
        makeRng(attributeRngSeed(saveSeed, clubs[0].slug, player.squadSlot)),
      );

    expect(generate("save-1")).toEqual(generate("save-1"));
    expect(generate("save-1")).not.toEqual(generate("save-2"));
  });
});
