import type { Locale } from "@/src/i18n/locale";
import { formatDate } from "@/src/lib/format";
import { CHANGELOG, CHANGELOG_LABELS, type ChangelogEntry } from "../../_content/changelog";
import { DocumentArticle } from "./document";

/** An entry's day, « YYYY-MM-DD », as a date at midnight UTC: the clock the game's dates are formatted in. */
const dayOf = (date: string): Date => new Date(`${date}T00:00:00Z`);

/** A day the game went live, and what it brought, in the changelog's order. */
export type Release = { date: string; entries: ChangelogEntry[] };

/** The changelog by day: its entries of a same day together, the days newest first, as it lists them. */
export function releasesOf(entries: readonly ChangelogEntry[]): Release[] {
  const releases: Release[] = [];
  for (const entry of entries) {
    const last = releases.at(-1);
    if (last !== undefined && last.date === entry.date) {
      last.entries.push(entry);
    } else {
      releases.push({ date: entry.date, entries: [entry] });
    }
  }
  return releases;
}

/**
 * « Nouveautés » / « What's new » (app/changelog, app/fr/nouveautes): what changed for players since the game opened,
 * newest first, by the day it went live, each with what it brought.
 */
export function ChangelogDocument({ locale }: { locale: Locale }) {
  const labels = CHANGELOG_LABELS[locale];
  const releases = releasesOf(CHANGELOG);
  const opening = CHANGELOG.at(-1);
  return (
    <DocumentArticle
      lang={locale}
      title={labels.title}
      lead={opening === undefined ? undefined : labels.lead(formatDate(dayOf(opening.date), locale))}
    >
      <ol className="space-y-12">
        {releases.map((release, index) => {
          // Numbered from the opening, so that a day keeps its anchor as others come above it.
          const id = `version-${releases.length - index}`;
          return (
            <li key={release.date}>
              <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-6">
                <h2 id={`${id}-title`} className="font-heading text-2xl leading-tight lg:text-[1.75rem]">
                  <time dateTime={release.date}>{formatDate(dayOf(release.date), locale)}</time>
                </h2>
                {release.entries.map((entry) => (
                  <div key={entry.en.title} className="space-y-2">
                    <h3 className="text-lg leading-snug font-bold">{entry[locale].title}</h3>
                    <ul className="list-disc space-y-1.5 pl-5 text-[0.9375rem] leading-relaxed text-muted-foreground">
                      {entry[locale].items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            </li>
          );
        })}
      </ol>
    </DocumentArticle>
  );
}
