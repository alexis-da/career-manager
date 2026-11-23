import type { ReactNode } from "react";
import { CONTACT_EMAIL } from "@/src/config/contact";
import type { Locale } from "@/src/i18n/locale";
import { formatDate } from "@/src/lib/format";

/** The day this page last changed, the same in both versions: to update with their content. */
const UPDATED_ON = new Date(Date.UTC(2026, 10, 23));

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
            <strong>Si tu demandes un lien de reprise</strong> (dans le navigateur d&apos;une appli comme Instagram, pour
            retrouver tes parties dans ton navigateur) : une empreinte du lien, jamais le lien lui-même, avec ses dates de
            création, d&apos;expiration (sept jours) et d&apos;utilisation. Le lien ne sert qu&apos;une fois ; ces lignes
            sont supprimées avec ton profil de joueur.
          </li>
          <li>
            <strong>Si tu te connectes avec Google</strong> : ton adresse e-mail, ton nom, ta photo de profil (son adresse)
            et ton identifiant Google, ainsi qu&apos;un cookie de session pour rester connecté.
          </li>
          <li>
            <strong>Les données de jeu</strong> : tes parties, tes choix et leurs résultats, dont tes achats en boutique
            dans chaque carrière ; avec ton profil de joueur, tes missions du jour (les trois missions de chaque jour,
            leur avancement, le moment où tu les as accomplies, une mission changée), ta série de jours d&apos;affilée et
            ton protège-série, tes jetons et leur journal (chaque gain et chaque dépense), ta collection de titres,
            badges et cadres avec ceux que tu portes, le nombre de tes matchs joués et gagnés en direct, et le tutoriel de
            ta première carrière (les étapes que l&apos;adjoint t&apos;a montrées, quand, et ce que tu en as fait :
            faite, passée ; le tutoriel passé ou repris).
          </li>
          <li>
            <strong>Si tu joues le défi de la semaine</strong> : ton score de la semaine. Connecté avec Google, ton
            prénom (le premier mot du nom de ton compte Google), et le titre de manager que tu portes si tu en as
            choisi un, apparaissent avec ce score dans le classement public du défi, visible de tous ; sans compte, ton
            score n&apos;y apparaît pas.
          </li>
          <li>
            <strong>Un cookie de mesure d&apos;audience, lw_src</strong> : à ta première visite, d&apos;où tu viens (le nom
            de campagne du lien, comme ?ref=…, sinon le domaine du site qui t&apos;envoie, jamais l&apos;adresse de sa
            page, sinon « direct ») et la page où tu arrives, pendant 30 jours. Les robots n&apos;en reçoivent pas.
          </li>
          <li>
            <strong>À la création de ton profil de joueur</strong> (ta première partie sans compte, ou ta connexion avec
            Google) : cette origine et cette page, ta langue et ton type d&apos;appareil (téléphone ou ordinateur, déduit
            de ton navigateur, dont rien d&apos;autre n&apos;est gardé) ; puis les dates de tes premiers pas : ta
            première carrière, ton premier match, ton premier match joué en direct, ta première saison terminée.
          </li>
          <li>
            <strong>La date de ta dernière visite et la liste de tes jours de visite</strong>, pour mesurer combien de
            joueurs reviennent.
          </li>
          <li>
            <strong>Des compteurs de visites</strong> : le nombre de premières visites par jour, par origine et par page
            d&apos;arrivée, et le nombre de lancements de l&apos;appli installée par jour, de simples totaux sans aucune
            donnée personnelle.
          </li>
          <li>
            <strong>Les erreurs du jeu</strong> : quand une page du jeu rencontre une erreur, sur le serveur ou dans ton
            navigateur, la page concernée (sans ses identifiants) et le message de l&apos;erreur, nettoyé de toute adresse
            e-mail et de tout identifiant, sont comptés par jour, sans rien qui te désigne. Pour limiter ces envois,
            l&apos;adresse IP de ton navigateur est gardée une minute en mémoire, jamais enregistrée.
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
          compte Google ; repérer et corriger ses erreurs ; afficher le classement du défi de la semaine ; mesurer
          l&apos;audience, strictement en
          interne : d&apos;où viennent les joueurs, combien créent une carrière, jouent un match, terminent une saison et
          reviennent.
        </p>
      </Section>

      <Section title="Durées de conservation">
        <p>
          Un joueur sans compte qui n&apos;est venu que le jour où il a créé sa carrière, une carrière jamais reprise, est
          supprimé avec ses parties après 14 jours sans visite ; un joueur sans compte revenu au moins un autre jour
          l&apos;est après 30 jours sans visite ; un joueur sans compte qui n&apos;a plus aucune partie l&apos;est après
          24 heures d&apos;inactivité. Un compte Google est conservé jusqu&apos;à ce que tu le supprimes.
        </p>
        <p>
          Le cookie lw_src expire au bout de 30 jours. L&apos;origine, la langue, l&apos;appareil et les dates de tes
          premiers pas restent avec ton profil de joueur et partent avec lui. Les compteurs de visites, de simples
          totaux, sont gardés sans limite de durée. Les erreurs comptées sont supprimées au bout de 30 jours.
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
          défi, elle, part avec ton profil, après 14 ou 30 jours sans visite). Tu peux aussi écrire à <Contact />. En cas de désaccord, tu peux
          adresser une réclamation à la CNIL (cnil.fr).
        </p>
      </Section>

      <section lang="en" className="space-y-2 border-t pt-6">
        <h2 className="font-heading text-xl">English summary</h2>
        <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            Late Winner is run by Alexis Da Cruz (<Contact />). It uses a technical cookie, lw_uid (a random id, one
            year), to link your saves to your browser, and the fingerprint of any resume link you ask for (seven days,
            used once); if you sign in with Google, your email address, name, profile
            picture and Google id, and a session cookie; your game data, your daily missions, your streak, your tokens and their history, your purchases, your collection and your first career&apos;s tutorial among them; and the date of your last visit and the days
            you visited, to measure how many players come back. A first-party audience cookie, lw_src (30 days), keeps
            where your first visit came from (a link&apos;s campaign such as ?ref=…, else the referring site&apos;s
            domain, never its address, else “direct”) and the page you landed on; when your player profile is created,
            that origin, your language and your device type (phone or computer) are kept with it, then the dates of
            your first career, first match, first match played live and first finished season. First visits are also counted by day, origin and
            landing page, and launches of the installed app by day, as plain totals without personal data. If you play the weekly challenge, your score; signed in
            with Google, your first name (the first word of your Google account&apos;s name), and the manager title you
            wear if you chose one, are shown with it in the challenge&apos;s public ranking, to everyone. Comfort cookies keep the language you choose (lw_lang, one
            year), the closing of the banner inviting you to sign in (seven days) and what you have seen of a
            career&apos;s first steps (lw_seen_…, thirty days). Errors the game meets, on the server or in your browser,
            are counted by day with the page (without its identifiers) and a cleaned message, nothing that points to
            you, and deleted after 30 days; your IP address is held in memory for a minute to limit them, never
            recorded. No third-party cookie, no advertising, no cross-site tracking, no sale of data.
          </p>
          <p>
            Purposes: running the game and finding your saves again; showing the weekly challenge&apos;s ranking; internal
            audience measurement only (where players come from, how many create a career, play a match, finish a season
            and come back). A player without an account is deleted with their saves after 14 days without a visit if
            they only came on the day they created their career, after 30 days otherwise (24 hours if they have no save
            left); an account is kept until you delete it. The lw_src cookie expires after 30
            days; the audience details go with your player profile; the visit totals are kept without limit. A weekly
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
            <strong>If you ask for a resume link</strong> (in an app&apos;s browser such as Instagram&apos;s, to find your
            careers in your own browser): a fingerprint of the link, never the link itself, with the dates it was created,
            expires (seven days) and was used. The link works only once; these rows are deleted with your player profile.
          </li>
          <li>
            <strong>If you sign in with Google</strong>: your email address, your name, your profile picture (its address)
            and your Google identifier, as well as a session cookie to keep you signed in.
          </li>
          <li>
            <strong>Game data</strong>: your careers, your choices and their results, your shop purchases in each career
            among them; with your player profile, your daily missions (each day&apos;s three missions, their progress,
            when you completed them, a mission changed), your streak of days in a row and your streak shield, your
            tokens and their history (each gain and each spending), your collection of titles, badges and frames with
            those you wear, how many matches you played and won live, and your first career&apos;s tutorial (the steps
            your assistant showed you, when, and what you did with them: done, skipped; the tutorial skipped or taken up
            again).
          </li>
          <li>
            <strong>If you play the weekly challenge</strong>: your score for the week. Signed in with Google, your first
            name (the first word of your Google account&apos;s name), and the manager title you wear if you chose one,
            appear with this score in the challenge&apos;s public ranking, visible to everyone; without an account, your
            score does not appear there.
          </li>
          <li>
            <strong>An audience measurement cookie, lw_src</strong>: on your first visit, where you came from (the
            campaign name of the link, such as ?ref=…, else the domain of the site that sent you, never the address of
            its page, else “direct”) and the page you landed on, for 30 days. Crawlers do not get it.
          </li>
          <li>
            <strong>When your player profile is created</strong> (your first career without an account, or signing in
            with Google): that origin and that page, your language and your device type (phone or computer, worked out
            from your browser, of which nothing else is kept); then the dates of your first steps: your first career,
            your first match, your first match played live, your first finished season.
          </li>
          <li>
            <strong>The date of your last visit and the list of the days you visited</strong>, to measure how many
            players come back.
          </li>
          <li>
            <strong>Visit counters</strong>: the number of first visits by day, by origin and by landing page, and the
            number of launches of the installed app by day, plain totals without any personal data.
          </li>
          <li>
            <strong>The game&apos;s errors</strong>: when a page of the game meets an error, on the server or in your
            browser, the page concerned (without its identifiers) and the error&apos;s message, cleaned of any email address
            and identifier, are counted by day, with nothing that points to you. To limit how many are sent, your
            browser&apos;s IP address is held in memory for a minute, never recorded.
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
          account; spotting and fixing its errors; showing the weekly challenge&apos;s ranking; measuring the audience,
          strictly internally: where
          players come from, how many create a career, play a match, finish a season and come back.
        </p>
      </Section>

      <Section title="Retention periods">
        <p>
          A player without an account who only came on the day they created their career, a career never resumed, is
          deleted along with their careers after 14 days without a visit; one who came back on at least one other day,
          after 30 days without a visit; a player without an account who no longer has any career is deleted after 24
          hours of inactivity. A Google account is kept until you delete it.
        </p>
        <p>
          The lw_src cookie expires after 30 days. The origin, language, device and dates of your first steps stay with
          your player profile and go with it. The visit counters, plain totals, are kept without a time limit. The
          counted errors are deleted after 30 days.
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
          profile, after 14 or 30 days without a visit). You can also write to <Contact />. If you disagree, you can lodge a
          complaint with the CNIL (cnil.fr), the French data protection authority.
        </p>
      </Section>
    </article>
  );
}

/**
 * What the game does with players' data, exactly as it works today: the cookies it sets, the Google account it reads,
 * the game data, the weekly challenge's public ranking (first names) and its saves' deletion, the visit days of
 * /admin/stats, the arrival of a player (lw_src, src/lib/arrival.ts) and their first steps (src/db/activation.ts), the
 * visit counters (VisitDay), the game's errors (src/db/errors.ts), the purge (src/db/purge.ts), account deletion. In the player's language: the French version, or the
 * English one in full. Update both, and UPDATED_ON, whenever one of these changes.
 */
export function PrivacyDocument({ locale }: { locale: Locale }) {
  return locale === "fr" ? <FrenchPrivacy /> : <EnglishPrivacy />;
}
