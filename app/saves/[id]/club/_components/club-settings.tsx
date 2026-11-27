import { useLocale, useTranslations } from "next-intl";
import Link from "@/src/components/link";
import { GoogleSignInButton } from "@/app/_components/account-panel";
import { ResumeLinkCopy } from "@/app/_components/in-app-actions";
import { LanguageSwitcher } from "@/app/_components/language-switcher";
import { signOutAction } from "@/app/actions";
import type { CurrentUser } from "@/src/auth/current-user";
import type { AssistantSettings as AssistantSettingsView, YouthLaunchPlan } from "@/src/db/assistant-settings";
import { publicPath } from "@/src/i18n/public-pages";
import { maxSavesFor } from "@/src/lib/limits";
import type { StreakView } from "@/src/lib/missions";
import type { TutorialSettingState } from "@/src/lib/tutorial";
import { cn } from "@/src/lib/utils";
import { Panel } from "@/src/components/panel";
import { StreakChip } from "../../_components/mission-chips";
import { AssistantSettings } from "./assistant-settings";
import { CLUB_CARD_LINK, ClubCardTitle } from "./club-card";
import { InstallApp } from "./install-app";
import { TutorialSetting } from "./tutorial-setting";
import { SETTINGS_DETAIL as DETAIL, SETTINGS_NAME as NAME, SETTINGS_ROW as ROW } from "./settings-styles";

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
        {/* In an app's browser, where Google does not sign in: the careers' resume link instead. */}
        <ResumeLinkCopy className="hidden in-app:block" />
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

/** The player's streak of daily missions, its chip while it runs, and their record; none running says how to start one. */
function MissionStreak({ streak }: { streak: StreakView }) {
  const t = useTranslations("missions.settings");
  return (
    <div data-testid="settings-streak" data-streak={streak.current} data-best={streak.best} className={ROW}>
      <div className="min-w-0 flex-1">
        <p className={NAME}>{t("title")}</p>
        {streak.current === 0 && <p className={DETAIL}>{t("none")}</p>}
        <p className={cn(DETAIL, "tabular-nums")}>{t("record", { count: streak.best })}</p>
      </div>
      {streak.current > 0 && <StreakChip count={streak.current} />}
    </div>
  );
}

type ClubSettingsProps = {
  user: CurrentUser;
  ownedSaves: number;
  // What the career leaves to the assistant, and under « Lancer les jeunes » the young players he brings on.
  assistant?: { saveId: string; settings: AssistantSettingsView; plan?: YouthLaunchPlan | null } | null;
  streak?: StreakView | null; // the player's daily missions, none in a challenge save
  tutorial?: { saveId: string; state: TutorialSettingState } | null; // the tutorial this save follows, if it does
  className?: string;
};

/**
 * The player's settings: first what the career leaves to the assistant (docs/design/simplification.md § 6.8), then
 * language, account, saves used, the daily missions' streak, the first career's tutorial, the installable game and
 * privacy. Its anchor, `#reglages`, is where the dashboard's announcement leads.
 */
export function ClubSettings({ user, ownedSaves, assistant = null, streak = null, tutorial = null, className }: ClubSettingsProps) {
  const t = useTranslations("settings");
  const tLanguage = useTranslations("language");
  const tFooter = useTranslations("footer");
  // The public pages it leads to, in the save's language.
  const locale = useLocale();
  return (
    <Panel
      id="reglages"
      aria-labelledby="club-settings-title"
      data-testid="club-settings"
      className={cn("flex scroll-mt-4 flex-col gap-4", className)}
    >
      <ClubCardTitle id="club-settings-title">{t("title")}</ClubCardTitle>
      {assistant !== null && <AssistantSettings saveId={assistant.saveId} settings={assistant.settings} plan={assistant.plan ?? null} />}
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
        <Link href={publicPath("home", locale)} data-testid="settings-change-save" className={CLUB_CARD_LINK}>
          {t("changeSave")}
        </Link>
      </div>
      {streak !== null && <MissionStreak streak={streak} />}
      {tutorial !== null && <TutorialSetting saveId={tutorial.saveId} view={tutorial.state} />}
      <InstallApp />
      <Link
        href={publicPath("privacy", locale)}
        data-testid="settings-privacy"
        className="mt-auto self-start text-[0.8125rem] text-muted-foreground hover:text-foreground max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
      >
        {tFooter("privacy")}
      </Link>
    </Panel>
  );
}
