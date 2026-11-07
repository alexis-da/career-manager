import type { Metadata } from "next";
import { PublicPage } from "../_components/public-page";
import { ChangelogDocument } from "../_components/documents/changelog-document";
import { publicPageMetadata } from "../_lib/public-metadata";

export function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata("changelog", "en");
}

/** What's new, in English; in French at /fr/nouveautes. */
export default function EnglishChangelogPage() {
  return (
    <PublicPage page="changelog" className="max-w-3xl">
      <ChangelogDocument locale="en" />
    </PublicPage>
  );
}
