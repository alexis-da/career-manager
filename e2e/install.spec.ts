import { devices, expect, test, type Page } from "@playwright/test";
import { appLaunchesToday, demoSaveId, DEMO_USER_ID } from "./db";
import { expectNoSidewaysScroll, signInAs, waitForReact } from "./helpers";

// The installable game (app/manifest.ts, public/sw.js, the settings' InstallApp): its manifest and icons, its service
// worker and the page it shows without a connection, the settings' button where Chrome offers its prompt (simulated:
// no test browser installs anything) and on an iPhone, and a launch of the installed app (display-mode standalone,
// simulated) counted once a session. On the demo save, whose Club screen has the settings.

const PHONE = { width: 360, height: 780 };

let demo = "";

test.beforeAll(async () => {
  demo = await demoSaveId();
});

/** Opens the demo save's Club screen, signed in as its owner, the page's React committed. */
async function openSettings(page: Page): Promise<void> {
  await signInAs(page, DEMO_USER_ID);
  await page.goto(`/saves/${demo}/club`);
  await waitForReact(page);
  await expect(page.getByTestId("settings-install")).toBeVisible();
}

test("serves a manifest of Late Winner, standalone in the game's colours, its icons, its service worker and its offline page", async ({
  page,
  request,
}) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: "Late Winner", start_url: "/", display: "standalone", background_color: "#0B1340" });
  for (const icon of manifest.icons as { src: string }[]) {
    const image = await request.get(icon.src);
    expect(image.status(), icon.src).toBe(200);
    expect(image.headers()["content-type"], icon.src).toBe("image/png");
  }

  // Every page links the manifest, paints the browser's bars in the game's colour and has an icon for a home screen.
  await page.goto("/fr");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0B1340");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Late Winner");

  const worker = await request.get("/sw.js");
  expect(worker.status()).toBe(200);
  expect(await worker.text()).toContain('addEventListener("fetch"');
  await page.goto("/offline.html");
  await expect(page.getByRole("heading", { name: "Pas de connexion" })).toBeVisible();
  await expect(page.getByText("No connection.")).toBeVisible();
});

test("opens Chrome's own prompt from the settings' button, held back until then, and says the game is installed", async ({ page }) => {
  // A browser that finds the game installable fires beforeinstallprompt: here, a made-up one, which the layout holds back.
  await page.addInitScript(() => {
    window.addEventListener("load", () => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, {
        prompt: async () => {
          Object.assign(window, { promptOpened: true });
        },
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      window.dispatchEvent(event);
      Object.assign(window, { promptHeldBack: event.defaultPrevented });
    });
  });
  await openSettings(page);

  // Held back: no window came by itself.
  expect(await page.evaluate(() => (window as unknown as { promptHeldBack?: boolean }).promptHeldBack)).toBe(true);
  const row = page.getByTestId("settings-install");
  await expect(row).toHaveAttribute("data-state", "prompt");
  await row.getByTestId("settings-install-button").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { promptOpened?: boolean }).promptOpened)).toBe(true);
  await expect(row).toContainText("Tu joues dans l'appli installée.");
  await expect(row.getByTestId("settings-install-button")).toHaveCount(0);
});

/** An iPhone, as Chromium plays it: its screen, touch and Safari's user agent (a group cannot change the browser). */
const IPHONE = devices["iPhone 13"];

test.describe("on an iPhone", () => {
  test.use({
    viewport: IPHONE.viewport,
    userAgent: IPHONE.userAgent,
    deviceScaleFactor: IPHONE.deviceScaleFactor,
    isMobile: IPHONE.isMobile,
    hasTouch: IPHONE.hasTouch,
    locale: "fr-FR",
  });

  test("says how to install the game from the Share menu, on a press of the button, without a sideways scroll", async ({ page }) => {
    await openSettings(page);
    const row = page.getByTestId("settings-install");
    await expect(row).toHaveAttribute("data-state", "apple");
    await expect(row.getByTestId("settings-install-help")).toHaveCount(0);

    await row.getByTestId("settings-install-button").click();
    await expect(row.getByTestId("settings-install-help")).toHaveText("Touche Partager, puis « Sur l'écran d'accueil ».");
    await expect(row.getByTestId("settings-install-button")).toHaveAttribute("aria-expanded", "true");
    await expectNoSidewaysScroll(page, "settings on an iPhone");
  });
});

test.describe("in the installed app", () => {
  test.use({ viewport: PHONE, locale: "en-GB" });

  test("counts a launch once a session, and says the game is installed", async ({ page }) => {
    // The page as the installed app shows it: display-mode standalone.
    await page.addInitScript(() => {
      const matchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query: string) =>
        query === "(display-mode: standalone)" ? ({ ...matchMedia(query), matches: true, media: query } as MediaQueryList) : matchMedia(query);
    });
    const before = await appLaunchesToday();

    await openSettings(page);
    await expect(page.getByTestId("settings-install")).toContainText("You are playing in the installed app.");
    await expect.poll(appLaunchesToday).toBe(before + 1);

    // The same session: not counted again.
    await page.reload();
    await waitForReact(page);
    await page.waitForLoadState("networkidle");
    expect(await appLaunchesToday()).toBe(before + 1);
    await expectNoSidewaysScroll(page, "settings in the installed app");
  });
});
