import type { Metadata } from "next";
import { PublicPage } from "../../_components/public-page";
import { publicPageMetadata } from "../../_lib/public-metadata";
import { PrivacyDocument } from "../../privacy/_components/privacy-document";

export function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata("privacy", "fr");
}

/** The privacy document in French, with its English summary, open to everyone; in English at /privacy (app/privacy). */
export default function FrenchPrivacyPage() {
  return (
    <PublicPage page="privacy" className="max-w-2xl">
      <PrivacyDocument locale="fr" />
    </PublicPage>
  );
}
