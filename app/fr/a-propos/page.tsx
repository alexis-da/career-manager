import type { Metadata } from "next";
import { PublicPage } from "../../_components/public-page";
import { AboutDocument } from "../../_components/documents/about-document";
import { publicPageMetadata } from "../../_lib/public-metadata";

export function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata("about", "fr");
}

/** About the game and its maker, in French (« À propos »); in English at /about. */
export default function FrenchAboutPage() {
  return (
    <PublicPage page="about" className="max-w-3xl">
      <AboutDocument locale="fr" />
    </PublicPage>
  );
}
