import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
