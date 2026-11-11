import Link from "@/src/components/link";
import { buttonVariants } from "@/src/components/ui/button";
import type { Locale } from "@/src/i18n/locale";
import { publicPath } from "@/src/i18n/public-pages";
import { cn } from "@/src/lib/utils";
import { GUIDE, GUIDE_INTRO, GUIDE_LABELS } from "../../_content/how-to-play";
import { DocumentArticle, DocumentSection, RichText } from "./document";

/**
 * « Comment jouer » / « How to play » (app/how-to-play, app/fr/comment-jouer): a short guide from the creation of a career
 * to its first match, then the market, the line-up, the match events, the objectives and the weekly challenge; its table
 * of contents first, and the way to the game last, the page's one orange action.
 */
export function HowToPlayDocument({ locale }: { locale: Locale }) {
  const labels = GUIDE_LABELS[locale];
  return (
    <DocumentArticle lang={locale} title={labels.title} lead={GUIDE_INTRO[locale]}>
      <nav aria-labelledby="guide-contents" className="rounded-card bg-card px-5 py-4">
        <h2 id="guide-contents" className="eyebrow">
          {labels.contents}
        </h2>
        <ol className="mt-1 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {GUIDE.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="flex min-h-11 items-center text-[0.9375rem] font-semibold hover:text-(--club)"
              >
                {section[locale].title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {GUIDE.map((section) => (
        <DocumentSection key={section.id} id={section.id} title={section[locale].title}>
          {section[locale].blocks.map((block, index) =>
            typeof block === "string" ? (
              <p key={index}>
                <RichText text={block} />
              </p>
            ) : (
              <ul key={index} className="list-disc space-y-1.5 pl-5">
                {block.map((item) => (
                  <li key={item}>
                    <RichText text={item} />
                  </li>
                ))}
              </ul>
            ),
          )}
        </DocumentSection>
      ))}

      <Link
        href={publicPath("home", locale)}
        className={cn(buttonVariants({ variant: "club", size: "lg" }), "h-12 px-6 font-heading text-xl")}
        data-testid="how-to-play-start"
      >
        {labels.start}
      </Link>
    </DocumentArticle>
  );
}
