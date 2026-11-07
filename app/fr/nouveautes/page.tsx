import type { Metadata } from "next";
import { PublicPage } from "../../_components/public-page";
import { ChangelogDocument } from "../../_components/documents/changelog-document";
import { publicPageMetadata } from "../../_lib/public-metadata";

export function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata("changelog", "fr");
}

/** What's new, in French (« Nouveautés »); in English at /changelog. */
export default function FrenchChangelogPage() {
  return (
    <PublicPage page="changelog" className="max-w-3xl">
      <ChangelogDocument locale="fr" />
    </PublicPage>
  );
}
