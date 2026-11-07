import { describe, expect, it } from "vitest";
import { LOCALES } from "./locale";
import {
  absoluteUrl,
  languageAlternates,
  pageLocaleOf,
  PUBLIC_PAGE_NAMES,
  PUBLIC_PAGES,
  publicPageOf,
  publicPath,
} from "./public-pages";

describe("the public pages' addresses", () => {
  it("are English at the root and French under /fr, each its own", () => {
    const addresses = PUBLIC_PAGE_NAMES.flatMap((page) => LOCALES.map((locale) => publicPath(page, locale)));
    expect(new Set(addresses).size).toBe(addresses.length);
    for (const page of PUBLIC_PAGE_NAMES) {
      expect(publicPath(page, "en").startsWith("/fr")).toBe(false);
      expect(publicPath(page, "fr") === "/fr" || publicPath(page, "fr").startsWith("/fr/")).toBe(true);
    }
  });

  it("keep the addresses the old links lead to, the home page's, the challenge's and the privacy page's", () => {
    expect(PUBLIC_PAGES.home).toEqual({ en: "/", fr: "/fr" });
    expect(PUBLIC_PAGES.challenge).toEqual({ en: "/challenge", fr: "/fr/defi" });
    expect(PUBLIC_PAGES.privacy).toEqual({ en: "/privacy", fr: "/fr/confidentialite" });
  });

  it("give the guide, the changelog and the about page an address in each language, French in French words", () => {
    expect(PUBLIC_PAGES.howToPlay).toEqual({ en: "/how-to-play", fr: "/fr/comment-jouer" });
    expect(PUBLIC_PAGES.changelog).toEqual({ en: "/changelog", fr: "/fr/nouveautes" });
    expect(PUBLIC_PAGES.about).toEqual({ en: "/about", fr: "/fr/a-propos" });
  });

  it("are read back to their page and language, and nothing else is one", () => {
    for (const page of PUBLIC_PAGE_NAMES) {
      for (const locale of LOCALES) {
        expect(publicPageOf(publicPath(page, locale))).toEqual({ page, locale });
      }
    }
    for (const other of ["/saves/abc", "/admin/stats", "/fr/", "/privacy/", "/Privacy", "/fr/defi/x", "/login"]) {
      expect(publicPageOf(other)).toBeNull();
    }
  });
});

describe("pageLocaleOf", () => {
  it("gives a public page its address's language, and French to anything under /fr", () => {
    expect(pageLocaleOf("/")).toBe("en");
    expect(pageLocaleOf("/challenge")).toBe("en");
    expect(pageLocaleOf("/fr")).toBe("fr");
    expect(pageLocaleOf("/fr/confidentialite")).toBe("fr");
    expect(pageLocaleOf("/fr/no-such-page")).toBe("fr");
  });

  it("leaves any other address to the player's language", () => {
    for (const other of ["/saves/abc", "/saves/abc/fr", "/admin/stats", "/no-such-page", "/france", "/frx"]) {
      expect(pageLocaleOf(other)).toBeNull();
    }
  });
});

describe("absolute addresses", () => {
  it("are on the canonical host, in https", () => {
    expect(absoluteUrl("/")).toBe("https://www.latewinner.app/");
    expect(absoluteUrl("/fr/defi")).toBe("https://www.latewinner.app/fr/defi");
  });

  it("give every page its address in each language, and English as x-default", () => {
    expect(languageAlternates("home")).toEqual({
      en: "https://www.latewinner.app/",
      fr: "https://www.latewinner.app/fr",
      "x-default": "https://www.latewinner.app/",
    });
    expect(languageAlternates("privacy")).toEqual({
      en: "https://www.latewinner.app/privacy",
      fr: "https://www.latewinner.app/fr/confidentialite",
      "x-default": "https://www.latewinner.app/privacy",
    });
  });
});
