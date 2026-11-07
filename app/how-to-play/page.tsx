import type { Metadata } from "next";
import { PublicPage } from "../_components/public-page";
import { HowToPlayDocument } from "../_components/documents/how-to-play-document";
import { publicPageMetadata } from "../_lib/public-metadata";

export function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata("howToPlay", "en");
}

/** The « How to play » guide in English; in French at /fr/comment-jouer. */
export default function EnglishHowToPlayPage() {
  return (
    <PublicPage page="howToPlay" className="max-w-3xl">
      <HowToPlayDocument locale="en" />
    </PublicPage>
  );
}
