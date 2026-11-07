import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, negotiateLocale, type Locale } from "./locale";

/**
 * The player's language, whatever page asks: the one they chose (lw_lang), else the one their browser prefers of the two.
 * A save's pages are in it; a public page is in its address's (PAGE_LOCALE_HEADER), even when it renders a save, as a
 * Server Action posted from it renders the save it redirects to (app/_components/locale-guard.tsx).
 */
export async function playerLocale(): Promise<Locale> {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  return negotiateLocale(cookieStore.get(LOCALE_COOKIE)?.value, requestHeaders.get("accept-language"));
}
