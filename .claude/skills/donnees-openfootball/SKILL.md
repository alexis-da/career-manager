---
name: donnees-openfootball
description: À utiliser pour importer, mettre à jour ou déboguer les données de base du jeu (clubs, compétitions, calendriers) issues d'OpenFootball, et pour générer les joueurs — identité dans le seed (graine fixe), attributs à la création d'une partie (Save.seed). Couvre le format des fichiers, la normalisation des noms, le classement de référence et les règles de licence.
---

# Données OpenFootball

## Source

[OpenFootball](https://github.com/openfootball) — données sous licence CC0 (domaine public). Pas de clé
d'API, pas de quota. Les fichiers sont téléchargés une fois et **commités dans le dépôt** sous
`prisma/seed/data/`, pour que le seed soit reproductible et fonctionne hors ligne.

Ne jamais appeler OpenFootball au runtime : c'est une source de seed, pas une API de production. Les
fichiers JSON eux-mêmes ne sont lus **que par le seed** : le jeu lit la base.

## Format des calendriers

`https://raw.githubusercontent.com/openfootball/football.json/master/<saison>/<code>.json`

Exemple : `2024-25/en.1.json`. Codes importés : `en.1`, `es.1`, `de.1`, `it.1`, `fr.1`
(`prisma/seed/competitions.ts`, avec des noms de compétition neutres — jamais le nom officiel sous licence).

```json
{
  "name": "English Premier League 2024/25",
  "matches": [
    {
      "round": "Matchday 1",
      "date": "2024-08-16",
      "time": "20:00",
      "team1": "Manchester United FC",
      "team2": "Fulham FC",
      "score": { "ht": [0, 0], "ft": [1, 0] }
    }
  ]
}
```

Points d'attention réels :

- `time` est parfois absent.
- `score` est absent **ou vide (`{}`)** pour un match non joué — c'est normal, le seed doit l'accepter.
  Dans les fichiers 2024-25 commités, la 38e journée de `es.1` et `it.1` n'a pas de score (10 matchs chacun).
- `status` apparaît sur quelques matchs (`"awarded"` : score sur tapis vert) ; le score `ft` fait foi.
- Les clubs n'ont **pas d'identifiant** : ils n'existent que comme chaîne dans `team1` / `team2`.
  C'est la chaîne qui fait la clé. Normaliser une fois (trim, espaces multiples, accents conservés) et
  construire un slug ASCII stable : `manchester-united-fc`, `borussia-monchengladbach`.
- Le même club peut être orthographié différemment d'une saison à l'autre. Maintenir une table
  d'alias dans `prisma/seed/aliases.ts` plutôt que de corriger les fichiers source.

## Métadonnées des clubs

Le dépôt `openfootball/clubs` fournit stade, ville et année de fondation, en texte structuré :

```
Arsenal FC, 1886, @ Emirates Stadium, London
  | Arsenal | FC Arsenal
```

C'est un enrichissement **optionnel** : le seed doit fonctionner sans, avec les seuls noms issus des
calendriers. Ne pas bloquer l'import parce qu'un club n'a pas de stade renseigné.

## Classement de référence 2024-25 — `Club.initialRank`

Le seed calcule le classement final de chaque compétition avec `computeStandings`
(`src/engine/standings.ts`) appliqué aux scores des calendriers (`extractScores` dans
`prisma/seed/openfootball.ts`), et l'enregistre dans `Club.initialRank` (1 = champion).

- Règles : 3/1/0 points, puis différence de buts, buts marqués, slug. Pas de confrontations directes ni
  de pénalités de points : c'est une approximation déterministe, pas le classement officiel.
- Les matchs sans score `ft` sont ignorés. Un club sans aucun match joué fait échouer le seed.
- La création de partie (`createSave`, `src/db/saves.ts`) lit `Club.initialRank`, **jamais les fichiers
  JSON** : niveau de club, budget, masse salariale et réputation en sont dérivés.

## Joueurs : identité dans le seed, attributs dans la partie

OpenFootball ne fournit ni effectifs ni notes. Tout est généré, en **deux temps séparés** qui ne
partagent pas la même graine.

### 1. Identité — table `Player`, créée par le seed

Le monde est le même pour toutes les parties : la graine est **fixe**, `WORLD_SEED = "world-2024-25"`
(`prisma/seed/players.ts`). Relancer le seed produit exactement les mêmes joueurs.

- Un flux aléatoire par club : `makeRng(`${WORLD_SEED}:squad:${club.slug}`)`. Ajouter ou renommer un
  club ne modifie pas l'effectif des autres.
- Effectif : `SQUAD_TEMPLATE` = 2 GK, 8 DF, 8 MF, 5 FW. L'identité stable d'un joueur est
  `(initialClubId, squadSlot)` (`@@unique`), `squadSlot` allant de 1 à 23 dans l'ordre du template.
  `initialClubId` est le club dans le monde 2024-25 ; le club courant d'une partie est porté par `PlayerSave`.
- Âge : 17 à 36 ans révolus au 1er juillet 2024 (`WORLD_REFERENCE_DATE`), distribution centrée sur 21–29.
- Nationalité : celle du pays du club à 70 % (`HOME_NATIONALITY_SHARE`), sinon tirée parmi les autres listes.
- Noms : `prisma/seed/data/names/<code>.json` = `{ nationality, firstNames, lastNames }`, validé par Zod
  (au moins 20 entrées, sans doublon). `nationality` porte **le même libellé que `Club.country`**
  (`"Angleterre"`, `"Brésil"`…). Ajouter une nationalité = ajouter un fichier.
- **Aucun attribut dans `Player`.**
- Écriture idempotente (`prisma/seed/seed.ts`) : une lecture des joueurs existants, `createMany` pour les
  absents, `update` seulement pour ceux qui diffèrent. Un second passage n'écrit aucun joueur.

Modifier la graine, une liste de noms ou le template change le monde : les joueurs sont mis à jour en
place (même `id`), donc **renommés dans toutes les parties existantes**. Le test à valeurs figées de
`players.test.ts` casse volontairement dans ce cas.

### 2. Attributs — table `PlayerSave`, créés à la création d'une partie

Les attributs dépendent de `Save.seed` : deux parties ont les mêmes joueurs mais pas les mêmes notes.
Le seed ne crée **aucun** `PlayerSave`.

- `generateAttributes(player, clubLevel, rng)` — `src/engine/generation.ts`, fonction pure. Entrée :
  `{ position, age }` (âge révolu à `Save.currentDate`, via `ageInYears` de `src/lib/dates.ts`). Sortie :
  `overall`, `potential`, `pace`, `shooting`, `passing`, `dribbling`, `defending`, `physical`,
  `goalkeeping`, tous entiers bornés à 1–99, `potential ≥ overall`.
- `clubLevel = clubLevelFromRank(club.initialRank, clubCount)` : 78 pour le champion, 60 pour le dernier,
  linéaire entre les deux, `clubCount` étant le nombre de clubs de la compétition.
- Graine d'un joueur : `makeRng(attributeRngSeed(save.seed, club.slug, player.squadSlot))`, où `club`
  est le club initial. **Jamais `Player.id`** : c'est un cuid, différent d'une base à l'autre, qui
  casserait le rejeu.
- Cohérence : profil d'attributs par poste, qualité modulée par l'âge (pic 26–29), marge de potentiel
  décroissante avec l'âge (nulle à partir de 29 ans). Toutes les constantes sont dans
  `src/engine/balance.ts`.

Aucun nom de joueur réel n'est importé : les noms sont combinés depuis des listes de prénoms et noms
courants. Quand une combinaison donnerait le nom d'un joueur célèbre, retirer le prénom ou le nom de sa
liste plutôt que de filtrer à la génération.

## Licence

Les données OpenFootball sont CC0 : utilisables et redistribuables librement. En revanche, ne jamais
ajouter au dépôt des données scrapées d'un site commercial, ni les noms ou notes de joueurs issus d'un
jeu sous licence.
