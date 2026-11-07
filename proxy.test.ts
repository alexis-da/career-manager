import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/src/i18n/locale";
import { PAGE_LOCALE_HEADER, PUBLIC_PAGE_NAMES, publicPath } from "@/src/i18n/public-pages";
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
