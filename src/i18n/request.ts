import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from "./locale";
import en from "./messages/en.json";
import fr from "./messages/fr.json";

/** Each language's messages: the English ones have the French ones' keys (src/i18n/messages.test.ts). */
const MESSAGES: Record<Locale, typeof fr> = { fr, en };

// next-intl's configuration of a request, without the language in the address: the player's language (negotiateLocale,
// from the lw_lang cookie and Accept-Language), its messages, and UTC, the clock in-game dates are stored in
// (src/lib/format.ts). A language asked for explicitly, getTranslations({ locale }), wins.
export default getRequestConfig(async ({ locale: requested }) => {
  const locale = isLocale(requested)
    ? requested
    : negotiateLocale((await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get("accept-language"));
  return { locale, messages: MESSAGES[locale], timeZone: "UTC" };
});
