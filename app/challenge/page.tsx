import type { Metadata } from "next";
import { publicPageMetadata } from "../_lib/public-metadata";
import { ChallengePage } from "./_components/challenge-page";

export const dynamic = "force-dynamic";

// « Jouer le défi » creates a worldVersion 2 save, several thousand rows in one transaction: up to 60 s, as the home page.
export const maxDuration = 60;

// No club name in the title, nor in the sharing image (CLAUDE.md, « Communication sortante »).
export function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata("challenge", "en");
}

/** The weekly challenge in English; in French at /fr/defi (app/fr/defi/page.tsx). */
export default function EnglishChallengePage() {
  return <ChallengePage />;
}
