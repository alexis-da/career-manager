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

export const metadata: Metadata = {
  title: { default: "Career Manager", template: "%s · Career Manager" },
  description: "Jeu de gestion de carrière football.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`dark ${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
