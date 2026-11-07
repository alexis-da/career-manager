import type { Metadata } from "next";
import { PublicPage } from "../../_components/public-page";
import { HowToPlayDocument } from "../../_components/documents/how-to-play-document";
import { publicPageMetadata } from "../../_lib/public-metadata";

export function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata("howToPlay", "fr");
}

/** The « Comment jouer » guide in French; in English at /how-to-play. */
export default function FrenchHowToPlayPage() {
  return (
    <PublicPage page="howToPlay" className="max-w-3xl">
      <HowToPlayDocument locale="fr" />
    </PublicPage>
  );
}
