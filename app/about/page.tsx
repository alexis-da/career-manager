import type { Metadata } from "next";
import { PublicPage } from "../_components/public-page";
import { AboutDocument } from "../_components/documents/about-document";
import { publicPageMetadata } from "../_lib/public-metadata";

export function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata("about", "en");
}

/** About the game and its maker, in English; in French at /fr/a-propos. */
export default function EnglishAboutPage() {
  return (
    <PublicPage page="about" className="max-w-3xl">
      <AboutDocument locale="en" />
    </PublicPage>
  );
}
