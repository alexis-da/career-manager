import { describe, expect, it } from "vitest";
import { chromeIntentUrl, IN_APP_BROWSER_SCRIPT, inAppBrowserOf, type InAppBrowser } from "./in-app-browser";

/** User agents of the in-app browsers, as their apps sent them in 2026, and of browsers that are not one. */
const USER_AGENTS: readonly [string, string, InAppBrowser | null][] = [
  [
    "Instagram, iPhone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_5; en_GB; en-GB; scale=3.00; 1170x2532; 614462468; IABMV/1)",
    { app: "instagram", platform: "ios" },
  ],
  [
    "Instagram, Android",
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 Instagram 337.0.0.35.102 Android (34/14; 450dpi; 1080x2340; samsung; SM-S918B; dm3q; qcom; en_GB; 614462440)",
    { app: "instagram", platform: "android" },
  ],
  [
    "Facebook, iPhone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.97;FBBV/619346420;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_GB;FBOP/5;FBRV/621226047]",
    { app: "facebook", platform: "ios" },
  ],
  [
    "Facebook, Android",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240605.024; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.43.108;]",
    { app: "facebook", platform: "android" },
  ],
  [
    "Messenger, iPhone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/460.0.0.39.109;FBBV/615146421;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBCR/;FBID/phone;FBLC/en_GB;FBOP/5]",
    { app: "facebook", platform: "ios" },
  ],
  [
    "TikTok, iPhone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_35.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/GB isDarkMode/1 WKWebView/1 RevealType/Dialog BytedanceWebview/d8a21c6",
    { app: "tiktok", platform: "ios" },
  ],
  [
    "TikTok, Android",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240605.024; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 trill_350102 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/trill app_version/35.1.2 ByteLocale/en-GB Region/GB AppId/1180 BytedanceWebview/d8a21c6",
    { app: "tiktok", platform: "android" },
  ],
  [
    "Snapchat, iPhone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/13.0.0.40 (like Safari/8618.2.12.10.3, panda)",
    { app: "snapchat", platform: "ios" },
  ],
  [
    "Snapchat, Android",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240605.024; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 Snapchat/13.1.0.33 (Pixel 8; Android 14#11228933#34; gzip; )",
    { app: "snapchat", platform: "android" },
  ],
  ["Chrome, Android", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36", null],
  [
    "Safari, iPhone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    null,
  ],
  [
    "Google app, iPhone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/326.0.649006093 Mobile/15E148 Safari/604.1",
    null,
  ],
  ["Chrome, Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", null],
];

/** What the layout's script puts on <html> for a user agent, run as the browser runs it. */
function scriptAttributes(userAgent: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const document = { documentElement: { setAttribute: (name: string, value: string) => (attributes[name] = value) } };
  // The inline script itself, as a string: the only way to run what the browser runs.
  new Function("navigator", "document", IN_APP_BROWSER_SCRIPT)({ userAgent }, document);
  return attributes;
}

describe("inAppBrowserOf", () => {
  it.each(USER_AGENTS)("%s", (_name, userAgent, expected) => {
    expect(inAppBrowserOf(userAgent)).toEqual(expected);
  });
});

describe("IN_APP_BROWSER_SCRIPT", () => {
  it.each(USER_AGENTS)("marks <html> as inAppBrowserOf says: %s", (_name, userAgent, expected) => {
    expect(scriptAttributes(userAgent)).toEqual(
      expected === null ? {} : { "data-in-app": expected.app, "data-in-app-platform": expected.platform },
    );
  });

  it("does nothing, and throws nothing, without a navigator", () => {
    const attributes: Record<string, string> = {};
    expect(() => new Function("navigator", "document", IN_APP_BROWSER_SCRIPT)(undefined, attributes)).not.toThrow();
    expect(attributes).toEqual({});
  });
});

describe("chromeIntentUrl", () => {
  it("opens the address in Chrome, the address itself to fall back on", () => {
    expect(chromeIntentUrl(new URL("https://www.latewinner.app/fr?ref=instagram"))).toBe(
      "intent://www.latewinner.app/fr?ref=instagram#Intent;scheme=https;package=com.android.chrome;" +
        "S.browser_fallback_url=https%3A%2F%2Fwww.latewinner.app%2Ffr%3Fref%3Dinstagram;end",
    );
  });

  it("keeps a local server's port and scheme", () => {
    expect(chromeIntentUrl(new URL("http://localhost:3100/resume?t=abc"))).toBe(
      "intent://localhost:3100/resume?t=abc#Intent;scheme=http;package=com.android.chrome;" +
        "S.browser_fallback_url=http%3A%2F%2Flocalhost%3A3100%2Fresume%3Ft%3Dabc;end",
    );
  });
});
