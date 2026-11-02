import { useTranslations } from "next-intl";
import Link from "next/link";
import { GoogleSignInButton } from "@/app/_components/account-panel";
import { LanguageSwitcher } from "@/app/_components/language-switcher";
import { signOutAction } from "@/app/actions";
import type { CurrentUser } from "@/src/auth/current-user";
import { maxSavesFor } from "@/src/lib/limits";
import { cn } from "@/src/lib/utils";
import { Panel } from "../../_components/panel";
import { CLUB_CARD_LINK, ClubCardTitle } from "./club-card";

const ROW = "flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5";
const NAME = "text-[0.9375rem]";
const DETAIL = "text-[0.8125rem] text-muted-foreground";

/** What an account says, wide enough for most e-mails: its action goes under it rather than break one. */
const ACCOUNT_LABEL = "min-w-0 flex-[1_1_12rem] wrap-break-word";

/** An anonymous player's way to a Google account; a Google account's name, e-mail and way out. */
function Account({ user }: { user: CurrentUser }) {
  const t = useTranslations("settings");
  const tAccount = useTranslations("account");
  if (user.kind !== "REGISTERED") {
    return (
      <div data-testid="settings-account" className={ROW}>
        <div className={ACCOUNT_LABEL}>
          <p className={NAME}>{t("account")}</p>
          <p className={DETAIL}>{t("browserOnly")}</p>
        </div>
        <GoogleSignInButton />
      </div>
    );
  }
  return (
    <div data-testid="settings-account" className={ROW}>
      <div className={ACCOUNT_LABEL}>
        <p data-testid="account-name" className={NAME}>
          {user.name ?? user.email ?? tAccount("googleAccount")}
        </p>
        {user.name !== null && user.email !== null && <p className={DETAIL}>{user.email}</p>}
      </div>
      <form action={signOutAction}>
        <button type="submit" data-testid="sign-out" className={CLUB_CARD_LINK}>
          {tAccount("signOut")}
        </button>
      </form>
    </div>
  );
}

type ClubSettingsProps = {
  user: CurrentUser;
  ownedSaves: number;
  className?: string;
};

/** The player's settings: language, account, saves used and privacy. */
export function ClubSettings({ user, ownedSaves, className }: ClubSettingsProps) {
  const t = useTranslations("settings");
  const tLanguage = useTranslations("language");
  const tFooter = useTranslations("footer");
  return (
    <Panel aria-labelledby="club-settings-title" data-testid="club-settings" className={cn("flex flex-col gap-4", className)}>
      <ClubCardTitle id="club-settings-title">{t("title")}</ClubCardTitle>
      <div className={ROW}>
        <p className={NAME}>{tLanguage("label")}</p>
        <LanguageSwitcher segmented />
      </div>
      <Account user={user} />
      <div data-testid="settings-saves" className={ROW}>
        <div className="min-w-0 flex-1">
          <p className={NAME}>{t("saves")}</p>
          <p className={cn(DETAIL, "tabular-nums")}>{t("savesUsed", { used: ownedSaves, max: maxSavesFor(user.kind) })}</p>
        </div>
        <Link href="/" data-testid="settings-change-save" className={CLUB_CARD_LINK}>
          {t("changeSave")}
        </Link>
      </div>
      <Link
        href="/privacy"
        data-testid="settings-privacy"
        className="mt-auto self-start text-[0.8125rem] text-muted-foreground hover:text-foreground max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
      >
        {tFooter("privacy")}
      </Link>
    </Panel>
  );
}
