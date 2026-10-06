---
name: donnees-openfootball
description: À utiliser pour importer, mettre à jour ou déboguer les données de base du jeu (clubs, compétitions, calendriers) issues d'OpenFootball, et pour générer les joueurs — identité dans le seed (graine fixe), copie dans la partie, attributs à la création d'une partie (Save.seed), jeunes arrivant et joueurs quittant le monde. Couvre le format des fichiers, la normalisation des noms, le classement de référence et les règles de licence.
---

# Données OpenFootball

## Source

[OpenFootball](https://github.com/openfootball) — données sous licence CC0 (domaine public). Pas de clé
d'API, pas de quota. Les fichiers sont téléchargés une fois et **commités dans le dépôt** sous
`prisma/seed/data/`, pour que le seed soit reproductible et fonctionne hors ligne.

Ne jamais appeler OpenFootball au runtime : c'est une source de seed, pas une API de production. Les
fichiers de calendriers ne sont lus **que par le seed** : le jeu lit la base.

## Saison source et saison de jeu

Deux années, à ne pas confondre :

- **Saison source : 2024-25** (`SOURCE_SEASON_START_YEAR`, `prisma/seed/openfootball.ts`). Les fichiers OpenFootball
  commités sont ceux de 2024-25 et **restent la source** des clubs, des compétitions et du classement initial
  (`Club.initialRank`). Les graines du monde portent son nom (`world-2024-25`) : elles ne la suivent pas.
- **Saison de jeu : 2026-27** (`WORLD_START_YEAR`, `src/engine/world.ts`), **seul endroit qui fixe l'année du
  jeu**. En dérivent la date de départ d'une partie (`WORLD_START_DATE`, 1er juillet 2026), l'âge de référence du
  seed et du vivier, le premier samedi du calendrier (`firstMatchdayDate`) et les libellés « Saison 2026-27 »
  (`seasonLabel`). `src/engine/world-year.test.ts` refuse toute autre année littérale dans le code.

Changer `WORLD_START_YEAR` de N ans demande une migration qui décale `birthDate` de N ans sur `Player` **et**
`PlayerSave` (`+ interval 'N years'`) : les âges ne changent pas, et un seed relancé ensuite n'écrit aucun joueur.
Les parties créées avant deviennent incohérentes : elles se suppriment par l'application (cascade depuis `Save`),
jamais dans la migration.

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

## Classement de référence de la saison source (2024-25) — `Club.initialRank`

Le seed calcule le classement final de chaque compétition avec `computeStandings`
(`src/engine/standings.ts`) appliqué aux scores des calendriers (`extractScores` dans
`prisma/seed/openfootball.ts`), et l'enregistre dans `Club.initialRank` (1 = champion).

- Règles : 3/1/0 points, puis différence de buts, buts marqués, slug. Pas de confrontations directes ni
  de pénalités de points : c'est une approximation déterministe, pas le classement officiel.
- Les matchs sans score `ft` sont ignorés. Un club sans aucun match joué fait échouer le seed.
- La création de partie (`createSave`, `src/db/saves.ts`) lit `Club.initialRank`, **jamais les fichiers
  JSON** : niveau de club, budget, masse salariale et réputation en sont dérivés.

## Listes de noms

`src/engine/data/names/<code>.json` = `{ nationality, firstNames, lastNames }`, chargées par **import
statique** dans `src/engine/names.ts` (`NAME_BANK`) et validées par Zod au chargement (au moins 20 entrées,
sans doublon). Elles partent avec le code : le seed les utilise pour le monde, la présaison pour les jeunes.
`nationality` porte **le même libellé que `Club.country`** (`"Angleterre"`, `"Brésil"`…). Ajouter une
nationalité = ajouter un fichier **et** son import, dans l'ordre alphabétique des fichiers : l'ordre fait
partie des tirages.

Aucun nom de joueur réel n'est importé : les noms sont combinés depuis des listes de prénoms et noms
courants. Quand une combinaison donnerait le nom d'un joueur célèbre, retirer le prénom ou le nom de sa
liste plutôt que de filtrer à la génération.

## Joueurs du monde : identité dans le seed

Le monde est le même pour toutes les parties : la graine est **fixe**, `WORLD_SEED = "world-2024-25"`
(`prisma/seed/players.ts`). Relancer le seed produit exactement les mêmes joueurs dans `Player`.

- Un flux aléatoire par club : `makeRng(`${WORLD_SEED}:squad:${club.slug}`)`. Ajouter ou renommer un
  club ne modifie pas l'effectif des autres.
- Postes : enum `Position` à 12 valeurs (`src/engine/positions.ts`) — GK, RB, CB, LB, CDM, CM, CAM, RM, LM,
  RW, LW, ST ; libellés courts dans l'UI : G, DD, DC, DG, MDC, MC, MOC, MD, MG, AD, AG, BU
  (`app/saves/[id]/_lib/positions.ts`). `positionGroup(position)` → GK | DF | MF | FW donne la ligne, qui porte
  les couleurs, le groupement de l'effectif et les pondérations du moteur de match.
- Effectif : `SQUAD_ROLES` (`balance.ts`) = GK 2, RB 2, CB 4, LB 2, CDM 2, CM 3, CAM 2, RM/RW 2, LM/LW 2, ST 2 ;
  `SQUAD_TEMPLATE = squadTemplate(23)`, rôle après rôle, un rôle à deux postes les alternant (RM puis RW) :
  chaque club a donc un RM, un RW, un LM et un LW. **Aucun tirage pour le poste** : le flux d'identité ne change
  pas quand le gabarit change. L'identité stable d'un joueur du monde est `(initialClubId, squadSlot)`
  (`@@unique`), `squadSlot` allant de 1 à 23 dans l'ordre du template.
- Âge : 17 à 36 ans révolus au 1er juillet 2026 (`WORLD_REFERENCE_DATE` = `WORLD_START_DATE`), distribution
  centrée sur 21–29. La date est tirée par rapport au 1er juillet de la saison source, puis avancée d'autant d'années
  civiles (`addYears`, `src/lib/dates.ts` : le 29 février devient le 28, comme dans PostgreSQL) : changer
  l'année du jeu ne change ni les tirages ni les âges (empreinte épinglée dans `players.test.ts`).
- Nationalité : celle du pays du club à 70 % (`HOME_NATIONALITY_SHARE`), sinon tirée parmi les autres listes.
- Tirages d'identité partagés avec les jeunes : `src/engine/identity.ts` (`drawNameList`, `drawUniqueName`,
  `drawBirthDate`).
- **Aucun attribut dans `Player`.**
- Écriture idempotente (`prisma/seed/seed.ts`) : une lecture des joueurs existants, `createMany` pour les
  absents, `update` seulement pour ceux qui diffèrent. Un second passage n'écrit aucun joueur.

Modifier la graine, une liste de noms ou le template change le monde des **nouvelles** parties. Le test à
valeurs figées de `players.test.ts` casse volontairement dans ce cas.

## Vivier de joueurs libres

Le monde compte aussi 120 joueurs **sans club** au 1er juillet 2026 (`generateFreeAgentPool`,
`prisma/seed/players.ts`), pour qu'une partie neuve ait un marché de joueurs libres.

- `Player.initialClubId` null, `squadSlot` de 1 à 120. PostgreSQL ne compare pas les NULL dans
  `@@unique([initialClubId, squadSlot])` : c'est le seed qui garantit l'unicité du vivier (clé
  `free-agents#slot`, mise à jour par `updateMany`, faute de clé unique adressable).
- Flux fixe `world-2024-25:free-agents`, indépendant des effectifs. Postes dans les proportions du template
  (`FREE_AGENT_POOL_TEMPLATE = squadTemplate(120)`, plus forts restes : GK 11, RB 11, CB 21, LB 11, CDM 10,
  CM 16, CAM 10, RM/RW 10, LM/LW 10, ST 10), 24 à 34 ans, nationalité tirée parmi toutes les
  listes, noms distincts dans le vivier.
- À la création de partie : `PlayerSave` sans club ni contrat (`clubSaveId` et `contractUntil` null, salaire 0),
  clé `free-agents#slot` (`freeAgentPlayerKey`). Attributs par `generateFreeAgentAttributes`
  (`src/engine/free-agents.ts`), graine `attributeRngSeed(save.seed, "free-agents", slot)` : note cible de 50 à
  66, 10 % entre 67 et 70, **quelle que soit la graine de la partie**, puis profil du poste ramené à cette note
  (`shiftToOverall`, partagé avec les jeunes).
- La présaison de création ne les fait pas signer : chaque club IA a déjà 25 joueurs (`SQUAD_SIZE_MAX`) une fois
  ses jeunes arrivés, et `planSquad` ne signe au-delà que pour un gardien manquant.
- Ils suivent la règle commune de départ : sans libération enregistrée, la date de création de la partie
  (`WORLD_START_DATE`) vaut date de libération. Ceux encore libres à la présaison suivante (1er juillet 2027) quittent le monde, sauf
  note > 65.

## Création de partie : `PlayerSave` porte l'identité

`createSave` copie l'identité de chaque `Player` dans son `PlayerSave` : `firstName`, `lastName`,
`birthDate`, `nationality`, `position`, tous NOT NULL, plus `playerKey`. À partir de là, **le jeu ne lit
jamais `Player` pour connaître un joueur** : `PlayerSave.playerId` est optionnel et ne sert qu'à tracer
l'origine dans le monde du seed (null pour un jeune arrivé en cours de partie).

- `playerKey` (`@@unique([saveId, playerKey])`) est la clé stable du joueur dans la partie :
  `slug du club initial#squadSlot` pour un joueur du monde (`worldPlayerKey`), `youth:année:club:rang` pour
  un jeune. Elle sert aux graines (progression, match) et aux départages. **Jamais `PlayerSave.id` ni
  `Player.id`** : ce sont des cuid, différents d'une base à l'autre, qui casseraient le rejeu.
- Les attributs dépendent de `Save.seed` : deux parties ont les mêmes joueurs mais pas les mêmes notes. Le
  seed ne crée **aucun** `PlayerSave`.
- `generateAttributes(player, clubLevel, rng)` — `src/engine/generation.ts`, fonction pure. Entrée :
  `{ position, age }` (âge révolu à `Save.currentDate`, via `ageInYears` de `src/lib/dates.ts`). Sortie :
  `overall`, `potential`, `pace`, `shooting`, `passing`, `dribbling`, `defending`, `physical`,
  `goalkeeping`, tous entiers bornés à 1–99, `potential ≥ overall`.
- `clubLevel = clubLevelFromRank(club.initialRank, clubCount)` : 78 pour le champion, 60 pour le dernier,
  linéaire entre les deux, `clubCount` étant le nombre de clubs de la compétition.
- Graine d'un joueur du monde à la création : `makeRng(attributeRngSeed(save.seed, club.slug, squadSlot))`,
  attributs puis durée de contrat (1 à 5 saisons pondérées 10/25/30/25/10 %, au plus 2 après 33 ans).
- Cohérence : profil d'attributs par poste (`POSITION_PROFILES`) — DC défense + physique, latéraux vitesse +
  défense, MDC passe + défense, MC équilibré, MOC passe + dribble, milieux de côté vitesse + passe, ailiers
  vitesse + dribble, BU tir + vitesse — et note `overall` pondérée propre au poste (`OVERALL_WEIGHTS`, chaque
  ligne somme à 1) : un joueur est mieux noté à son poste qu'à celui d'une autre ligne. Qualité modulée par
  l'âge (pic 26–29), marge de potentiel décroissante avec l'âge (nulle à partir de 29 ans). Toutes les
  constantes sont dans `src/engine/balance.ts`.
- Changer un profil ou une pondération change les notes des **nouvelles** parties, pas le monde du seed
  (aucun attribut dans `Player`).

## Arrivées et départs du monde

Sans renouvellement, les retraites (~80 par saison) videraient les effectifs. La présaison
(`runPreseason`, `src/db/preseason.ts`, à la création de partie puis à chaque `advanceToNextSeason`)
fait entrer et sortir des joueurs :

- **Jeunes** (`src/engine/youth.ts`) : 2 par club, club dirigé compris, à chaque présaison. 16 à 18 ans au
  1er juillet, note 45 à 60 selon la réputation du club, potentiel note + 15 à 30, nationalité du pays du
  club à 85 %, noms depuis `NAME_BANK`, contrat de 3 saisons. Si le club a moins de 2 gardiens, son
  premier jeune est un gardien ; sinon le rôle de `SQUAD_ROLES` le plus en dessous de son effectif cible
  (égalité : les rôles les plus nombreux d'abord, gardiens en dernier), au poste le moins pourvu du rôle. Graine
  `youthRngSeed(save.seed, startYear, club.slug, rang)`, clé `youth:startYear:club.slug:rang`. Pas
  d'entraînement ni d'écran : c'est une arrivée, sans `Transfer`.
- **Départs** : un joueur libre toujours sans club à la présaison qui suit sa libération quitte le monde
  (`Transfer` RETIREMENT), sauf s'il a plus de 65 de note (`FREE_AGENT_STAY_MIN_OVERALL`). Pour le vivier
  initial, jamais libéré, la date de création de la partie vaut date de libération. Les retraites
  liées à l'âge restent tirées en fin de saison (`willRetire`, `src/engine/progression.ts`).
- Une présaison ne s'exécute qu'une fois par saison : si des jeunes de l'année existent déjà, elle ne fait
  rien.

## Visages des joueurs

Aucune image stockée ni bibliothèque : le visage est dessiné en SVG inline (`src/components/player-face.tsx`) à
partir de `faceParams(playerKey, age)` (`src/engine/face.ts`, pur) : carnation (6), coiffure (12 dont chauve),
couleur de cheveux (6 dont gris), pilosité (4 dont aucune), yeux (3), sourcils (3), forme du visage (3), puis,
ajoutés en fin de séquence : ligne de front (3), nez (3), bouche (3), mâchoire (3), couleur des yeux (3),
épaisseur des sourcils (2), et les traits rares — lunettes 4 %, bandeau 3 %, cicatrice de sourcil 2 %
(`balance.ts`). Chaque carnation et chaque couleur de cheveux a une seconde teinte plate (ombre du cou, mèche) :
du relief sans dégradé.

- Graine `face:${playerKey}` — **ni `Save.seed` ni un id** : un joueur a le même visage dans toutes les parties
  et toutes les saisons. Rien n'est écrit en base ; un jeune a sa clé, donc son visage, dès son arrivée.
- **La carnation est tirée uniformément depuis la graine, indépendamment de la nationalité.** Ne jamais la
  dériver de `nationality` ni du pays du club : ce serait un stéréotype, et la nationalité d'un joueur ne dit
  rien de son apparence.
- L'âge ne change que les cheveux et les rides : gris possible au-delà de 33 ans, calvitie de plus en plus
  probable, deux fines rides aux coins des yeux possibles au-delà de 30 ans (`GRAY_HAIR_CHANCE_BY_AGE`,
  `BALD_CHANCE_BY_AGE`, `WRINKLES_CHANCE_BY_AGE`, `balance.ts`). Chaque joueur tire une seule fois sa place sur
  ces courbes croissantes : il peut grisonner, se dégarnir ou se rider en vieillissant, jamais l'inverse.
- L'ordre des tirages de `faceParams` fait partie du visage : ne pas le réordonner, **ajouter les tirages à la
  fin**, et faire chaque tirage quel que soit son résultat pour ne pas décaler les suivants. Une nouvelle
  variante d'un paramètre existant se tire aussi à la fin : les 4 coiffures ajoutées (bouclés, afro court, longs
  attachés, rasé avec dégradé) remplacent la première coiffure tirée avec une probabilité 4/11. Un test épingle
  les tirages de la première séquence pour 5 clés ; le snapshot de `player-face.test.tsx` casse volontairement
  si le dessin change.
- Col du maillot aux couleurs du club actuel (`Club.primaryColor` / `secondaryColor`), gris pour un joueur libre.

## Licence

Les données OpenFootball sont CC0 : utilisables et redistribuables librement. En revanche, ne jamais
ajouter au dépôt des données scrapées d'un site commercial, ni les noms ou notes de joueurs issus d'un
jeu sous licence.
