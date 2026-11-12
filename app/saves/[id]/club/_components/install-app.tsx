"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { INSTALL_PROMPT_HELD, isAppleMobile, isStandalone } from "@/app/_lib/install-app";
import { cn } from "@/src/lib/utils";
import { CLUB_CARD_LINK } from "./club-card";
import { SETTINGS_DETAIL, SETTINGS_NAME, SETTINGS_ROW } from "./settings-styles";

/** Where the browser stands: the installed app already, its own prompt held back, an iPhone, or neither. */
type InstallState = "unknown" | "installed" | "prompt" | "apple" | "other";

function currentState(): InstallState {
  if (isStandalone()) {
    return "installed";
  }
  if (window.__lwInstallPrompt !== undefined && window.__lwInstallPrompt !== null) {
    return "prompt";
  }
  return isAppleMobile() ? "apple" : "other";
}

/**
 * Where the browser stands for installing the game, followed as it changes, and what pressing « Installer l'appli » does:
 * the browser's own prompt where there is one, else the help line shown or hidden.
 */
function useInstallApp(): { state: InstallState; help: boolean; install: () => Promise<void> } {
  const [state, setState] = useState<InstallState>("unknown");
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const update = () => setState(currentState());
    update();
    window.addEventListener(INSTALL_PROMPT_HELD, update);
    window.addEventListener("appinstalled", update);
    return () => {
      window.removeEventListener(INSTALL_PROMPT_HELD, update);
      window.removeEventListener("appinstalled", update);
    };
  }, []);

  const install = async () => {
    const prompt = window.__lwInstallPrompt;
    if (state === "prompt" && prompt !== undefined && prompt !== null) {
      // A prompt opens once: the browser offers another one later if the player says no.
      window.__lwInstallPrompt = null;
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      setState(outcome === "accepted" ? "installed" : currentState());
      return;
    }
    setHelp((open) => !open);
  };

  return { state, help, install };
}

/**
 * The settings' row of the installable game: a discreet button that opens the browser's own prompt where there is one
 * (Chrome, Edge, Android: held back from the first page, app/_lib/install-app.ts), or says in a line how to install it,
 * Share then Add to Home Screen on an iPhone or an iPad, the browser's menu elsewhere. In the installed app, says so.
 * Nothing opens unless the player presses it.
 */
export function InstallApp() {
  const t = useTranslations("settings.install");
  const { state, help, install } = useInstallApp();
  return (
    <div data-testid="settings-install" data-state={state} className={SETTINGS_ROW}>
      <div className="min-w-0 flex-1">
        <p className={SETTINGS_NAME}>{t("title")}</p>
        <p className={SETTINGS_DETAIL}>{state === "installed" ? t("installed") : t("detail")}</p>
      </div>
      {state !== "installed" && (
        <button
          type="button"
          data-testid="settings-install-button"
          aria-expanded={state === "prompt" ? undefined : help}
          className={CLUB_CARD_LINK}
          onClick={() => void install()}
        >
          {t("button")}
        </button>
      )}
      {help && state !== "installed" && state !== "prompt" && (
        <p data-testid="settings-install-help" className={cn(SETTINGS_DETAIL, "basis-full")}>
          {state === "apple" ? t("ios") : t("other")}
        </p>
      )}
    </div>
  );
}

/**
 * « Installer l'appli » in one line, for the « À demain » card: the same button as the settings', nothing once installed,
 * and never in an app's browser, which installs nothing (the in-app notice sends the player to their browser first).
 */
export function InstallAppLink({ className }: { className?: string }) {
  const t = useTranslations("settings.install");
  const { state, help, install } = useInstallApp();
  if (state === "unknown" || state === "installed") {
    return null;
  }
  return (
    <div data-testid="install-app-link" data-state={state} className={cn("space-y-1 in-app:hidden", className)}>
      <button type="button" aria-expanded={state === "prompt" ? undefined : help} className={CLUB_CARD_LINK} onClick={() => void install()}>
        {t("button")}
      </button>
      {help && state !== "prompt" && <p className="text-sm text-muted-foreground">{state === "apple" ? t("ios") : t("other")}</p>}
    </div>
  );
}
