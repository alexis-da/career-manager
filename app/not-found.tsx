import Link from "@/src/components/link";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/src/components/ui/button";
import { publicPath } from "@/src/i18n/public-pages";
import { PublicPage } from "./_components/public-page";

/**
 * A page that does not exist, a save deleted, or a save of another player (requireOwnedSave): the same 404, outside any
 * save, in French under /fr, else in the player's language. Its language switcher leads to the home page in the other
 * language; nothing else is offered in it.
 */
export default async function NotFound() {
  const [t, locale] = await Promise.all([getTranslations("notFound"), getLocale()]);
  return (
    <PublicPage page="home" languageBanner={false} className="max-w-md">
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="font-heading text-4xl">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </header>
        <Link href={publicPath("home", locale)} className={buttonVariants({ variant: "club", size: "lg" })} data-testid="not-found-home">
          {t("home")}
        </Link>
      </div>
    </PublicPage>
  );
}
