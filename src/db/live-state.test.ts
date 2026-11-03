import { describe, expect, it } from "vitest";
import { buildWorldPlan } from "../../prisma/seed/seed";
import { HALF_TIME_MINUTE, REGULATION_MINUTES } from "../engine/balance";
import { DEFAULT_FORMATION_NAME, FORMATION_NAMES, formationPositions, type FormationName } from "../engine/formations";
import { attributeRngSeed, clubLevelFromRank, generateAttributes } from "../engine/generation";
import { assistantChoices, withChoices } from "../engine/choices";
import { selectLineup, type Lineup, type SquadPlayer } from "../engine/lineup";
import { playOn } from "../engine/live";
import { knockoutWinner, matchResult, simulateMatch, startMatch, type MatchState, type Side } from "../engine/match";
import { competitionTier } from "../engine/tiers";
import { WORLD_START_DATE } from "../engine/world";
import { ageInYears } from "../lib/dates";
import { makeRng } from "../lib/rng";
import halfTimeV1 from "./data/live-state-v1-half-time.json";
import regulationEndV1 from "./data/live-state-v1-regulation-end.json";
import { parseLiveState, serializeLiveState } from "./live-state";

/** A match played on from where it waits to its end, without a choice or a change, break after break. */
function finish(state: MatchState, managedSide: Side, seed: string): MatchState {
  let current = state;
  while (current.phase !== "FULL_TIME") {
    current = playOn(current, managedSide, seed, {}, "break");
  }
  return current;
}

// Two matches paused by the engine before its segments (liveState version 1, written by the engine of commit 9ace7f5,
// on two synthetic teams): a league match at half-time, on seed "v1-league", and a cup tie level at the end of
// regulation time, on seed "v1-cup-6". A match paused when a new engine is deployed must still play on to its end.
describe("a live match paused before the segment engine (liveState version 1)", () => {
  it("comes back at the minute it was paused at, without choice events", () => {
    expect(parseLiveState("v1-half-time", halfTimeV1).state).toMatchObject({ phase: "HALF_TIME", played: HALF_TIME_MINUTE });
    expect(parseLiveState("v1-regulation-end", regulationEndV1).state).toMatchObject({ phase: "REGULATION_END", played: REGULATION_MINUTES });
    expect(parseLiveState("v1-half-time", halfTimeV1).state.choices).toBeUndefined();
  });

  it("plays on from half-time to the final whistle, the second half in three segments", () => {
    const { managedSide, state } = parseLiveState("v1-half-time", halfTimeV1);
    const finished = finish(state, managedSide, "v1-league");
    const result = matchResult(finished);

    expect(finished.phase).toBe("FULL_TIME");
    expect(result.events.slice(0, state.events.length)).toEqual(state.events);
    expect(result.events.slice(state.events.length).every((event) => event.minute > HALF_TIME_MINUTE)).toBe(true);
    expect(result.events.every((event) => event.minute <= result.fullTime)).toBe(true);
    expect(result.fullTime).toBeGreaterThanOrEqual(REGULATION_MINUTES);
    expect([result.homeHalfTimeGoals, result.awayHalfTimeGoals]).toEqual([state.home.goals, state.away.goals]);
    for (const side of ["home", "away"] as const) {
      const goals = result.events.filter((event) => event.type === "GOAL" && event.side === side).length;
      expect(side === "home" ? result.homeGoals : result.awayGoals).toBe(goals);
      expect(result.appearances.filter((appearance) => appearance.side === side && appearance.from === 0)).toHaveLength(11);
    }
    // The same at every replay.
    expect(finish(parseLiveState("v1-half-time", halfTimeV1).state, managedSide, "v1-league")).toEqual(finished);
  });

  it("replaces at half-time a player injured in the first half, whom the old engine left off until the break", () => {
    const { managedSide, state } = parseLiveState("v1-half-time", halfTimeV1);
    const team = state[managedSide];
    const injured = team.pitch[3];
    const injuredAt = 30;
    // The old engine's shape: the slot empty, the player's time counted, the injury and its event recorded.
    const withInjury: MatchState = {
      ...state,
      [managedSide]: {
        ...team,
        pitch: team.pitch.map((entry) => (entry === injured ? { ...entry, status: "INJURED" } : entry)),
      },
      events: [...state.events, { minute: injuredAt, side: managedSide, type: "INJURY" as const, playerId: injured.player.id }].sort(
        (a, b) => a.minute - b.minute,
      ),
      appearances: [
        ...state.appearances,
        { playerId: injured.player.id, side: managedSide, slot: injured.slot, from: 0, to: injuredAt, minutes: injuredAt },
      ],
      injuries: [...state.injuries, { playerId: injured.player.id, side: managedSide, days: 10 }],
    };
    const stored = parseLiveState("v1-injured", serializeLiveState({ managedSide, state: withInjury }));
    const result = matchResult(finish(stored.state, stored.managedSide, "v1-league"));

    expect(result.events).toContainEqual(
      expect.objectContaining({ minute: HALF_TIME_MINUTE + 1, side: managedSide, type: "SUBSTITUTION", relatedPlayerId: injured.player.id }),
    );
    expect(result.injuries).toContainEqual({ playerId: injured.player.id, side: managedSide, days: 10 });
    expect(result.appearances.filter((appearance) => appearance.playerId === injured.player.id)).toHaveLength(1);
  });

  it("plays on from the end of regulation time of a cup tie to extra time, then the shoot-out if still level", () => {
    const { managedSide, state } = parseLiveState("v1-regulation-end", regulationEndV1);
    const finished = finish(state, managedSide, "v1-cup-6");
    const result = matchResult(finished);

    expect(finished.phase).toBe("FULL_TIME");
    expect(result.decidedBy).not.toBe("REGULATION");
    expect(result.events.slice(0, state.events.length)).toEqual(state.events);
    expect(result.events.slice(state.events.length).every((event) => event.period !== undefined)).toBe(true);
    expect(["home", "away"]).toContain(knockoutWinner(result));
  });
});

// Real squads of the ten leagues, the first four clubs of each by slug, generated for one save, their players at
// fitness from 55 to 100: what a player has left must cross the stored state too.
const SAVE_SEED = "live-state-test";
const squads: { slug: string; squad: SquadPlayer[] }[] = buildWorldPlan().flatMap(({ competition, clubs }) =>
  [...clubs]
    .sort((a, b) => (a.slug < b.slug ? -1 : 1))
    .slice(0, 4)
    .map((club) => ({
      slug: club.slug,
      squad: club.players.map((player) => ({
        ...generateAttributes(
          { position: player.position, age: ageInYears(player.birthDate, WORLD_START_DATE) },
          clubLevelFromRank(club.initialRank, clubs.length, competitionTier(competition.tier)),
          makeRng(attributeRngSeed(SAVE_SEED, club.slug, player.squadSlot)),
        ),
        id: `${club.slug}#${player.squadSlot}`,
        position: player.position,
        form: 50,
        morale: 50,
        fitness: 55 + ((player.squadSlot * 7) % 46),
        injured: false,
      })),
    })),
);

describe("simulating or watching a match", () => {
  it("gives the same match when the player takes his assistant's decisions and changes nothing at the breaks, through the stored live state", () => {
    let paused = 0;
    let cupBreaks = 0;
    let firstHalfIncidents = 0;
    let decisions = 0;
    for (let index = 0; index < 600; index++) {
      const knockout = index % 2 === 1;
      const managedSide: Side = index % 4 < 2 ? "home" : "away";
      const managedFormation: FormationName = FORMATION_NAMES[index % FORMATION_NAMES.length];
      const formations = {
        home: managedSide === "home" ? managedFormation : DEFAULT_FORMATION_NAME,
        away: managedSide === "away" ? managedFormation : DEFAULT_FORMATION_NAME,
      };
      const homeClub = squads[(index * 7) % squads.length];
      const awayClub = squads[(index * 11 + 1 + Math.floor(index / squads.length)) % squads.length];
      if (homeClub === awayClub) {
        continue;
      }
      const lineup = (squad: SquadPlayer[], formation: FormationName): Lineup => selectLineup(squad, formationPositions(formation));
      const home = lineup(homeClub.squad, formations.home);
      const away = lineup(awayClub.squad, formations.away);
      const seed = `live-state:${index}`;

      // Watched: stored at every pause, from the first boundary to the end, played on segment by segment with the
      // assistant's decisions and no change at the breaks.
      let state = playOn(withChoices(startMatch(home, away, formations, knockout), managedSide, seed), managedSide, seed, {}, "segment");
      while (state.phase !== "FULL_TIME") {
        const live = parseLiveState("watched", serializeLiveState({ managedSide, state }));
        cupBreaks += live.state.phase === "REGULATION_END" ? 1 : 0;
        firstHalfIncidents +=
          live.state.phase === "HALF_TIME" && live.state.events.some((event) => event.type === "INJURY" || event.type === "RED_CARD") ? 1 : 0;
        state = playOn(live.state, live.managedSide, seed, {}, "segment");
      }
      paused++;
      decisions += state.choices?.decisions.length ?? 0;

      expect(matchResult(state)).toEqual(simulateMatch(home, away, seed, formations, knockout, {}, assistantChoices(managedSide, seed)));
    }
    expect(paused).toBeGreaterThan(500);
    expect(cupBreaks).toBeGreaterThan(20);
    expect(firstHalfIncidents).toBeGreaterThan(50);
    expect(decisions).toBeGreaterThan(paused);
    // 1 200 matches: longer than the default 5 s while other files run.
  }, 60_000);
});
