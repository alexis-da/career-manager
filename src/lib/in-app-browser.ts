// In-app browsers: the pages Instagram, Facebook, TikTok or Snapchat open a link in. Their cookies are the app's own,
// apart from the phone's browser: a career begun there stays there, and Google refuses to sign in inside them
// (disallowed_useragent). Told apart by their user agent, in the browser only: IN_APP_BROWSER_SCRIPT marks <html> before
// the first paint, and the pages show or hide what concerns them by CSS (the in-app variants of app/globals.css), with no
// shift and nothing read on the server.

export const IN_APP_APPS = ["instagram", "facebook", "tiktok", "snapchat"] as const;

export type InAppApp = (typeof IN_APP_APPS)[number];

/** Android opens Chrome by an intent; elsewhere (an iPhone), the player follows the steps. */
export type InAppPlatform = "android" | "ios" | "other";

export type InAppBrowser = { app: InAppApp; platform: InAppPlatform };

/**
 * Each app's mark in the user agent of its browser, as the source of a case-insensitive regular expression, tried in the
 * order of IN_APP_APPS. Facebook's covers Messenger (FBAN/MessengerForiOS, FB_IAB/Orca-Android); TikTok's, its former
 * name (musical_ly) and its Android browser (BytedanceWebview, trill).
 */
export const IN_APP_PATTERNS: Readonly<Record<InAppApp, string>> = {
  instagram: "\\bInstagram\\b",
  facebook: "FBAN|FBAV|FB_IAB|FBIOS|FB4A",
  tiktok: "musical_ly|Bytedance|\\bTikTok\\b|\\btrill_",
  snapchat: "\\bSnapchat\\b",
};

const ANDROID = "Android";
const IOS = "iPhone|iPad|iPod";

/** The platform of a user agent: Android, an iPhone or iPad, or another. */
function platformOf(userAgent: string): InAppPlatform {
  return new RegExp(ANDROID, "i").test(userAgent) ? "android" : new RegExp(IOS, "i").test(userAgent) ? "ios" : "other";
}

/** The in-app browser a user agent is, with its platform; null for any other browser. */
export function inAppBrowserOf(userAgent: string): InAppBrowser | null {
  const app = IN_APP_APPS.find((candidate) => new RegExp(IN_APP_PATTERNS[candidate], "i").test(userAgent));
  return app === undefined ? null : { app, platform: platformOf(userAgent) };
}

/** The attributes the script puts on <html> in an in-app browser: the app, and its platform. */
export const IN_APP_ATTRIBUTE = "data-in-app";
export const IN_APP_PLATFORM_ATTRIBUTE = "data-in-app-platform";

/**
 * The layout's first script, inline in <head>: inAppBrowserOf, run before the page paints, marks <html> with
 * IN_APP_ATTRIBUTE and IN_APP_PLATFORM_ATTRIBUTE. The same patterns and the same order (in-app-browser.test.ts runs both).
 */
export const IN_APP_BROWSER_SCRIPT =
  "(function(){try{" +
  `var u=navigator.userAgent,p=${JSON.stringify(IN_APP_PATTERNS)},a=${JSON.stringify(IN_APP_APPS)};` +
  "for(var i=0;i<a.length;i++){if(new RegExp(p[a[i]],'i').test(u)){var d=document.documentElement;" +
  `d.setAttribute('${IN_APP_ATTRIBUTE}',a[i]);` +
  `d.setAttribute('${IN_APP_PLATFORM_ATTRIBUTE}',new RegExp('${ANDROID}','i').test(u)?'android':new RegExp('${IOS}','i').test(u)?'ios':'other');` +
  "return}}}catch(e){}})();";

/** Whether this page was marked by the script: in the browser, after it ran. */
export function isInAppBrowser(): boolean {
  return typeof document !== "undefined" && document.documentElement.hasAttribute(IN_APP_ATTRIBUTE);
}

/**
 * The intent that opens an address in Chrome from an Android in-app browser, with the address itself to fall back on if
 * Chrome is not there: « intent://www.latewinner.app/fr?ref=instagram#Intent;scheme=https;package=com.android.chrome;… ».
 */
export function chromeIntentUrl(address: URL): string {
  const fallback = encodeURIComponent(address.toString());
  const scheme = address.protocol.replace(/:$/, "");
  return `intent://${address.host}${address.pathname}${address.search}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}
