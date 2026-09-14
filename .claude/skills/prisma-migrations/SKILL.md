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

```bash
# 1. modifier prisma/schema.prisma
npx prisma migrate dev --name description_courte   # crée la migration + régénère le client
npx prisma studio                                   # vérifier visuellement
npm run test                                        # les tests doivent passer
```

Ne jamais éditer un fichier de migration déjà appliqué. Ne jamais utiliser `prisma db push` sur ce projet :
l'historique des migrations doit rester complet pour pouvoir redéployer proprement.

## Conventions

- Modèles en `PascalCase` singulier, champs en `camelCase`.
- Clés primaires : `id String @id @default(cuid())`.
- Index explicite sur chaque colonne servant de filtre fréquent, `saveId` en tête.
- Les suppressions en cascade sont limitées à `Save` : supprimer une sauvegarde efface toute la partie.
  Partout ailleurs, `onDelete: Restrict` — une suppression silencieuse de données de jeu est un bug.
- Les montants (valeurs, salaires, budgets) sont des `Int` en euros. Jamais de flottant sur de l'argent.
