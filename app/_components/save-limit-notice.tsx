import type { CurrentUser } from "@/src/auth/current-user";
import type { UserKind } from "@/src/lib/limits";
import { AccountPanel } from "./account-panel";

/** What a player at their save limit (src/lib/limits.ts) reads, in place of the creation form or after a refusal. */
export const SAVE_LIMIT_MESSAGES: Record<UserKind, string> = {
  ANONYMOUS: "Tu as déjà une carrière en cours. Connecte-toi avec Google pour en mener jusqu'à trois.",
  REGISTERED: "Trois carrières maximum pour l'instant. Supprime-en une pour en commencer une autre.",
};

/** Replaces the creation form once the player owns as many saves as they may: an anonymous one is offered Google. */
export function SaveLimitNotice({ user }: { user: CurrentUser }) {
  return (
    <div className="space-y-4" data-testid="save-limit">
      <p className="text-sm">{SAVE_LIMIT_MESSAGES[user.kind]}</p>
      {user.kind === "ANONYMOUS" && <AccountPanel user={user} />}
    </div>
  );
}
