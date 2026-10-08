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
npm run test:slow      # tests longs en base : saisons complètes (Vitest)
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

**Toute requête est scopée par le propriétaire de la partie, puis par `saveId`.** Une requête Prisma sur une
table de partie sans `saveId` dans le `where` est un bug : elle mélangerait deux parties du même utilisateur.
La propriété (une partie appartient à un compte) arrive avec le chantier comptes : d'ici là, le `saveId` reste
le seul filtre, et toute nouvelle fonction d'accès doit pouvoir recevoir le propriétaire sans être réécrite.

**Pas de marques sous licence.** Aucune mention de FIFA, EA, ou des noms de compétitions officiels sous
licence dans le code, l'UI ou le README. Les données viennent d'OpenFootball (CC0).

## Marque et règles produit

**Nom.** Le jeu s'appelle **Late Winner**. Le nom interne du dépôt (`career-manager`) ne change pas.
Adresse canonique : https://www.latewinner.app.

**Communication sortante.** Titres de page, descriptions, images de partage et cartes partageables ne
contiennent aucun nom de club, ni « FIFA », ni « EA FC », ni le nom d'un jeu concurrent.

**Noms de clubs.** Le nom affiché d'un club passe toujours par une fonction unique de résolution (à créer) ;
aucun composant ne lit `Club.name` pour l'afficher directement. Jamais de logo ni d'écusson.

**Hébergement.** Aucun service propre à Vercel (Blob, KV, Cron, Analytics) : le jeu doit rester déplaçable
chez un autre hébergeur.

**Budget base de données.** Le plan gratuit Neon donne, par mois, 100 CU-h de calcul, 1 Go de stockage et
5 Go de transfert, **partagés par la production et la branche de test**. Limiter le volume des tests lourds
(`npm run test:slow`, saisons complètes, E2E) : ne les lancer que quand le changement le justifie.

## Conventions

- Code, noms de variables et commentaires en **anglais**. Textes d'interface en **français**.
- Server Components par défaut ; `"use client"` seulement pour un composant réellement interactif.
- Mutations via Server Actions, jamais de route API pour un usage interne.
- Validation des entrées avec Zod à la frontière (Server Action, parsing de fichier importé).
- Pas de `any`. Pas de `!` non-null sans commentaire justifiant.
- Un commit = un changement cohérent, message en français à l'impératif.

## Structure

```
app/                  # routes App Router, à la racine ; UI en français
  _components/        # composants de la page d'accueil (liste et création de parties)
  saves/[id]/         # une partie : tableau de bord, effectif, composition, calendrier, classement, transferts
                      # actions.ts (Server Actions) à côté des pages qui les utilisent
e2e/                  # tests Playwright (npm run test:e2e)
src/
  components/ui/      # composants shadcn/ui (Base UI), générés par la CLI
  engine/             # simulation pure : match, progression, transferts, IA des clubs, jeunes
    data/names/       # listes de noms, importées statiquement
  db/                 # accès Prisma, toujours scopé par saveId ; *.slow.test.ts via npm run test:slow
  lib/                # utilitaires partagés (rng, dates, couleurs, formatage)
  generated/prisma/   # client Prisma généré, ignoré par git
prisma/
  schema.prisma
  migrations/
  seed/               # import OpenFootball, couleurs des clubs, génération du monde
    data/             # calendriers OpenFootball et club-colors.json
```

## Ordre de construction

1. Seed OpenFootball (clubs, compétitions, calendriers) → voir la skill `donnees-openfootball`
2. Génération des attributs joueurs (déterministe, à partir de la graine)
3. Création de partie
4. Moteur de match → voir la skill `moteur-de-match`
5. Boucle de saison (journées, classement, fin de saison)
6. Transferts et contrats
7. UI

Ne pas commencer une étape tant que la précédente n'a pas de test qui passe.
