import { describe, expect, it } from "vitest";
import { attributeRngSeed, clubLevelFromRank, generateAttributes } from "../../src/engine/generation";
import { ageInYears } from "../../src/lib/dates";
import { makeRng } from "../../src/lib/rng";
import { NAME_BANK } from "../../src/engine/names";
import {
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
          "birthDate": 1995-02-25T00:00:00.000Z,
          "firstName": "Kieran",
          "lastName": "Williams",
          "nationality": "Angleterre",
          "position": "GK",
          "squadSlot": 1,
        },
        {
          "birthDate": 1998-07-29T00:00:00.000Z,
          "firstName": "Thiago",
          "lastName": "Pereyra",
          "nationality": "Argentine",
          "position": "GK",
          "squadSlot": 2,
        },
      ]
    `);
  });

  it("fill every squad with 2 GK, 8 DF, 8 MF and 5 FW under distinct names", () => {
    expect(clubs).toHaveLength(96);
    for (const club of clubs) {
      expect(club.players.map((player) => player.position)).toEqual(SQUAD_TEMPLATE);
      expect(club.players.map((player) => player.squadSlot)).toEqual(SQUAD_TEMPLATE.map((_, index) => index + 1));
      expect(new Set(club.players.map((player) => `${player.firstName} ${player.lastName}`)).size).toBe(
        SQUAD_TEMPLATE.length,
      );
    }
  });

  it("are 17 to 36 years old on 1 July 2024", () => {
    const ages = players.map((player) => ageInYears(player.birthDate, WORLD_REFERENCE_DATE));

    expect(Math.min(...ages)).toBe(MIN_AGE);
    expect(Math.max(...ages)).toBe(MAX_AGE);
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

describe("club level from the 2024-25 rank", () => {
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
