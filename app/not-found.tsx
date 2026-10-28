import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/src/components/ui/button";
import { BrandFooter } from "./_components/brand-footer";

/**
 * A page that does not exist, a save deleted, or a save of another player (requireOwnedSave): the same 404, in the
 * player's language, outside any save.
 */
export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main className="brand flex-1 bg-background text-foreground">
      <div className="mx-auto w-full max-w-md space-y-8 px-4 py-10">
        <header className="space-y-2">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            {t("back")}
          </Link>
          <h1 className="font-heading text-4xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </header>
        <Link href="/" className={buttonVariants({ size: "lg" })} data-testid="not-found-home">
          {t("home")}
        </Link>
        <BrandFooter />
      </div>
    </main>
  );
}
