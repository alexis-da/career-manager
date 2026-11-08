import type { Metadata, Viewport } from "next";
import { Barlow } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { ErrorReporter } from "./_components/error-reporter";
import { getLocale } from "next-intl/server";
import { Toaster } from "@/src/components/ui/sonner";
import { SITE_URL } from "@/src/config/site";
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
export const viewport: Viewport = { viewportFit: "cover" };

// Each page in the player's language (src/i18n/request.ts), its messages handed down to the client components.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={await getLocale()} className={`dark ${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          {children}
          {/* The page's uncaught errors, reported to the server for /admin. */}
          <ErrorReporter />
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
