import * as z from "zod";
import type { Locale } from "../i18n/locale";
import { publicPageOf } from "../i18n/public-pages";

// Where the players come from, without a third-party cookie nor an outside tool. At a visitor's first visit of a public
// page, proxy.ts keeps in a first-party cookie, lw_src, for 30 days, the source of the visit, the referring site's domain
// and the page of arrival; the page counts the visit, by day, source and page (VisitDay, src/db/visits.ts); the user the
// game creates for them later gets them, with their language and their device (src/auth/acquisition.ts). Pure: the
// request's values are passed in.

export const ARRIVAL_COOKIE = "lw_src";
export const ARRIVAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** The request header proxy.ts sets on a first visit, for the page to count it; a forged one is removed. */
export const ARRIVAL_HEADER = "x-lw-arrival";

/** With it, the visit's own id, random: what counts it once however many times the page renders for it. */
export const VISIT_ID_HEADER = "x-lw-visit";

/** The source of a visit without a campaign nor a referring site. */
export const DIRECT_SOURCE = "direct";

const MAX_CAMPAIGN_LENGTH = 40;
const MAX_DOMAIN_LENGTH = 100;

export type Arrival = {
  source: string; // ref, else utm_source, else the referring site's domain, else « direct »
  referrerDomain: string | null; // the referring site's domain, never its address; null without one
  landingPage: string; // the public page's address: « / », « /fr/defi »
};

/** A phone or a computer: a tablet counts as a computer. */
export type DeviceKind = "PHONE" | "COMPUTER";

/**
 * A campaign's name from a link (?ref=, ?utm_source=): lower case, letters, digits, dots, dashes and underscores, anything
 * else a dash, 40 characters at most; null when nothing is left. Anyone can write one: it never holds more.
 */
export function campaignSource(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const source = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .slice(0, MAX_CAMPAIGN_LENGTH)
    .replace(/^-+|-+$/g, "");
  return source === "" ? null : source;
}

/** A host without its « www. », in lower case. */
const bareHost = (host: string): string => host.toLowerCase().replace(/^www\./, "");

/**
 * The domain of the site a visit comes from (its Referer header), never its address: « reddit.com » of
 * « https://www.reddit.com/r/… ». Null without one, for one that is not a domain, and for the game's own pages.
 */
export function referrerDomainOf(referer: string | null, ownHost: string): string | null {
  if (referer === null || referer === "") {
    return null;
  }
  let host: string;
  try {
    host = new URL(referer).hostname;
  } catch {
    return null;
  }
  const domain = bareHost(host);
  if (domain === "" || domain.length > MAX_DOMAIN_LENGTH || !/^[a-z0-9.-]+$/.test(domain) || domain === bareHost(ownHost)) {
    return null;
  }
  return domain;
}

/** A visit of a page: its address, its link's campaign, where it comes from, and the game's own host. */
export type Visit = { pathname: string; ref: string | null; utmSource: string | null; referer: string | null; ownHost: string };

/**
 * What a visit tells of its arrival: its source, ref first, utm_source next, the referring site's domain next, « direct »
 * last; that domain; its page. Null for an address that is not a public page.
 */
export function arrivalOf(visit: Visit): Arrival | null {
  if (publicPageOf(visit.pathname) === null) {
    return null;
  }
  const referrerDomain = referrerDomainOf(visit.referer, visit.ownHost);
  return {
    source: campaignSource(visit.ref) ?? campaignSource(visit.utmSource) ?? referrerDomain ?? DIRECT_SOURCE,
    referrerDomain,
    landingPage: visit.pathname,
  };
}

/** An arrival as the cookie and the header hold it: « s=…&r=…&p=… ». */
export function encodeArrival({ source, referrerDomain, landingPage }: Arrival): string {
  return new URLSearchParams({ s: source, r: referrerDomain ?? "", p: landingPage }).toString();
}

const arrivalSchema = z.object({
  s: z.string().regex(/^[a-z0-9._-]{1,100}$/),
  r: z.union([z.literal(""), z.string().regex(/^[a-z0-9.-]{1,100}$/)]),
  p: z.string().refine((path) => publicPageOf(path) !== null),
});

/** The arrival a cookie or a header holds, checked: anyone can write either. Null when absent or not one. */
export function readArrival(value: string | null | undefined): Arrival | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = arrivalSchema.safeParse(Object.fromEntries(new URLSearchParams(value)));
  if (!parsed.success) {
    return null;
  }
  const { s, r, p } = parsed.data;
  return { source: s, referrerDomain: r === "" ? null : r, landingPage: p };
}

/**
 * Whether a request comes from a crawler, a link preview or a script, by its user agent: none is a visit. Without a user
 * agent too. Broad on purpose: a visitor lost here is not counted, never more.
 */
const CRAWLER_AGENT =
  /bot|crawl|spider|slurp|scrap|preview|externalhit|embedly|whatsapp|headless|phantom|lighthouse|pagespeed|gtmetrix|curl|wget|python|java\/|go-http|okhttp|axios|node-fetch|undici|httpclient|libwww|uptime|monitor|validator/i;

export function isCrawler(userAgent: string | null): boolean {
  return userAgent === null || userAgent.trim() === "" || CRAWLER_AGENT.test(userAgent);
}

/**
 * Phone or computer, from the browser: its own hint first (Sec-CH-UA-Mobile, Chromium's), its user agent otherwise; null
 * without either. A tablet is a computer here. Nothing of the browser itself is kept.
 */
export function deviceOf(userAgent: string | null, mobileHint: string | null): DeviceKind | null {
  if (mobileHint === "?1") {
    return "PHONE";
  }
  if (mobileHint === "?0") {
    return "COMPUTER";
  }
  if (userAgent === null || userAgent.trim() === "") {
    return null;
  }
  if (/iPad|Tablet/i.test(userAgent)) {
    return "COMPUTER";
  }
  return /Mobi|iPhone|iPod|Windows Phone/i.test(userAgent) ? "PHONE" : "COMPUTER";
}

/** What the creation of a user keeps of their arrival (User.source…): the cookie's, their language, their device. */
export type Acquisition = {
  source: string | null; // null without the cookie: an arrival not seen
  referrerDomain: string | null;
  landingPage: string | null;
  locale: Locale;
  device: DeviceKind | null;
};

/** The acquisition of a user created by a request: its arrival cookie (lw_src), the player's language, the browser's kind. */
export function acquisitionOf(request: {
  arrivalCookie: string | undefined;
  locale: Locale;
  userAgent: string | null;
  mobileHint: string | null;
}): Acquisition {
  const arrival = readArrival(request.arrivalCookie);
  return {
    source: arrival?.source ?? null,
    referrerDomain: arrival?.referrerDomain ?? null,
    landingPage: arrival?.landingPage ?? null,
    locale: request.locale,
    device: deviceOf(request.userAgent, request.mobileHint),
  };
}

/**
 * Whether a request is the browser opening a page: a GET navigating to a document, never a prefetch (the browser's or the
 * router's), a router's fetch of a page's content (Sec-Fetch-Mode « cors »), a frame, nor a form posted. Without the
 * Sec-Fetch headers, an old browser's: what it accepts first.
 */
export function isPageNavigation(method: string, header: (name: string) => string | null): boolean {
  if (method !== "GET") {
    return false;
  }
  if (`${header("sec-purpose") ?? ""} ${header("purpose") ?? ""}`.includes("prefetch")) {
    return false;
  }
  const mode = header("sec-fetch-mode");
  if (mode !== null) {
    return mode === "navigate" && (header("sec-fetch-dest") ?? "document") === "document";
  }
  return (header("accept") ?? "").includes("text/html");
}
