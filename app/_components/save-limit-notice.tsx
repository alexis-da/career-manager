import { useTranslations } from "next-intl";
import type { CurrentUser } from "@/src/auth/current-user";
import { AccountPanel } from "./account-panel";

/**
 * Replaces the creation form once the player owns as many saves as they may (src/lib/limits.ts): the saveLimit message
 * of their kind, which a refused creation shows too, and Google for an anonymous one.
 */
export function SaveLimitNotice({ user }: { user: CurrentUser }) {
  const t = useTranslations("saveLimit");
  return (
    <div className="space-y-4" data-testid="save-limit">
      <p className="text-sm">{t(user.kind)}</p>
      {user.kind === "ANONYMOUS" && <AccountPanel user={user} />}
    </div>
  );
}
