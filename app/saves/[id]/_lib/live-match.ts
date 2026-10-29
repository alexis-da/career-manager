import { MAX_SUBSTITUTIONS } from "@/src/engine/balance";
import type { HalfTimeChoiceIssue } from "@/src/engine/match";
import type { Translator } from "@/src/i18n/translator";

// Why the game cannot move forward while the managed club's match waits at a break (half-time, or before extra time):
// liveMatch.matchInProgress; and that no match waits at one: liveMatch.noMatchInProgress.

/** The reason a half-time choice was refused, as the player of the game should read it. */
export function halfTimeRefusalMessage(issue: HalfTimeChoiceIssue, t: Translator<"liveMatch">): string {
  switch (issue) {
    case "not-half-time":
      return t("noMatchInProgress");
    case "too-many-substitutions":
      return t("issues.too-many-substitutions", { max: MAX_SUBSTITUTIONS });
    default:
      return t(`issues.${issue}`);
  }
}
