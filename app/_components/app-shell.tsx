"use client";

import { useEffect } from "react";
import { countAppLaunchAction } from "../actions";
import { isStandalone, LAUNCH_COUNTED_KEY } from "../_lib/install-app";

/**
 * What the installed game needs on every page, mounted once in the root layout: the service worker (public/sw.js, a
 * production build only: a development server's pages change under it), and, in the installed app, its launch counted
 * once a session for /admin (countAppLaunchAction). Renders nothing.
 */
export function AppShell() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    if (!isStandalone()) {
      return;
    }
    try {
      if (sessionStorage.getItem(LAUNCH_COUNTED_KEY) !== null) {
        return;
      }
      sessionStorage.setItem(LAUNCH_COUNTED_KEY, "1");
    } catch {
      // Without a session's storage, a launch could not be counted once: it is not counted.
      return;
    }
    countAppLaunchAction().catch(() => undefined);
  }, []);
  return null;
}
