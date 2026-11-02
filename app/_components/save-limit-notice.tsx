import { useTranslations } from "next-intl";
import type { CurrentUser } from "@/src/auth/current-user";
import { Panel, PanelTitle } from "@/src/components/panel";
import { AccountPanel } from "./account-panel";

/**
 * Replaces the creation form once the player owns as many saves as they may (src/lib/limits.ts): the saveLimit message
 * of their kind, which a refused creation shows too, and Google for an anonymous one.
 */
export function SaveLimitNotice({ user }: { user: CurrentUser }) {
  const t = useTranslations("saveLimit");
  const tHome = useTranslations("home");
  return (
    <Panel aria-labelledby="save-limit-title" className="space-y-3" data-testid="save-limit">
      <PanelTitle id="save-limit-title">{tHome("newSave")}</PanelTitle>
      <p className="text-sm">{t(user.kind)}</p>
      {user.kind === "ANONYMOUS" && <AccountPanel user={user} />}
    </Panel>
  );
}
