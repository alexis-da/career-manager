# Compétitions européennes : deux coupes, une phase de ligue puis l'élimination directe

Cahier rédigé le 17/11/2026, **validé le 17/11** avec les décisions de validation ci-dessous, qui l'emportent sur le
reste du texte. Il s'appuie sur le code du 17/11 : calendrier (`matchdayDates`, `src/engine/schedule.ts` ; `cupDates`,
`src/engine/cup.ts`), fatigue (`src/engine/fitness.ts`, `balance.ts`), économie (`clubFinances`,
`src/engine/economy.ts`), coût mesuré par le chantier « cpu » (`docs/design/simulation-legere.md`) et poids mesuré par
le chantier « archives » (règle « Archives des saisons terminées » de `CLAUDE.md`).

Dans ce cahier, **E1** est la compétition des meilleurs clubs, la **Coupe des Lauriers** (« Laurel Cup »), et **E2**
celle des suivants, la **Coupe des Fanions** (« Pennant Cup ») : jamais « C1 » ni « C3 », surnoms des compétitions
officielles. Leurs codes sont `eu.1` et `eu.2`, comme `en.1`.

## Décisions de validation (17/11)

1. **Noms** : paire A, Coupe des Lauriers / Laurel Cup (E1) et Coupe des Fanions / Pennant Cup (E2). Les deux cadres de
   la collection nommés « Lauriers » changent de libellé, « Couronne » et « Couronne d'or » (« Wreath », « Golden
   wreath »), leurs identifiants (`frame-laurels`, `frame-gold-laurels`) inchangés : rien ne bouge chez ceux qui les
   possèdent.
2. **E2 à 15 clubs** (§ 1).
3. **Matchs secs** (§ 1.3).
4. **Place de la coupe en saison 1 au 7e** (§ 2).
5. **Aucune compétition européenne dans une partie de défi**, à aucune saison (§ 7) : mise en ligne n'importe quel jour.
6. **Bonus de réputation** de +1 à +3 sur la cible (§ 4.2).
7. **Primes et objectif européen** aux valeurs du § 4.
8. **Suspension après 3 jaunes en Europe** (§ 8).
9. **Finales le samedi 29 mai** (§ 3.1).
10. **Rotation du club dirigé à la main**, avec une alerte « À faire » quand des titulaires sont sous le seuil de
    condition avant un match européen (§ 3.3).

## Décisions d'Alexis (17/11)

- Deux compétitions : une pour les meilleurs clubs (environ les 4 premiers de chaque pays), une pour les suivants
  (environ 5e-6e et vainqueur de la coupe nationale).
- Format : phase de ligue (chaque club affronte plusieurs adversaires différents, classement unique) puis élimination
  directe.
- Dès la première saison : qualifiés de la saison 1 tirés du classement réel de la saison précédente (données
  OpenFootball) ou, à défaut, du rang de réputation.
- Noms neutres inventés, sans ressemblance avec les marques officielles, vérifiés.

Ce qui ne change pas : le déterminisme (`Save.seed`, `Save.currentDate`), le moteur pur, les migrations d'ajout
uniquement, la saison en cours des parties existantes, les parties 1, le moteur de match (prolongation et tirs au but
existent déjà pour la coupe).

## En bref

|                      | E1                                                   | E2                                                    |
| -------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| Clubs                | 20 : les 4 premiers de chaque pays                   | 15 : les 5e et 6e de chaque pays, les 5 vainqueurs de coupe (ou le 7e, § 2) |
| Phase de ligue       | 6 matchs, 6 adversaires différents                   | 4 matchs, 4 adversaires différents                    |
| Ensuite              | 1er-4e en quarts, 5e-12e en barrages, 8 éliminés     | 1er-4e en quarts, 5e-12e en barrages, 3 éliminés      |
| Élimination directe  | matchs secs chez le mieux classé, finale sur terrain neutre, prolongation et tirs au but | la même                 |
| Matchs par saison    | 71                                                   | 41                                                    |
| Parcours parfait     | 23,6 M€ de primes                                    | 10 M€ de primes                                       |

Par saison et par partie : 10 dates de plus (52 → 62), 112 matchs de plus (+2,8 %), environ +5 % de CPU de simulation,
environ 0,1 Mo de plus avant archivage. Un club européen joue au plus 53 matchs (49 en Allemagne et en France), un de
plus qu'un club de deuxième division anglaise aujourd'hui (46 journées et 6 tours de coupe : 52).

## 0. Noms

Trois paires, recherchées sur le web le 17/11 (bases de marques en ligne, compétitions, tournois et jeux existants) :

| Paire | E1                                | E2                                      | Ce qu'on trouve |
| ----- | --------------------------------- | --------------------------------------- | --------------- |
| A     | Coupe des Lauriers / Laurel Cup   | Coupe des Fanions / Pennant Cup         | rien dans le football ni dans les jeux ; mais « Lauriers » et « Lauriers d'or » sont déjà deux cadres de la collection (`frame-laurels`, `frame-gold-laurels`) |
| B     | Coupe des Sommets / Summit Cup    | Coupe des Horizons / Horizon Cup        | rien en français ; « Summit Cup » : demande d'enregistrement en cours aux États-Unis (USPTO 99825718, classe 41, compétitions de football), un vrai risque en anglais |
| C     | Coupe des Géants / Giants Cup     | Coupe des Conquérants / Conquerors Cup  | quelques petits tournois d'esport sous ces noms ; « Géant » est aussi une enseigne d'hypermarchés, hors du sport |

Recommandation : **A**, la plus sûre ; le fanion est celui qu'échangent les capitaines avant un match européen. Les deux
cadres gardent leurs identifiants (jamais renommés) ; leurs libellés pourraient devenir « Couronne » et « Couronne d'or »
si la confusion gêne. Ce n'est pas un avis juridique : une recherche d'antériorité (INPI, EUIPO, USPTO) avant la mise en
ligne reste prudente.

Aucun des six noms ne rappelle les compétitions officielles : ni « champions », ni « ligue », ni « Europa », ni
« conférence », ni « coupe des coupes », et aucun logo. `FORBIDDEN_NAMES` (`src/lib/outward-names.ts`) a déjà
« Champions League », « Europa League » et « Conference League » ; il recevrait « UEFA », « Ligue des champions »,
« Ligue Europa », « Ligue Europa Conférence », « Coupe UEFA », « UEFA Cup », « Coupe des coupes », « Cup Winners' Cup »
et « Intertoto ».

Les exemples d'écran de ce cahier prennent les noms A.

## 1. Format

### 1.1 Qualifiés et chapeaux

- **E1** : 20 clubs, les 4 premiers de chaque pays. Quatre chapeaux de 5, un club par pays dans chacun : les champions,
  les 2es, les 3es, les 4es.
- **E2** : 15 clubs, les 5e et 6e de chaque pays et les vainqueurs de coupe (§ 2). Trois chapeaux de 5, un club par
  pays dans chacun : les trois qualifiés d'un pays rangés par leur classement en championnat (un vainqueur de coupe de
  D2 en dernier).

### 1.2 Phase de ligue

- **E1** : 6 matchs par club, 2 adversaires dans chacun des trois autres chapeaux, l'un reçu, l'autre visité : 3 à
  domicile, 3 à l'extérieur, 6 adversaires différents, jamais de son pays. 60 matchs.
- **E2** : 4 matchs par club, 2 adversaires dans chacun des deux autres chapeaux, l'un reçu, l'autre visité. 30 matchs.
- **Tirage**, par la graine, à l'ouverture de la saison (`europeDrawRngSeed`, flux `{graine}:europe-draw:{année}:{code}`) :
  pour chaque paire de chapeaux, un ordre des cinq pays ; le club du k-ième pays du premier chapeau reçoit celui du
  (k+1)-ième du second et se rend chez celui du (k+2)-ième (modulo 5). Jamais deux clubs d'un même pays, un match à
  domicile et un à l'extérieur contre chaque autre chapeau, et un tirage toujours possible : jamais de nouvel essai.
- **Journées** : en E1, les trois façons d'apparier quatre chapeaux (1-2 et 3-4, 1-3 et 2-4, 1-4 et 2-3), deux fois
  chacune (un adversaire reçu, puis l'autre visité), dans un ordre tiré : chaque club joue aux six dates. En E2, une paire
  de chapeaux par date : chaque club joue quatre des six dates et se repose aux deux autres.
- **Classement unique** : points (3, 1, 0), différence de buts, buts marqués, puis la réputation à l'ouverture et le
  slug, pour un ordre toujours strict. Le nul existe, sans prolongation.

### 1.3 Élimination directe

- Après la phase de ligue : du 1er au 4e en quarts de finale, du 5e au 12e en barrages, les autres éliminés (8 en E1,
  3 en E2).
- Barrages : 5e-12e, 6e-11e, 7e-10e, 8e-9e. Quarts : le 1er contre le vainqueur de 8e-9e, le 2e contre celui de 7e-10e,
  le 3e contre 6e-11e, le 4e contre 5e-12e. Demi-finales : le côté du 1er contre celui du 4e, le côté du 2e contre celui
  du 3e. **Tableau fixe**, connu dès la fin de la phase de ligue : aucun tirage de plus, et bien finir rapporte un
  adversaire plus faible et le terrain.
- **Matchs secs**, chez le mieux classé de la phase de ligue. **Finale sur terrain neutre** : `HOME_ADVANTAGE` (1,12)
  ne joue pour aucun des deux (facteur 1), « Terrain neutre » à l'écran.
- Un nul après 90 minutes : **prolongation, puis tirs au but**, ceux de la coupe nationale (skill `moteur-de-match`), le
  direct s'arrêtant à « Fin du temps réglementaire » comme en coupe. `isKnockout` dépendrait de la compétition **et** du
  tour : jamais en phase de ligue.
- Pourquoi des matchs secs : l'aller-retour demanderait le score cumulé (la prolongation seulement si le cumul est nul,
  et non le match), un changement du moteur et du direct, et 4 dates de plus en fin de saison (deux par tour). À trancher
  (point 3).

Matchs par saison : E1 60 + 4 + 4 + 2 + 1 = **71** ; E2 30 + 4 + 4 + 2 + 1 = **41** ; **112** en tout.

## 2. Places par pays et doubles qualifications

| Par pays | Places | Clubs                                    |
| -------- | ------ | ---------------------------------------- |
| E1       | 4      | 1er, 2e, 3e et 4e du championnat         |
| E2       | 3      | 5e, 6e et vainqueur de la coupe nationale |

Sept places par pays, les mêmes pour les cinq (leurs divisions ont la même force par niveau : aucun coefficient de
pays) : 35 clubs, 36 % des premières divisions (35 % d'un championnat à 20, 39 % d'un championnat à 18).

- Le rang est celui du classement final de D1 affiché (même ordre que pour les montées et descentes).
- Le vainqueur de la coupe va en E2 quelle que soit sa division : un club de D2 peut jouer l'Europe.
- **Qualifié deux fois** : un vainqueur de coupe déjà qualifié par son rang (1er à 6e) joue la compétition de son rang, et
  la place de la coupe passe au 7e du championnat. Un club ne joue jamais les deux compétitions la même saison.
- **Saison 1 d'une nouvelle partie** : le rang est `Club.initialRank`, le classement final réel de la saison source
  (2024-25), calculé par le seed depuis les scores d'OpenFootball (l'Espagne et l'Italie sur 37 journées de 38). Le rang
  de réputation de la création (`creationReputationRanks`) suit déjà ce classement : les deux sources donnent les mêmes
  qualifiés, la réputation ne servant qu'à départager si un rang manquait. Aucune donnée ne dit qui a gagné les coupes
  2024-25 : la place de la coupe va au 7e, comme pour une double qualification. À trancher (point 4) : les vainqueurs
  réels saisis à la main (deux des cinq étaient déjà dans les 4 premiers, trois classés 9e à 12e).

## 3. Calendrier

### 3.1 Dates

Des mercredis, 4 jours après un samedi comme la coupe, dans des semaines sans tour de coupe (semaines 5, 12, 20, 26, 33)
ni mardi de D2 (semaines 3, 9, 16, 22, 29, 35) : aucun club ne joue trois fois dans une semaine, pas même un vainqueur
de coupe de D2. Les finales le samedi qui suit la finale de coupe. E1 et E2 jouent les mêmes jours, un club n'étant que
dans l'une. Dates pures et sans tirage (`europeDates`, comme `cupDates`), de la saison 2026-27 :

| Date              | Semaine | Tour          | Autour                                                       |
| ----------------- | ------- | ------------- | ------------------------------------------------------------ |
| mer. 16 septembre | 4       | 1re journée   | 4 ou 5 journées de championnat jouées                        |
| mer. 30 septembre | 6       | 2e journée    | coupe : tour préliminaire le 23, sans club de D1             |
| mer. 14 octobre   | 8       | 3e journée    |                                                              |
| mer. 28 octobre   | 10      | 4e journée    | samedi 24 : repos de toutes les D1                           |
| mer. 25 novembre  | 14      | 5e journée    | coupe : seizièmes le 11                                      |
| mer. 16 décembre  | 17      | 6e journée    | samedi 5 : repos des D1 à 18                                 |
| mer. 3 février    | 24      | barrages      | coupe : huitièmes le 6 janvier, quarts le 17 février         |
| mer. 3 mars       | 28      | quarts        | samedi 6 : repos de toutes les D1                            |
| mer. 28 avril     | 36      | demi-finales  | coupe : demi-finales le 7 avril ; samedi 24 : repos des D1 à 18 |
| sam. 29 mai       | 41      | finales       | dernière journée le 15, finale de coupe le 22                |

Toute saison d'une partie 2 finit donc une semaine plus tard (29 mai au lieu du 22). Un club qui n'est pas en finale
passe cette date comme il passe aujourd'hui la finale de coupe (« Prochain match » joue les dates restantes).

### 3.2 Matchs d'un club qualifié

| Club                                        | Championnat | Coupe | Europe                     | Au plus |
| ------------------------------------------- | ----------- | ----- | -------------------------- | ------- |
| E1, D1 à 20 (Angleterre, Espagne, Italie)   | 38          | 5     | 10 (6, barrage, 3 tours)   | 53      |
| E1, D1 à 18 (Allemagne, France)             | 34          | 5     | 10                         | 49      |
| E2, D1 à 20 / à 18                          | 38 / 34     | 5     | 8 (4, barrage, 3 tours)    | 51 / 47 |
| Aujourd'hui, D2 anglaise                    | 46          | 6     | —                          | 52      |

Un club d'E1 classé dans les 4 premiers saute le barrage (9 matchs européens au plus). Un parcours type, 2 tours de coupe
et une élimination en barrages : 38 + 2 + 7 = 47 matchs.

### 3.3 Fatigue et rotation

Règles inchangées (G2) : −5 de condition par segment sur le terrain (−30 sur 90 minutes, −9 pour un gardien), +5 par
jour jusqu'à 100 ; au coup d'envoi, la force × (1 − 0,0015 × (100 − condition)) ; sous 70, le risque de blessure croît
(double à 40). Un titulaire de champ qui joue chaque minute :

| Match                          | Au coup d'envoi | À la fin |
| ------------------------------ | --------------- | -------- |
| samedi                         | 100             | 70       |
| mercredi européen (+4 jours)   | 90              | 60       |
| samedi (+3 jours)              | 75              | 45       |
| samedi suivant (+7 jours)      | 80              | 50       |
| mercredi européen              | 70              | 40       |
| samedi                         | 55              | 25       |

Sur une quinzaine européenne (samedi, mercredi, samedi), un titulaire perd 90 points et n'en récupère que 70 : sans
repos, il commence chaque quinzaine 20 points plus bas, et un match sous 70 dès la deuxième. Il tient environ 2,3 matchs
complets par quinzaine : sur trois matchs, il en manque un ou n'en joue qu'une partie. La force y perd peu (−3,75 % à 75
au coup d'envoi, −6,75 % à 55), le risque de blessure beaucoup plus (parti à 55, il finit le match à 25 : deux fois et
demie le risque de base). L'automne est le plus chargé : quatre mercredis en six semaines (16 septembre-28 octobre).

- **Clubs IA** : la règle existe (`selectRestedLineup` : un joueur sous 75 laisse sa place au meilleur reposé qui vaut au
  plus 5 points de moins à son poste ; le plus fatigué sort aux minutes de changement). Elle jouera d'elle-même dès la
  deuxième quinzaine. Aucun changement proposé avant la mesure (§ 9). **Réglée le 17/11** (§ 9 ter) : 5 points, plus 2
  par point de condition sous 75 (`maxRotationGap`), le banc des clubs européens décrochant de leur onze au fil des saisons.
- **Club dirigé** : il garde sa composition (règle actuelle), le joueur fait tourner. Aides : la condition au coup
  d'envoi, déjà sur la composition (ambre sous 75, rouge sous 70) ; une ligne « À faire » nouvelle (« 3 titulaires sous
  75 pour mercredi ») ; la composition automatique, qui repose déjà les fatigués ; le « Stage de forme » de la boutique.

## 4. Primes, réputation et objectif

### 4.1 Primes

Créditées sur `ClubSave.budget` à chaque victoire et à chaque tour, comme la coupe (`progressCups`), pour tous les
clubs ; celles d'un club IA disparaissent avec sa dotation de la saison suivante (règle V2), le club dirigé garde la
moitié de ce qu'il n'a pas dépensé (`BUDGET_CARRY_OVER_SHARE`).

| En M€                                                  | E1       | E2     |
| ------------------------------------------------------ | -------- | ------ |
| Participation                                          | 3        | 1,5    |
| Victoire en phase de ligue                             | 0,6      | 0,3    |
| Qualification pour les quarts (top 4 ou barrage gagné) | 2        | 0,8    |
| Quart gagné                                            | 3        | 1,2    |
| Demi-finale gagnée                                     | 4        | 1,8    |
| Finale gagnée / perdue                                 | 8 / 4    | 3,5 / 1,75 |
| **Parcours parfait**                                   | **23,6** | **10** |
| Parcours type : 2 victoires, sorti en barrages         | 4,2      | 2,1    |

À comparer : la coupe nationale gagnée par un club de D1 (depuis les seizièmes) rapporte 8,75 M€ ; budgets de création
d'un club d'E1 (1er à 4e) 103 à 150 M€, d'E2 (5e à 7e) 66 à 95 M€. Un parcours parfait vaut 16 à 23 % du budget d'un
club d'E1 ; sa moitié reportée, environ 12 M€, 8 à 11 % de son budget suivant.

### 4.2 Réputation

Aujourd'hui, la réputation ne suit que le championnat (sa cible : la réputation de création du rang final, un quart du
chemin par saison). Proposition : un **bonus de cible** pour tous les clubs, plafonné à 99 : en E1 quart de finaliste +1,
finaliste +2, vainqueur +3 ; en E2 finaliste +1, vainqueur +2. Il s'ajoute à la cible, pas à la réputation : un club qui
gagne l'E1 chaque saison finit 3 points au-dessus de sa cible de championnat (environ un rang et demi en D1, où les
réputations de création vont de 55 à 90), au rythme d'un quart du chemin par saison. Il compte pour le rang attendu
(objectifs, dotation) et pour les joueurs qui acceptent le club (`minimumReputation`). Alternative : rien, l'Europe ne
rapportant que ses primes (point 6).

### 4.3 Objectif européen de la direction

Pour le club dirigé qualifié, un troisième objectif imposé, `EUROPE`, comme la coupe, selon le tiers de sa réputation
parmi les clubs de sa compétition à l'ouverture, dépassé deux tours plus loin :

| Tiers de réputation | Objectif                                     | Dépassé           |
| ------------------- | -------------------------------------------- | ----------------- |
| premier             | les quarts (les demi-finales jusqu'au 17/11) | la finale         |
| deuxième            | les quarts                                   | la finale         |
| troisième           | les barrages (top 12 de la phase de ligue)   | les demi-finales  |

Coefficient de la dotation suivante : dépassé +10, atteint +5, manqué −5 (comme la coupe), toujours entre 70 et 140
(`budgetCoefficient`). La confiance du président le compte comme les autres, et « Trop tôt pour juger » jusqu'au 5e match
de championnat, comme eux. Écrans : Club (`club-objectives`), carte Objectifs de l'Accueil, écran de début de saison,
bilan et carte de fin de saison (« Objectifs : 3/4 »).

## 5. Coût

### 5.1 Matchs et dates

- **+112 matchs** par saison et par partie 2 (E1 71, E2 41), pour environ 3 950 aujourd'hui (3 758 de championnat, 193
  de coupe) : +2,8 %.
- **+10 dates** par saison (52 → 62) : 6 de phase de ligue, 3 d'élimination directe, les finales.
- Le club dirigé qualifié : 4 à 10 matchs de plus, chacun en direct ou simulé.

### 5.2 CPU Vercel

Repère : un samedi complet d'une partie 2 (99 matchs) coûte environ 164 ms de CPU en local, depuis le choix mensuel du
dispositif des clubs des quatre autres pays (`docs/design/simulation-legere.md`, 11/11) : environ 1,5 ms par match et
une part fixe par date (lectures, récupération, écritures), estimée à 15 ms.

| Date européenne           | Matchs        | CPU estimé                                       |
| ------------------------- | ------------- | ------------------------------------------------ |
| journée de phase de ligue | 15 (10 + 5)   | ~40 ms                                           |
| barrages, quarts          | 8             | ~25 ms                                           |
| demi-finales              | 4             | ~20 ms                                           |
| finales                   | 2             | ~20 ms                                           |
| **saison**                | 112           | **~0,3 s**, pour ~7 s aujourd'hui (+4 à 5 %)     |

- **Dispositifs** : la règle mensuelle reste pour les clubs des quatre autres pays ; ceux du pays du club dirigé
  choisissent avant chaque match (au plus 7 par date) et l'adversaire étranger du club dirigé avant leur match, pour que
  l'aperçu de l'adversaire soit le match joué (`getOpponentPreview`) : 0,19 ms par choix, négligeable.
- Le samedi qui suit une date européenne ne coûte rien de plus : la fatigue n'est lue qu'au coup d'envoi.
- Requêtes : aucune de plus pour un club non qualifié (« Prochain match » passe jusqu'à 5 dates des autres compétitions
  dans le même appel) ; pour un club qualifié, celles de chacun de ses matchs européens.
- À mesurer sous profileur, comme le chantier « cpu », sur une saison avec l'Europe.

### 5.3 Poids en base

- **Lignes** : 112 `Fixture`, 2 `Season`, les événements et décisions des matchs du club dirigé (10 au plus), les
  statistiques de ses seuls joueurs (comme la coupe) : environ 0,1 Mo par saison ; après archivage et nettoyage, environ
  10 Ko (14 entiers par match, `FIXTURE_FIELDS`).
- **Récupération** : chaque date de plus réécrit les joueurs sous 100 qui ne jouent pas (environ 2 800 après un samedi) :
  environ 28 000 mises à jour de `PlayerSave` de plus par saison, +20 % des écritures de joueurs. HOT (fillfactor 50),
  elles réutilisent la place de leur page : les fichiers ne devraient pas grossir.
- **Repère** : 6,2, 10,7, 12,8 et 14,0 Mo réels à la création puis après 1, 2 et 3 saisons, avec archives (10/11). À
  refaire avec l'Europe (`npm run measure:weight -- --archive`) ; cible : moins de 0,2 Mo de plus par saison.
- Si la mesure le demande, et seulement alors : une récupération paresseuse (la condition d'un club écrite à son match,
  la récupération calculée à la lecture), qui retirerait aussi celle des dates de coupe et de D2. Un chantier à part :
  chaque lecteur de la condition change.

## 6. Écrans

- **Match → Europe** (`/saves/[id]/europe`, `nav-europe`, après Coupe), dans toute partie qui a l'Europe : la
  compétition du club dirigé d'abord (l'E1 s'il n'est pas qualifié), une bascule E1 / E2 (`SegmentedLinks`). Une carte
  sur le bleu vif, comme `CupCard` : où en est le club (« Phase de ligue : 7e, 7 pts », « En quarts », « Éliminé en
  barrages », ou « Pas qualifié cette saison : finis dans les 6 premiers ou gagne la coupe »), son prochain match et sa
  prochaine prime. Puis le classement de la phase de ligue (pastille bleue du 1er au 4e, neutre du 5e au 12e, aucune
  ensuite ; le pays de chaque club), les matchs du club, et le tableau, connu dès la fin de la phase de ligue, la finale
  marquée « Terrain neutre ». Aucun orange plein : l'action de jeu reste dans la colonne.
- **Calendrier** : une étiquette à elle (le nom court, « LAURIERS », « FANIONS »), d'une couleur de la palette autre que
  l'orange de la coupe ; `stageLabel` : « Coupe des Lauriers — 3e journée », « Barrages », « Quarts », « Demi-finale »,
  « Finale ». Partout où le code tire un pays ou un niveau d'un code de compétition (`competitionCountry`, l'étiquette
  D1/D2 de `FixtureRow`), un cas pour `eu.1` et `eu.2`.
- **Direct** : la compétition et le tour sur `LiveScoreCard`, « Terrain neutre » pour la finale, prolongation et tirs au
  but comme la coupe ; les autres matchs : ceux de la même compétition à cette date.
- **Accueil** : le héros montre le match européen (compétition, tour, adversaire et son pays, rang et points de la phase
  de ligue) ; l'enjeu de « À demain » (`stakeOf`) : « Une victoire te place dans les quatre premiers » ; « À faire » :
  les titulaires fatigués (§ 3.3).
- **Suspensions** : badges « Suspendu en Europe », « 2 jaunes en Europe » (§ 8).
- **Palmarès et bilan** : « Coupe des Lauriers : quarts de finale », « Vainqueur de la Coupe des Lauriers », sur la ligne
  de la saison avec la coupe et les montées.
- **Carte de fin de saison** : la ligne européenne et ses badges (`cardBadge` : « EUROPE » pour un titre européen,
  « DOUBLÉ » et « TRIPLÉ » avec le championnat et la coupe), `SEASON_CARD_VERSION` + 1 ; aucun nom de club, comme
  toujours.
- **Objectifs** : § 4.3.
- **Missions du jour** : un match européen compte comme un autre.
- **Collection** (proposition) : un cadre ou un titre débloqué par un titre européen (`unlockSeasonAchievements`).
- Guide « Comment jouer », Nouveautés, `llms.txt` ; une zone de messages `europe`, et `world` pour les noms.
- E2E : `e2e/europe.spec.ts` à 1280, 390 et 360 px (onglet, calendrier, un match européen en direct jusqu'aux tirs au
  but).

## 7. Parties existantes et défi de la semaine

- **Parties 2 seulement**, comme les coupes ; une partie 1 reste comme elle est.
- **Nouvelle partie** : l'Europe dès la saison 1 (§ 2), ouverte par `createSave` après les coupes.
- **Partie 2 existante** : l'Europe s'ouvre à son prochain `advanceToNextSeason`, dans sa transaction, après les
  classements finaux, les montées et descentes et l'ouverture des coupes, avant les objectifs, depuis le classement final
  et le vainqueur de la coupe de la saison qui se termine. **La saison en cours ne change pas** : aucun match européen
  ajouté, aucun flux décalé. Une partie 2 sans coupe la saison passée : pas de vainqueur, la place va au 7e.
- **Interrupteur** `EUROPE_ENABLED`, comme `CUPS_ENABLED` (`createSave({ …, europe })` pour un test qui en décide).
- **Déterminisme** : les flux européens portent le code de la compétition (`europeMatchRngSeed` : graine, année, code,
  tour, clubs ; `europeDrawRngSeed`), que `matchRngSeed` et `cupMatchRngSeed` ne portent pas ; aucun flux existant n'est
  décalé. Une partie rejouée avec la même graine et le même code donne les mêmes saisons.
- **Défi (décidé)** : aucune Europe dans une partie de défi, à aucune saison (`createChallengeSave` avec `europe: false`,
  et le passage de saison d'une partie de défi n'en ouvre pas). Ses 10 journées restent ce qu'elles sont : **mise en
  ligne n'importe quel jour**. Le club du défi (D2, ou 12e à 18e de D1 de la saison source) ne serait de toute façon
  jamais européen en saison 1 avec la règle du § 2, mais ses adversaires le seraient, et fatigués.
- **Alternative écartée** : l'Europe aussi dans le défi, qui aurait demandé une mise en ligne un lundi matin, juste après
  minuit UTC, avant la première partie de défi de la semaine.

## 8. Données et migrations (ajout uniquement)

1. **Migration de schéma** `…_european_competitions_schema` :
   - `CompetitionKind` + `EUROPE`, `ObjectiveKind` + `EUROPE` (`ALTER TYPE … ADD VALUE`) ;
   - `PlayerSave` + `europeYellows` et `suspendedEuropeMatches` (`Int`, 0 par défaut) ;
   - `SeasonResult` + `europeCode` (`String?`, la compétition jouée) et `europeStage` (`Int?`, le tour atteint : 1 phase
     de ligue, 2 barrages, 3 quarts, 4 demi-finale, 5 finale) ; le trophée « europe » dans `trophies`, sans migration ;
   - `Season` + `entrants` (`Json?`, validé par Zod comme `movements` : sur une saison européenne, ses clubs, leur chemin,
     rang ou coupe, leur rang et leur chapeau ; null ailleurs).

   Rien de renommé ni de supprimé, aucun défaut changé ; les lignes existantes gardent 0 ou null.
2. **Migration de données** `…_european_competitions`, générée par `scripts/generate-reference-migration.ts` (un suffixe
   de plus, `EUROPEAN_COMPETITIONS` dans `prisma/seed/competitions.ts`) : deux `Competition`, `eu.1` et `eu.2`,
   `kind = EUROPE`, niveau 0, pays « Europe », noms en français ; aucun club rattaché (`Club.competitionId` reste son
   championnat). Elle suit la migration de schéma, la valeur d'enum devant exister avant d'être écrite (comme
   `…_national_cup` puis `…_national_cups`).
3. **Aucune table nouvelle** : les matchs dans `Fixture` (`round` 1 à 6 en phase de ligue, 7 barrages, 8 quarts, 9
   demi-finales, 10 finale ; `decidedBy`, tirs au but et `winnerClubSaveId` à partir de 7), les saisons dans `Season`, les
   statistiques du club dirigé dans `PlayerSeasonStats`, ses décisions dans `MatchDecision`. Le terrain neutre se déduit
   (tour 10 d'une compétition européenne), sans colonne : le format des archives (14 champs par match) ne change pas, à
   prouver par `sameSeason` sur une saison européenne.
4. **Lecteurs** : ceux du championnat filtrent déjà `kind = LEAGUE`, ceux de la coupe `CUP` ; à revoir, ceux qui
   prennent « tout sauf le championnat » pour de la coupe (discipline : `withSuspensions` et `disciplineAfterMatch` selon
   la compétition du match ; `managedMatchesAhead` ; le parcours de coupe ; `SeasonResult`).
5. **Discipline** : jaunes européens comptés à part, 3 suspendent pour le prochain match européen
   (`EUROPE_YELLOWS_PER_SUSPENSION` ; 5 en championnat et en coupe, qui sur 6 à 10 matchs n'arriveraient presque jamais) ;
   un rouge suspend comme aujourd'hui pour le prochain match officiel, toute compétition ; tout revient à 0 en fin de
   saison.

## 9. Risques pour l'équilibrage et mesures

Mesurer d'abord, régler ensuite, une chose à la fois dans `balance.ts`, la calibration de première division vérifiée
après chaque changement (règle « Équilibrage des deux divisions »). Cibles proposées :

| Risque | Mesure | Cible |
| ------ | ------ | ----- |
| Les européens perdent des points le samedi d'après | `measure:balance`, nouvelle section « Europe » (6 saisons d'une partie 2) : points par match en championnat le samedi qui suit une date européenne, contre les autres samedis | 0,1 à 0,2 point de moins, pas davantage |
| Fatigue et blessures | même section : condition des titulaires au coup d'envoi, titulaires reposés, blessures par club et par saison, européens contre les autres | blessures des européens au plus × 1,3 |
| Un championnat qui s'ouvre trop | `measure:seasons` : rang final par rang de réputation, avec et sans l'Europe | le top 4 de réputation garde l'essentiel des titres |
| Élimination directe, finale neutre | part des matchs à prolongation et aux tirs au but, victoires du mieux classé, finales | comme la coupe |
| Budget du club dirigé qui enfle | `measure:seasons` : budget, report et dotation sur 6 saisons d'un club qualifié | le report d'un parcours parfait au plus 12 % du budget suivant, 5 % en moyenne sur 6 saisons |
| Étalement des réputations (si le bonus est retenu) | `measure:seasons`, section « Étalement des réputations » | écart-type de D1 à 1 point près d'aujourd'hui |
| Objectif européen mal dosé | `measure:seasons`, objectifs : atteints par tiers de réputation | environ une fois sur deux, comme la coupe |
| Calibration du moteur | `match.test.ts` (2,5 à 2,8 buts, 42 à 46 % à domicile, 23 à 27 % de nuls), `match-season.test.ts`, `match-d2.slow.test.ts` | inchangée : même moteur, même force |
| Poids et CPU | `measure:weight -- --archive`, profil d'une saison | moins de 0,2 Mo et de 6 % de plus par saison |

Leviers si la mesure déçoit, dans cet ordre : le seuil de rotation des clubs IA (`ROTATION_FITNESS`, 75) la semaine
d'une date européenne, les primes, le bonus de réputation.

## 9 bis. Mesures du 17/11, avant la mise en ligne

Sur des bases locales dédiées, le code de la branche `europe`.

- **Six cibles** (`measure:balance -- --world-only --seeds=10`, dix saisons complètes d'une partie 2 avec l'Europe) :
  2,61 buts par match (2,65 en D1), 25,3 % de nuls, 43,6 % de victoires à domicile, 53,7 points entre le 1er et le
  dernier, forme des onze de 31,8 à 71,9, le plus faible gagne 23,5 % ; le 06/11, sans l'Europe : 2,64, 25,1 %, 43,6 %,
  55,2, 35,3 à 75,3 et 23,2 %. Les six tiennent.
- **Europe, même mesure** : points par match des clubs IA européens en championnat dans les quatre jours qui suivent leur
  match européen 1,71, contre 1,77 pour leurs autres matchs (−0,06 ; cible −0,1 à −0,2, pas davantage). Condition des
  titulaires au coup d'envoi : 91,8 en Coupe des Lauriers (7,3 % des titularisations sous 75), 93,5 en Coupe des Fanions
  (3,9 %), 98,0 pour les autres clubs de D1 (0,4 %) ; titulaires reposés par club et par saison 19,1, 11,7 et 1,3 ;
  blessures par club et par saison 5,8, 5,5 et 4,7, soit × 1,24 et × 1,16 (cible : au plus × 1,3 ; sur trois saisons
  seulement, × 1,37 en Lauriers : le bruit). Élimination directe, 220 matchs : 75,9 % en 90 minutes, 11,4 % après
  prolongation, 12,7 % aux tirs au but, le mieux classé passe 56,4 % du temps. Aucun réglage nécessaire.
- **Cinq saisons** (`measure:seasons -- --seasons=5`, graine de la démo) : requalifiés la saison suivante, Lauriers 65 à
  95 % (pour la même compétition 45 à 65 %), Fanions 60 à 67 % (20 à 33 %) ; relégués en fin de saison : un club des
  Lauriers et deux des Fanions en quatre saisons ; rang final moyen 3,6 à 5,8 en Lauriers, 5,9 à 7,7 en Fanions. Budgets
  moyens des clubs IA au début : 128 à 137 M€ en Lauriers, 75 à 83 M€ en Fanions, 24 à 28 M€ pour les autres clubs de D1
  (+5 à 7, +3 à 4 et +0,2 à 0,7 M€ sur la saison, primes et ventes comprises). Réputations stables (84 à 87, 77 à 81,
  65 à 67), étalement de chaque division à ±10 % (7,7 % au plus), réputation recalculée avec le bonus égale à la relevée
  pour 990 clubs-saisons sur 990. Objectif européen qu'aurait reçu chaque club : 45 % atteint ou dépassé (175
  clubs-saisons) ; par tiers, Lauriers 27 % (haut, les demies), 43 % (milieu) et 43 % (bas), Fanions 32 %, 52 % et 76 %.
  Condition des titulaires des clubs européens au coup d'envoi : 92,7 en championnat (7 % sous 75), 89,1 en Europe
  (8 %), contre 98,3 (0 %) pour les autres clubs de D1 ; d'octobre à décembre, 84 à 90 de moyenne, et en octobre 12 %
  des titularisations sous 75 la première saison, puis 17, 21, 21 et 25 %. Saison par saison, tous leurs matchs (section
  « Charge de chaque saison ») : la part sous 75 passe de 5 à 10 % et les titulaires reposés de 16,1 à 12,4 par club,
  les joueurs disponibles restant 24,2 à 24,4 par match (un club IA trouve moins souvent un remplaçant à 5 points) ;
  blessures 5,6 à 6,0 par club et par saison, contre 4,8 à 5,2 pour les autres clubs de D1, soit × 1,08 à × 1,25 (cible :
  au plus × 1,3). À surveiller au-delà de cinq saisons.
- **CPU** (`process.cpuUsage()` autour de chaque date d'une saison complète, deux graines, pas de 15,6 ms sous Windows) :
  une date européenne 27 à 36 ms en moyenne (0 à 94 ms selon la date), soit 0,27 à 0,36 s pour les dix dates d'une
  saison ; un samedi 158 à 182 ms ; la saison entière 8,5 à 9,5 s avec ou sans l'Europe, l'écart dans le bruit de la
  mesure ; création +25 à 46 ms (« europe 90 » du minuteur), passage de saison 1,1 à 1,3 s, inchangé.
- **Poids** (`measure:weight -- --archive`, trois saisons, l'une après l'autre sur deux bases vides, avec puis sans
  l'Europe à toute saison, `--no-europe`) : compact (lignes vivantes et leurs index) 6,28, 6,97, 7,71 et 8,48 Mo avec
  l'Europe, 6,22, 6,90, 7,63 et 8,40 Mo sans : +0,06 Mo à la création (90 matchs de phase de ligue), puis +0,01 Mo par
  saison archivée (deux archives de saison de plus). Réel 6,55, 11,72, 14,51 et 15,66 Mo avec l'Europe (repère du 10/11 :
  6,2, 10,7, 12,8 et 14,0), 6,47, 20,36, 21,73 et 24,38 Mo sans : le réel varie de ±10 Mo selon l'autovacuum (la place des
  lignes mortes de `PlayerSave`), le compact est la mesure à comparer.

## 9 ter. Suite du 17/11 : objectif, primes à l'écran, rotation des clubs IA

Décidé après la mise en ligne, mesuré sur des bases locales dédiées.

- **Objectif européen** : le tiers haut vise les quarts (`EUROPE_OBJECTIVE_STAGES` 3, 3, 2), comme le milieu, dépassé à
  la finale ; les saisons déjà ouvertes gardent le leur. `measure:seasons -- --seasons=5` sur trois graines (la démo,
  `europe-seed-2`, `europe-seed-3` ; 175 clubs-saisons chacune) : atteint ou dépassé 55, 56 et 52 % du temps (45 %
  avant, graine de la démo). Par tiers, en moyenne : Lauriers 52 % (haut, les quarts ; 27 % avec les demies), 40 %
  (milieu, les quarts) et 52 % (bas, les barrages) ; Fanions 69 % (haut, les quarts ; 32 % avec les demies), 44 % et
  76 %. En Fanions, 8 clubs sur 15 atteignent les quarts et 12 au moins les barrages : aucune étape ne donne une saison
  sur deux au tiers haut ni au tiers bas.
- **Primes à l'écran** : la carte Finances de l'écran Club montre les primes reçues de la saison, européennes
  (participation comprise) et de la coupe (`getSeasonPrizes`, `club-prizes`), recalculées des matchs joués par les
  fonctions mêmes qui les créditent (`europePrizesOf`, `cupPrizesOf`, `wonEuropeMatch`), sans colonne ni migration.
  La suite lente (`europe.slow.test.ts`) vérifie, sur une saison jouée en entier, primes affichées = budget − dotation.
- **Rotation des clubs IA** : cause mesurée avant tout réglage (diagnostic sur cinq saisons, graine de la démo) : en
  octobre, l'écart entre un titulaire européen et le meilleur autre joueur à son poste passe de 4,1 à 7,1 points en cinq
  saisons ; aucun titulaire fatigué n'avait de reposé à 5 points ou moins, et la part de ceux dont le meilleur reposé
  était à plus de 12 points montait de 19 à 47 %. Règle : un joueur sous 75 laisse sa place à un reposé valant au plus
  5 points de moins, **plus 2 par point de condition sous 75** (`maxRotationGap` : 7 à 74, 15 à 70, 25 à 65). Avec 1 point
  par point de condition, la part d'octobre faisait 3, 5, 8, 8 et 11 % : sous 15 %, mais elle grimpait encore.
  - `measure:seasons`, part des titularisations européennes sous 75 en octobre, saison 1 à 5 : **12, 17, 21, 21, 25 %**
    avant ; **1, 2, 3, 3, 4 %** après, sur chacune des trois graines. Condition des titulaires européens sur la saison :
    92,8 à 91,1 avant, 94,0 à 94,6 après ; titulaires reposés par club et par saison 16,1 à 12,4 avant, 18,4 à 23,4
    après ; blessures × 1,16 de celles des autres clubs de D1 en moyenne avant, × 1,17 après sur la même graine et
    × 1,18 sur les trois (× 1,01 à × 1,34 selon la saison et la graine, une saison sur quinze au-dessus de × 1,3).
  - `measure:balance -- --world-only --seeds=10`, six cibles (avant entre parenthèses) : 2,601 buts par match (2,61),
    25,4 % de nuls (25,3), 43,6 % de victoires à domicile (43,6), 53,4 points entre le 1er et le dernier (53,7), forme
    des onze de 31,8 à 71,9 (31,8 à 71,9), le plus faible gagne 23,6 % (23,5) : elles tiennent. Clubs européens : points
    en championnat dans les quatre jours après un match européen 1,68 contre 1,77 (−0,09 ; −0,06 avant, cible −0,1 à
    −0,2) ; titularisations sous 75 0,8 % en Lauriers et 0,5 % en Fanions (7,3 et 3,9 %) ; blessures × 1,20 et × 1,16
    (× 1,24 et × 1,16).
  - La composition automatique du club dirigé suit la même règle (`selectRestedLineup`) ; ses matchs, eux, jouent sa
    composition enregistrée, ou `selectLineup` sans elle.

## 10. Ordre de construction

1. Moteur, pur et testé : dates (`europeDates`), tirage de la phase de ligue, classement, tableau, primes, objectif,
   bonus de réputation, discipline européenne.
2. Données : les deux migrations, le seed.
3. Saison : ouverture (`openEurope`, à la création et au passage de saison), dates jouées par `simulateMatchdays`, tours
   (`progressEurope`), primes, discipline. Tests lents : deux saisons d'une partie 2 avec coupes et Europe, une partie
   existante qui la reçoit à sa saison suivante, une partie de défi sans Europe, une partie européenne jouée puis
   supprimée (cascade).
4. Mesures (§ 9) et réglages.
5. Écrans (§ 6), puis E2E à 1280, 390 et 360 px.
6. Guide, Nouveautés, règle de `CLAUDE.md`, noms interdits.

Une taille comparable au chantier des coupes.

## Points tranchés le 17/11

Tous selon la recommandation (section « Décisions de validation » en tête) : noms A ; E2 à 15 clubs ; matchs secs ;
place de la coupe au 7e en saison 1 ; aucune Europe dans une partie de défi ; bonus de réputation ; primes et objectif
aux valeurs du § 4 ; 3 jaunes en Europe ; finales le samedi 29 mai ; rotation du club dirigé à la main, avec une alerte
« À faire » avant un match européen.
