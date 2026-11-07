import { describe, expect, it } from "vitest";
import {
  acquisitionOf,
  arrivalOf,
  campaignSource,
  deviceOf,
  encodeArrival,
  isCrawler,
  isPageNavigation,
  readArrival,
  referrerDomainOf,
  type Visit,
} from "./arrival";

const CHROME_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const ANDROID_PHONE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const OLD_IPAD =
  "Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1";

const visit = (overrides: Partial<Visit> = {}): Visit => ({
  pathname: "/",
  ref: null,
  utmSource: null,
  referer: null,
  ownHost: "www.latewinner.app",
  ...overrides,
});

describe("a visit's source", () => {
  it("is the link's ref first, its utm_source next, cleaned: lower case, a dash for anything else, 40 characters", () => {
    expect(arrivalOf(visit({ ref: "reddit-playmygame", utmSource: "newsletter" }))?.source).toBe("reddit-playmygame");
    expect(arrivalOf(visit({ utmSource: "Newsletter" }))?.source).toBe("newsletter");
    expect(campaignSource("Reddit Jeux Vidéo!")).toBe("reddit-jeux-vid-o");
    expect(campaignSource(`${"x".repeat(39)} y`)).toBe("x".repeat(39));
    expect(campaignSource("<script>")).toBe("script");
    expect(campaignSource("???")).toBeNull();
    expect(campaignSource("")).toBeNull();
  });

  it("is the referring site's domain without a campaign, never its address, « www. » left out", () => {
    const arrival = arrivalOf(visit({ referer: "https://www.reddit.com/r/WebGames/comments/abc/late_winner/?share=1" }));
    expect(arrival).toEqual({ source: "reddit.com", referrerDomain: "reddit.com", landingPage: "/" });
    expect(arrivalOf(visit({ ref: "reddit-webgames", referer: "https://old.reddit.com/r/x" }))).toEqual({
      source: "reddit-webgames",
      referrerDomain: "old.reddit.com",
      landingPage: "/",
    });
    expect(referrerDomainOf("android-app://com.reddit.frontpage/", "www.latewinner.app")).toBe("com.reddit.frontpage");
  });

  it("is « direct » without either: no referrer, one that is not an address, or the game's own pages", () => {
    expect(arrivalOf(visit())?.source).toBe("direct");
    expect(arrivalOf(visit({ referer: "not an address" }))?.source).toBe("direct");
    expect(arrivalOf(visit({ referer: "https://latewinner.app/fr" }))?.source).toBe("direct");
    expect(arrivalOf(visit({ referer: "http://localhost:3100/", ownHost: "localhost" }))?.source).toBe("direct");
  });

  it("is only a public page's: never a save's, the API's or a missing page", () => {
    expect(arrivalOf(visit({ pathname: "/fr/defi" }))?.landingPage).toBe("/fr/defi");
    for (const pathname of ["/saves/abc", "/admin/stats", "/fr/no-such-page", "/api/auth/session"]) {
      expect(arrivalOf(visit({ pathname }))).toBeNull();
    }
  });
});

describe("the arrival cookie", () => {
  it("reads back what it holds", () => {
    for (const arrival of [
      { source: "reddit-playmygame", referrerDomain: "reddit.com", landingPage: "/fr" },
      { source: "direct", referrerDomain: null, landingPage: "/challenge" },
    ]) {
      expect(readArrival(encodeArrival(arrival))).toEqual(arrival);
    }
  });

  it("refuses anything else: anyone can write a cookie", () => {
    for (const value of [
      undefined,
      null,
      "",
      "garbage",
      "s=direct&r=&p=/saves/abc",
      "s=DIRECT&r=&p=/",
      "s=direct&r=https://x.com/a&p=/",
      `s=${"x".repeat(101)}&r=&p=/`,
      "s=&r=&p=/",
    ]) {
      expect(readArrival(value)).toBeNull();
    }
  });
});

describe("what a user's creation keeps of their arrival", () => {
  it("is the cookie's, the player's language and their device; nothing of an arrival without the cookie", () => {
    const cookie = encodeArrival({ source: "reddit-jeuxvideo", referrerDomain: null, landingPage: "/fr" });
    expect(acquisitionOf({ arrivalCookie: cookie, locale: "fr", userAgent: IPHONE, mobileHint: null })).toEqual({
      source: "reddit-jeuxvideo",
      referrerDomain: null,
      landingPage: "/fr",
      locale: "fr",
      device: "PHONE",
    });
    expect(acquisitionOf({ arrivalCookie: undefined, locale: "en", userAgent: CHROME_DESKTOP, mobileHint: "?0" })).toEqual({
      source: null,
      referrerDomain: null,
      landingPage: null,
      locale: "en",
      device: "COMPUTER",
    });
  });
});

describe("crawlers", () => {
  it("are the crawlers, link previews and scripts, and a request without a user agent", () => {
    for (const agent of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Mozilla/5.0 (compatible; redditbot/1.0; +http://www.reddit.com/feedback)",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      "WhatsApp/2.23.20.0",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/142.0.0.0 Safari/537.36",
      "curl/8.4.0",
      "python-requests/2.31.0",
      "",
    ]) {
      expect(isCrawler(agent), agent).toBe(true);
    }
    expect(isCrawler(null)).toBe(true);
  });

  it("are never a browser's, a phone's included", () => {
    for (const agent of [CHROME_DESKTOP, IPHONE, ANDROID_PHONE, ANDROID_TABLET, OLD_IPAD]) {
      expect(isCrawler(agent), agent).toBe(false);
    }
  });
});

describe("the device", () => {
  it("is the browser's hint first, the user agent otherwise: phones, then computers and tablets", () => {
    expect(deviceOf(CHROME_DESKTOP, "?1")).toBe("PHONE");
    expect(deviceOf(ANDROID_PHONE, "?0")).toBe("COMPUTER");
    expect(deviceOf(IPHONE, null)).toBe("PHONE");
    expect(deviceOf(ANDROID_PHONE, null)).toBe("PHONE");
    expect(deviceOf(CHROME_DESKTOP, null)).toBe("COMPUTER");
    expect(deviceOf(ANDROID_TABLET, null)).toBe("COMPUTER");
    expect(deviceOf(OLD_IPAD, null)).toBe("COMPUTER");
    expect(deviceOf(null, null)).toBeNull();
  });
});

describe("a page's opening", () => {
  const headersOf = (values: Record<string, string>) => (name: string) => values[name] ?? null;

  it("is a GET navigating to a document", () => {
    expect(isPageNavigation("GET", headersOf({ "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }))).toBe(true);
    // Without the Sec-Fetch headers: an old browser, by what it accepts.
    expect(isPageNavigation("GET", headersOf({ accept: "text/html,application/xhtml+xml" }))).toBe(true);
  });

  it("is never a router's fetch, a prefetch, a frame, a form posted, nor a request asking for something else", () => {
    expect(isPageNavigation("GET", headersOf({ "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" }))).toBe(false);
    expect(isPageNavigation("GET", headersOf({ "sec-fetch-mode": "navigate", "sec-purpose": "prefetch;prerender" }))).toBe(false);
    expect(isPageNavigation("GET", headersOf({ purpose: "prefetch", accept: "text/html" }))).toBe(false);
    expect(isPageNavigation("GET", headersOf({ "sec-fetch-mode": "navigate", "sec-fetch-dest": "iframe" }))).toBe(false);
    expect(isPageNavigation("POST", headersOf({ "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }))).toBe(false);
    expect(isPageNavigation("HEAD", headersOf({ accept: "text/html" }))).toBe(false);
    expect(isPageNavigation("GET", headersOf({ accept: "*/*" }))).toBe(false);
  });
});
