import "server-only";
import { cookies, headers } from "next/headers";
import { playerLocale } from "../i18n/player-locale";
import { ARRIVAL_COOKIE, acquisitionOf, type Acquisition } from "../lib/arrival";

/**
 * What the request creating a user tells of their arrival (src/lib/arrival.ts): the lw_src cookie of their first visit,
 * their language (the one the game speaks to them: lw_lang, else their browser's), phone or computer. The creation of
 * a save's Server Action, or Google's callback: both are the player's browser.
 */
export async function requestAcquisition(): Promise<Acquisition> {
  const [store, requestHeaders, locale] = await Promise.all([cookies(), headers(), playerLocale()]);
  return acquisitionOf({
    arrivalCookie: store.get(ARRIVAL_COOKIE)?.value,
    locale,
    userAgent: requestHeaders.get("user-agent"),
    mobileHint: requestHeaders.get("sec-ch-ua-mobile"),
  });
}
