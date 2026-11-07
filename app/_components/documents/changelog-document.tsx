import type { Locale } from "@/src/i18n/locale";
import { formatDate } from "@/src/lib/format";
import { CHANGELOG, CHANGELOG_LABELS } from "../../_content/changelog";
import { DocumentArticle, DocumentSection } from "./document";

/** An entry's day, « YYYY-MM-DD », as a date at midnight UTC: the clock the game's dates are formatted in. */
const dayOf = (date: string): Date => new Date(`${date}T00:00:00Z`);

/**
 * « Nouveautés » / « What's new » (app/changelog, app/fr/nouveautes): what changed for players since the game opened,
 * newest first, each batch with its day, its title and what it brought.
 */
export function ChangelogDocument({ locale }: { locale: Locale }) {
  const labels = CHANGELOG_LABELS[locale];
  const opening = CHANGELOG[CHANGELOG.length - 1];
  return (
    <DocumentArticle
      lang={locale}
      title={labels.title}
      lead={opening === undefined ? undefined : labels.lead(formatDate(dayOf(opening.date), locale))}
    >
      <ol className="space-y-12">
        {CHANGELOG.map((entry, index) => (
          // Numbered from the opening, so that an entry keeps its anchor as others come above it.
          <li key={`${entry.date}-${entry.en.title}`}>
            <DocumentSection
              id={`version-${CHANGELOG.length - index}`}
              title={entry[locale].title}
              aside={
                <p className="eyebrow">
                  <time dateTime={entry.date}>{formatDate(dayOf(entry.date), locale)}</time>
                </p>
              }
            >
              <ul className="list-disc space-y-1.5 pl-5">
                {entry[locale].items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </DocumentSection>
          </li>
        ))}
      </ol>
    </DocumentArticle>
  );
}
