import Image from "next/image";
import { useTranslations } from "next-intl";
import { cn } from "@/src/lib/utils";

/** The logo for a dark background: its width and height, from the SVG's viewBox. */
const LOGO = { src: "/brand/late-winner-logo-fond-sombre.svg", width: 552, height: 150 };

/**
 * The brand at the top of the pages outside a save: the full logo, which is the page title, the tagline and the
 * catchphrase in English, the brand's language, and a line saying the game is played in French and in English. Inside
 * a .brand scope.
 */
export function BrandHeader({ logoHeight, className }: { logoHeight: number; className?: string }) {
  const t = useTranslations("brand");
  return (
    <header className={cn("space-y-3", className)}>
      <h1>
        <Image
          src={LOGO.src}
          alt="Late Winner"
          width={Math.round((LOGO.width * logoHeight) / LOGO.height)}
          height={logoHeight}
          priority
          unoptimized
        />
      </h1>
      <div lang="en" className="space-y-0.5">
        <p className="font-heading text-2xl font-semibold tracking-wide">The football career game</p>
        <p className="font-heading text-lg font-semibold text-(--brand-orange)">Take your club to the top</p>
      </div>
      <p className="text-sm text-muted-foreground">{t("languages")}</p>
    </header>
  );
}
