import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicPage } from "../_components/public-page";
import { PrivacyDocument } from "./_components/privacy-document";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("footer"))("privacy") };
}

/** Open to everyone, outside the password (proxy.ts): the privacy document in the player's language. */
export default async function PrivacyPage() {
  return (
    <PublicPage className="max-w-2xl">
      <PrivacyDocument locale={await getLocale()} />
    </PublicPage>
  );
}
