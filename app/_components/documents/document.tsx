import type { ReactNode } from "react";
import type { Locale } from "@/src/i18n/locale";

/**
 * A document of the public pages, in one language: its title, a lead under it, then its sections. The guide, the
 * changelog and the about page (app/_components/documents) keep their words here and in app/_content, outside the
 * messages, as the privacy document does.
 */
export function DocumentArticle({
  lang,
  title,
  lead,
  children,
}: {
  lang: Locale;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article lang={lang} className="space-y-10">
      <header className="space-y-3">
        <h1 className="font-heading text-[2.5rem] leading-[0.95] lg:text-6xl">{title}</h1>
        {lead !== undefined && (
          <p className="text-[1.0625rem] leading-relaxed text-muted-foreground lg:text-lg">{lead}</p>
        )}
      </header>
      {children}
    </article>
  );
}

/** A section of a document: its title (an anchor's target), what goes above its text, its text. */
export function DocumentSection({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-3">
      <h2 id={`${id}-title`} className="font-heading text-2xl leading-tight lg:text-[1.75rem]">
        {title}
      </h2>
      {aside}
      <div className="space-y-3 text-[0.9375rem] leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

/** A text of the guide: **…** in bold, a label of the game's screens as it reads; the rest as it is. */
export function RichText({ text }: { text: string }) {
  return <>{text.split("**").map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part))}</>;
}

/**
 * A link in the middle of a line: on a phone, its padding gives it a thumb's height without moving the lines around it
 * (the privacy document's way).
 */
export const INLINE_LINK = "text-foreground underline max-sm:py-3.5";
