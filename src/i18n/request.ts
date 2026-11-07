import { headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { isLocale, type Locale } from "./locale";
import { MESSAGES } from "./messages";
import { playerLocale } from "./player-locale";
import { PAGE_LOCALE_HEADER } from "./public-pages";

// next-intl's configuration of a request: its language, its messages, and UTC, the clock in-game dates are stored in
// (src/lib/format.ts). A language asked for explicitly, getTranslations({ locale }), wins.
export default getRequestConfig(async ({ locale: requested }) => {
  const locale = isLocale(requested) ? requested : await requestLocale();
  return { locale, messages: MESSAGES[locale], timeZone: "UTC" };
});

/**
 * A public page's language is its address's (PAGE_LOCALE_HEADER, set by proxy.ts: /fr… in French, the rest in English);
 * any other page's, the player's (playerLocale, from the lw_lang cookie and Accept-Language).
 */
async function requestLocale(): Promise<Locale> {
  const pageLocale = (await headers()).get(PAGE_LOCALE_HEADER);
  return isLocale(pageLocale) ? pageLocale : playerLocale();
}
