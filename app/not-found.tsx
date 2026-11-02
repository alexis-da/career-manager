import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/src/components/ui/button";
import { PublicPage } from "./_components/public-page";

/**
 * A page that does not exist, a save deleted, or a save of another player (requireOwnedSave): the same 404, in the
 * player's language, outside any save.
 */
export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <PublicPage className="max-w-md">
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="font-heading text-4xl">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </header>
        <Link href="/" className={buttonVariants({ variant: "club", size: "lg" })} data-testid="not-found-home">
          {t("home")}
        </Link>
      </div>
    </PublicPage>
  );
}
