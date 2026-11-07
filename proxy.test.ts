import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/src/i18n/locale";
import { PAGE_LOCALE_HEADER, PUBLIC_PAGE_NAMES, publicPath } from "@/src/i18n/public-pages";
import { ARRIVAL_COOKIE, ARRIVAL_HEADER, readArrival, VISIT_ID_HEADER } from "@/src/lib/arrival";
import proxy, { config } from "./proxy";

const SITE = "http://localhost:3000";

type RequestOptions = { method?: string; cookie?: string; headers?: Record<string, string> };

function request(path: string, { method = "GET", cookie, headers = {} }: RequestOptions = {}): NextRequest {
  return new NextRequest(new URL(path, SITE), {
    method,
    headers: { ...headers, ...(cookie === undefined ? {} : { cookie }) },
  });
}

/** The header the page is rendered with: what NextResponse.next passes on (x-middleware-override-headers). */
function forwardedLocale(response: Response): string | null {
  return response.headers.get(`x-middleware-request-${PAGE_LOCALE_HEADER}`);
}

describe("proxy", () => {
  it("sends a visitor who chose French from the English home page to the French one, the query kept", () => {
    const response = proxy(request("/?error=AccessDenied", { cookie: "lw_lang=fr" }));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${SITE}/fr?error=AccessDenied`);
  });

  it("redirects nobody else: no cookie, an English one, a French browser, a Server Action's POST", () => {
    for (const response of [
      proxy(request("/")),
      proxy(request("/", { cookie: "lw_lang=en" })),
      proxy(request("/", { headers: { "accept-language": "fr-FR,fr;q=0.9" } })),
      proxy(request("/", { method: "POST", cookie: "lw_lang=fr" })),
      proxy(request("/challenge", { cookie: "lw_lang=fr" })),
    ]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("renders each public page in its address's language", () => {
    expect(forwardedLocale(proxy(request("/")))).toBe("en");
    expect(forwardedLocale(proxy(request("/fr")))).toBe("fr");
    expect(forwardedLocale(proxy(request("/fr/defi", { cookie: "lw_lang=en" })))).toBe("fr");
    expect(forwardedLocale(proxy(request("/privacy", { headers: { "accept-language": "fr-FR" } })))).toBe("en");
    expect(forwardedLocale(proxy(request("/fr/no-such-page")))).toBe("fr");
  });

  it("removes a forged header from any other address", () => {
    const response = proxy(request("/france", { headers: { [PAGE_LOCALE_HEADER]: "fr" } }));
    expect(response.headers.get("x-middleware-override-headers")?.split(",")).not.toContain(PAGE_LOCALE_HEADER);
    expect(forwardedLocale(response)).toBeNull();
  });
});

describe("a visitor's arrival", () => {
  const BROWSER = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "sec-fetch-mode": "navigate",
    "sec-fetch-dest": "document",
  };
  const firstVisit = (path: string, headers: Record<string, string> = {}, cookie?: string) =>
    proxy(request(path, { headers: { ...BROWSER, ...headers }, cookie }));
  /** The arrival the page is told to count, as the proxy forwards it, read back. */
  const forwardedArrival = (response: Response) => readArrival(response.headers.get(`x-middleware-request-${ARRIVAL_HEADER}`));
  const forwardedVisitId = (response: Response) => response.headers.get(`x-middleware-request-${VISIT_ID_HEADER}`);
  /** The lw_src cookie the response sets: its value read back, and its attributes. */
  const arrivalCookie = (response: Response) => {
    const line = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${ARRIVAL_COOKIE}=`));
    return line === undefined ? null : { arrival: readArrival(decodeURIComponent(line.split(";")[0].split("=").slice(1).join("="))), line };
  };

  it("keeps a first visit's source, referring domain and page in lw_src for 30 days, and tells the page to count it", () => {
    const response = firstVisit("/fr?ref=reddit-jeuxvideo", { referer: "https://www.reddit.com/r/jeuxvideo/comments/x" });
    const expected = { source: "reddit-jeuxvideo", referrerDomain: "reddit.com", landingPage: "/fr" };

    expect(forwardedArrival(response)).toEqual(expected);
    // Its own id, a new one each time: the page counts it once, however many times it renders for it.
    expect(forwardedVisitId(response)).toMatch(/^[0-9a-f-]{36}$/);
    expect(forwardedVisitId(firstVisit("/fr"))).not.toBe(forwardedVisitId(response));
    const cookie = arrivalCookie(response);
    expect(cookie?.arrival).toEqual(expected);
    expect(cookie?.line).toMatch(/Max-Age=2592000/);
    expect(cookie?.line).toMatch(/HttpOnly/);
    expect(cookie?.line).toMatch(/SameSite=lax/i);
    expect(cookie?.line).toMatch(/Path=\//);
  });

  it("counts nothing and keeps nothing for a crawler, a router's fetch, a prefetch, a Server Action, a save's page or a missing one", () => {
    for (const response of [
      firstVisit("/", { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }),
      firstVisit("/", { "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" }),
      firstVisit("/", { "sec-purpose": "prefetch" }),
      proxy(request("/", { method: "POST", headers: BROWSER })),
      firstVisit("/fr/no-such-page"),
    ]) {
      expect(forwardedArrival(response)).toBeNull();
      expect(arrivalCookie(response)).toBeNull();
    }
  });

  it("counts a visitor once: not with an arrival already kept, nor once a player (lw_uid, a Google session)", () => {
    for (const cookie of [
      `${ARRIVAL_COOKIE}=s%3Ddirect%26r%3D%26p%3D%252F`,
      "lw_uid=user.signature",
      "authjs.session-token=jwt",
      "__Secure-authjs.session-token.0=jwt",
    ]) {
      const response = firstVisit("/?ref=reddit-webgames", {}, cookie);
      expect(forwardedArrival(response), cookie).toBeNull();
      expect(arrivalCookie(response), cookie).toBeNull();
    }
  });

  it("removes a forged arrival header, and leaves the French home page's redirect its ?ref=", () => {
    const forged = proxy(
      request("/challenge", { headers: { [ARRIVAL_HEADER]: "s=forged&r=&p=/", [VISIT_ID_HEADER]: "forged" }, cookie: "lw_uid=x.y" }),
    );
    expect(forwardedArrival(forged)).toBeNull();
    expect(forwardedVisitId(forged)).toBeNull();

    const redirect = proxy(request("/?ref=reddit-sideproject", { headers: BROWSER, cookie: "lw_lang=fr" }));
    expect(redirect.headers.get("location")).toBe(`${SITE}/fr?ref=reddit-sideproject`);
    expect(arrivalCookie(redirect)).toBeNull();
  });
});

describe("the proxy's matcher", () => {
  /** Whether one of the matcher's paths takes this address: a path itself, or « …/:path* » for what is under it. */
  const matched = (address: string) =>
    config.matcher.some((path) =>
      path.endsWith("/:path*") ? address.startsWith(`${path.slice(0, -"/:path*".length)}/`) : path === address,
    );

  it("takes every public page, in both languages", () => {
    for (const page of PUBLIC_PAGE_NAMES) {
      for (const locale of LOCALES) {
        expect(matched(publicPath(page, locale)), publicPath(page, locale)).toBe(true);
      }
    }
  });

  it("leaves a save's pages, the API and the admin page alone", () => {
    for (const other of ["/saves/abc", "/saves/abc/lineup", "/api/auth/session", "/admin/stats", "/opengraph-image"]) {
      expect(matched(other), other).toBe(false);
    }
  });
});
