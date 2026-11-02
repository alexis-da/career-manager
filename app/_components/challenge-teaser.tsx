import Link from "next/link";
import { useTranslations } from "next-intl";

/** The way to the weekly challenge from the home page: from 1024 px its link alone, beside the game's mark. */
export function ChallengeTeaser() {
  const t = useTranslations("challenge");
  return (
    <div>
      <Link
        href="/challenge"
        className="inline-flex min-h-11 items-center text-[0.9375rem] font-semibold text-(--club) hover:text-(--club-hover)"
        data-testid="challenge-teaser"
      >
        {t("title")}
      </Link>
      <p className="text-sm text-muted-foreground lg:hidden">{t("teaser")}</p>
    </div>
  );
}
