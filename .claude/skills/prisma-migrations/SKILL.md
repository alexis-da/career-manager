---
name: prisma-migrations
description: À utiliser pour toute modification du schéma Prisma, création de migration, ou écriture de requêtes d'accès aux données. Couvre le scoping par saveId, les conventions de nommage et la procédure de migration.
---

# Schéma et migrations Prisma

## Séparation monde / partie

Deux familles de tables, à ne jamais confondre :

- **Référence** — `Competition`, `Club`, `Player`. Viennent du seed OpenFootball, identiques pour toutes
  les parties, jamais modifiées par le jeu.
- **Partie** — `Save`, `ClubSave`, `PlayerSave`, `Fixture`, `Transfer`, `PlayerSeasonStats`. Portent
  toujours un `saveId` et représentent l'état évolutif d'une carrière.

Un attribut qui change au cours d'une carrière (valeur marchande, moral, note) appartient à une table
`*Save`, jamais à la table de référence.

## Règle de requête

Toute requête sur une table de partie inclut `saveId` dans le `where`, même quand un autre filtre semble
déjà suffisant. Concentrer les accès dans `src/db/`, avec une fonction par intention métier
(`getSquad(saveId, clubId)`), plutôt que des appels Prisma dispersés dans les composants.

## Procédure de modification

Avant toute migration ou seed depuis le poste local, afficher l'hôte de DIRECT_URL et vérifier qu'il contient
sparkling-darkness (branche test), jamais damp-rain (production).

```bash
# 1. modifier prisma/schema.prisma
npx prisma migrate dev --name description_courte   # crée la migration + régénère le client
npx prisma studio                                   # vérifier visuellement
npm run test                                        # les tests doivent passer
```

Ne jamais éditer un fichier de migration déjà appliqué. Ne jamais utiliser `prisma db push` sur ce projet :
l'historique des migrations doit rester complet pour pouvoir redéployer proprement.

## Renommage de colonne

Sur un renommage de colonne, Prisma génère DROP + ADD et perd les données. Toujours relire le SQL généré
et le réécrire en RENAME COLUMN. Vérifier ensuite avec migrate diff.

Renommer aussi la clé étrangère et l'index, pour qu'ils portent les noms que Prisma attend :

```sql
ALTER TABLE "Player" RENAME COLUMN "clubId" TO "initialClubId";
ALTER TABLE "Player" RENAME CONSTRAINT "Player_clubId_fkey" TO "Player_initialClubId_fkey";
ALTER INDEX "Player_clubId_squadSlot_key" RENAME TO "Player_initialClubId_squadSlot_key";
```

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
# attendu : « No difference detected », code de sortie 0
```

## Conventions

- Modèles en `PascalCase` singulier, champs en `camelCase`.
- Clés primaires : `id String @id @default(cuid())`.
- Index explicite sur chaque colonne servant de filtre fréquent, `saveId` en tête.
- Les suppressions en cascade partent de `Save` : supprimer une sauvegarde efface toute la partie.
  Partout ailleurs, `onDelete: Restrict` — une suppression silencieuse de données de jeu est un bug.
- Au-dessus de `Save`, `User` : `Save.ownerId` est en `Cascade` vers `User`, supprimer un utilisateur supprime ses
  parties. Seuls la purge, la fusion à la connexion Google, la suppression volontaire d'un compte et les tests
  suppriment un `User` (CLAUDE.md).
- `Save.ownerId` NULL = partie **héritée** (créée avant les propriétaires) : visible de personne, rattachée au
  compte administrateur à sa connexion Google. Une nouvelle partie a toujours un propriétaire.
- Aucun code ne supprime un PlayerSave, un ClubSave ou une Season directement.
  La seule suppression autorisée est celle d'un Save (ou de son User), qui cascade.
- Exception : une table de partie qui référence `PlayerSave` (`MatchEvent`, `Transfer`) est en `Cascade`
  vers `PlayerSave`. PostgreSQL exécute chaque étape de la cascade depuis `Save` comme une instruction
  interne et vérifie `Restrict` **et même `NoAction`** à la fin de chacune : dès la suppression des
  `PlayerSave`, avant que les événements soient atteints par `Fixture`. `NoAction` ne suffit donc pas à
  rendre une partie jouée supprimable (essayé et refusé sur la partie de démonstration).
- Toute nouvelle relation entre deux tables de partie se valide en supprimant une partie **jouée** : le
  test en base de `src/db/season.slow.test.ts` (`npm run test:slow`) le fait, et `migrate diff` ne détecte
  rien de ce côté.
- Les montants (valeurs, salaires, budgets) sont des `Int` en euros. Jamais de flottant sur de l'argent.

## Palmarès et reconstruction paresseuse

`SeasonResult` (une ligne par saison terminée du club dirigé, `@@unique([saveId, seasonId])`) est écrite par
`advanceToNextSeason` (`recordSeasonResult`, `src/db/season-results.ts`), dans sa transaction, avant que les joueurs
progressent, partent ou prennent leur retraite. Les saisons terminées avant cette table n'ont pas de ligne : la lecture
(`getSeasonResults`, `getSeasonResult`) les **reconstruit une fois** et les insère (`createMany` avec
`skipDuplicates`, deux requêtes simultanées n'en écrivent qu'une), puis ne les recalcule plus jamais.

La reconstruction n'utilise que des données qui ne changent pas après la saison : `Fixture` (classement final),
`PlayerSeasonStats` (note de saison, `seasonRating`, calculée des seules stats) et `Transfer` : le club d'un joueur à
la fin de la saison est celui que quitte son premier transfert daté après le 30 juin (`clubAtDate`,
`src/engine/season-result.ts`), son club actuel sans transfert ultérieur. Tout changement de club doit donc rester
enregistré dans `Transfer`. Seule approximation : `formation` est le dispositif actuel du club, pas celui de la saison.
Un joueur arrivé en cours de saison d'un autre club de la même compétition compte ses stats des deux clubs (la table
de stats n'a pas de club), à la reconstruction comme à l'écriture.

Modifier `seasonRating`, `bestPlayerOf` ou la règle de reconstruction ne réécrit pas les lignes existantes : c'est
voulu, un palmarès ne bouge pas.
