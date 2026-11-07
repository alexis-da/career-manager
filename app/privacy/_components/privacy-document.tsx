import type { ReactNode } from "react";
import { CONTACT_EMAIL } from "@/src/config/contact";
import type { Locale } from "@/src/i18n/locale";
import { formatDate } from "@/src/lib/format";

/** The day this page last changed, the same in both versions: to update with their content. */
const UPDATED_ON = new Date(Date.UTC(2026, 10, 7));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-xl">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">{children}</div>
    </section>
  );
}

/** In the middle of a line: on a phone, its padding gives it a thumb's height without moving the lines around it. */
const Contact = () => (
  <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline max-sm:py-3.5">
    {CONTACT_EMAIL}
  </a>
);

/** The French version, and its English summary at the end. */
function FrenchPrivacy() {
  return (
    <article lang="fr" className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl">Confidentialité · Late Winner</h1>
        <p className="text-sm text-muted-foreground">Mise à jour le {formatDate(UPDATED_ON, "fr")}.</p>
      </header>

      <Section title="Responsable">
        <p>
          Late Winner est édité par Alexis Da Cruz, joignable à <Contact />.
        </p>
      </Section>

      <Section title="Données traitées">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Un cookie technique, lw_uid</strong> : un identifiant aléatoire, valable un an, qui rattache tes parties
            à ton navigateur quand tu joues sans compte.
          </li>
          <li>
            <strong>Si tu te connectes avec Google</strong> : ton adresse e-mail, ton nom, ta photo de profil (son adresse)
            et ton identifiant Google, ainsi qu&apos;un cookie de session pour rester connecté.
          </li>
          <li>
            <strong>Les données de jeu</strong> : tes parties, tes choix et leurs résultats.
          </li>
          <li>
            <strong>Si tu joues le défi de la semaine</strong> : ton score de la semaine. Connecté avec Google, ton
            prénom (le premier mot du nom de ton compte Google) apparaît avec ce score dans le classement public du
            défi, visible de tous ; sans compte, ton score n&apos;y apparaît pas.
          </li>
          <li>
            <strong>La date de ta dernière visite et la liste de tes jours de visite</strong>, pour mesurer combien de
            joueurs reviennent.
          </li>
          <li>
            Des cookies de confort : la langue que tu choisis, lw_lang (un an), la fermeture du bandeau qui invite à
            créer un compte (sept jours) et ce que tu as déjà vu des premiers pas d&apos;une partie, lw_seen_… (trente
            jours, envoyés pour cette partie seulement).
          </li>
        </ul>
        <p>Aucun cookie tiers, aucune publicité, aucun suivi entre sites, aucune revente de données.</p>
      </Section>

      <Section title="Finalités">
        <p>
          Faire fonctionner le jeu et te permettre de retrouver tes parties, y compris sur un autre appareil avec ton
          compte Google ; afficher le classement du défi de la semaine ; mesurer l&apos;audience, strictement en
          interne.
        </p>
      </Section>

      <Section title="Durées de conservation">
        <p>
          Un joueur sans compte et inactif depuis 30 jours est supprimé avec ses parties ; un joueur sans compte qui
          n&apos;a plus aucune partie l&apos;est après 24 heures d&apos;inactivité. Un compte Google est conservé
          jusqu&apos;à ce que tu le supprimes.
        </p>
        <p>
          Une partie du défi de la semaine est supprimée 24 heures après la fin de sa semaine, le mardi, avec ou sans
          compte. Ton entrée au classement (ton score, et ton prénom si tu es connecté) est conservée, pour les
          classements des semaines passées, aussi longtemps que ton compte, ou que ton profil sans compte.
        </p>
      </Section>

      <Section title="Hébergement">
        <p>
          L&apos;application est hébergée par Vercel et la base de données par Neon. Ces prestataires peuvent traiter
          des données hors de l&apos;Union européenne, avec leurs garanties contractuelles pour ces transferts.
        </p>
      </Section>

      <Section title="Tes droits">
        <p>
          Tu disposes d&apos;un droit d&apos;accès, de rectification, d&apos;effacement et d&apos;opposition. Le bouton
          « Supprimer mon compte », sur l&apos;accueil une fois connecté, efface immédiatement ton compte, tes parties et
          tes entrées au classement du défi ; sans compte, supprimer ta partie suffit (une entrée au classement du
          défi, elle, part avec ton profil, après 30 jours sans visite). Tu peux aussi écrire à <Contact />. En cas de désaccord, tu peux
          adresser une réclamation à la CNIL (cnil.fr).
        </p>
      </Section>

      <section lang="en" className="space-y-2 border-t pt-6">
        <h2 className="font-heading text-xl">English summary</h2>
        <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            Late Winner is run by Alexis Da Cruz (<Contact />). It uses a technical cookie, lw_uid (a random id, one
            year), to link your saves to your browser; if you sign in with Google, your email address, name, profile
            picture and Google id, and a session cookie; your game data; and the date of your last visit and the days
            you visited, to measure how many players come back. If you play the weekly challenge, your score; signed in
            with Google, your first name (the first word of your Google account&apos;s name) is shown with it in the
            challenge&apos;s public ranking, to everyone. Comfort cookies keep the language you choose (lw_lang, one
            year), the closing of the banner inviting you to sign in (seven days) and what you have seen of a
            career&apos;s first steps (lw_seen_…, thirty days). No third-party cookie, no advertising, no cross-site
            tracking, no sale of data.
          </p>
          <p>
            Purposes: running the game and finding your saves again; showing the weekly challenge&apos;s ranking; internal
            audience measurement only. A player without an account is deleted with their saves after 30 days of
            inactivity (24 hours if they have no save left); an account is kept until you delete it. A weekly
            challenge save is deleted 24 hours after its week ends, with or without an account; its ranking entry is
            kept as long as your account or your profile without one. Hosting: Vercel (application) and Neon
            (database), with their contractual safeguards for transfers outside the European Union.
          </p>
          <p>
            You may access, correct, erase or object to your data: “Delete my account” on the home page deletes your
            account and saves at once, or write to us. You may lodge a complaint with the CNIL. Last updated{" "}
            {formatDate(UPDATED_ON, "en")}.
          </p>
        </div>
      </section>
    </article>
  );
}

/** The English version, in full: what the French one says. */
function EnglishPrivacy() {
  return (
    <article lang="en" className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl">Privacy · Late Winner</h1>
        <p className="text-sm text-muted-foreground">Last updated {formatDate(UPDATED_ON, "en")}.</p>
      </header>

      <Section title="Controller">
        <p>
          Late Winner is published by Alexis Da Cruz, who can be reached at <Contact />.
        </p>
      </Section>

      <Section title="Data processed">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>A technical cookie, lw_uid</strong>: a random identifier, valid for one year, that links your careers
            to your browser when you play without an account.
          </li>
          <li>
            <strong>If you sign in with Google</strong>: your email address, your name, your profile picture (its address)
            and your Google identifier, as well as a session cookie to keep you signed in.
          </li>
          <li>
            <strong>Game data</strong>: your careers, your choices and their results.
          </li>
          <li>
            <strong>If you play the weekly challenge</strong>: your score for the week. Signed in with Google, your first
            name (the first word of your Google account&apos;s name) appears with this score in the challenge&apos;s public
            ranking, visible to everyone; without an account, your score does not appear there.
          </li>
          <li>
            <strong>The date of your last visit and the list of the days you visited</strong>, to measure how many
            players come back.
          </li>
          <li>
            Comfort cookies: the language you choose, lw_lang (one year), the closing of the banner inviting you to create
            an account (seven days) and what you have already seen of a career&apos;s first steps, lw_seen_… (thirty
            days, sent for that career only).
          </li>
        </ul>
        <p>No third-party cookies, no advertising, no cross-site tracking, no sale of data.</p>
      </Section>

      <Section title="Purposes">
        <p>
          Running the game and letting you find your careers again, including on another device with your Google
          account; showing the weekly challenge&apos;s ranking; measuring the audience, strictly internally.
        </p>
      </Section>

      <Section title="Retention periods">
        <p>
          A player without an account who has been inactive for 30 days is deleted along with their careers; a player
          without an account who no longer has any career is deleted after 24 hours of inactivity. A Google account is
          kept until you delete it.
        </p>
        <p>
          A weekly challenge career is deleted 24 hours after its week ends, on the Tuesday, with or without an account.
          Your ranking entry (your score, and your first name if you are signed in) is kept, for the rankings of past
          weeks, as long as your account, or your profile without an account.
        </p>
      </Section>

      <Section title="Hosting">
        <p>
          The application is hosted by Vercel and the database by Neon. These providers may process data outside the
          European Union, with their contractual safeguards for these transfers.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You have the right to access, rectify, erase and object to your data. The “Delete my account” button, on the
          home page once signed in, immediately deletes your account, your careers and your entries in the challenge
          rankings; without an account, deleting your career is enough (a challenge ranking entry goes with your
          profile, after 30 days without a visit). You can also write to <Contact />. If you disagree, you can lodge a
          complaint with the CNIL (cnil.fr), the French data protection authority.
        </p>
      </Section>
    </article>
  );
}

/**
 * What the game does with players' data, exactly as it works today: the cookies it sets, the Google account it reads,
 * the game data, the weekly challenge's public ranking (first names) and its saves' deletion, the visit days of
 * /admin/stats, the purge (src/db/purge.ts), account deletion. In the player's language: the French version, or the
 * English one in full. Update both, and UPDATED_ON, whenever one of these changes.
 */
export function PrivacyDocument({ locale }: { locale: Locale }) {
  return locale === "fr" ? <FrenchPrivacy /> : <EnglishPrivacy />;
}
