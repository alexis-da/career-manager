import { expect, test, type Page } from "@playwright/test";
import { deleteUsers, realClubNames, userIdOf } from "./db";
import { fillCreateSaveForm, saveRow } from "./helpers";

// What crawlers and visitors find of the public pages: an address per language, its metadata, robots.txt, the sitemap,
// llms.txt, the home page's structured data, the line that offers the other language, and every page read without
// JavaScript. The addresses are written out here, not read from the code: this checks the code.

const SITE = "https://www.latewinner.app";

type Language = "en" | "fr";

/** Each public page at its address in each language, and what its h1 says there. */
const PAGES: { en: string; fr: string; h1: Record<Language, RegExp> }[] = [
  { en: "/", fr: "/fr", h1: { en: /^Free football career game in your browser$/, fr: /^Jeu de carrière de football gratuit, dans ton navigateur$/ } },
  { en: "/how-to-play", fr: "/fr/comment-jouer", h1: { en: /^How to play$/, fr: /^Comment jouer$/ } },
  { en: "/challenge", fr: "/fr/defi", h1: { en: /^Weekly challenge$/, fr: /^Défi de la semaine$/ } },
  { en: "/changelog", fr: "/fr/nouveautes", h1: { en: /^What's new$/, fr: /^Nouveautés$/ } },
  { en: "/about", fr: "/fr/a-propos", h1: { en: /^About Late Winner$/, fr: /^À propos de Late Winner$/ } },
  { en: "/privacy", fr: "/fr/confidentialite", h1: { en: /^Privacy · Late Winner$/, fr: /^Confidentialité · Late Winner$/ } },
];

const LANGUAGES: Language[] = ["en", "fr"];

/** An absolute address of the site, as canonical, hreflang and the sitemap give it (the root without its slash). */
const absolute = (path: string) => (path === "/" ? SITE : `${SITE}${path}`);

const attribute = (page: Page, selector: string, name: string) => page.locator(selector).getAttribute(name);

for (const language of LANGUAGES) {
  test.describe(`the public pages in ${language}`, () => {
    // A browser of the page's own language: no line offers it another.
    test.use({ locale: language === "fr" ? "fr-FR" : "en-GB" });

    for (const addresses of PAGES) {
      const path = addresses[language];
      test(`${path} has its language, its title and description, its canonical address and both its languages`, async ({ page }) => {
        const response = await page.goto(path);
        expect(response?.status()).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(addresses.h1[language]);
        await expect(page).toHaveTitle(/Late Winner/);
        expect((await attribute(page, 'meta[name="description"]', "content"))?.length ?? 0).toBeGreaterThan(60);

        expect(await attribute(page, 'link[rel="canonical"]', "href")).toBe(absolute(path));
        expect(await attribute(page, 'link[rel="alternate"][hreflang="en"]', "href")).toBe(absolute(addresses.en));
        expect(await attribute(page, 'link[rel="alternate"][hreflang="fr"]', "href")).toBe(absolute(addresses.fr));
        expect(await attribute(page, 'link[rel="alternate"][hreflang="x-default"]', "href")).toBe(absolute(addresses.en));
        expect(await attribute(page, 'meta[property="og:url"]', "content")).toBe(absolute(path));
        expect(await attribute(page, 'meta[property="og:image"]', "content")).toBe(`${SITE}/opengraph-image`);
        await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
        await expect(page.getByTestId("language-banner")).toHaveCount(0);
      });
    }
  });
}

test("serves robots.txt: everything but a save's pages, the API and the admin page, the AI crawlers let in, the sitemap", async ({
  request,
}) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const text = await response.text();
  for (const line of ["User-Agent: *", "Allow: /", "Disallow: /saves/", "Disallow: /api/", "Disallow: /admin"]) {
    expect(text).toContain(line);
  }
  for (const crawler of ["OAI-SearchBot", "PerplexityBot", "Claude-SearchBot", "Claude-User", "GPTBot", "ClaudeBot", "Google-Extended"]) {
    expect(text).toContain(`User-Agent: ${crawler}`);
  }
  expect(text).toContain(`Sitemap: ${SITE}/sitemap.xml`);
});

test("serves the sitemap: every public page in each language, each with all its languages", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const xml = await response.text();
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, url]) => url);
  expect(urls).toHaveLength(PAGES.length * LANGUAGES.length);
  for (const addresses of PAGES) {
    for (const language of LANGUAGES) {
      const loc = addresses[language] === "/" ? `${SITE}/` : `${SITE}${addresses[language]}`;
      const entry = urls.find((url) => url.includes(`<loc>${loc}</loc>`));
      expect(entry, loc).toBeDefined();
      for (const [hreflang, path] of [["en", addresses.en], ["fr", addresses.fr], ["x-default", addresses.en]]) {
        const href = path === "/" ? `${SITE}/` : `${SITE}${path}`;
        expect(entry).toContain(`hreflang="${hreflang}" href="${href}"`);
      }
    }
  }
  expect(xml).not.toContain("/saves");
});

test("serves llms.txt, which says what the game is and links its pages", async ({ request }) => {
  const response = await request.get("/llms.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  const text = await response.text();
  expect(text).toMatch(/^# Late Winner\n\n> /);
  for (const addresses of PAGES) {
    expect(text).toContain(`(${addresses.en === "/" ? `${SITE}/` : `${SITE}${addresses.en}`})`);
  }
});

for (const language of LANGUAGES) {
  test(`gives the home page in ${language} its structured data: the site, and the game, free, without a rating`, async ({ page }) => {
    await page.goto(language === "en" ? "/" : "/fr");
    const scripts = page.locator('script[type="application/ld+json"]');
    await expect(scripts).toHaveCount(1);
    const data = JSON.parse((await scripts.textContent()) ?? "");
    const [site, game] = data["@graph"];
    expect(data["@context"]).toBe("https://schema.org");
    expect(site).toMatchObject({ "@type": "WebSite", name: "Late Winner", url: `${SITE}/` });
    expect(game).toMatchObject({
      "@type": ["VideoGame", "WebApplication"],
      name: "Late Winner",
      url: language === "en" ? `${SITE}/` : `${SITE}/fr`,
      inLanguage: ["en", "fr"],
      gamePlatform: "Web browser",
      offers: { "@type": "Offer", price: 0, priceCurrency: "EUR" },
    });
    expect(game.description).toBe(await attribute(page, 'meta[name="description"]', "content"));
    expect(JSON.stringify(data)).not.toMatch(/aggregateRating|review/i);
  });
}

test.describe("a French browser on the English pages", () => {
  test.use({ locale: "fr-FR" });

  test("is offered the French page by a line in French, never sent there, and its choice is kept", async ({ page, context }) => {
    await page.goto("/how-to-play");
    const banner = page.getByTestId("language-banner");
    await expect(banner).toHaveAttribute("lang", "fr");
    await expect(banner).toContainText("Cette page existe en français.");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await banner.getByTestId("language-banner-switch").click();
    await expect(page).toHaveURL((url) => url.pathname === "/fr/comment-jouer");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByTestId("language-banner")).toHaveCount(0);
    expect((await context.cookies()).find(({ name }) => name === "lw_lang")?.value).toBe("fr");

    // Having chosen French, the English home page leads to the French one; any other English page stays English.
    await page.goto("/?from=test");
    await expect(page).toHaveURL((url) => url.pathname === "/fr" && url.search === "?from=test");
    await page.goto("/about");
    await expect(page).toHaveURL((url) => url.pathname === "/about");
    await expect(page.getByTestId("language-banner")).toContainText("Cette page existe en français.");
  });

  test("keeps the English home page's button above the fold on a small phone, the line on one row", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/");
    await expect(page.getByTestId("language-banner")).toBeVisible();
    const submit = await page.getByTestId("create-save").boundingBox();
    expect((submit?.y ?? Infinity) + (submit?.height ?? 0)).toBeLessThanOrEqual(780);
    const [switchTo, stay] = await Promise.all([
      page.getByTestId("language-banner-switch").boundingBox(),
      page.getByTestId("language-banner-stay").boundingBox(),
    ]);
    expect(switchTo?.y).toBe(stay?.y);
  });

  test("can stay on the English page: the line goes, and English is kept", async ({ page, context }) => {
    await page.goto("/changelog");
    await page.getByTestId("language-banner-stay").click();
    await expect(page).toHaveURL((url) => url.pathname === "/changelog");
    await expect(page.getByTestId("language-banner")).toHaveCount(0);
    expect((await context.cookies()).find(({ name }) => name === "lw_lang")?.value).toBe("en");
    await page.goto("/");
    await expect(page).toHaveURL((url) => url.pathname === "/");
  });
});

test("redirects nobody by their browser's language, and offers a crawler, which says none, no other language", async ({
  request,
}) => {
  const browsers: Record<string, string>[] = [{ "accept-language": "fr-FR,fr;q=0.9" }, {}];
  for (const headers of browsers) {
    const response = await request.get("/", { headers, maxRedirects: 0 });
    expect(response.status()).toBe(200);
  }
  const crawled = await (await request.get("/fr/comment-jouer")).text();
  expect(crawled).not.toContain('data-testid="language-banner"');
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  for (const addresses of PAGES) {
    for (const language of LANGUAGES) {
      const path = addresses[language];
      test(`${path} reads in full: its title, its text, its links`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(addresses.h1[language]);
        expect((await page.locator("main").innerText()).length).toBeGreaterThan(400);
        await expect(page.getByTestId("privacy-link")).toBeVisible();
      });
    }
  }

  test("the home page has its landing sections, screenshots and questions without JavaScript", async ({ page }) => {
    await page.goto("/fr");
    await expect(page.getByTestId("landing").getByRole("heading", { level: 2 })).toHaveCount(5);
    await expect(page.getByTestId("landing-screenshot")).toHaveCount(3);
    await expect(page.getByTestId("landing-faq").getByRole("heading", { level: 3 })).toHaveCount(5);
    await expect(page.getByTestId("create-save")).toBeVisible();
  });
});

test.describe("a French player on the English home page", () => {
  test.use({ locale: "fr-FR" });

  test("plays the career created there in French, their language, resumes it in French, and steps back to English", async ({
    page,
    context,
  }) => {
    // A world of 198 clubs created.
    test.setTimeout(240_000);
    // A unique name to find this save again (not simulation code: the clock is fine here).
    const name = `E2E langue ${Date.now()}`;
    try {
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await fillCreateSaveForm(page, name, "Olympique Lyonnais");
      await page.getByTestId("create-save").click();
      await expect(page).toHaveURL(/\/saves\/[^/]+$/);
      // The career is in the player's language, its document with it: nothing of the English page is left.
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      await expect(page.getByTestId("nav-team")).toContainText("Équipe");
      await expect(page.getByTestId("dashboard-title")).toHaveText("Tableau de bord");

      // A step back: the English home page, in English again, its client parts included (its careers, the player being at
      // their limit, in place of the form). Once the reloaded career has hydrated:
      // its router, starting, would put its own address back over the step.
      await page.waitForFunction(() => sessionStorage.getItem("lw_locale_reload") === null);
      await page.goBack();
      await expect(page).toHaveURL((url) => url.pathname === "/");
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your careers");
      await expect(saveRow(page, name).getByTestId("open-save")).toContainText("Resume");
      await expect(saveRow(page, name).getByTestId("delete-save")).toHaveText("Delete");

      // From it, the career resumes in French.
      await saveRow(page, name).getByTestId("open-save").click();
      await expect(page).toHaveURL(/\/saves\/[^/]+$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      await expect(page.getByTestId("nav-team")).toContainText("Équipe");
    } finally {
      await deleteUsers([await userIdOf(context)]);
    }
  });
});

/** A page's HTML as a crawler reads it: its entities read back. */
const htmlText = (html: string) =>
  html.replaceAll("&amp;", "&").replaceAll("&#x27;", "'").replaceAll("&#39;", "'").replaceAll("&quot;", '"');

test("serves no real club's name in the HTML of any public page, in either language", async ({ request }) => {
  const clubs = await realClubNames();
  expect(clubs).toHaveLength(198);
  for (const addresses of PAGES) {
    for (const language of LANGUAGES) {
      const path = addresses[language];
      const html = htmlText(await (await request.get(path)).text());
      expect(clubs.filter((club) => html.includes(club)), path).toEqual([]);
    }
  }
});

for (const { language, viewport } of [
  { language: "fr", viewport: { width: 390, height: 844 } },
  { language: "en", viewport: { width: 1280, height: 800 } },
] as const) {
  test.describe(`the home page in ${language} at ${viewport.width} px`, () => {
    test.use({ locale: language === "fr" ? "fr-FR" : "en-GB", viewport });

    test("keeps the clubs' places until their names come: the button neither moves nor leaves the first screen", async ({
      browser,
      page,
    }) => {
      const home = language === "fr" ? "/fr" : "/";
      // As the server sends it: the cards' places, no club yet.
      const bare = await browser.newContext({ javaScriptEnabled: false, viewport, locale: language === "fr" ? "fr-FR" : "en-GB" });
      const before = await bare.newPage();
      await before.goto(home);
      await expect(before.getByTestId("club-suggestion-mid-table")).toBeVisible();
      const waiting = await before.getByTestId("create-save").boundingBox();
      await bare.close();

      // Once the browser has them.
      await page.goto(home);
      await expect(page.getByTestId("club-suggestion-favourite")).toContainText(language === "fr" ? "Facile · favori" : "Easy · favourite");
      await expect(page.getByTestId("club")).not.toHaveText(language === "fr" ? "Choisir un club" : "Choose a club");
      await expect(page.getByTestId("create-save")).toBeEnabled();
      const ready = await page.getByTestId("create-save").boundingBox();

      expect(Math.abs((ready?.y ?? 0) - (waiting?.y ?? Infinity))).toBeLessThanOrEqual(1);
      expect((ready?.y ?? Infinity) + (ready?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
    });
  });
}
