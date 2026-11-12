import type { Metadata, Viewport } from "next";
import { Barlow } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import Script from "next/script";
import { AppShell } from "./_components/app-shell";
import { ErrorReporter } from "./_components/error-reporter";
import { APP_BACKGROUND, HOLD_INSTALL_PROMPT_SCRIPT } from "./_lib/install-app";
import { getLocale } from "next-intl/server";
import { Toaster } from "@/src/components/ui/sonner";
import { SITE_URL } from "@/src/config/site";
import { IN_APP_BROWSER_SCRIPT } from "@/src/lib/in-app-browser";
import "./globals.css";

// Barlow for text; Barlow Condensed for titles, scores and large figures (Tailwind's font-heading): one face, the file the
// share images draw with, so whatever weight or style a class asks for gets its 800 italic.
const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = localFont({
  variable: "--font-barlow-condensed",
  src: "../src/assets/fonts/BarlowCondensed-ExtraBoldItalic.ttf",
  weight: "800",
  style: "italic",
});

// What the outside world sees of the game: no club name, no third-party brand (CLAUDE.md, « Marque et règles produit »).
const TITLE = "Late Winner — The football career game";
const DESCRIPTION = "Late Winner is a free football manager career game you play in your browser.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · Late Winner" },
  description: DESCRIPTION,
  applicationName: "Late Winner",
  // Added to an iPhone's home screen, the game opens as an app, under an opaque status bar: nothing goes under it.
  appleWebApp: { capable: true, title: "Late Winner", statusBarStyle: "black" },
  openGraph: {
    type: "website",
    siteName: "Late Winner",
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

// To the screen's edges: the bars at the foot of a save keep the home indicator's room themselves (safe-area-inset-bottom).
// The browser's bars, and the installed app's, in the colour of the game's screens (app/manifest.ts).
export const viewport: Viewport = { viewportFit: "cover", themeColor: APP_BACKGROUND };

// Each page in the player's language (src/i18n/request.ts), its messages handed down to the client components.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The first script marks <html> in an app's browser (data-in-app): an attribute the server never renders.
    <html
      lang={await getLocale()}
      className={`dark ${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Inline and first, before the page paints: what concerns an app's browser shows from the start, nothing moves. */}
        <script dangerouslySetInnerHTML={{ __html: IN_APP_BROWSER_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        {/* Before React: the browser's install prompt held back, for the settings' button (no window comes by itself). */}
        <Script id="hold-install-prompt" strategy="beforeInteractive">
          {HOLD_INSTALL_PROMPT_SCRIPT}
        </Script>
        <NextIntlClientProvider>
          {children}
          {/* The page's uncaught errors, reported to the server for /admin. */}
          <ErrorReporter />
          {/* The installable game: its service worker, its launches counted. */}
          <AppShell />
          {/* Above a save's navigation, fixed to the foot of the screen under lg (--toast-bottom). */}
          <Toaster
            theme="dark"
            position="bottom-right"
            offset={{ bottom: "var(--toast-bottom, 1.5rem)" }}
            mobileOffset={{ bottom: "var(--toast-bottom, 1rem)" }}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
