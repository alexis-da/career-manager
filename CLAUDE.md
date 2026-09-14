# Career Manager

Jeu de gestion de carrière football en web. Projet personnel solo, développé avec Claude Code.

## Stack

- Next.js (App Router) + TypeScript strict
- Prisma 7 + PostgreSQL
- Tailwind CSS
- Vitest (unitaire) · Playwright (E2E)
- Déploiement visé : Vercel

## Commandes

```bash
npm run dev            # serveur de dev
npm run build          # build de production
npx prisma migrate dev # créer + appliquer une migration
npx prisma studio      # inspecter la base
npm run test           # tests unitaires (Vitest)
npm run test:e2e       # tests Playwright
```

## Règles non négociables

**Déterminisme.** Une sauvegarde rejouée avec la même graine doit produire exactement la même saison.
Aucun appel à `Math.random()`, `Date.now()` ou `new Date()` dans le code de simulation : la graine vient
de `Save.seed`, la date courante vient de `Save.currentDate`. Toute violation est un bug, pas un détail.

**Le moteur est pur.** Les fonctions de `src/engine/` ne lisent ni n'écrivent la base. Elles prennent un
état en entrée et retournent un résultat. La persistance se fait dans la couche appelante. C'est ce qui
rend le moteur testable et rejouable.

**Données du monde vs état de partie.** Les tables de référence (`Club`, `Player`, `Competition`) viennent
d'OpenFootball et ne changent jamais pendant une partie. Tout ce qui évolue est suffixé `Save`
(`PlayerSave`, `ClubSave`) et porte un `saveId`. Ne jamais muter une table de référence depuis le jeu.

**Toute requête est scopée par `saveId`.** Une requête Prisma sur une table de partie sans `saveId` dans
le `where` est un bug : elle mélangerait deux parties du même utilisateur.

**Pas de marques sous licence.** Aucune mention de FIFA, EA, ou des noms de compétitions officiels sous
licence dans le code, l'UI ou le README. Les données viennent d'OpenFootball (CC0).

## Conventions

- Code, noms de variables et commentaires en **anglais**. Textes d'interface en **français**.
- Server Components par défaut ; `"use client"` seulement pour un composant réellement interactif.
- Mutations via Server Actions, jamais de route API pour un usage interne.
- Validation des entrées avec Zod à la frontière (Server Action, parsing de fichier importé).
- Pas de `any`. Pas de `!` non-null sans commentaire justifiant.
- Un commit = un changement cohérent, message en français à l'impératif.

## Structure

```
src/
  app/            # routes App Router, UI en français
  engine/         # simulation pure : match, progression, transferts, IA des clubs
  db/             # accès Prisma, toujours scopé par saveId
  lib/            # utilitaires partagés (rng, dates, formatage)
prisma/
  schema.prisma
  seed/           # import OpenFootball + génération des attributs
```

## Ordre de construction

1. Seed OpenFootball (clubs, compétitions, calendriers) → voir la skill `donnees-openfootball`
2. Génération des attributs joueurs (déterministe, à partir de la graine)
3. Moteur de match → voir la skill `moteur-de-match`
4. Boucle de saison (journées, classement, fin de saison)
5. Transferts et contrats
6. UI

Ne pas commencer une étape tant que la précédente n'a pas de test qui passe.
