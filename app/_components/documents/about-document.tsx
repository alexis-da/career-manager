import Link from "@/src/components/link";
import { CONTACT_EMAIL } from "@/src/config/contact";
import type { Locale } from "@/src/i18n/locale";
import { publicPath } from "@/src/i18n/public-pages";
import { DocumentArticle, DocumentSection, INLINE_LINK } from "./document";

// « À propos » / « About » (app/about, app/fr/a-propos): who makes the game, why, how it is made, how to reach its maker.
// A draft to have validated before it goes live: no surname, no school.

const Contact = () => (
  <a href={`mailto:${CONTACT_EMAIL}`} className={INLINE_LINK}>
    {CONTACT_EMAIL}
  </a>
);

function FrenchAbout() {
  return (
    <DocumentArticle
      lang="fr"
      title="À propos de Late Winner"
      lead="Late Winner est un jeu de carrière de football gratuit, qui se joue dans le navigateur, en français et en anglais."
    >
      <DocumentSection id="projet" title="Un projet en solo">
        <p>
          Je développe Late Winner seul. Je suis étudiant en développement web, en France, et ce jeu est mon projet
          personnel : je le conçois, je le code et je le fais évoluer avec ce que j&apos;apprends et ce que les joueurs me
          disent.
        </p>
      </DocumentSection>
      <DocumentSection id="pourquoi" title="Pourquoi ce jeu">
        <p>
          Je voulais un jeu de carrière de football qu&apos;on lance en un clic, sans rien installer ni créer de compte, et
          qui se joue aussi bien sur un téléphone que sur un ordinateur. Un jeu où le match n&apos;est pas qu&apos;un
          résultat : on le suit en direct, et on y prend des décisions qui comptent.
        </p>
      </DocumentSection>
      <DocumentSection id="fabrication" title="Comment il est fait">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Les clubs et leurs calendriers viennent d&apos;OpenFootball, des données ouvertes ; les joueurs sont inventés
            par le jeu.
          </li>
          <li>Aucune licence officielle : les compétitions s&apos;appellent Division 1, Division 2 et Coupe.</li>
          <li>
            Le jeu est gratuit, sans publicité, et ne revend aucune donnée : la page{" "}
            <Link href={publicPath("privacy", "fr")} className={INLINE_LINK}>
              Confidentialité
            </Link>{" "}
            dit ce qu&apos;il garde.
          </li>
        </ul>
      </DocumentSection>
      <DocumentSection id="contact" title="Me contacter">
        <p>
          Une idée, un bug, une question : écris-moi à <Contact />.
        </p>
      </DocumentSection>
    </DocumentArticle>
  );
}

function EnglishAbout() {
  return (
    <DocumentArticle
      lang="en"
      title="About Late Winner"
      lead="Late Winner is a free football career game you play in your browser, in English and French."
    >
      <DocumentSection id="project" title="A one-person project">
        <p>
          I build Late Winner on my own. I&apos;m a web development student in France, and this game is my personal
          project: I design it, code it and keep improving it with what I learn and what players tell me.
        </p>
      </DocumentSection>
      <DocumentSection id="why" title="Why this game">
        <p>
          I wanted a football career game you can start in one click, with nothing to install and no account to create,
          that plays as well on a phone as on a computer. A game where a match is more than a score: you follow it live and
          make decisions that count.
        </p>
      </DocumentSection>
      <DocumentSection id="making" title="How it is made">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Clubs and their fixtures come from OpenFootball, an open dataset; the players are made up by the game.</li>
          <li>No official licence: the competitions are called Division 1, Division 2 and Cup.</li>
          <li>
            The game is free, has no advertising and sells no data: the{" "}
            <Link href={publicPath("privacy", "en")} className={INLINE_LINK}>
              Privacy
            </Link>{" "}
            page says what it keeps.
          </li>
        </ul>
      </DocumentSection>
      <DocumentSection id="contact" title="Get in touch">
        <p>
          An idea, a bug, a question: write to me at <Contact />.
        </p>
      </DocumentSection>
    </DocumentArticle>
  );
}

export function AboutDocument({ locale }: { locale: Locale }) {
  return locale === "fr" ? <FrenchAbout /> : <EnglishAbout />;
}
