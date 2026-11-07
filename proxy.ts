import { NextResponse, type NextRequest } from "next/server";
import { USER_COOKIE } from "@/src/auth/identity";
import { LOCALE_COOKIE } from "@/src/i18n/locale";
import { PAGE_LOCALE_HEADER, pageLocaleOf, publicPath } from "@/src/i18n/public-pages";
import {
  ARRIVAL_COOKIE,
  ARRIVAL_COOKIE_MAX_AGE_SECONDS,
  ARRIVAL_HEADER,
  arrivalOf,
  encodeArrival,
  isCrawler,
  isPageNavigation,
  VISIT_ID_HEADER,
  type Arrival,
} from "@/src/lib/arrival";

/** Auth.js's session cookie, its name on https (__Secure-) and in development, in one piece or in chunks (.0, .1…). */
const SESSION_COOKIE = /^(__Secure-)?authjs\.session-token(\.\d+)?$/;

/**
 * A visitor's first visit, its arrival (src/lib/arrival.ts): the browser opening a public page, not a crawler's, without
 * the cookie of an arrival already kept, and from a visitor who is not a player yet (no lw_uid, no Google session).
 */
function firstVisitOf(request: NextRequest): Arrival | null {
  const header = (name: string) => request.headers.get(name);
  const cookies = request.cookies.getAll().map(({ name }) => name);
  if (
    !isPageNavigation(request.method, header) ||
    isCrawler(header("user-agent")) ||
    cookies.some((name) => name === ARRIVAL_COOKIE || name === USER_COOKIE || SESSION_COOKIE.test(name))
  ) {
    return null;
  }
  const { pathname, searchParams, hostname } = request.nextUrl;
  return arrivalOf({
    pathname,
    ref: searchParams.get("ref"),
    utmSource: searchParams.get("utm_source"),
    referer: header("referer"),
    ownHost: hostname,
  });
}

/**
 * The language of a public page's address (src/i18n/public-pages.ts): PAGE_LOCALE_HEADER on the request, which
 * src/i18n/request.ts reads before the player's language; a forged one is removed here, and elsewhere could only choose
 * a page's language, as the language switcher does. A visitor who chose French (lw_lang,
 * the language switcher) and opens the English home page goes to the French one, for now (302: their choice may change);
 * never one without the cookie, a crawler included: no address follows the browser's language. A visitor's first visit
 * keeps its arrival in the lw_src cookie, 30 days, and ARRIVAL_HEADER tells the page to count it, with the visit's id
 * (CountArrival); forged ones are removed. Runs on the Node.js runtime (the default for proxy.ts since Next 16), without
 * the database.
 */
export default function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  // A page asked for, never a Server Action posted to it, which a redirect would lose.
  const navigation = request.method === "GET" || request.method === "HEAD";
  if (pathname === publicPath("home", "en") && navigation && request.cookies.get(LOCALE_COOKIE)?.value === "fr") {
    const french = request.nextUrl.clone();
    french.pathname = publicPath("home", "fr");
    // The query goes along: the French page keeps the arrival's ?ref=.
    return NextResponse.redirect(french, 302);
  }
  const headers = new Headers(request.headers);
  const locale = pageLocaleOf(pathname);
  if (locale === null) {
    headers.delete(PAGE_LOCALE_HEADER);
  } else {
    headers.set(PAGE_LOCALE_HEADER, locale);
  }
  headers.delete(ARRIVAL_HEADER);
  headers.delete(VISIT_ID_HEADER);
  const arrival = firstVisitOf(request);
  if (arrival !== null) {
    headers.set(ARRIVAL_HEADER, encodeArrival(arrival));
    headers.set(VISIT_ID_HEADER, crypto.randomUUID());
  }
  const response = NextResponse.next({ request: { headers } });
  if (arrival !== null) {
    response.cookies.set(ARRIVAL_COOKIE, encodeArrival(arrival), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ARRIVAL_COOKIE_MAX_AGE_SECONDS,
    });
  }
  return response;
}

export const config = {
  // The public pages and every address under /fr: no other page needs the proxy. A literal, which Next reads when it
  // builds (proxy.test.ts checks it covers every public page).
  matcher: ["/", "/how-to-play", "/challenge", "/changelog", "/about", "/privacy", "/fr", "/fr/:path*"],
};
