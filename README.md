[![CI](https://github.com/alexis-da/career-manager/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/alexis-da/career-manager/actions/workflows/ci.yml)
[![Weekly](https://github.com/alexis-da/career-manager/actions/workflows/weekly.yml/badge.svg)](https://github.com/alexis-da/career-manager/actions/workflows/weekly.yml)

Tests automatiques sur GitHub : voir « Tests automatiques (GitHub Actions) » plus bas.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Le jeu

Late Winner, « The football career game ». Une partie commence le 1er juillet 2026 avec l'un des 198 clubs de cinq
pays, en première ou en deuxième division (données OpenFootball 2024-25, CC0) :

- deux divisions par pays, montées et descentes directes à chaque fin de saison (3 en Angleterre, Espagne et Italie,
  2 en Allemagne et en France) ;
- toutes les compétitions finissent le même jour : les deuxièmes divisions à 22 ou 24 clubs jouent aussi le mardi ;
- « Prochain match » joue les dates où seules les autres compétitions jouent, puis le match du club, en direct ;
- une coupe nationale par pays, à élimination directe entre les clubs des deux divisions : tour préliminaire le
  23 septembre, finale le samedi après la dernière journée, prolongation et tirs au but joués en direct pour le club
  du joueur, primes par tour, page Coupe, trophée au palmarès et sur la carte de fin de saison ;
- les parties créées avant les deuxièmes divisions gardent les cinq premières divisions seules
  (`Save.worldVersion` 1) ;
- `npm run measure:balance` mesure le moteur : victoires par écart de force, effet isolé de chaque facteur, saisons d'une partie 2
- `npm run measure:divisions` mesure l'équilibrage des deux divisions sur six saisons (base locale seulement) ;
- un défi chaque semaine (`/challenge`) : le même club et le même monde pour tous, classement sur les 10 premières
  journées de championnat, 20 parties par semaine au plus, supprimées le mardi qui suit ;
- en français et en anglais : la langue choisie par le sélecteur « FR · EN » (cookie `lw_lang`), sinon celle que
  préfère le navigateur ; tout l'écran, carte de fin de saison et page de confidentialité comprises ;
- sur téléphone : aucun écran ne défile de côté (390 et 360 px), les actions de jeu dans une barre au pied de l'écran,
  des cibles d'au moins 44 px, des tableaux réduits ou en cartes, le glisser-déposer au doigt par un appui maintenu
  (`e2e/mobile.spec.ts`) ;
- pour un nouveau joueur : trois clubs suggérés à la création, une liste de trois premières actions qui se coche
  toute seule, quatre bulles d'aide fermables, rien de bloquant et tout mémorisé par partie
  (`e2e/onboarding.spec.ts`).

## Langues

Les textes sont des messages next-intl, un fichier par zone du jeu et par langue :
`src/i18n/messages/fr/<zone>.json` et `src/i18n/messages/en/<zone>.json`, assemblés par `src/i18n/messages/index.ts`.
Seule la page de confidentialité, un document, a ses deux versions en JSX
(`app/privacy/_components/privacy-document.tsx`). Ajouter une chaîne, les fichiers de zone et les règles d'écriture
(tutoiement, anglais britannique, « career ») : `CLAUDE.md`, règle « Langues ». `npx vitest run
src/i18n/messages.test.ts` vérifie que les deux langues ont les mêmes clés et les mêmes arguments.

## Déployer

1. Importer le dépôt dans Vercel (Node.js 24.x, réglé par `engines` dans `package.json`).
2. Créer les variables d'environnement du projet (voir `.env.example`) :
   - `DATABASE_URL` : connexion PostgreSQL *poolée*, utilisée par l'application ;
   - `DIRECT_URL` : connexion *directe* à la même base, utilisée par les migrations et le seed ;
   - `AUTH_SECRET` : signe le cookie anonyme `lw_uid` et la session Google (obligatoire) ;
   - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` : client OAuth Google (redirection `<site>/api/auth/callback/google`) ;
   - `ADMIN_EMAIL` : compte Google de l'administrateur (parties héritées, `/admin/stats`) ;
   - `MAINTENANCE_SECRET` : secret de `POST /api/maintenance/purge` et de `POST /api/maintenance/challenge` (sans lui,
     elles répondent 404) ;
   - `CLUB_NAMES` (facultatif) : `real` (par défaut) ou `fictional` pour afficher des noms de clubs neutres.
3. Déployer : `npm run build` génère le client Prisma, applique les migrations puis construit l'application.
4. Données de référence : la production a reçu les premières divisions par un seed initial, une fois ; tout ce qui
   s'ajoute depuis (deuxièmes divisions…) arrive par des migrations de données générées
   (`scripts/generate-reference-migration.ts`), appliquées à l'étape 3. Le seed ne tourne que sur les bases locales.
5. Les tests E2E ne tournent jamais au build : en local, ils écrivent dans la base de `DATABASE_URL_TEST` (`.env.test`).

Le poste local travaille sur un PostgreSQL local ; Neon (la production) n'est touché que par Vercel.

**Seule `main` est déployée ; une branche ne doit jamais atteindre Neon.** Les déploiements de prévisualisation sont
désactivés (Ignored Build Step du projet Vercel) et l'environnement Preview n'a aucune variable de base de données :
pousser une autre branche ne sert qu'à la sauvegarder sur GitHub.

## Développer en local

1. PostgreSQL 17 sur le port 5432 par défaut (utilisateur `postgres`). Le port dépend de l'installation (5434 si un
   autre PostgreSQL occupait 5432, voir `Get-Content postgresql.conf`) : celui des URL de l'étape 2.
2. `.env` (voir `.env.example`) : `DATABASE_URL` et `DIRECT_URL` sur `latewinner_dev` ; `.env.test` :
   `DATABASE_URL_TEST` sur `latewinner_test` et un `AUTH_SECRET` à lui. Un mot de passe à caractères spéciaux s'écrit
   encodé (`%40` pour `@`).
3. `npm run db:local:init` crée les deux bases (psql, idempotent ; `PSQL=<chemin>` si psql n'est pas dans le PATH).
4. Sur chacune : `npx prisma migrate deploy` puis `npm run db:seed` (pour la base de test :
   `DIRECT_URL=<URL de latewinner_test>` devant les deux commandes). Le client Prisma (`src/generated/prisma`, ignoré
   par git) est généré par `npm install` (`postinstall`) ; si le seed se plaint de `src/generated/prisma`, lancer
   `npx prisma generate`.
5. `npm run test`, `npm run test:slow` et `npm run test:e2e` écrivent dans `latewinner_test` ; `npm run dev` dans
   `latewinner_dev`.

Toute commande locale refuse une base qui n'est pas sur localhost ; `ALLOW_REMOTE_DB=1` lève ce garde-fou, à
n'utiliser que sciemment.

### Tests automatiques (GitHub Actions)

- `.github/workflows/ci.yml`, à chaque push sur `main` et à chaque pull request (une branche sans pull request n'est pas
  testée), en un seul job : types (`next typegen` puis `tsc`), lint, Vitest (`npm run test`), puis une sélection rapide
  des E2E (`npm run test:e2e:quick` : création d'une partie et sa première journée, un direct avec un événement, le
  marché, les pages publiques et le SEO, `/admin`). `main` avancée en avance rapide sur la tête d'une pull request
  verte n'est pas testée une seconde fois.
- `.github/workflows/weekly.yml`, le dimanche à 01:30 UTC et à la demande (Actions → Weekly → Run workflow) : toute la
  suite E2E (`npx playwright test`) et la suite lente (`npm run test:slow`). Une semaine sans nouveau commit sur `main`
  ne teste rien de plus.
- Chaque job a sa base PostgreSQL 17 jetable (un service du job, sur localhost), migrée depuis zéro puis remplie par le
  seed, sur un runner `ubuntu-24.04`. Les valeurs sont factices et écrites dans le workflow : aucun secret du dépôt
  n'est lu, et l'adresse de Neon n'existe nulle part dans GitHub.
- Le dépôt est privé : les minutes comptent sur le quota du compte, maintenance comprise (estimation dans `CLAUDE.md`,
  règle « Filet de sécurité »).
- En cas d'échec d'un E2E : le rapport Playwright et les captures sont gardés 7 jours (le passage → Artifacts).

Lire le résultat : l'onglet Actions du dépôt montre chaque passage avec une coche verte (réussi) ou une croix rouge
(échoué, cliquer pour voir le job et l'étape en cause) ; les badges en tête de ce README donnent l'état du dernier passage
sur `main`.

### Sauvegardes de la base

Instantané hebdomadaire programmé dans la console Neon, et restauration (d'abord sur une nouvelle branche, puis bascule
de la production) : `docs/restauration.md`.

### Maintenance (GitHub Actions)

`.github/workflows/maintenance.yml` appelle chaque jour à 04:17 UTC (et à la demande, onglet Actions) la purge des
utilisateurs anonymes, puis des parties de défi finies depuis plus de 24 h. `.github/workflows/challenge.yml` crée le
défi de la semaine chaque lundi à 05:00 UTC (et à la demande) ; sans lui, la première visite de `/challenge` le crée.
Secrets du dépôt (Settings > Secrets and variables > Actions) :

- `MAINTENANCE_URL` : `https://www.latewinner.app/api/maintenance/purge` ;
- `CHALLENGE_URL` : `https://www.latewinner.app/api/maintenance/challenge` ;
- `MAINTENANCE_SECRET` : la même valeur que sur Vercel, pour les deux workflows.

Chaque appel de la purge supprime au plus 25 utilisateurs et 10 parties de défi et renvoie `remaining` : le job rappelle
la route tant qu'il en reste, 20 appels au plus (le reste attend le lendemain). Il échoue si une réponse n'est pas 200.
`?dryRun=1` compte sans supprimer :
`curl -X POST -H "Authorization: Bearer $SECRET" "https://www.latewinner.app/api/maintenance/purge?dryRun=1"`. Le
workflow du défi essaie trois fois, à 30 s d'intervalle, et échoue si aucune réponse n'est 200 ; rappelé, il ne crée
rien de plus (`created: false`).

Règle des 14 jours de la purge (`?oneDay=1`) : un anonyme venu le seul jour de la création de sa carrière part après
14 jours sans visite au lieu de 30. Un lancement à la main du workflow choisit `purge` : `count` (un appel en
`?dryRun=1&oneDay=1`, rien supprimé, `byRule` dit ce que chaque règle supprimerait), `one-day` (la purge avec cette
règle) ou `daily` (comme chaque jour). Le passage quotidien ne l'applique que si la variable de dépôt `PURGE_ONE_DAY`
vaut `delete` (Settings > Secrets and variables > Actions > Variables) ; sinon il la compte seulement.

## Accès et comptes

- **Jouer en un clic** : un visiteur crée sa partie depuis l'accueil, sans compte ; il devient un utilisateur
  anonyme reconnu par le cookie `lw_uid`. La connexion Google rattache ses parties à son compte.
- **Limites** (`src/lib/limits.ts`) : une partie pour un anonyme, trois pour un compte Google, vérifiées à la
  création seulement (la fusion à la connexion peut dépasser trois).
- **Bandeau** : sur le tableau de bord d'un anonyme, après une journée jouée, une invitation à créer un compte ;
  la croix la masque sept jours (cookie `lw_banner_closed`).
- **Purge** (`src/db/purge.ts`) : anonymes non vus depuis 30 jours (avec leurs parties), anonymes venus le seul jour
  de leur création après 14 jours (règle des 14 jours, voir « Maintenance ») et anonymes sans partie non vus depuis
  24 h, par lots de 25. Jamais un compte Google. Seule suppression automatique d'utilisateurs.
- **Premiers pas** : ce qu'un joueur a vu d'une partie reste dans de petits cookies de confort (`lw_seen_…`,
  30 jours), sur les chemins de cette partie, jamais en base.
- **Mesure** : la table `UserDay` note chaque jour où un utilisateur vient ; `/admin/stats`, réservée à
  `ADMIN_EMAIL` (404 sinon), montre utilisateurs, parties, nouveaux utilisateurs et rétention J+1 et J+7 sur
  14 jours, les premiers pas des nouvelles parties (composition enregistrée, 1er match joué, 10 matchs joués) et la
  taille de la base.
