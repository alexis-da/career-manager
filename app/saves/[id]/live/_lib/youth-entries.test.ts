import { describe, expect, it, vi } from "vitest";
import { halfTimeTeamOf, squadKeys, type HalfTimeTeam, type Identity } from "@/src/db/live-match";
import { MAX_SUBSTITUTIONS, POSITION_PROFILES, YOUTH_ENTRY_MINUTE } from "@/src/engine/balance";
import { DEFAULT_FORMATION_NAME, formationPositions } from "@/src/engine/formations";
import { ATTRIBUTE_NAMES, clampRating, overallFor, type AttributeName } from "@/src/engine/generation";
import type { Lineup, SquadPlayer } from "@/src/engine/lineup";
import { pauseOf, playOn } from "@/src/engine/live";
import { startMatch, youthEntriesDue, type HalfTimeChoice, type MatchState, type TeamLive } from "@/src/engine/match";
import type { Position } from "@/src/engine/positions";
import { testTranslator } from "@/src/i18n/test-intl";
import { coachAdvice } from "./coach-advice";
import { pauseRules, pauseState, suggestChange, type SuggestedChange } from "./half-time-moves";

// The managed club's young players its assistant brings on at the restart after the 60th minute (« Lancer les jeunes »),
// from the state the engine plays to what the Coaching panel says of them. halfTimeTeamOf is pure: the database client
// its module imports is never reached.
vi.mock("@/src/db/client", () => ({ prisma: {} }));

const t = testTranslator("fr", "halfTime");

function player(id: string, position: Position, level: number): SquadPlayer {
  const attributes = Object.fromEntries(
    ATTRIBUTE_NAMES.map((name) => [name, clampRating(level + POSITION_PROFILES[position][name])]),
  ) as Record<AttributeName, number>;
  return { id, position, overall: overallFor(position, attributes), injured: false, form: 50, morale: 50, fitness: 100, ...attributes };
}

const BENCH: readonly Position[] = ["GK", "CB", "RB", "CDM", "CM", "RW", "ST"];

/** A team of one level in the 4-3-3, its bench three points below. */
function team(name: string, level: number): Lineup {
  return {
    starters: formationPositions(DEFAULT_FORMATION_NAME).map((slot, index) => ({ player: player(`${name}#${index}`, slot, level), slot, index })),
    bench: BENCH.map((position, index) => player(`${name}#bench${index}`, position, level - 3)),
  };
}

// The managed club at home, its substitute centre-back and central midfielder to bring on.
const YOUNG = ["home#bench1", "home#bench4"];
const HOME: Lineup = { ...team("home", 70), youthEntries: YOUNG };
const AWAY = team("away", 70);
const SEEDS = Array.from({ length: 30 }, (_, index) => `youth-advice:${index}`);

/** The match played on segment by segment from kick-off to a minute, without choice events. */
function playedTo(minute: number, seed: string, home: Lineup = HOME): MatchState {
  let state = startMatch(home, AWAY);
  while (state.played < minute) {
    state = playOn(state, "home", seed, {}, "segment");
  }
  return state;
}

/** The managed club at the pause its match waits at, as the Coaching panel receives it, each player named after his key. */
function clubAt(state: MatchState): HalfTimeTeam {
  const pause = pauseOf(state);
  if (pause === null) {
    throw new Error("The match waits at no pause");
  }
  const identities: Identity[] = squadKeys(state, "home").map((playerKey) => ({
    playerKey,
    firstName: "Léo",
    lastName: playerKey,
    birthDate: new Date("2005-03-01T00:00:00.000Z"),
  }));
  return halfTimeTeamOf(state, "home", pause, identities, new Date("2026-08-22T00:00:00.000Z"), { primary: "#000000", secondary: "#ffffff" });
}

/** The Coaching panel at a pause, nothing changed yet: the assistant's suggestion and what he says of it. */
function panelAt(state: MatchState): { club: HalfTimeTeam; suggestion: SuggestedChange | null; line: string | undefined } {
  const club = clubAt(state);
  const rules = pauseRules(club);
  const panel = pauseState(club);
  const suggestion = suggestChange(panel, rules, club.players);
  const advice = coachAdvice(
    {
      phase: club.phase,
      goalDifference: 0,
      state: panel,
      rules,
      suggestion,
      booked: club.booked,
      hurt: club.hurt,
      players: new Map(club.players.map((entry) => [entry.id, entry])),
    },
    t,
  );
  return { club, suggestion, line: advice.find((entry) => entry.topic === "change")?.text };
}

/** The engine's plan for a side at the 60th minute, as the panel lists it: its assistant's, whoever makes the changes. */
const enginePlan = (side: TeamLive): { in: string; out: string }[] =>
  youthEntriesDue({ ...side, manual: undefined }, YOUTH_ENTRY_MINUTE)
    .slice(0, MAX_SUBSTITUTIONS - side.substitutions)
    .map(({ player: young, out }) => ({ in: young.id, out: out.player.id }));

/** The young players a restart brought on in the 61st minute, each for the starter he replaced. */
const broughtOn = (state: MatchState): { in: string; out: string | undefined }[] =>
  state.events
    .filter((event) => event.minute === YOUTH_ENTRY_MINUTE + 1 && event.side === "home" && event.type === "SUBSTITUTION" && YOUNG.includes(event.playerId))
    .map((event) => ({ in: event.playerId, out: event.relatedPlayerId }));

describe("the young players the assistant brings on, in the Coaching panel (« Lancer les jeunes »)", () => {
  it("are proposed at half-time, then at the 60th minute's pause as the very changes the restart makes", () => {
    const proposed = { halfTime: 0, sixty: 0 };
    for (const seed of SEEDS) {
      const halfTime = playedTo(45, seed);
      const atHalfTime = panelAt(halfTime);
      expect(atHalfTime.club.phase).toBe("HALF_TIME");
      expect(atHalfTime.club.youthEntries).toEqual(enginePlan(halfTime.home));
      const [planned] = atHalfTime.club.youthEntries;
      if (planned !== undefined && atHalfTime.club.injured.length === 0) {
        expect(atHalfTime.suggestion).toMatchObject({ in: planned.in, out: planned.out, reason: "youth" });
        expect(atHalfTime.line).toBe(`À la 61e, je fais entrer ${planned.in} à la place de ${planned.out} : il a besoin de minutes.`);
        proposed.halfTime++;
      }

      // Left to the assistant, half-time and the hour: the panel lists exactly whom the restart brings on, and for whom.
      const sixty = playOn(halfTime, "home", seed, {}, "segment");
      const atSixty = panelAt(sixty);
      expect(atSixty.club).toMatchObject({ phase: "IN_PLAY", minute: YOUTH_ENTRY_MINUTE, manual: false });
      expect(atSixty.club.youthEntries).toEqual(broughtOn(playOn(sixty, "home", seed, {}, "segment")));
      const [first] = atSixty.club.youthEntries;
      if (first !== undefined && atSixty.club.injured.length === 0 && atSixty.club.windows.open) {
        expect(atSixty.suggestion).toMatchObject({ in: first.in, out: first.out, reason: "youth" });
        expect(atSixty.line).toBe(`À la reprise, je fais entrer ${first.in} à la place de ${first.out} : il a besoin de minutes.`);
        proposed.sixty++;
      }
    }
    expect(proposed.halfTime).toBeGreaterThan(SEEDS.length / 2);
    expect(proposed.sixty).toBeGreaterThan(SEEDS.length / 2);
  });

  it("are none at the other pauses: the 30th minute's, before half-time, and the 75th's, once they came on", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      expect(clubAt(playedTo(30, seed)).youthEntries).toEqual([]);
      const at75 = panelAt(playedTo(75, seed));
      expect(at75.club.youthEntries).toEqual([]);
      expect(at75.suggestion?.reason).not.toBe("youth");
    }
  });

  it("are still proposed once the manager makes his own changes, as his call: the assistant brings none on", () => {
    let advised = 0;
    for (const seed of SEEDS) {
      const halfTime = playedTo(45, seed);
      const club = clubAt(halfTime);
      // His own change at half-time, up front: the left winger off for the substitute winger.
      const leaving = "home#10";
      const coming = "home#bench5";
      if (club.injured.length > 0 || !club.starters.includes(leaving) || !club.bench.includes(coming)) {
        continue;
      }
      const changes: HalfTimeChoice = {
        formation: club.formation,
        starters: club.starters.flatMap((key, slot) => (key === null ? [] : [{ slot, playerKey: key === leaving ? coming : key }])),
        substitutions: [{ in: coming, out: leaving }],
      };
      const sixty = playOn(halfTime, "home", seed, { changes }, "segment");
      const atSixty = panelAt(sixty);
      expect(atSixty.club.manual).toBe(true);
      expect(youthEntriesDue(sixty.home, YOUTH_ENTRY_MINUTE)).toEqual([]);
      expect(atSixty.club.youthEntries).toEqual(enginePlan(sixty.home));
      expect(broughtOn(playOn(sixty, "home", seed, {}, "segment"))).toEqual([]);
      const [first] = atSixty.club.youthEntries;
      if (first !== undefined && atSixty.club.windows.open) {
        expect(atSixty.suggestion).toMatchObject({ in: first.in, out: first.out, reason: "youth" });
        expect(atSixty.line).toBe(`Fais entrer ${first.in} à la place de ${first.out} : il a besoin de minutes.`);
        advised++;
      }
    }
    expect(advised).toBeGreaterThan(SEEDS.length / 2);
  });

  it("are none for a side without young players to bring on, its advice as it always was", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      for (const minute of [45, YOUTH_ENTRY_MINUTE]) {
        const { club, suggestion } = panelAt(playedTo(minute, seed, team("home", 70)));
        expect(club.youthEntries).toEqual([]);
        expect(suggestion?.reason).not.toBe("youth");
      }
    }
  });
});
