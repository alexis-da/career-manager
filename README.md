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
   - `APP_PASSWORD` : mot de passe d'accès au site (sans lui, le site est ouvert à tous).
3. Déployer : `npm run build` génère le client Prisma, applique les migrations puis construit l'application.
4. Première fois seulement, remplir la base depuis un poste local : `DIRECT_URL=… npm run db:seed`.
5. Les tests E2E ne tournent jamais au build : en local, ils écrivent dans la base de `DATABASE_URL_TEST` (`.env.test`).

Le poste local travaille sur la branche Neon test ; la branche production n'est touchée que par Vercel.
