import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CONTACT_EMAIL } from "@/src/config/contact";

export const metadata: Metadata = { title: "Confidentialité" };

/** The day this page last changed: to update with its content. */
const UPDATED_ON = { fr: "9 octobre 2026", en: "9 October 2026" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">{children}</div>
    </section>
  );
}

const Contact = () => (
  <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline">
    {CONTACT_EMAIL}
  </a>
);

/**
 * What the game does with players' data, exactly as it works today: the cookies it sets, the Google account it reads,
 * the game data, the visit days of /admin/stats, the purge (src/db/purge.ts), account deletion. Open to everyone,
 * outside the password (proxy.ts). Update it, and UPDATED_ON, whenever one of these changes.
 */
export default function PrivacyPage() {
  return (
    <main className="brand flex-1 bg-background text-foreground">
      <article lang="fr" className="mx-auto w-full max-w-2xl space-y-8 px-4 py-10">
        <header className="space-y-2">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            ← Late Winner
          </Link>
          <h1 className="font-heading text-3xl font-bold">Confidentialité · Late Winner</h1>
          <p className="text-sm text-muted-foreground">Mise à jour le {UPDATED_ON.fr}.</p>
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
              <strong>La date de ta dernière visite et la liste de tes jours de visite</strong>, pour mesurer combien de
              joueurs reviennent.
            </li>
            <li>
              Deux cookies de confort : la fermeture du bandeau qui invite à créer un compte (sept jours) et, si l&apos;accès
              au site est protégé par un mot de passe, la session correspondante.
            </li>
          </ul>
          <p>Aucun cookie tiers, aucune publicité, aucun suivi entre sites, aucune revente de données.</p>
        </Section>

        <Section title="Finalités">
          <p>
            Faire fonctionner le jeu et te permettre de retrouver tes parties, y compris sur un autre appareil avec ton
            compte Google ; mesurer l&apos;audience, strictement en interne.
          </p>
        </Section>

        <Section title="Durées de conservation">
          <p>
            Un joueur sans compte et inactif depuis 30 jours est supprimé avec ses parties ; un joueur sans compte qui
            n&apos;a plus aucune partie l&apos;est après 24 heures d&apos;inactivité. Un compte Google est conservé
            jusqu&apos;à ce que tu le supprimes.
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
            « Supprimer mon compte », sur l&apos;accueil une fois connecté, efface immédiatement ton compte et tes parties ;
            sans compte, supprimer ta partie suffit. Tu peux aussi écrire à <Contact />. En cas de désaccord, tu peux
            adresser une réclamation à la CNIL (cnil.fr).
          </p>
        </Section>

        <section lang="en" className="space-y-2 border-t pt-6">
          <h2 className="font-heading text-xl font-semibold">English summary</h2>
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>
              Late Winner is run by Alexis Da Cruz (<Contact />). It uses a technical cookie, lw_uid (a random id, one
              year), to link your saves to your browser; if you sign in with Google, your email address, name, profile
              picture and Google id, and a session cookie; your game data; and the date of your last visit and the days
              you visited, to measure how many players come back. No third-party cookie, no advertising, no cross-site
              tracking, no sale of data.
            </p>
            <p>
              Purposes: running the game and finding your saves again; internal audience measurement only. A player
              without an account is deleted with their saves after 30 days of inactivity (24 hours if they have no save
              left); an account is kept until you delete it. Hosting: Vercel (application) and Neon (database), with
              their contractual safeguards for transfers outside the European Union.
            </p>
            <p>
              You may access, correct, erase or object to your data: « Supprimer mon compte » on the home page deletes your
              account and saves at once, or write to us. You may lodge a complaint with the CNIL. Last updated{" "}
              {UPDATED_ON.en}.
            </p>
          </div>
        </section>
      </article>
    </main>
  );
}
