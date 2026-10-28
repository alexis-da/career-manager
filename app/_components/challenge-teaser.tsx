import Link from "next/link";
import { buttonVariants } from "@/src/components/ui/button";

/** The way to the weekly challenge from the home page (inside a .brand scope): one club for all, ten matchdays, a ranking. */
export function ChallengeTeaser() {
  return (
    <section lang="fr" aria-labelledby="challenge-teaser" className="space-y-3 rounded-lg border bg-card p-5">
      <h2 id="challenge-teaser" className="eyebrow">
        Défi de la semaine
      </h2>
      <p className="text-sm text-muted-foreground">
        Le même club pour tout le monde, dix journées de championnat, un classement chaque semaine.
      </p>
      <Link href="/challenge" className={buttonVariants({ variant: "outline" })}>
        Voir le défi
      </Link>
    </section>
  );
}
