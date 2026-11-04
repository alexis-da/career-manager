import type { ChoiceEventView, HalfTimeTeam } from "@/src/db/live-match";
import { KNOCK_SHARE } from "@/src/engine/balance";

/**
 * The managed club at a pause as the player's decision on its choice event leaves it, before anything is played: the
 * player an option takes off replaced in his slot by the substitute the event names, in this pause's window; a player
 * played on after a knock hurt; a late tactical choice's instruction given by the event, the starting one to carry on as
 * the club started. The Coaching panel opens on it after the event card and its changes go on from it, as the server
 * makes the same decision first. `change`: the substitution the decision makes, which the panel shows and cannot undo.
 */
export function decidedTeam(
  team: HalfTimeTeam,
  event: ChoiceEventView,
  index: number,
): { team: HalfTimeTeam; change: { out: string; in: string } | null } {
  const chosen = event.options[index];
  if (chosen === undefined) {
    return { team, change: null };
  }
  if (chosen.instruction !== null) {
    return { team: { ...team, instruction: { ...team.instruction, current: chosen.instruction, source: "EVENT" } }, change: null };
  }
  const playerKey = chosen.playerKey;
  if (chosen.option === "PLAY_ON" && playerKey !== null) {
    return {
      team: {
        ...team,
        hurt: [...team.hurt, playerKey],
        players: team.players.map((player) =>
          player.id === playerKey
            ? { ...player, fitnessFactor: player.fitnessFactor * KNOCK_SHARE, condition: player.condition * KNOCK_SHARE }
            : player,
        ),
      },
      change: null,
    };
  }
  const incoming = chosen.replacement?.key;
  const slot = playerKey === null ? -1 : team.starters.indexOf(playerKey);
  if ((chosen.option !== "TAKE_OFF" && chosen.option !== "REPLACE") || playerKey === null || incoming === undefined || slot < 0) {
    return { team, change: null };
  }
  const starters = [...team.starters];
  starters[slot] = incoming;
  return {
    team: {
      ...team,
      starters,
      bench: team.bench.filter((key) => key !== incoming),
      substitutions: team.substitutions + 1,
      // During play, the pause becomes one of the club's windows: its other substitutions go in it.
      windows: team.phase === "IN_PLAY" ? { ...team.windows, used: team.windows.used + 1, open: true } : team.windows,
    },
    change: { out: playerKey, in: incoming },
  };
}
