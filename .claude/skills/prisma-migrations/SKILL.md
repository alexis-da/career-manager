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

À part, le **défi de la semaine** (CLAUDE.md) : `Challenge`, une ligne par semaine, écrite une fois et jamais supprimée
(Restrict depuis `Save.challengeId` et `ChallengeEntry`) ; `ChallengeEntry`, une par utilisateur et par semaine, qui
survit à sa partie (`saveId` en SetNull) et part avec son utilisateur (Cascade). Les tests suppriment leurs semaines par
`deleteTestChallenges` (`src/db/test-support.ts`), sur des années lointaines qui ne croisent pas les vraies semaines.

## Règle de requête

Toute requête sur une table de partie inclut `saveId` dans le `where`, même quand un autre filtre semble
déjà suffisant. Concentrer les accès dans `src/db/`, avec une fonction par intention métier
(`getSquad(saveId, clubId)`), plutôt que des appels Prisma dispersés dans les composants.

## Procédure de modification

Avant toute migration ou seed depuis le poste local, l'hôte de DIRECT_URL doit être **localhost** (latewinner_dev, ou
latewinner_test avec DIRECT_URL en préfixe) : `prisma.config.ts`, le seed et le client le refusent sinon
(`assertLocalDatabase`, `src/db/database-url.ts`), sauf ALLOW_REMOTE_DB=1. Neon (damp-rain, production) n'est atteint
que par Vercel ; la branche Neon de test (sparkling-darkness) n'existe plus pour nous.

```bash
# 1. modifier prisma/schema.prisma
npx prisma migrate dev --name description_courte   # crée et applique la migration, sans régénérer le client
npx prisma generate                                 # puis régénère le client (src/generated/prisma)
npx prisma studio                                   # vérifier visuellement
npm run test                                        # les tests doivent passer
```

Après `migrate dev`, lancer `npx prisma generate` : depuis Prisma 7, la migration ne régénère plus le client, et le
code ne voit pas encore les nouvelles tables (`prisma.challenge` indéfini, tests en échec). Le `postinstall` ne le fait
qu'à l'installation.

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
- Toute clé étrangère vers une table d'où le jeu supprime (partie, club, joueur, saison, match de partie, utilisateur) a
  un index qui commence par ses colonnes : PostgreSQL applique une cascade, ou vérifie un Restrict, une ligne supprimée
  à la fois, et sans cet index chaque requête parcourt toute la table, les autres parties comprises (une partie à deux
  divisions se supprimait en 30 s, 0,4 s depuis `…_save_deletion_indexes`). Un index dont la clé n'est que la deuxième
  colonne, comme `(saveId, clubSaveId)`, ne sert pas. `src/db/foreign-key-indexes.test.ts` le vérifie sur le catalogue.
- Les suppressions en cascade partent de `Save` : supprimer une sauvegarde efface toute la partie.
  Partout ailleurs, `onDelete: Restrict` — une suppression silencieuse de données de jeu est un bug.
- Au-dessus de `Save`, `User` : `Save.ownerId` est en `Cascade` vers `User`, supprimer un utilisateur supprime ses
  parties. Seuls la purge, la fusion à la connexion Google, la suppression volontaire d'un compte et les tests
  suppriment un `User` (CLAUDE.md).
- `Save.ownerId` NULL = partie **héritée** (créée avant les propriétaires) : visible de personne, rattachée au
  compte administrateur à sa connexion Google. Une nouvelle partie a toujours un propriétaire.
- Aucun code ne supprime un PlayerSave, un ClubSave ou une Season directement.
  La seule suppression autorisée est celle d'un Save (ou de son User), qui cascade. Deux tâches de maintenance, décidées
  par l'utilisateur, suppriment en plus des lignes que plus aucun écran ne lit : le nettoyage (`MatchEvent`,
  `MatchDecision`, `src/db/event-cleanup.ts`) et l'archivage (`Fixture` et `PlayerSeasonStats` d'une saison terminée,
  une fois gardés et vérifiés dans `SeasonArchive`, `src/db/season-archiving.ts`) ; aucune autre.
- Exception : une table de partie qui référence `PlayerSave` (`MatchEvent`, `Transfer`) est en `Cascade`
  vers `PlayerSave`. PostgreSQL exécute chaque étape de la cascade depuis `Save` comme une instruction
  interne et vérifie `Restrict` **et même `NoAction`** à la fin de chacune : dès la suppression des
  `PlayerSave`, avant que les événements soient atteints par `Fixture`. `NoAction` ne suffit donc pas à
  rendre une partie jouée supprimable (essayé et refusé sur la partie de démonstration).
- Toute nouvelle relation entre deux tables de partie se valide en supprimant une partie **jouée** : le
  test en base de `src/db/season.slow.test.ts` (`npm run test:slow`) le fait, et `migrate diff` ne détecte
  rien de ce côté.
- Les montants (valeurs, salaires, budgets) sont des `Int` en euros. Jamais de flottant sur de l'argent.

## Migrations de données de référence

Le poste local ne touche jamais la production : `Competition`, `Club` et `Player` y arrivent par des migrations,
appliquées par `prisma migrate deploy` au déploiement, jamais par `npm run db:seed` (qui ne tourne que sur
les bases locales). Une telle migration est **générée**, jamais écrite à la main :

```bash
npx tsx scripts/generate-reference-migration.ts prisma/migrations/<horodatage>_second_divisions
npx tsx scripts/generate-reference-migration.ts prisma/migrations/<horodatage>_national_cups
```

- `prisma/seed/reference-sql.ts` transforme une partie du plan du seed (`buildWorldPlan`) en SQL idempotent : chaque
  ligne est insérée sur sa clé naturelle (`Competition.code`, `Club.slug`, `Player (initialClubId, squadSlot)`, le club
  et la compétition retrouvés par sous-requête sur leur clé) avec `ON CONFLICT DO NOTHING`, et un id
  `gen_random_uuid()::text` (les ids diffèrent d'une base à l'autre, comme les cuid du seed ; aucune graine n'en dépend).
- `reference-sql.test.ts` compare la migration commitée à la sortie du générateur : changer une liste de noms ou un
  gabarit le fait échouer, et rappelle que la production a déjà ces lignes (la migration est appliquée, on ne l'édite
  pas ; une correction est une nouvelle migration).
- Vérifier avant de commiter, sur une base locale, dans une transaction annulée : supprimer les lignes concernées,
  appliquer le SQL (tout est inséré, identique au plan), le rejouer (rien n'est inséré). Puis `migrate deploy`, et
  `npm run db:seed` doit annoncer `0 created, 0 updated`.
- Le générateur choisit le contenu d'après le suffixe du dossier ; une nouvelle donnée de référence y ajoute le sien.
- Première : `20261023120000_second_divisions` (5 compétitions, 102 clubs, 2 346 joueurs, environ 220 Ko). Deuxième :
  `20261024124148_national_cups` (les 5 coupes, `kind = CUP`, niveau 0, depuis `CUPS`, `prisma/seed/competitions.ts`),
  après la migration de schéma `20261024124147_national_cup` qui crée `Competition.kind`. Troisième :
  `20261117180001_european_competitions` (les 2 compétitions européennes, `kind = EUROPE`, niveau 0, depuis
  `EUROPEAN_COMPETITIONS`), après `20261117180000_european_competitions_schema` qui ajoute la valeur d'enum : une valeur
  ajoutée par `ALTER TYPE … ADD VALUE` ne peut servir que dans une migration suivante.

## Compétition d'un club et monde d'une partie

- `ClubSave.competitionId` (NOT NULL, Restrict, index `(saveId, competitionId)`) : la compétition **actuelle** du club
  dans la partie, initialisée depuis `Club.competitionId` par `createSave` ; montées et descentes la changeront. Le jeu
  ne lit `Club.competitionId` nulle part ailleurs. Une saison passée prend ses clubs dans ses `Fixture` (classement
  `getStandings`, palmarès `computeSeasonResult`), jamais dans `ClubSave.competitionId`.
- `Save.worldVersion` (sans défaut en base, la migration a rempli 1 puis retiré le défaut) : 1 = premières divisions,
  2 = premières et deuxièmes, le monde par défaut (`DEFAULT_WORLD_VERSION`) de toute nouvelle partie. `createSave` lit les compétitions, clubs et joueurs des niveaux de son monde
  (`worldTiers`) et refuse un club hors de ce monde. Les grandes tables (`PlayerSave`, `Fixture`) s'écrivent par lots de
  1 000 lignes ; la page d'accueil, qui crée les parties, a `maxDuration = 60`.
- Un test qui crée un `Save` directement, ou appelle `createSave` sans avoir besoin de deuxième division, donne
  explicitement `worldVersion: 1` : deux fois moins de lignes, des tests plus rapides.
- `Season.movements` (Json, nullable) : sur une saison terminée d'une partie 2, la liste des clubs qui quittent sa
  compétition `{ clubId, from, to, reason: "PROMOTED" | "RELEGATED", rank }` (codes de compétition, `Club.id`), validée
  par `seasonMovementsSchema` (`src/db/promotion.ts`) à la lecture ; liste vide sans mouvement, null dans une partie 1,
  pour une saison en cours ou terminée avant la migration `promotion_relegation`. `SeasonResult.promoted` et
  `relegated` (défaut false) sont écrits par `recordSeasonResult` ; une ligne reconstruite paresseusement les laisse
  à false (la reconstruction ne relit pas les mouvements).

## Palmarès et reconstruction paresseuse

`SeasonResult` (une ligne par saison terminée du club dirigé, `@@unique([saveId, seasonId])`) est écrite par
`advanceToNextSeason` (`recordSeasonResult`, `src/db/season-results.ts`), dans sa transaction, avant que les joueurs
progressent, partent ou prennent leur retraite. Les saisons terminées avant cette table n'ont pas de ligne : la lecture
(`getSeasonResults`, `getSeasonResult`) les **reconstruit une fois** et les insère (`createMany` avec
`skipDuplicates`, deux requêtes simultanées n'en écrivent qu'une), puis ne les recalcule plus jamais.

La reconstruction n'utilise que des données qui ne changent pas après la saison : `Fixture` (classement final),
`PlayerSeasonStats` (note de saison, `seasonRating`, calculée des seules stats), ou leur archive une fois la saison
archivée (`SeasonArchive`, CLAUDE.md « Archives des saisons terminées », que la tâche d'archivage fait précéder de la
reconstruction), et `Transfer` : le club d'un joueur à
la fin de la saison est celui que quitte son premier transfert daté après le 30 juin (`clubAtDate`,
`src/engine/season-result.ts`), son club actuel sans transfert ultérieur. Tout changement de club doit donc rester
enregistré dans `Transfer`. Seule approximation : `formation` est le dispositif actuel du club, pas celui de la saison.
Un joueur arrivé en cours de saison d'un autre club de la même compétition compte ses stats des deux clubs (la table
de stats n'a pas de club), à la reconstruction comme à l'écriture.

Modifier `seasonRating`, `bestPlayerOf` ou la règle de reconstruction ne réécrit pas les lignes existantes : c'est
voulu, un palmarès ne bouge pas.
