// The game installed from the browser, without a store (app/manifest.ts, public/sw.js). The browser's own prompt is held
// back from the first page on (HOLD_INSTALL_PROMPT_SCRIPT, in the root layout before React): no window ever comes by
// itself; the player asks for it from the settings (InstallApp). Browser code only.

/** The colour of the game's screens (piste A): the installed app's background and the browser's bars. */
export const APP_BACKGROUND = "#0B1340";

/** The prompt Chrome, Edge and Android's browsers offer once the game is installable (beforeinstallprompt). */
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    // The prompt held back, until the player asks for it; null once used or once the game is installed.
    __lwInstallPrompt?: InstallPromptEvent | null;
  }
}

/** The event that says a prompt was held back, for a settings page already open. */
export const INSTALL_PROMPT_HELD = "lw-install-prompt";

/**
 * Run before React, in the root layout: holds the browser's prompt back (no mini-infobar on Android), keeps it for the
 * settings, forgets it once the game is installed.
 */
export const HOLD_INSTALL_PROMPT_SCRIPT = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__lwInstallPrompt=e;window.dispatchEvent(new Event("${INSTALL_PROMPT_HELD}"))});window.addEventListener("appinstalled",function(){window.__lwInstallPrompt=null});`;

/** Whether the page runs as the installed app: standalone (or full screen), or an iPhone's home-screen web app. */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** An iPhone or an iPad, which installs from its Share menu (an iPad asks for a desktop site: a Mac with touch). */
export function isAppleMobile(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

/** The key, in the session's storage, of a launch already counted: one a session of the installed app. */
export const LAUNCH_COUNTED_KEY = "lw_launch_counted";
