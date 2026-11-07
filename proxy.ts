import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE } from "@/src/i18n/locale";
import { PAGE_LOCALE_HEADER, pageLocaleOf, publicPath } from "@/src/i18n/public-pages";

/**
 * The language of a public page's address (src/i18n/public-pages.ts): PAGE_LOCALE_HEADER on the request, which
 * src/i18n/request.ts reads before the player's language; a forged one is removed here, and elsewhere could only choose
 * a page's language, as the language switcher does. A visitor who chose French (lw_lang,
 * the language switcher) and opens the English home page goes to the French one, for now (302: their choice may change);
 * never one without the cookie, a crawler included: no address follows the browser's language. Runs on the Node.js
 * runtime (the default for proxy.ts since Next 16).
 */
export default function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  // A page asked for, never a Server Action posted to it, which a redirect would lose.
  const navigation = request.method === "GET" || request.method === "HEAD";
  if (pathname === publicPath("home", "en") && navigation && request.cookies.get(LOCALE_COOKIE)?.value === "fr") {
    const french = request.nextUrl.clone();
    french.pathname = publicPath("home", "fr");
    return NextResponse.redirect(french, 302);
  }
  const headers = new Headers(request.headers);
  const locale = pageLocaleOf(pathname);
  if (locale === null) {
    headers.delete(PAGE_LOCALE_HEADER);
  } else {
    headers.set(PAGE_LOCALE_HEADER, locale);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // The public pages and every address under /fr: no other page needs the proxy. A literal, which Next reads when it
  // builds (proxy.test.ts checks it covers every public page).
  matcher: ["/", "/challenge", "/privacy", "/fr", "/fr/:path*"],
};
