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

## Déployer

1. Importer le dépôt dans Vercel (Node.js 24.x, réglé par `engines` dans `package.json`).
2. Créer les variables d'environnement du projet (voir `.env.example`) :
   - `DATABASE_URL` : connexion PostgreSQL *poolée*, utilisée par l'application ;
   - `DIRECT_URL` : connexion *directe* à la même base, utilisée par les migrations et le seed ;
   - `AUTH_SECRET` : signe le cookie anonyme `lw_uid` et la session Google (obligatoire) ;
   - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` : client OAuth Google (redirection `<site>/api/auth/callback/google`) ;
   - `ADMIN_EMAIL` : compte Google de l'administrateur (parties héritées, `/admin/stats`) ;
   - `MAINTENANCE_SECRET` : secret de `POST /api/maintenance/purge` (sans lui, la route répond 404) ;
   - `APP_PASSWORD` (facultatif) : mode « fermé », tout le site demande ce mot de passe ; absente, le jeu est ouvert ;
   - `CLUB_NAMES` (facultatif) : `real` (par défaut) ou `fictional` pour afficher des noms de clubs neutres.
3. Déployer : `npm run build` génère le client Prisma, applique les migrations puis construit l'application.
4. Première fois seulement, remplir la base depuis un poste local : `DIRECT_URL=… npm run db:seed`.
5. Les tests E2E ne tournent jamais au build : en local, ils écrivent dans la base de `DATABASE_URL_TEST` (`.env.test`).

Le poste local travaille sur la branche Neon test ; la branche production n'est touchée que par Vercel.

### Maintenance (GitHub Actions)

`.github/workflows/maintenance.yml` appelle chaque jour à 04:17 UTC (et à la demande, onglet Actions) la purge des
utilisateurs anonymes. Secrets du dépôt (Settings > Secrets and variables > Actions) :

- `MAINTENANCE_URL` : `https://www.latewinner.app/api/maintenance/purge` ;
- `MAINTENANCE_SECRET` : la même valeur que sur Vercel.

Chaque appel purge au plus 25 utilisateurs et renvoie `remaining` : le job rappelle la route tant qu'il en
reste, 20 appels au plus (le reste attend le lendemain). Il échoue si une réponse n'est pas 200. `?dryRun=1` compte sans supprimer :
`curl -X POST -H "Authorization: Bearer $SECRET" "https://www.latewinner.app/api/maintenance/purge?dryRun=1"`.

## Accès et comptes

- **Jouer en un clic** : un visiteur crée sa partie depuis l'accueil, sans compte ; il devient un utilisateur
  anonyme reconnu par le cookie `lw_uid`. La connexion Google rattache ses parties à son compte.
- **Limites** (`src/lib/limits.ts`) : une partie pour un anonyme, trois pour un compte Google, vérifiées à la
  création seulement (la fusion à la connexion peut dépasser trois).
- **Bandeau** : sur le tableau de bord d'un anonyme, après une journée jouée, une invitation à créer un compte ;
  la croix la masque sept jours (cookie `lw_banner_closed`).
- **Purge** (`src/db/purge.ts`) : anonymes non vus depuis 30 jours (avec leurs parties) et anonymes sans partie
  non vus depuis 24 h, par lots de 25. Jamais un compte Google. Seule suppression automatique d'utilisateurs.
- **Mesure** : la table `UserDay` note chaque jour où un utilisateur vient ; `/admin/stats`, réservée à
  `ADMIN_EMAIL` (404 sinon), montre utilisateurs, parties, nouveaux utilisateurs et rétention J+1 et J+7 sur
  14 jours, et la taille de la base.
