"use client";

import { useLocale } from "next-intl";
import { useEffect } from "react";
import type { Locale } from "@/src/i18n/locale";

/** The page this tab already reloaded for its language, if any: never twice in a row for the same one. */
const RELOADED_KEY = "lw_locale_reload";

/**
 * Loads the page again, in full, when it is not in the language its document was loaded in. The root layout stays as the
 * first page loaded made it, its <html lang> and the messages it hands down to client components: a page reached without
 * a full load from a page in the other language would mix both. That happens between a public page, in its address's
 * language, and a save, in the player's: a career created from the English home page by a French player, a step back
 * from it. Nothing happens on a page loaded in full, and a page is never reloaded twice in a row.
 */
export function LocaleGuard({ locale }: { locale: Locale }) {
  const loaded = useLocale();
  useEffect(() => {
    const page = `${window.location.pathname}:${locale}`;
    try {
      if (loaded === locale) {
        sessionStorage.removeItem(RELOADED_KEY);
        return;
      }
      if (sessionStorage.getItem(RELOADED_KEY) === page) {
        return;
      }
      sessionStorage.setItem(RELOADED_KEY, page);
    } catch {
      // No session storage (a private window, blocked site data): the languages agree after one full load anyway.
      if (loaded === locale) {
        return;
      }
    }
    window.location.reload();
  }, [loaded, locale]);
  return null;
}
