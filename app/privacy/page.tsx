import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PrivacyDocument } from "./_components/privacy-document";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("footer"))("privacy") };
}

/** Open to everyone, outside the password (proxy.ts): the privacy document in the player's language. */
export default async function PrivacyPage() {
  return <PrivacyDocument locale={await getLocale()} />;
}
