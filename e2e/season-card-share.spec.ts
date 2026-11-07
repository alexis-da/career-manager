import { expect, test, type Page } from "@playwright/test";
import { demoSaveId, DEMO_USER_ID } from "./db";
import { expectNoSidewaysScroll, expectOrangeActions, signInAs, waitForReact } from "./helpers";

// The season card's way out of the game, on the demo save's finished season, on a phone. Where the browser shares files,
// « Partager » hands the PNG itself to the system's share sheet, alone; elsewhere, « Enregistrer l'image » comes first, a
// sentence says how to post it from the gallery, and « Copier le lien » copies the game's address. The browser's sharing
// is simulated before the page loads (navigator.share and navigator.canShare): the only way to have either case in the
// same Chromium. The demo save is only read.

const PHONE = { width: 390, height: 844 };

/** The square card's file, as the season's page names it in French. */
const CARD_FILE = "late-winner-saison-2026-27.png";

/** Safari on an iPhone: a download would land in Files, so saving opens the image for a long press instead. */
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

/** What the simulated share sheet received. */
type SharedData = { title?: string; text?: string; url?: string; files: { name: string; type: string; size: number }[] };

declare global {
  interface Window {
    sharedCards?: SharedData[];
  }
}

test.use({ viewport: PHONE });

let demo = "";

test.beforeAll(async () => {
  demo = await demoSaveId();
});

/** The demo's finished season, opened by its owner from its honours, once React has committed the page. */
async function openSeason(page: Page): Promise<void> {
  await signInAs(page, DEMO_USER_ID);
  await page.goto(`/saves/${demo}/seasons`);
  await waitForReact(page);
  const path = (await page.getByTestId("seasons-card-link-2026").getAttribute("href")) ?? "";
  await page.goto(path);
  await waitForReact(page);
  await expect(page.getByTestId("season-card-image")).toBeVisible();
}

/** A browser that shares files: navigator.share records what it is given, navigator.canShare accepts PNG files. */
async function shareFiles(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sharedCards = [];
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: (data?: ShareData) => (data?.files ?? []).length > 0 && (data?.files ?? []).every((file) => file.type === "image/png"),
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        window.sharedCards?.push({
          title: data.title,
          text: data.text,
          url: data.url,
          files: (data.files ?? []).map((file) => ({ name: file.name, type: file.type, size: file.size })),
        });
      },
    });
  });
}

/** A browser without navigator.share: an app's browser, many Android ones, most computers. */
async function shareNothing(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
  });
}

test("shares the PNG itself, alone, where the browser shares files", async ({ page }) => {
  await shareFiles(page);
  await openSeason(page);

  const share = page.getByTestId("season-card-share");
  await expect(share).toHaveText("Partager");
  await expect(share).toBeEnabled(); // the file fetched beforehand
  await expectOrangeActions(page, ["season-card-share"]);
  await expect(page.getByTestId("season-card-save-hint")).toHaveCount(0);
  await expect(page.getByTestId("season-card-download")).toHaveText("Enregistrer l'image");
  await expect(page.getByTestId("season-card-copy-link")).toBeVisible();

  await share.click();
  await expect.poll(() => page.evaluate(() => window.sharedCards ?? [])).toHaveLength(1);
  const [shared] = await page.evaluate(() => window.sharedCards ?? []);
  // The image alone: no title, text nor link beside it, which Instagram, TikTok and Snap drop or choke on.
  expect(shared).toEqual({ files: [{ name: CARD_FILE, type: "image/png", size: expect.any(Number) }] });
  expect(shared?.files[0]?.size).toBeGreaterThan(10_000);
  await expectNoSidewaysScroll(page, "card shared");
});

test.describe("without navigator.share", () => {
  test("saves the image first, says how to post it from the gallery, and copies the game's link", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await shareNothing(page);
    await openSeason(page);

    await expect(page.getByTestId("season-card-share")).toHaveCount(0);
    const save = page.getByTestId("season-card-download");
    await expect(save).toHaveText("Enregistrer l'image");
    await expectOrangeActions(page, ["season-card-download"]);
    await expect(page.getByTestId("season-card-save-hint")).toHaveText(
      "Ton navigateur ne partage pas l'image directement : enregistre-la, puis publie-la depuis ta galerie dans Instagram, TikTok, Snap ou un message.",
    );

    // Elsewhere than on an iPhone, the PNG downloads.
    const download = page.waitForEvent("download");
    await save.click();
    expect((await download).suggestedFilename()).toBe(CARD_FILE);

    await page.getByTestId("season-card-copy-link").click();
    await expect(page.getByTestId("season-card-link-copied")).toHaveText("Lien du jeu copié.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://www.latewinner.app");
    await expectNoSidewaysScroll(page, "card saved");
  });

  test.describe("on an iPhone", () => {
    test.use({ userAgent: IPHONE });

    test("opens the image for a long press to Photos", async ({ page }) => {
      await shareNothing(page);
      await openSeason(page);

      await page.getByTestId("season-card-download").click();
      const viewer = page.getByTestId("season-card-viewer");
      await expect(viewer).toBeVisible();
      await expect(viewer.getByTestId("season-card-viewer-image")).toBeVisible();
      await expect(viewer).toContainText("Appuie longuement sur l'image, puis enregistre-la dans Photos");
      await page.keyboard.press("Escape");
      await expect(viewer).toHaveCount(0);
    });
  });

  test.describe("in English", () => {
    test.use({ locale: "en-GB" });

    test("names the buttons and the way through the gallery as a British player reads them", async ({ page }) => {
      await shareNothing(page);
      await openSeason(page);

      await expect(page.getByTestId("season-card-download")).toHaveText("Save image");
      await expect(page.getByTestId("season-card-copy-link")).toHaveText("Copy link");
      await expect(page.getByTestId("season-card-save-hint")).toHaveText(
        "Your browser can't share the image directly: save it, then post it from your gallery to Instagram, TikTok, Snap or a message.",
      );
    });
  });
});
