import type { Metadata } from "next";
import { PublicPage } from "../_components/public-page";
import { publicPageMetadata } from "../_lib/public-metadata";
import { PrivacyDocument } from "./_components/privacy-document";

export function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata("privacy", "en");
}

/** The privacy document in English, open to everyone; in French at /fr/confidentialite (app/fr/confidentialite). */
export default function EnglishPrivacyPage() {
  return (
    <PublicPage page="privacy" className="max-w-2xl">
      <PrivacyDocument locale="en" />
    </PublicPage>
  );
}
