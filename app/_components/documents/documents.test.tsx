import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { realClubNames } from "@/prisma/seed/real-club-names";
import { CONTACT_EMAIL } from "@/src/config/contact";
import { LOCALES } from "@/src/i18n/locale";
import { forbiddenNamesIn } from "@/src/lib/outward-names";
import { CHANGELOG } from "../../_content/changelog";
import { GUIDE } from "../../_content/how-to-play";
import { AboutDocument } from "./about-document";
import { ChangelogDocument, releasesOf } from "./changelog-document";
import { HowToPlayDocument } from "./how-to-play-document";

/** What a reader reads of a markup: its text, tags dropped, entities as they read. */
const textOf = (markup: string): string =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");

const DOCUMENTS = {
  guide: HowToPlayDocument,
  changelog: ChangelogDocument,
  about: AboutDocument,
};

describe("the public pages' documents", () => {
  const clubs = realClubNames();

  for (const [name, Document] of Object.entries(DOCUMENTS)) {
    for (const locale of LOCALES) {
      it(`gives the ${name} in ${locale}, in a document marked as such, naming no real club, brand or licensed competition`, () => {
        const markup = renderToStaticMarkup(<Document locale={locale} />);
        expect(markup).toMatch(new RegExp(`^<article lang="${locale}"`));
        expect(markup.match(/<h1/g)).toHaveLength(1);
        expect(forbiddenNamesIn(textOf(markup), clubs)).toEqual([]);
      });
    }
  }
});

describe("the guide", () => {
  it("has its seven sections in both languages, each an anchor of its table of contents, and the way to the game", () => {
    for (const locale of LOCALES) {
      const markup = renderToStaticMarkup(<HowToPlayDocument locale={locale} />);
      expect(GUIDE.map(({ id }) => id)).toEqual(["create", "first-match", "market", "lineup", "events", "objectives", "challenge"]);
      for (const { id } of GUIDE) {
        expect(markup).toContain(`<section id="${id}"`);
        expect(markup).toContain(`href="#${id}"`);
      }
      const start = /<a[^>]*data-testid="how-to-play-start"[^>]*>/.exec(markup)?.[0] ?? "";
      expect(start).toContain(`href="${locale === "fr" ? "/fr" : "/"}"`);
    }
  });

  it("shows the game's labels in bold, never the marks around them", () => {
    const markup = renderToStaticMarkup(<HowToPlayDocument locale="fr" />);
    expect(markup).toContain("<strong>Lancer ma carrière</strong>");
    expect(markup).not.toContain("**");
  });
});

describe("the changelog", () => {
  it("dates each entry by the day it went live, newest first, from the opening on 9 October 2026", () => {
    const days = CHANGELOG.map(({ date }) => date);
    expect([...days].sort().reverse()).toEqual(days);
    expect([...new Set(days)]).toEqual([
      "2026-11-09",
      "2026-11-07",
      "2026-11-06",
      "2026-11-02",
      "2026-10-24",
      "2026-10-23",
      "2026-10-22",
      "2026-10-09",
    ]);
    for (const entry of CHANGELOG) {
      expect(entry.fr.items).toHaveLength(entry.en.items.length);
    }
  });

  it("gathers a day's entries under it, each day an anchor numbered from the opening", () => {
    const releases = releasesOf(CHANGELOG);
    expect(releases.map(({ date }) => date)).toEqual([...new Set(CHANGELOG.map(({ date }) => date))]);
    expect(releases.find(({ date }) => date === "2026-11-02")?.entries.map(({ fr }) => fr.title)).toEqual([
      "Le défi de la semaine",
      "Le jeu en anglais",
      "Premiers pas guidés",
      "Un nouveau design, pensé pour le téléphone",
    ]);

    const french = renderToStaticMarkup(<ChangelogDocument locale="fr" />);
    expect(french).toContain("depuis son ouverture, le 9 octobre 2026");
    expect(french).toContain('<time dateTime="2026-10-09">9 octobre 2026</time>');
    expect(french.match(/<h2 /g)).toHaveLength(releases.length);
    expect(french).toContain(`id="version-${releases.length}"`);
    expect(french).toContain('id="version-1"');
    const english = renderToStaticMarkup(<ChangelogDocument locale="en" />);
    expect(english).toContain("since it opened on 9 October 2026");
    expect(english).toContain("The game introduces itself, in two languages");
  });
});

describe("the about page", () => {
  it("says who makes the game without a surname nor a school, and how to reach them", () => {
    for (const locale of LOCALES) {
      const markup = renderToStaticMarkup(<AboutDocument locale={locale} />);
      expect(markup).toContain(`href="mailto:${CONTACT_EMAIL}"`);
      expect(markup).not.toMatch(/Da Cruz|Alexis/);
      expect(markup).toContain(locale === "fr" ? 'href="/fr/confidentialite"' : 'href="/privacy"');
    }
  });
});
