import { MAX_SUBSTITUTIONS } from "@/src/engine/balance";
import type { HalfTimeChoiceIssue } from "@/src/engine/match";

/** Why the game cannot move forward while the managed club's match waits at a break (half-time, or before extra time). */
export const MATCH_IN_PROGRESS_MESSAGE = "Votre match attend la reprise : jouez la suite avant de continuer.";

export const NO_MATCH_IN_PROGRESS_MESSAGE = "Aucun match n'attend la reprise.";

/** The reason a half-time choice was refused, as the player of the game should read it. */
export function halfTimeRefusalMessage(issue: HalfTimeChoiceIssue): string {
  switch (issue) {
    case "not-half-time":
      return NO_MATCH_IN_PROGRESS_MESSAGE;
    case "too-many-substitutions":
      return `Trop de remplacements : ${MAX_SUBSTITUTIONS} au maximum par match, un de plus avant la prolongation.`;
    case "unknown-player-off":
      return "Le joueur remplacé n'est pas sur le terrain.";
    case "sent-off-player":
      return "Un joueur exclu ne peut être ni remplacé ni rappelé : votre équipe joue à dix.";
    case "unknown-substitute":
      return "L'entrant n'est pas sur le banc : un joueur sorti ne peut pas revenir.";
    case "duplicate-player":
      return "Un joueur figure deux fois dans vos changements.";
    case "invalid-slot":
      return "Un poste du dispositif est attribué deux fois ou n'existe pas.";
    case "sent-off-slot":
      return "Le poste d'un joueur exclu reste vide.";
    case "lineup-mismatch":
      return "Le onze ne correspond pas aux joueurs sur le terrain après les remplacements.";
    case "incomplete-lineup":
      return "Un poste reste vide alors qu'un remplaçant peut entrer.";
  }
}
