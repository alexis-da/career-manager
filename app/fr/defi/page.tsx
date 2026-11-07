import type { Metadata } from "next";
import { publicPageMetadata } from "../../_lib/public-metadata";
import { ChallengePage } from "../../challenge/_components/challenge-page";

export const dynamic = "force-dynamic";

// « Jouer le défi » creates a worldVersion 2 save, several thousand rows in one transaction: up to 60 s, as the home page.
export const maxDuration = 60;

// No club name in the title, nor in the sharing image (CLAUDE.md, « Communication sortante »).
export function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata("challenge", "fr");
}

/** The weekly challenge in French; in English at /challenge (app/challenge/page.tsx). */
export default function FrenchChallengePage() {
  return <ChallengePage />;
}
