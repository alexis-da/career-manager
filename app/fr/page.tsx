import type { Metadata } from "next";
import { HomePage } from "../_components/home-page";
import { publicPageMetadata } from "../_lib/public-metadata";

export const dynamic = "force-dynamic";

// The Server Actions of this page include the creation of a save (createSave), several thousand rows in one
// transaction: up to 60 s, as the purge route.
export const maxDuration = 60;

export function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata("home", "fr");
}

/** The home page in French; in English at the site's root (app/page.tsx). */
export default function FrenchHomePage({ searchParams }: PageProps<"/fr">) {
  return <HomePage searchParams={searchParams} />;
}
