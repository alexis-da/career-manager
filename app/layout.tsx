import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Toaster } from "@/src/components/ui/sonner";
import "./globals.css";

// Barlow for text; Barlow Condensed for titles, scores and large figures (Tailwind's font-heading).
const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700"],
});

// What the outside world sees of the game: no club name, no third-party brand (CLAUDE.md, « Marque et règles produit »).
const TITLE = "Late Winner — The football career game";
const DESCRIPTION = "Late Winner is a free football manager career game you play in your browser.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.latewinner.app"),
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

// Each page in the player's language (src/i18n/request.ts), its messages handed down to the client components.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={await getLocale()} className={`dark ${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          {children}
          {/* On a phone, above a save's action bar, fixed to the foot of the screen. */}
          <Toaster theme="dark" position="bottom-right" mobileOffset={{ bottom: 80 }} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
