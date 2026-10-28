import Link from "next/link";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/src/components/ui/button";

/** The way to the weekly challenge from the home page (inside a .brand scope): one club for all, ten matchdays, a ranking. */
export function ChallengeTeaser() {
  const t = useTranslations("challenge");
  return (
    <section aria-labelledby="challenge-teaser" className="space-y-3 rounded-lg border bg-card p-5">
      <h2 id="challenge-teaser" className="eyebrow">
        {t("title")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("teaser")}</p>
      <Link href="/challenge" className={buttonVariants({ variant: "outline" })} data-testid="challenge-teaser">
        {t("see")}
      </Link>
    </section>
  );
}
