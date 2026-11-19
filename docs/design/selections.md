# Sélections nationales : trêves, éliminatoires, deux tournois d'été et un poste de sélectionneur

Cahier rédigé le 18/11/2026, **validé le 18/11** avec toutes ses recommandations (décisions de validation ci-dessous,
qui l'emportent sur le reste du texte). Il s'appuie sur le code du 18/11 : identité des joueurs
(`prisma/seed/players.ts`, `src/engine/identity.ts`, `src/engine/names.ts`, `src/engine/youth.ts`), calendrier
(`matchdayDates`, `src/engine/schedule.ts` ; `cupDates`, `src/engine/cup.ts` ; `europeDates`, `src/engine/europe.ts`),
force (`src/engine/strength.ts`, `chooseFormation`), fatigue et blessures (`src/engine/fitness.ts`, `balance.ts`),
valeur (`marketValueFor`, `src/engine/economy.ts`), coûts mesurés par les chantiers « cpu », « archives », « europe » et
« historique ». L'audit du § 1 a été mesuré le 18/11 sur une base locale dédiée, supprimée depuis (jamais
`latewinner_dev`) : un jumeau 2 de la démo (graine `demo-2026-27`, Lyon), créé puis joué cinq saisons, l'adjoint gérant
les contrats, comme `measure:seasons`.

Dans ce cahier, une **trêve** est une fenêtre internationale (deux matchs de sélection, aucun match de club) et un
**cycle** les deux saisons qui mènent à un tournoi d'été.

## Décisions de validation (18/11)

1. **Les 14 nations du jeu**, sans en créer (§ 1).
2. **La réserve hors championnats à un niveau propre à chaque nation** (§ 2.3).
3. **Tournois à 6 nations pour l'Europe, 8 pour le Monde** (§ 4.4, 4.5).
4. **Éliminatoires** : une poule en matchs simples pour la zone Europe, aller-retour pour la zone Monde en cycle Monde,
   des matchs amicaux sinon (§ 4.2, 4.3).
5. **Noms** : Coupe du Vieux Continent / Old Continent Cup et Coupe des Hémisphères / Hemispheres Cup (§ 4.1).
6. **Calendrier** : trêves des semaines 3, 8, 13 et 32 ; deux mardis pour les D1 à 20 clubs ; 3e et 4e journées
   européennes et seizièmes de coupe déplacés (§ 3).
7. **Un cycle propre à chaque partie, l'Europe d'abord** ; les parties existantes à leur prochaine saison ; ni partie 1
   ni défi (§ 3.4, 3.5).
8. **Forme et valeur** inchangées par les sélections (§ 6.4, 6.5).
9. **Sélectionneur** : offres dès la fin de la 1re saison, seuils de prestige 85, 75 et 65 ; renvoi si pas qualifié ou
   sous l'objectif ; amicaux laissés à l'adjoint par défaut (§ 5). **Le renvoi ne touche que le poste de sélectionneur,
   jamais le club du joueur** : la règle du club reste, la direction ne renvoie jamais son entraîneur.
10. **N1 avec N2**, en une première mise en ligne, avec N0 ; N3 et N4 après validation des mesures (§ 12).
11. **Indice de légende** : rien pour les sélections.

## Décisions d'Alexis (18/11)

- Deux rôles : les joueurs des clubs partent en sélection pendant les trêves (fatigue, blessures, sélections et buts
  comptés) ; le joueur peut devenir sélectionneur d'une nation, en plus de son club, quand sa réputation le permet (offre
  d'une fédération).
- Éliminatoires pendant les trêves de la saison, puis un grand tournoi en été tous les deux ans, en alternance Europe et
  Monde, sous des noms inventés, vérifiés.
- Toutes les nations représentées par les joueurs de nos cinq championnats, complétées si besoin par des joueurs
  générés hors championnats.
- Rien dans les parties du défi.
- Retouche à glisser dans la prochaine mise en ligne, quelle qu'elle soit : dans l'Histoire, un lien « Voir toutes les
  légendes », et « En route vers la légende » réservé aux joueurs au-dessus de 75 points (§ 0).

Ce qui ne change pas : le déterminisme (`Save.seed`, `Save.currentDate`), le moteur pur, les migrations d'ajout
uniquement, le scoping par `saveId`, une seule action orange par écran, FR et EN, aucun nom ni sigle réel de compétition
ou de fédération.

## En bref

|                | Proposition                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Nations        | 14 : les 14 nationalités du jeu (9 d'Europe, 5 du reste du monde) ; il n'en existe aucune autre (§ 1) |
| Force          | les meilleurs de la nationalité dans nos clubs, complétés par une réserve « hors championnats » de 23 joueurs par nation, à un niveau propre à chacune (§ 2) |
| Trêves         | 4 par saison (début septembre, mi-octobre, mi-novembre, fin mars), 2 matchs chacune, le vendredi et le mardi ; championnats et coupes s'arrêtent (§ 3) |
| Calendrier     | début et fin de saison inchangés, toujours 62 dates de club ; 4 samedis de moins, 4 mardis de plus ; à partir de la prochaine saison d'une partie (§ 3) |
| Éliminatoires  | 8 matchs par nation et par cycle, environ un par trêve, le reste en matchs amicaux (§ 4)             |
| Tournois       | en juin, un été sur deux : la Coupe du Vieux Continent (6 nations, 9 matchs), puis la Coupe des Hémisphères (8 nations, 15 matchs) ; noms à valider (§ 4.1) |
| Sélectionneur  | offre d'une fédération à un passage de saison, dès la fin de la 1re, selon la réputation du club et ses trophées ; objectif de la fédération, renvoi s'il est manqué ; le club continue (§ 5) |
| Matchs en plus | 56 par saison, + 9 ou 15 un été sur deux : +1,5 % des matchs, tous en simulation légère sauf ceux du sélectionneur |
| CPU            | environ 10 ms par trêve, 40 ms par saison (+0,5 %), 15 ms par tournoi ; aucune date de plus pour la partie (§ 7) |
| Poids          | environ 20 Ko par saison et 70 Ko une fois par partie : +3 % de la croissance d'une carrière archivée (§ 8) |
| Étapes         | N0 retouche de l'Histoire, N1 nations, N2 trêves et convocations, N3 éliminatoires et tournois, N4 sélectionneur, N4b son direct (§ 12) |

## 0. Retouche de l'Histoire (prochaine mise en ligne, quelle qu'elle soit)

Indépendante du reste du cahier, livrable seule ou avec n'importe quelle autre mise en ligne :

- **Toutes les légendes** : `legends` (`src/engine/career-history.ts`) rend toutes celles du club (indice ≥ 150,
  `LEGEND_THRESHOLD`), dans l'ordre ; l'écran en montre cinq (`LEGENDS_SHOWN`) et, au-delà, un lien « Voir toutes les
  légendes » (« See all legends », `career-legends-all`) qui déplie la liste sur la même page (`?legends=all#legendes`,
  rendu par le serveur, lisible sans JavaScript), avec « Voir moins ». Pas de lien quand il y en a cinq ou moins.
- **« En route vers la légende »** : les joueurs du club au-dessus de 75 points (`ON_THE_WAY_THRESHOLD`, un indice
  de plus de 75 et de moins de 150), trois au plus (`ON_THE_WAY_SHOWN`) ; sans aucun, le bloc disparaît.
- **Rien d'autre ne bouge** : la partie gardée en cache (`HISTORY_VERSION`) est faite des données, que la vue relit ; la
  carte de carrière montre toujours la première légende (`CAREER_CARD_VERSION` inchangé).
- **Tests** : `career-history.test.ts` (toutes les légendes ; 75 points ne suffisent pas, 76 oui),
  `history.test.tsx`, `e2e/club.spec.ts` (la démo n'attend plus trois joueurs en route, mais chacun au-dessus de
  75 points) ; messages FR et EN (zone `seasons`).

## 1. Audit des données

### 1.1 Ce qui existe

- **Un champ, déjà là** : `Player.nationality` (monde de référence) et `PlayerSave.nationality` (partie), en toutes
  lettres et en français, le même libellé que `Club.country` (« Sénégal ») ; l'écran l'affiche par son code et son nom
  traduit (`nationalityCode`, `nationalityName`, `app/saves/[id]/_lib/nationalities.ts` : effectif, fiche, marché).
- **Quatorze nationalités, pas une de plus** : une par liste de noms (`src/engine/data/names/*.json`, `NAME_BANK`) :
  les cinq pays de nos championnats (Allemagne, Angleterre, Espagne, France, Italie) et neuf autres (Argentine,
  Belgique, Brésil, Côte d'Ivoire, Croatie, Maroc, Pays-Bas, Portugal, Sénégal). Le nom d'un joueur est tiré de la
  liste de sa nationalité : nom et nationalité vont ensemble.
- **Le tirage**, toujours par une graine (celle du monde pour le seed, celle de la partie pour les jeunes) : 70 % des
  joueurs du seed ont la nationalité du pays de leur club, les 30 % autres une des 13 autres listes, au hasard uniforme
  (`HOME_NATIONALITY_SHARE`, `drawNameList`) ; les 120 joueurs libres du départ, une des 14 au hasard ; les jeunes du
  centre de formation et de la boutique, 85 % celle du pays du club (`YOUTH_HOME_NATIONALITY_SHARE`).

### 1.2 Combien de joueurs par nation

Monde de référence (table `Player`, partagée par toutes les parties) :

| Nation        | D1  | D2  | Libres | Monde 1 | Monde 2 |
| ------------- | --- | --- | ------ | ------- | ------- |
| Espagne       | 373 | 397 | 8      | 381     | 778     |
| Angleterre    | 338 | 424 | 12     | 350     | 774     |
| Italie        | 378 | 359 | 8      | 386     | 745     |
| Allemagne     | 342 | 373 | 9      | 351     | 724     |
| France        | 320 | 348 | 8      | 328     | 676     |
| Belgique      | 64  | 51  | 7      | 71      | 122     |
| Croatie       | 58  | 55  | 6      | 64      | 119     |
| Pays-Bas      | 62  | 48  | 6      | 68      | 116     |
| Maroc         | 50  | 51  | 12     | 62      | 113     |
| Argentine     | 49  | 55  | 8      | 57      | 112     |
| Côte d'Ivoire | 39  | 55  | 15     | 54      | 109     |
| Sénégal       | 48  | 51  | 4      | 52      | 103     |
| Brésil        | 40  | 47  | 11     | 51      | 98      |
| Portugal      | 47  | 32  | 6      | 53      | 85      |

Dans la partie 2 mesurée : joueurs sous contrat d'un de nos clubs, gardiens, moyenne du onze de la nation dans son
meilleur dispositif (§ 2.2) et joueurs notés 75 ou plus, à la création puis après cinq saisons :

| Nation        | Joueurs | Gardiens | Onze | ≥ 75 | 5 saisons après : joueurs | gardiens | onze |
| ------------- | ------- | -------- | ---- | ---- | ------------------------- | -------- | ---- |
| Allemagne     | 778     | 52       | 81,7 | 75   | 772                       | 51       | 83,2 |
| Angleterre    | 839     | 65       | 81,2 | 50   | 893                       | 67       | 80,3 |
| Italie        | 808     | 71       | 80,1 | 49   | 864                       | 72       | 81,0 |
| Espagne       | 848     | 72       | 80,0 | 61   | 875                       | 75       | 82,5 |
| France        | 734     | 51       | 79,7 | 43   | 778                       | 53       | 81,9 |
| Croatie       | 115     | 13       | 78,2 | 13   | 81                        | 9        | 76,2 |
| Pays-Bas      | 112     | 17       | 77,7 | 15   | 88                        | 15       | 76,5 |
| Argentine     | 111     | 12       | 77,3 | 13   | 84                        | 11       | 78,9 |
| Côte d'Ivoire | 99      | 5        | 76,0 | 8    | 78                        | 5        | 76,0 |
| Belgique      | 122     | 10       | 75,5 | 7    | 105                       | 10       | 75,0 |
| Maroc         | 107     | 11       | 75,1 | 6    | 84                        | 10       | 73,4 |
| Brésil        | 91      | 7        | 74,8 | 6    | 75                        | 6        | 71,8 |
| Portugal      | 84      | 5        | 74,4 | 7    | 72                        | 7        | 75,3 |
| Sénégal       | 102     | 5        | 72,9 | 3    | 90                        | 5        | 75,1 |

### 1.3 Ce que ça dit

1. **Les 14 nations ont assez de joueurs** : au moins 84 dans nos clubs à la création d'une partie 2, 72 après cinq
   saisons (39 dans les seules premières divisions d'un monde 1, qui n'aura pas de sélections). Aucune n'a besoin d'être
   complétée pour en avoir 23.
2. **Les petites nations fondent** : de −12 % (Sénégal) à −30 % (Croatie) en cinq saisons, parce que 85 % des jeunes
   ont la nationalité de leur club ; les cinq grandes grossissent.
3. **Les gardiens sont rares** : 5 pour la Côte d'Ivoire, le Portugal et le Sénégal (4 pour la Côte d'Ivoire en
   saisons 3 et 4) ; une sélection en appelle 3.
4. **L'ordre des forces n'est pas crédible** : les étrangers sont semés au hasard dans tous les clubs, quelle que soit
   leur nation, quand chacune des cinq grandes a 700 à 900 joueurs. Les cinq grandes forment les cinq meilleures
   sélections, leurs 23 tous joueurs de D1 ; le Brésil est 12e sur 14 à la création et dernier après cinq saisons, le
   Portugal 13e. Face à l'ensemble des autres, en moyenne, l'Allemagne attend +0,52 but par match, le Brésil −0,27, le
   Sénégal −0,62.
5. **Qui part en trêve** (23 par nation, 322 joueurs) : un club de D1 en prête 3,2 en moyenne (aucun pour 30 clubs sur
   96, jusqu'à 12 pour Arsenal, le PSG et l'Atalanta), un club de D2 de 0,1 à 0,3 (2 à 4 au plus) ; Lyon, 7 à la
   création, 4 cinq saisons plus tard.

### 1.4 Une nationalité crédible et déterministe, sans casser les parties existantes

- **Rien à donner** : chaque joueur, de la référence comme de toute partie, a déjà sa nationalité, tirée par une graine
  et accordée à son nom. La changer casserait cet accord et les parties existantes (la production a ces lignes par
  migration ; une partie copie l'identité à sa création).
- **Aucune nouvelle nationalité en v1** : ajouter une liste de noms changerait les tirages du monde (`NAME_BANK` :
  « changing it changes the world ») et ceux des jeunes de toutes les parties.
- **La crédibilité vient d'une réserve** (§ 2.3) : 23 joueurs hors championnats par nation, générés par la graine de la
  partie à un niveau propre à la nation, appelés seulement là où ils valent mieux que ceux de nos clubs ou là où il en
  manque. Elle règle aussi la fonte des petites nations et la rareté des gardiens. Elle naît avec une partie 2
  nouvelle, ou au prochain passage de saison d'une partie 2 existante, sans toucher à aucune ligne existante.
- **Option écartée** : baisser `YOUTH_HOME_NATIONALITY_SHARE` pour freiner la fonte : les jeunes de toutes les parties
  changeraient dès leur prochaine saison, pour un effet lent ; la réserve suffit.

## 2. Les nations

### 2.1 La liste

| Code | Nation (FR / EN)              | Zone   | Réserve (§ 2.3) |
| ---- | ----------------------------- | ------ | --------------- |
| GER  | Allemagne / Germany           | Europe | 62-70           |
| ENG  | Angleterre / England          | Europe | 62-70           |
| ESP  | Espagne / Spain               | Europe | 62-70           |
| FRA  | France / France               | Europe | 62-70           |
| ITA  | Italie / Italy                | Europe | 62-70           |
| POR  | Portugal / Portugal           | Europe | 72-81           |
| NED  | Pays-Bas / Netherlands        | Europe | 69-77           |
| BEL  | Belgique / Belgium            | Europe | 69-77           |
| CRO  | Croatie / Croatia             | Europe | 69-77           |
| BRA  | Brésil / Brazil               | Monde  | 72-81           |
| ARG  | Argentine / Argentina         | Monde  | 72-81           |
| MAR  | Maroc / Morocco               | Monde  | 66-74           |
| SEN  | Sénégal / Senegal             | Monde  | 66-74           |
| CIV  | Côte d'Ivoire / Ivory Coast   | Monde  | 66-74           |

Codes et noms traduits : ceux de `nationalityCode` et `world.nationalities`, déjà là. Une nation se montre par son code
dans une pastille, comme un club par ses initiales (`ClubInitials`), jamais par un écusson ni par le sigle d'une
fédération réelle (« la fédération du Portugal ») ; les couleurs de son drapeau, publiques, peuvent border la pastille.

### 2.2 La force d'une sélection

- **Les 23** (`callUp`, pur) : 3 gardiens, 7 défenseurs, 7 milieux, 4 attaquants, puis les 2 meilleurs joueurs de champ
  restants ; dans chaque ligne, les mieux notés de la nationalité, disponibles à la première date de la trêve (ni
  blessés, ni retraités, ni libres), dans nos clubs ou dans sa réserve. Ex aequo : l'identifiant, comme les compositions.
- **Le dispositif et le onze** : comme un club IA (`chooseFormation`, au niveau de la D1) : de tous les dispositifs,
  celui qui rapporte le plus de points face à l'adversaire moyen de D1 ; son onze par `selectRestedLineup` (un joueur
  fatigué reposé quand un reposé le vaut presque). Choisis une fois par trêve.
- **La force** : `formationStrength`, celle des matchs de club. Aucune note de sélection stockée : elle se refait à
  chaque trêve, avec la forme, la condition et les progrès des joueurs du moment.

### 2.3 La réserve « hors championnats »

- **23 joueurs par nation**, nés avec la nation dans la partie (flux `{graine}:nation-reserve:{code}`) : les postes d'un
  effectif type (`squadTemplate(23)`), un nom de la liste de la nation, 21 à 33 ans, une note dans la plage de la nation
  (§ 2.1), un potentiel ; leurs attributs dérivés de leur poste et de leur note, comme au seed, jamais stockés.
- **Ils jouent ailleurs**, dans des championnats que le jeu ne simule pas : ni club, ni marché, ni liste de joueurs
  libres, seulement leur sélection. Leur fiche dit « Hors championnats ».
- **Chaque saison**, au passage de saison : un an de plus, une note qui suit l'âge (progrès avant 27 ans, déclin après
  31, comme les joueurs des clubs) ; à 34 ans, retraite, et un joueur de 21 ans du même poste et de la même plage prend
  sa place.
- **Appelés seulement s'ils valent mieux** que le joueur de nos clubs qu'ils remplaceraient dans les 23, ou s'il en
  manque un. Une grande nation ne les appelle presque jamais ; le Brésil, l'Argentine et le Portugal environ la moitié
  de leurs 23 (estimation à mesurer en N1).
- **Plages** : le niveau des joueurs que chaque nation a hors de nos cinq pays. Ordre visé, à vérifier par la mesure de
  N1 : Allemagne, Espagne, France, Italie, Angleterre, Brésil, Argentine, Portugal entre 79 et 82 pour la moyenne du
  onze ; Pays-Bas, Croatie, Belgique vers 77-78 ; Maroc, Sénégal, Côte d'Ivoire vers 75-76.
- **Alternative stricte** (« si besoin » au pied de la lettre) : la réserve ne comble que les manques, et l'ordre reste
  celui du § 1.2, le Brésil et le Portugal parmi les plus faibles et de plus en plus faibles (point à trancher n° 2).

## 3. Le calendrier

### 3.1 Les trêves

Quatre par saison, aux semaines 3, 8, 13 et 32 (semaine 0 : le premier samedi de championnat, 3e samedi d'août),
chacune de deux matchs : **le vendredi qui précède le samedi de la semaine, et le mardi qui le suit**.

| Trêve     | Matchs (2026-27)            | Autour                                                    |
| --------- | --------------------------- | --------------------------------------------------------- |
| septembre | ven. 4 et mar. 8 septembre  | 3 journées jouées ; le mercato a fermé le 31 août          |
| octobre   | ven. 9 et mar. 13 octobre   | 7 journées jouées                                          |
| novembre  | ven. 13 et mar. 17 novembre | 11 journées jouées                                         |
| mars      | ven. 26 et mar. 30 mars     | 29 journées jouées ; la dernière avant le sprint final     |

Règle d'une trêve de la semaine s : aucun match de club le samedi de s, ni le mardi ou le mercredi de s, ni le
mercredi de s − 1 ; le dernier match de club avant elle est le samedi de s − 1 (6 jours avant le vendredi), le suivant
le samedi de s + 1 (4 jours après le mardi). Dates pures, sans tirage (`breakDates(startYear)`), qui suivent chaque
année le premier samedi de championnat.

### 3.2 Championnats et coupes pendant les trêves

Tout s'arrête, deuxièmes divisions comprises (elles ne prêtent presque aucun joueur, mais un calendrier commun est plus
simple et plus juste). Le début (3e samedi d'août) et la fin (dernière journée mi-mai, finale de coupe une semaine
après, finales européennes la semaine suivante) ne bougent pas : il reste 36 samedis de club au lieu de 40, et les
journées en trop passent au mardi.

| Championnat                                        | Journées | Aujourd'hui                     | Avec les trêves         |
| -------------------------------------------------- | -------- | ------------------------------- | ----------------------- |
| D1 et D2 allemandes et françaises                  | 34       | 34 samedis, 6 samedis de repos  | 34 samedis, 2 de repos  |
| D1 anglaise, espagnole, italienne ; D2 italienne   | 38       | 38 samedis, 2 de repos          | 36 samedis + 2 mardis   |
| D2 espagnole                                       | 42       | 40 samedis + 2 mardis           | 36 samedis + 6 mardis   |
| D2 anglaise                                        | 46       | 40 samedis + 6 mardis           | 36 samedis + 10 mardis  |

Mercredis et mardis redistribués pour respecter la règle du § 3.1 et celle d'aujourd'hui (jamais un mardi de
championnat et un mercredi de coupe ou d'Europe la même semaine : aucun club ne joue trois fois dans une semaine) :

| Semaines | Aujourd'hui                     | Avec les trêves                                                                  |
| -------- | ------------------------------- | -------------------------------------------------------------------------------- |
| Europe   | 4, 6, 8, 10, 14, 17, 24, 28, 36 | 4, 6, **9, 11**, 14, 17, 24, 28, 36 : 3e journée le 21 octobre (au lieu du 14), 4e le 4 novembre (au lieu du 28 octobre) |
| Coupe    | 5, 12, 20, 26, 33               | 5, **15**, 20, 26, 33 : seizièmes le 2 décembre (au lieu du 11 novembre)          |
| Mardis   | 3, 9, 16, 22, 29, 35            | dans l'ordre d'usage : **19, 29** pour les 38 journées (29 décembre, 9 mars), puis 10, 22, 34, 16 pour les 42, puis 2, 7, 25, 37 pour les 46 |

Toujours **62 dates de club** par saison (36 samedis, 10 mardis, 6 dates de coupe, 10 d'Europe, contre 40, 6, 6 et
10) : la partie ne passe pas plus de dates, donc pas plus de récupérations. Un club anglais, espagnol ou italien de D1
joue deux mardis de championnat, à Noël et en mars ; un club allemand ou français a quatre samedis de repos de moins.
Les dates des trêves ne sont pas des dates de la partie (§ 7.2) : elle passe du samedi d'avant la trêve au samedi
d'après.

### 3.3 L'été du tournoi

Un été sur deux, à la fin de la deuxième saison d'un cycle, cinq dates à quatre jours d'écart, à partir du vendredi
qui suit d'une semaine les finales européennes : vendredi, mardi et samedi (les trois journées de groupes), mercredi
(demi-finales), dimanche (finale). En 2028 : 9, 13, 17, 21 et 25 juin ; selon les années, la finale tombe entre le 19 et
le 26 juin, avant le 1er juillet et la saison suivante.

« Passer à la saison suivante » arrive comme aujourd'hui, une fois joués les matchs de club de la saison, et le passage
de saison joue d'abord le tournoi (simulation légère, environ 15 ms), sauf si le joueur dirige une nation qualifiée
(§ 5) : ses matchs sont alors des dates de la partie, comme une finale européenne, et le passage attend son élimination
ou la finale. Aucune fatigue ne passe l'été (la présaison rend 5 points par jour) ; une blessure de juin peut durer
jusqu'en août.

### 3.4 Le cycle d'une partie

Deux saisons, huit trêves, seize dates, puis le tournoi. Le cycle est propre à chaque partie : le premier commence à sa
première saison avec éliminatoires (`Save.cyclesFrom`), et les tournois alternent en commençant par l'Europe. Une
nouvelle partie (2026-27) : Coupe du Vieux Continent en juin 2028, Coupe des Hémisphères en juin 2030, et ainsi de
suite, les années des vrais tournois ; une partie existante dont les éliminatoires commencent en 2027-28 : juin 2029,
puis 2031. Toute partie joue un cycle complet avant son premier tournoi.

### 3.5 Les parties existantes

- **À partir de leur prochaine saison seulement** : les matchs d'une saison sont créés à son ouverture
  (`advanceToNextSeason`), et les tours de coupe et d'Europe encore à tirer suivent les dates de leur saison :
  `matchdayDates`, `cupDates` et `europeDates` prennent un drapeau, vrai pour une saison commencée à partir de
  `Save.breaksFrom` (posé à la création d'une partie 2, et au prochain passage de saison d'une partie 2 existante). La
  saison en cours ne bouge pas, ses tours encore à tirer non plus.
- **Parties 1** : rien, comme pour la coupe et l'Europe.
- **Parties du défi** : rien, ni trêve ni nation, à aucune saison : leur calendrier reste celui d'aujourd'hui, le même
  pour tous les joueurs d'une semaine, quel que soit le jour de la mise en ligne.

## 4. Les compétitions

### 4.1 Noms

Recherchés sur le web le 18/11 (compétitions, tournois, jeux, bases de marques en ligne) :

| Tournoi | Nom (FR / EN)                                   | Ce qu'on trouve                                                                                           |
| ------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Europe  | **Coupe du Vieux Continent / Old Continent Cup** | rien sous ce nom ; « Continental Cup » existe (hockey sur glace, coupe de la ligue féminine anglaise), « Intercontinental Cup » aussi : d'où « Vieux Continent », jamais « Continental » |
| Europe  | Coupe des Étendards / Banner Cup                 | rien ; « Étendard » est le nom d'un petit club martiniquais                                                 |
| Europe  | Coupe des Hymnes / Anthem Cup                    | rien comme compétition (des hymnes de tournois, oui)                                                      |
| Monde   | **Coupe des Hémisphères / Hemispheres Cup**     | rien ; « HEMISPHERES » : quelques marques sans rapport (logiciel, papeterie), aucune coupe                  |
| Monde   | Coupe des Alizés / Trade Winds Cup               | rien ; proche, par le sens, du cadre « Rose des vents » de la collection                                   |

Recommandation : **Coupe du Vieux Continent et Coupe des Hémisphères**, qui disent l'Europe et le monde sans aucun mot
réservé. Écartés : « Meridian Cup » (un vrai tournoi de jeunes entre l'Europe et l'Afrique), « Coupe des Nations » ou
« Nations Cup » (premier nom du championnat d'Europe, et d'autres sports), « Coupe des Continents » (trop proche des
coupes intercontinentales et des confédérations), « Globe » (des trophées du football existent sous ce nom),
« Mondial ». Ce n'est pas un avis juridique : une recherche d'antériorité (INPI, EUIPO, USPTO) avant la mise en ligne
reste prudente.

`FORBIDDEN_NAMES` (`src/lib/outward-names.ts`) reçoit « World Cup », « Coupe du monde », « Mondial », « Championnat
d'Europe », « European Championship », « Nations League », « Ligue des nations », « Copa América », « Coupe d'Afrique »,
« Africa Cup of Nations », « Gold Cup », « Confederations Cup », « Coupe des confédérations », « Finalissima »,
« Meridian Cup », et les sigles des fédérations des 14 nations. Codes (jamais affichés) : `int.friendly`,
`int.qual.eu`, `int.qual.world`, `int.eu`, `int.world`. Libellés (`stageLabel`) : « Coupe des Hémisphères —
Éliminatoires, 5e journée », « — Groupe A, 2e journée », « — Demi-finale », « — Finale », « Match amical ».

### 4.2 Les éliminatoires

| Cycle   | Zone Europe (9 nations)                                                  | Zone Monde (5 nations)                                   | Tournoi                        |
| ------- | ------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------ |
| Europe  | une poule, matchs simples : chacune rencontre les 8 autres une fois (4 à domicile, 4 à l'extérieur), 9 journées, une exempte à chacune ; **les 6 premières qualifiées** | matchs amicaux                                           | Coupe du Vieux Continent (6)   |
| Monde   | la même poule ; **les 5 premières qualifiées**                            | une poule aller-retour : 8 matchs, 10 journées, une exempte à chacune ; **les 3 premières qualifiées** | Coupe des Hémisphères (8)      |

- Une journée par trêve, le vendredi ; les journées en plus (la 9e d'Europe, les 9e et 10e du Monde) le mardi des
  dernières trêves du cycle : la trêve de mars de la deuxième saison décide.
- Départage : points, différence, buts marqués, force à l'ouverture du cycle, code.
- Pourquoi pas l'aller-retour en Europe : 18 journées pour 16 dates. Pourquoi une seule poule : un seul tableau à lire,
  et chaque match compte jusqu'au bout.

### 4.3 Les matchs amicaux

Chaque nation joue les deux dates de chaque trêve. Celles qui n'ont pas de match d'éliminatoires ce jour-là (les
exemptes, la zone Monde en cycle Europe, presque toutes le mardi) sont appariées par une fonction pure : d'abord les
paires qui ne se sont pas rencontrées depuis le plus longtemps, puis les forces les plus proches ; à domicile, celle qui
a le moins reçu. Toujours 7 matchs par date. Aucun enjeu, mais les sélections, les buts, la fatigue et les blessures
comptent ; un sélectionneur les laisse à son adjoint par défaut (§ 5.2).

### 4.4 La Coupe du Vieux Continent (6 nations)

Deux groupes de 3, tirés par chapeaux de deux selon l'ordre des éliminatoires (1er-2e, 3e-4e, 5e-6e) ; chaque nation
joue deux matchs de groupe (trois journées, une nation au repos à chacune) ; les deux premiers de chaque groupe en
demi-finales (A1-B2, B1-A2), puis la finale. 9 matchs, tous sur terrain neutre. Départage des groupes comme les
éliminatoires, la force au tirage avant le code.

### 4.5 La Coupe des Hémisphères (8 nations)

Deux groupes de 4 (chapeaux de deux : les deux premiers de zone, puis les autres par points par match des
éliminatoires), trois journées, demi-finales A1-B2 et B1-A2, finale. 15 matchs, terrain neutre.

### 4.6 Prolongation et tirs au but

Demi-finales et finales : nul après 90 minutes, prolongation puis tirs au but, comme la coupe. Pour la nation du
sélectionneur, le moteur de toujours (`startMatch` en élimination directe et sur terrain neutre, `playShootout`). Pour
les autres, la version légère : une prolongation aux buts attendus divisés par trois et répartis comme ceux du moteur
(`EXTRA_TIME_GOAL_WEIGHTS`), puis la séance, chaque tir avec `shootoutChance` (les cinq meilleurs tireurs sur le
terrain contre le gardien), puis la mort subite. Groupes et éliminatoires peuvent finir nuls.

### 4.7 La simulation légère

Une fonction pure (`src/engine/international.ts`) pour chaque match qui n'est pas celui du sélectionneur :

- les buts attendus de chaque équipe, par la formule du moteur (`expectedGoals`, avantage du terrain en éliminatoires et
  en amical, aucun en tournoi), pour la force du § 2.2 ;
- les buts tirés par la loi de Poisson, leurs minutes selon le poids de chaque quart d'heure (`REGULATION_GOAL_WEIGHTS`),
  chaque buteur parmi les joueurs sur le terrain selon sa part de l'attaque (les poids de `teamStrength`) ;
- qui joue : le onze, trois changements à la 60e, la 70e et la 80e (les joueurs de champ les plus fatigués), cinq en
  amical ; chacun perd sa condition comme en club (−5 par quart d'heure, −1,5 pour un gardien, `fitnessAfter`) ; les
  blessures au taux du moteur (`INJURIES_PER_TEAM`, 0,12 par équipe et par match, `injuryRiskFactor` sous 70, 7 à
  42 jours), tirées joueur par joueur selon ses minutes ;
- rien d'autre : ni événement, ni carton, ni décision, ni note, ni forme.

Graine `{graine}:intl:{date}:{domicile}:{extérieur}` : même partie, mêmes résultats. Coût visé : environ 50 µs par
match, contre 1,5 ms pour un match de club.

## 5. Le rôle de sélectionneur

### 5.1 L'offre

- **Quand** : à un passage de saison, dès la fin de la première, sur l'écran de début de saison (puis une ligne
  d'« À faire » jusqu'au premier match) ; jamais pendant la saison, jamais dans une partie du défi, une seule nation à la
  fois.
- **De qui** : jusqu'à deux nations dont le manager atteint le seuil, tirées par la graine parmi elles, à n'importe quel
  moment de leur cycle (une fédération qui change d'entraîneur en cours d'éliminatoires, ça arrive).
- **Le seuil, par le prestige du manager** (`managerPrestige`, pur) : la réputation de son club (1-99), + 5 par trophée
  des deux dernières saisons (championnat de D1, coupe, Coupe des Lauriers ou des Fanions ; +3 pour un titre de D2 ou
  une montée), +10 au plus, + 5 pour un tournoi dépassé comme sélectionneur. Seuils, selon le rang de force de la nation
  au moment de l'offre : 1re à 5e, 85 ; 6e à 10e, 75 ; 11e à 14e, 65. Un club de tête de D1 (réputation 85 à 90) reçoit
  les offres des grandes nations dès sa deuxième saison ; un club moyen de D1 (70 à 75), celles du milieu ; un club de D2
  (40 à 60), aucune avant une montée et des trophées.
- **La carte** « Offre de la fédération du Portugal » : l'objectif (§ 5.3), la prochaine trêve, « Tu gardes ton club » ;
  « Voir l'offre » ouvre une feuille dont « Accepter le poste » est le seul orange (comme l'achat de la boutique) ;
  « Pas maintenant » la ferme, d'autres offres viendront.

### 5.2 Ce que fait le sélectionneur

- **Les convocations** : à chaque trêve, la liste de l'adjoint (les 23 du § 2.2) est prête une semaine avant ; le joueur
  la change jusqu'au premier match de la trêve (23 joueurs, dont au moins 3 gardiens ; jamais un blessé), sinon elle part
  telle quelle. Pour chacun : son club (ou « Hors championnats »), sa note, sa condition, ses sélections.
- **La composition** : l'éditeur de composition du club, avec les 23 pour effectif (dispositif, onze, banc, consigne de
  départ) ; sans changement, celle de l'adjoint.
- **Les matchs** : ceux de sa nation sont des dates où la partie s'arrête, comme un match du club : « Prochain match » y
  mène, puis « Jouer le match » (le direct, N4b) ou « Simuler ». Par défaut, l'adjoint joue les amicaux sans arrêt
  (« L'adjoint joue les amicaux », `nation-delegate-friendlies`) ; il peut aussi les laisser tous à l'adjoint.
- **Le direct (N4b)** : l'écran du direct du club, avec les pastilles des nations, la compétition et le tour, « Terrain
  neutre » en tournoi ; événements à choix, remplacements et consignes comme en club.

### 5.3 L'objectif de la fédération, et l'échec

| Rang de force de la nation, à son arrivée | Objectif           | Dépassé          |
| ----------------------------------------- | ------------------ | ---------------- |
| premier tiers                             | la finale          | le titre         |
| deuxième tiers                            | les demi-finales   | la finale        |
| troisième tiers                           | la qualification   | les demi-finales |

Les tiers se comptent parmi les nations qui visent le tournoi du cycle : en cycle Europe, les 9 européennes (1re-3e,
4e-6e, 7e-9e) ; en cycle Monde, les 14 (1re-4e, 5e-9e, 10e-14e). Une nation de la zone Monde en cycle Europe n'a pas
d'objectif : « Prépare le cycle suivant ».

- **Pas qualifiée** : fin de mission à la dernière trêve des éliminatoires (« La fédération met fin à ta mission »).
- **Tournoi sous l'objectif** : fin de mission au passage de saison qui le suit. **Atteint** : un nouveau cycle, un
  nouvel objectif. **Dépassé** : +5 de prestige pour les offres suivantes.
- **Démission** : à tout passage de saison (« Quitter la sélection »).
- **Rien pour le club** : ni confiance du président, ni budget, ni réputation. L'Histoire garde la mission (§ 9.9).

### 5.4 Garder son club sans corvée

- Aucun chevauchement : la sélection joue pendant les trêves et en juin, quand le club ne joue pas.
- Peu d'arrêts : 4 par saison avec les amicaux à l'adjoint (8 sans), 4 ou 5 un été sur deux ; tous simulables d'un
  geste.
- Rien d'obligatoire : convocations et composition de l'adjoint par défaut ; une ligne d'« À faire » une semaine avant
  la trêve (« Convocations pour la trêve du 9 octobre : la liste de l'adjoint est prête »), jamais bloquante.
- Le choix intéressant vient de lui-même : appeler les joueurs de son propre club, c'est les fatiguer pour le samedi
  d'après.

### 5.5 Ce qu'il y gagne

L'Histoire (la salle des trophées reçoit la Coupe du Vieux Continent et la Coupe des Hémisphères, « À conquérir » dès sa
première mission ; sa carrière de sélectionneur), une ligne de la carte de fin de saison, ses titres sur la carte de
carrière, et un titre de la collection, « Sélectionneur », pour un tournoi gagné (identifiant à créer, jamais renommé).
Ni jetons ni missions en v1.

## 6. Les effets sur les clubs

### 6.1 Qui part

Les chiffres du § 1.3 : un club de D1 prête 3,2 joueurs par trêve en moyenne, jusqu'à 12 ; un club de D2, presque
aucun. Avec la réserve, le Brésil, l'Argentine et le Portugal appellent la moitié de leurs 23 ailleurs : environ 280 à
300 joueurs de nos clubs par trêve au lieu de 322 (à mesurer). Clubs IA compris, mêmes règles ; aucun club ne refuse.
Aucun match de club pendant une trêve : personne ne manque un match de son club ; ce qui revient, c'est la fatigue et
les blessures.

### 6.2 Fatigue

Un international de champ qui joue les deux matchs en entier :

| Match                               | Au coup d'envoi | À la fin |
| ----------------------------------- | --------------- | -------- |
| samedi, club (semaine s − 1)        | 100             | 70       |
| vendredi, sélection (6 jours après) | 100             | 70       |
| mardi, sélection (4 jours après)    | 90              | 60       |
| samedi, club (4 jours après)        | **80**          | 50       |

Sans la trêve, il reviendrait à 100. À 80, la rotation des clubs IA ne le repose pas, et sa force y perd 3 % au coup
d'envoi. Après les trêves d'octobre et de novembre, un club d'Europe joue un mercredi la semaine suivante (21 octobre,
25 novembre) : l'international y arrive à 70 et le samedi suivant à 55, où la rotation le repose. Un remplaçant de sa
sélection revient à 100.

### 6.3 Blessures

Au taux du moteur : environ 13 blessures par saison parmi les internationaux (56 matchs, deux équipes, 0,12 par équipe
et par match), 2 à 4 de plus un été de tournoi, de 7 à 42 jours. Un club à 7 internationaux : environ 0,15 blessure par
trêve, 0,6 par saison. « Blessé en sélection » est dit dans le résumé de la simulation, dans « À faire » et sur la fiche
du joueur.

### 6.4 Forme

Inchangée : la simulation légère ne note personne, et la forme reste celle du club. De même pour les matchs du
sélectionneur en v1.

### 6.5 Valeur

Inchangée : `marketValueFor` est une fonction pure de la note, de l'âge et du potentiel, lue par le marché, les ventes
et l'IA des transferts ; une prime d'international toucherait tous les prix et l'équilibre du marché. Une décision à
part, à mesurer (point à trancher n° 8).

### 6.6 Clubs IA

Mêmes règles : leurs joueurs partent, jouent, se fatiguent, se blessent ; leur rotation (`selectRestedLineup`,
`maxRotationGap`) gère le retour. Rien dans leurs transferts.

### 6.7 Alertes et écrans du club

- **Avant une trêve**, dès le dernier match de club qui la précède : « À faire », `international-callups` : « Trêve du 9
  au 13 octobre : 6 joueurs appelés en sélection » (une information, vers l'effectif) ; dans l'effectif et la
  composition, l'état « En sélection » (bleu) sur les appelés.
- **Après** : `international-returns` : « Retour de sélection : Diallo blessé (12 jours), 3 joueurs sous 75 », au rang
  des titulaires blessés quand un titulaire l'est ; la fiche du joueur le dit.
- **Le héros de l'Accueil** : « Après la trêve internationale » sous la date du prochain match quand une trêve le
  précède.
- **Le résumé d'une simulation** qui passe une trêve : ses matchs, les joueurs du club, leurs buts et leurs blessures.

## 7. Le coût CPU

### 7.1 Matchs en plus

56 par saison (7 par date, 8 dates), + 9 (Vieux Continent) ou 15 (Hémisphères) un été sur deux : environ 62 par saison
en moyenne, +1,5 % des quelque 4 060 matchs de club d'une partie 2 avec l'Europe. Tous légers, sauf ceux de la nation
du sélectionneur (8 à 13 par saison, comme des matchs de club).

### 7.2 Par trêve

Une trêve se joue **d'un bloc**, dans la transaction de la première date de la partie qui la suit (le samedi de s + 1),
avant les matchs de cette date. Aucune date de plus pour la partie, donc aucune récupération de plus : la condition des
appelés est calculée en mémoire jusqu'à ce samedi, et leur ligne écrite une fois.

| Étape                                                                                                     | Requêtes | CPU estimé |
| --------------------------------------------------------------------------------------------------------- | -------- | ---------- |
| les candidats : les meilleurs de chaque nationalité et de chaque ligne (`ROW_NUMBER`, environ 450 lignes) | 1        | ~2 ms      |
| les réserves des 14 nations                                                                               | 1        | ~1 ms      |
| dispositif et onze des 14 nations (`chooseFormation`, 0,19 ms chacun)                                     | —        | ~3 ms      |
| 14 matchs légers                                                                                          | —        | < 1 ms     |
| écritures : environ 300 joueurs en une requête, 14 matchs, compteurs des réserves                         | 3        | ~3 ms      |
| **une trêve**                                                                                             | **5**    | **~10 ms** (30 à 40 ms de durée avec la base) |

Repère : un samedi complet d'une partie 2 coûte environ 164 ms. Par saison : environ 40 ms (+0,5 % des 8,5 à 9,5 s
d'une saison) ; un tournoi, environ 15 ms dans le passage de saison. Pour un sélectionneur, chaque match de sa nation
coûte un match de club (1,5 ms de moteur, ses étapes de direct), et chacun de ses 4 à 13 arrêts par saison est une date
avec récupération, comme une date de coupe : pour lui seul. À vérifier sous profileur sur une saison avec trêves, comme
le chantier « cpu ».

## 8. Le poids en base

| Quoi                     | Lignes                 | Poids                                                                                         |
| ------------------------ | ---------------------- | --------------------------------------------------------------------------------------------- |
| `InternationalMatch`     | environ 62 par saison  | environ 300 octets par match (scores, minutes et buteurs, deux index) : **~20 Ko par saison**  |
| `NationSave` (réserves)  | 14 par partie          | ~30 Ko à l'ouverture, réécrits une fois par saison ; les compteurs des réservistes à chaque trêve, à part du JSON (que PostgreSQL ne réécrit pas) |
| `PlayerSave`             | 2 colonnes entières    | ajoutées sans réécrire la table (défaut constant) ; +8 octets par ligne au fil des écritures, ~40 Ko par partie ; environ 1 200 écritures de plus par saison (300 par trêve), +1 % des écritures de joueurs, HOT |
| `SeasonResult.highlights` | —                     | sélections et buts de la saison des joueurs du club : ~0,5 Ko par saison                       |

Total : **environ 20 Ko par saison et 70 Ko une fois par partie**. Repère : une carrière archivée grossit d'environ
0,7 à 0,8 Mo compacts par saison (6,28, 6,97, 7,71 et 8,48 Mo à la création puis après 1, 2 et 3 saisons) : +3 %.
L'archivage ne change rien : `InternationalMatch` reste tel quel (petit, lu par l'Histoire), hors de `SeasonArchive`,
et le nettoyage des événements ne le concerne pas (aucun `MatchEvent`). Les événements des matchs du sélectionneur
(environ 2 Ko par match, N4b) pourront être nettoyés comme ceux du club, une fois leur saison terminée. Mesure :
`measure:weight -- --archive` avec les sélections, cible moins de 50 Ko par saison.

## 9. Les écrans

Toujours cinq entrées. Match reçoit un onglet « Sélections » (« Internationals », `nav-internationals`), après Europe,
dans une partie qui a des nations ; Équipe un onglet « Sélection » (« National team », `nav-nation`) pour le seul
sélectionneur. Match aura jusqu'à cinq onglets (Calendrier, Classement, Coupe, Europe, Sélections) : la bascule doit
tenir à 360 px, sur deux lignes ou avec des libellés courts, à vérifier en N1. Maquettes à 390 px ; FR et EN, aucun
défilement de côté à 390 ni 360 px, cibles de 44 px.

### 9.1 La fiche du joueur

```
┌────────────────────────────────────────┐
│ KD   K. DIALLO                  AT  78 │
│      Sénégal · 24 ans · Lyon           │
├────────────────────────────────────────┤
│ SÉLECTION                              │
│ (SEN) 23 sélections · 7 buts           │
│ Appelé pour la trêve du 9 au 13 oct.   │
├────────────────────────────────────────┤
│ Saison · Attributs · Contrat …         │
└────────────────────────────────────────┘
```

Après une blessure : « Blessé avec le Sénégal le 13/10 · retour le 25/10 ». Un réserviste (vu depuis les convocations du
sélectionneur) : « Hors championnats » à la place du club, ni contrat ni transfert.

### 9.2 L'effectif (cartes sous 1024 px)

```
┌────────────────────────────────────────┐
│ 78 AT   K. Diallo         24 · SEN     │
│ forme ▮▮▮▮▯   ♥ 92   [En sélection]    │
└────────────────────────────────────────┘
```

### 9.3 L'Accueil

Avant la trêve :

```
┌────────────────────────────────────────┐
│ À FAIRE                                │
│ ● Trêve du 9 au 13 octobre :           │
│   6 joueurs appelés en sélection     > │
└────────────────────────────────────────┘
```

Après :

```
┌────────────────────────────────────────┐
│ SAM. 17 OCT. · D1 · DOMICILE           │
│ Après la trêve internationale          │
│ LYO 5e              NAN 12e            │
│ [ Jouer le match ]                     │
├────────────────────────────────────────┤
│ À FAIRE                                │
│ ● Retour de sélection : Diallo blessé  │
│   (12 jours), 3 joueurs sous 75      > │
└────────────────────────────────────────┘
```

### 9.4 Le calendrier

```
┌────────────────────────────────────────┐
│ OCTOBRE 2026                           │
│ sam. 3    NAN   D1           V  2-1    │
│ ┄┄ TRÊVE INTERNATIONALE · 9-13 OCT. ┄┄ │
│ 6 joueurs appelés · 1 blessé         > │
│ sam. 17   LEN   D1        [Suivant]    │
│ mer. 21   RMA   LAURIERS               │
└────────────────────────────────────────┘
```

La ligne de trêve ouvre ses matchs (onglet Sélections) ; en juin d'un été de tournoi, « COUPE DES HÉMISPHÈRES · 9-25
JUIN · 4 de tes joueurs ».

### 9.5 Match → Sélections

```
┌────────────────────────────────────────┐
│ Calendrier Classement Coupe Europe Sél.│
├────────────────────────────────────────┤
│ COUPE DES HÉMISPHÈRES 2030             │
│ Éliminatoires · 7 trêves sur 8         │
│ Dernière trêve : 26-30 mars            │
├────────────────────────────────────────┤
│ ZONE EUROPE · 5 QUALIFIÉS              │
│    Nation            J   Diff   Pts    │
│ 1  GER Allemagne     7   +11    17     │
│ 2  ESP Espagne       6    +7    14     │
│ 3  FRA France        7    +6    13     │
│ 4  ITA Italie        6    +3    11     │
│ 5  POR Portugal      7    +1     9     │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ 6  ENG Angleterre    6     0     8     │
│ …                                      │
├────────────────────────────────────────┤
│ ZONE MONDE · 3 QUALIFIÉS               │
│ …                                      │
├────────────────────────────────────────┤
│ TES JOUEURS EN SÉLECTION               │
│ K. Diallo   SEN   4 matchs · 2 buts    │
│ M. Roy      FRA   3 matchs             │
├────────────────────────────────────────┤
│ TRÊVE DE NOVEMBRE                      │
│ ven. 13/11   FRA 2-0 CRO   Élim.       │
│ …                                      │
└────────────────────────────────────────┘
```

L'été du tournoi : ses groupes et son tableau, comme la page Europe (« Terrain neutre »). À partir de 1280 px, les deux
zones côte à côte. Aucun orange plein : l'action de jeu reste dans la colonne.

### 9.6 L'offre (écran de début de saison)

```
┌────────────────────────────────────────┐
│ OFFRE DE SÉLECTION                     │
│ (POR) La fédération du Portugal te     │
│ propose son poste de sélectionneur.    │
│ Objectif : la qualification pour la    │
│ Coupe des Hémisphères 2030, puis les   │
│ demi-finales.                          │
│ Tu gardes ton club : la sélection joue │
│ pendant les trêves et en juin.         │
│ [ Voir l'offre ]     Pas maintenant    │
└────────────────────────────────────────┘
```

« Voir l'offre » ouvre une feuille (le détail, le calendrier du cycle, « Accepter le poste », son seul orange).

### 9.7 Équipe → Sélection (le sélectionneur)

```
┌────────────────────────────────────────┐
│ Effectif · Composition · Sélection     │
├────────────────────────────────────────┤
│ (POR) PORTUGAL                         │
│ Sélectionneur depuis 2027-28           │
│ Objectif : qualification (5e ou mieux) │
│ Zone Europe : 4e · 8 pts · 5 matchs    │
├────────────────────────────────────────┤
│ TRÊVE DU 26 AU 30 MARS                 │
│ ven. 26   POR – NED   Élim. · domicile │
│ mar. 30   BRA – POR   Amical · adjoint │
├────────────────────────────────────────┤
│ CONVOCATIONS · liste de l'adjoint      │
│ 23 joueurs : 12 de nos clubs, 11 hors  │
│ championnats, dont 2 de ton club     > │
│ COMPOSITION · 4-2-3-1 large · auto   > │
│ [✓] L'adjoint joue les amicaux         │
├────────────────────────────────────────┤
│ Quitter la sélection                   │
└────────────────────────────────────────┘
```

Les convocations, en feuille :

```
┌────────────────────────────────────────┐
│ CONVOCATIONS · 23 / 23    Réinitialiser│
│ GARDIENS · 3                           │
│ [✓] 81  R. Costa   Hors championnats   │
│ [✓] 76  D. Sá      Nantes · ♥ 100 · 12 │
│ …                                      │
│ DÉFENSEURS · 7                         │
│ …                                      │
│ NON APPELÉS                            │
│ [ ] 74  J. Mendes  ton club · ♥ 85     │
│ [ Enregistrer la liste ]               │
└────────────────────────────────────────┘
```

« Enregistrer la liste » est l'orange de la feuille ; sur l'onglet, l'action de jeu de la colonne reste secondaire.

### 9.8 Le direct d'un match de sélection (N4b)

```
┌────────────────────────────────────────┐
│ COUPE DES HÉMISPHÈRES — DEMI-FINALE    │
│ mer. 21 juin 2030 · Terrain neutre     │
│   POR    2 - 1    ARG          67'     │
│ ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯      │
│ Consigne : Fermer · la tienne          │
└────────────────────────────────────────┘
```

Le reste de l'écran est celui du club : fil, statistiques, cartes de pause et d'événement, panneau Coaching.

### 9.9 L'Histoire

```
┌────────────────────────────────────────┐
│ SALLE DES TROPHÉES                     │
│ …                                      │
│ Coupe du Vieux Continent   À conquérir │
│ Coupe des Hémisphères      1 · 2030    │
├────────────────────────────────────────┤
│ SÉLECTIONS                             │
│ Sélectionneur du Portugal, 2027-28 →   │
│ 2029-30 · vainqueur de la Coupe des    │
│ Hémisphères 2030                       │
│ Tes internationaux                     │
│ K. Diallo  SEN   31 sél. · 9 buts      │
│ M. Roy     FRA   18 sél. · 2 buts      │
│ Les titres de tes joueurs              │
│ 2028 · Coupe du Vieux Continent :      │
│ M. Roy (France)                        │
└────────────────────────────────────────┘
```

Les deux tuiles de trophée n'apparaissent qu'après une première mission de sélectionneur. « Tes internationaux » : les
joueurs du club, leurs sélections et buts pendant qu'ils y étaient (relevé de fin de saison, § 10) ; « Les titres de tes
joueurs » : ceux qui ont gagné un tournoi en étant au club.

### 9.10 Les cartes

- **Fin de saison** (PNG) : la saison où il dirige une nation, une ligne au pied, « SÉLECTIONNEUR DU PORTUGAL · COUPE
  DES HÉMISPHÈRES : DEMI-FINALE » ; aucun nom de club, comme aujourd'hui ; `SEASON_CARD_VERSION` 3.
- **Carrière** : ses titres de sélectionneur parmi les trophées ; `CAREER_CARD_VERSION` 2.

## 10. Les données et migrations (ajout uniquement)

**Isolées par construction** : ni ligne `Competition`, ni valeur d'enum, ni `Season`, ni `Fixture` pour les
compétitions internationales ; ce sont des codes dans leur propre table, nommés par les messages (zone nouvelle
`nations`). Aucun lecteur d'aujourd'hui (championnat, coupe, Europe, classement, archives, nettoyage) ne peut les voir.
Toute requête porte le `saveId` ; tout part avec la partie (cascade). Aucune migration de données : des défauts, et les
lignes de `NationSave` écrites par le code (à la création, ou au prochain passage de saison d'une partie 2 existante).

N1 :

```sql
CREATE TABLE "NationSave" (
  "id" TEXT NOT NULL,
  "saveId" TEXT NOT NULL,
  "code" TEXT NOT NULL,                              -- « POR »
  "reserve" JSONB NOT NULL,                          -- ses 23 joueurs hors championnats (validé par Zod)
  "reserveCaps" INTEGER[] NOT NULL DEFAULT '{}',     -- leurs sélections, dans l'ordre de reserve
  "reserveGoals" INTEGER[] NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NationSave_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NationSave_saveId_code_key" ON "NationSave"("saveId", "code");
ALTER TABLE "NationSave" ADD CONSTRAINT "NationSave_saveId_fkey"
  FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

N2 :

```sql
ALTER TABLE "PlayerSave" ADD COLUMN "caps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "internationalGoals" INTEGER NOT NULL DEFAULT 0;   -- sur toute la carrière du joueur
ALTER TABLE "Save" ADD COLUMN "breaksFrom" INTEGER;               -- première saison avec trêves ; null : aucune

CREATE TABLE "InternationalMatch" (
  "id" TEXT NOT NULL,
  "saveId" TEXT NOT NULL,
  "startYear" INTEGER NOT NULL,                      -- la saison du match (juin : celle qui finit)
  "competition" TEXT NOT NULL,                       -- int.friendly, int.qual.eu, int.qual.world, int.eu, int.world
  "round" INTEGER NOT NULL,                          -- journée ; en tournoi : 1-3 groupes, 4 demi-finales, 5 finale
  "pool" INTEGER,                                    -- groupe d'un tournoi (0, 1) ; null ailleurs
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "home" TEXT NOT NULL,                              -- code de la nation
  "away" TEXT NOT NULL,
  "neutral" BOOLEAN NOT NULL DEFAULT false,
  "played" BOOLEAN NOT NULL DEFAULT false,
  "homeGoals" INTEGER, "awayGoals" INTEGER,
  "decidedBy" "DecidedBy", "homePenalties" INTEGER, "awayPenalties" INTEGER,
  "winner" TEXT,                                     -- qualifié d'un match à élimination directe
  "goalTimes" INTEGER[] NOT NULL DEFAULT '{}',       -- comme Fixture.goalTimes
  "scorers" TEXT[] NOT NULL DEFAULT '{}',            -- la clé du buteur de chaque but, même ordre
  CONSTRAINT "InternationalMatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InternationalMatch_saveId_scheduledAt_idx" ON "InternationalMatch"("saveId", "scheduledAt");
CREATE INDEX "InternationalMatch_saveId_competition_startYear_idx"
  ON "InternationalMatch"("saveId", "competition", "startYear");
ALTER TABLE "InternationalMatch" ADD CONSTRAINT "InternationalMatch_saveId_fkey"
  FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

`DecidedBy` existe déjà (la coupe). Les buteurs sont des clés de joueur (`playerKey`, ou `reserve:POR:7`), jamais une
clé étrangère vers `PlayerSave` : rien à ajouter à la cascade d'une partie.

N3 : `ALTER TABLE "Save" ADD COLUMN "cyclesFrom" INTEGER;` (première saison du premier cycle). Le relevé de fin de
saison (`SeasonResult.highlights`, Json) passe en version 2, avec les sélections et buts de la saison des joueurs du
club et les tournois gagnés par eux : aucune migration.

N4 et N4b :

```sql
ALTER TABLE "Save" ADD COLUMN "nationCode" TEXT,             -- la nation que dirige le joueur ; null : aucune
  ADD COLUMN "liveInternationalId" TEXT;                     -- son match de sélection en suspens (N4b), sans clé étrangère
ALTER TABLE "NationSave" ADD COLUMN "callUp" JSONB,          -- les 23 choisis pour la prochaine trêve
  ADD COLUMN "lineup" JSONB,                                 -- sa composition enregistrée
  ADD COLUMN "offeredIn" INTEGER;                            -- la saison d'une offre ouverte
ALTER TABLE "InternationalMatch" ADD COLUMN "liveState" JSONB,
  ADD COLUMN "events" JSONB, ADD COLUMN "decisions" JSONB;   -- les seuls matchs du sélectionneur
CREATE TABLE "CoachSpell" (                                  -- une mission de sélectionneur
  "id" TEXT NOT NULL, "saveId" TEXT NOT NULL, "code" TEXT NOT NULL,
  "fromYear" INTEGER NOT NULL, "toYear" INTEGER, "objective" INTEGER, "outcome" TEXT,
  CONSTRAINT "CoachSpell_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CoachSpell_saveId_idx" ON "CoachSpell"("saveId");
ALTER TABLE "CoachSpell" ADD CONSTRAINT "CoachSpell_saveId_fkey"
  FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Tout match « en suspens » se lit par une seule aide (`liveMatchOf`), la vérification d'aujourd'hui
(`MatchInProgressError`) regardant les deux colonnes.

## 11. Risques pour l'équilibrage, et mesures

| Risque                                     | Mesure                                                                                          | Cible                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Fatigue cumulée de l'Europe et des trêves  | `measure:seasons`, section « Europe » : titulaires sous 75 en octobre ; nouvelle section « Sélections » : condition des internationaux à leur premier match de club après une trêve | sous 15 % (la cible du 17/11) ; environ 80 au retour |
| Blessures                                  | jours d'absence par club et par saison, selon son nombre d'internationaux                        | un club à 10 internationaux : au plus +15 % de jours d'absence |
| Les six cibles du moteur                   | `match.test.ts`, `match-d2.slow.test.ts`, `match-season.test.ts` avec le nouveau calendrier     | inchangées                                  |
| Calendrier plus serré (mardis de D1, 10 mardis de D2 anglaise) | `measure:divisions`, `measure:balance -- --world-only`                   | équilibre des deux divisions et des dispositifs inchangé |
| Les clubs à internationaux perdent des points | points par match le samedi d'après trêve contre les autres samedis, selon le nombre d'internationaux | écart de moins de 0,1 point par match    |
| Crédibilité des sélections                 | ordre des forces sur cinq saisons (N1) ; vainqueurs de 50 tournois joués depuis un même état (pur) | les cinq grandes, le Brésil, l'Argentine et le Portugal font environ 80 % des titres, aucune nation plus de 30 % |
| Objectifs, rangs attendus, budgets         | rien ne les touche (ni réputation ni argent)                                                     | —                                           |
| CPU et poids                               | profil d'une saison ; `measure:weight -- --archive`                                              | +1 % de CPU au plus ; moins de 50 Ko par saison |

Réglages possibles, un à la fois, si une mesure le demande : les plages des réserves (crédibilité), le nombre de
changements de la simulation légère (fatigue), un repos des internationaux par les clubs IA au samedi d'après trêve
(fatigue), la place des mardis (calendrier).

## 12. Découpage en étapes

| Étape | Contenu | Visible par le joueur | Mesures |
| ----- | ------- | --------------------- | ------- |
| **N0** | la retouche de l'Histoire (§ 0) | lien « Voir toutes les légendes », seuil de 75 points | — |
| **N1** Nations | `src/engine/nations.ts` (liste, zones, plages, `callUp`, réserves, vieillissement), `NationSave` | l'onglet Sélections : les 14 nations par force, leurs 23 avec tes joueurs ; « Dans les 23 du Sénégal » sur la fiche | ordre des forces avec réserves, sur cinq saisons |
| **N2** Trêves et convocations | calendrier à trêves (`Save.breaksFrom`), matchs amicaux seulement, simulation légère, fatigue, blessures, sélections et buts, `InternationalMatch` | trêves au calendrier, « À faire », « En sélection », sélections sur la fiche, résumé de simulation | six cibles, `measure:divisions`, `measure:seasons` (fatigue, blessures, points), poids, profil CPU |
| **N3** Éliminatoires et tournois | cycles (`Save.cyclesFrom`), poules, tournois en juin joués au passage de saison, relevé de fin de saison v2, noms et `FORBIDDEN_NAMES` | tableaux des zones, groupes et tableau du tournoi, Histoire (internationaux, titres de tes joueurs) | crédibilité (50 tournois), cycle complet en test lent |
| **N4** Sélectionneur | prestige, offre, objectif et renvoi, convocations, composition, matchs du sélectionneur au moteur complet (simulés) | offre au début de saison, onglet Sélection, trophées et cartes | arrêts par saison, coût d'un match |
| **N4b** Le direct | état du direct d'un match de sélection, son écran, événements à choix | direct d'un match de sélection | comme le direct du club |

Chaque étape : moteur pur et testé (dates des trêves : aucun match de club dedans, 62 dates, jamais un mardi et un
mercredi la même semaine ; tirages déterministes), test lent (une partie existante garde sa saison en cours et passe aux
trêves à la suivante ; même graine, mêmes sélections), E2E à 1280, 390 et 360 px, contrôles habituels (tsc, lint,
Vitest, suite lente, E2E complets, build ; une seule suite à la fois sur la base de test), FR et EN, Nouveautés et guide,
règle de `CLAUDE.md`. N1 peut partir avec N2 si une étape sans match paraît trop mince (point à trancher n° 10).

## 13. Points à trancher

1. **Les 14 nations du jeu**, sans en créer (recommandé) ; en ajouter (nouvelles listes de noms) serait un chantier à
   part, qui changerait les tirages du monde.
2. **La réserve hors championnats** à un niveau propre à chaque nation (recommandé : Brésil, Argentine et Portugal parmi
   les meilleures), ou seulement pour combler les manques (l'ordre du § 1.2).
3. **Taille des tournois** : 6 pour l'Europe, 8 pour le Monde (recommandé) ; 8 en Europe n'éliminerait qu'une nation
   sur neuf.
4. **Éliminatoires** : une poule en matchs simples pour l'Europe, aller-retour pour la zone Monde en cycle Monde, des
   amicaux sinon (recommandé).
5. **Noms** : Coupe du Vieux Continent / Old Continent Cup et Coupe des Hémisphères / Hemispheres Cup (recommandé), ou
   les autres du § 4.1.
6. **Calendrier** : trêves des semaines 3, 8, 13 et 32 ; deux mardis pour les D1 à 20 clubs (29 décembre, 9 mars) ; 3e et
   4e journées européennes et seizièmes de coupe déplacés (recommandé).
7. **Cycle propre à chaque partie, l'Europe d'abord** ; les parties existantes à leur prochaine saison ; ni partie 1 ni
   défi (recommandé).
8. **Forme et valeur** inchangées par les sélections en v1 (recommandé).
9. **Sélectionneur** : offres dès la fin de la 1re saison, seuils de prestige 85, 75 et 65 ; renvoi si pas qualifié ou
   sous l'objectif ; amicaux laissés à l'adjoint par défaut (recommandé).
10. **N1 seule, ou avec N2** (recommandé : avec N2, une étape sans match étant mince).
11. **Indice de légende** : rien pour les sélections (recommandé), ou +10 par tournoi gagné en étant au club.

## 14. Mise en œuvre et mesures (18/11, N0, N1 et N2)

Livré en une mise en ligne : la retouche de l'Histoire (§ 0), les nations et leurs réserves (N1), les trêves et leurs
matchs amicaux (N2). Écarts au cahier, tous mesurés :

1. **Une trêve est une étape de la partie**, qui s'arrête le mardi de la trêve (§ 7.2 la jouait dans la date des clubs
   d'après) : l'alerte « Retour de sélection » doit venir avant le match du club, pas après. « Prochain match » s'arrête
   après une trêve (« Passer la trêve ») ; « Simuler jusqu'à… » la traverse. Elle ne coûte presque rien de plus : la
   récupération des joueurs se fait à la trêve au lieu du samedi suivant, qui n'a plus que les internationaux à écrire.
2. **Le potentiel d'un réserviste ne passe jamais la borne haute de sa nation** : sans ce plafond, la première mesure a
   vu le onze du Brésil passer de 79,1 à 83,4 en cinq saisons (2e nation en S4), les réservistes de 21 ans grandissant
   vers des potentiels sans limite.
3. **La convocation à venir** se lit dès le dernier match du club avant la trêve, même si d'autres clubs jouent encore
   (un mardi de D2) : elle ne dépend que des blessures et des clubs, que rien ne change pour les joueurs du club d'ici là.
4. **`InternationalMatch.managedPlayers`** (non prévu au § 10) : les joueurs du club dirigé de chaque match, leurs minutes,
   buts et blessures, pour l'alerte de retour, le résumé d'une simulation, la fiche et le calendrier.
5. **Les compteurs des réserves** s'écrivent en une seule requête pour les 14 nations, et la trêve ne relit pas les réserves
   que sa convocation a lues.
6. **Les mardis des saisons avec trêves** (§ 3 : 19, 29, 10, 22, 34, 16, 2, 7, 25, 37) : sept suivaient une semaine de coupe
   ou d'Europe, où un club aurait joué mercredi, samedi et mardi, trois matchs en six jours, ce que la règle de l'Europe
   refuse (`europe.slow.test.ts`, « jamais trois fois en une semaine », l'a vu : un club de D1 à 20 clubs, Europe le
   3 mars, championnat les 6 et 9 mars). Ce sont désormais les dix seules semaines qui la respectent, dans l'ordre 19, 30,
   2, 22, 35, 38, 0, 1, 23 et 31 : les D1 à 20 clubs jouent le 29 décembre et le 16 mars (au lieu du 9), la D2 espagnole
   en plus les 1er septembre, 19 janvier, 20 avril et 11 mai, la D2 anglaise en plus les 18 et 25 août, 26 janvier et
   23 mars. `breaks.test.ts` vérifie la règle pour un club de chaque taille de championnat, coupe et Europe comprises.
   Les mesures ci-dessous sont celles de ce calendrier.

### Les six cibles (`measure:balance -- --world-only`, 3 graines, une saison chacune, Europe et trêves)

| | Buts / match | Domicile | Nuls | Extérieur |
| --- | --- | --- | --- | --- |
| Toutes divisions | 2,60 | 43,6 % | 25,3 % | 31,1 % |
| Premières divisions | 2,63 | 43,4 % | 25,8 % | 30,8 % |
| Deuxièmes divisions | 2,58 | 43,7 % | 24,9 % | 31,3 % |

Les buts n'ont pas baissé (2,60 comme avant les trêves) : la base des buts reste à 1,31. Clubs européens : 1,29 fois les
blessures des autres clubs de D1 en Coupe des Lauriers, 1,22 en Coupe des Fanions (cible : 1,3 au plus) ; −0,16 point par
match de championnat dans les 4 jours après un match européen (cible : 0,1 à 0,2). La calibration du moteur
(`match.test.ts`, `match-season.test.ts`) passe telle quelle.

### Cinq saisons (`measure:seasons -- --seasons=5`, jumeau 2 de la démo)

| Saison | Appelés de nos clubs / trêve | Par club de D1 (max) | Par club de D2 | Ont joué / trêve | Blessés en sélection (jours) | Condition au retour (mardi) |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | 220 | 2,29 (13) | 0,00 | 172 | 7 (15 j) | 76,3 |
| S2 | 219 | 2,27 (12) | 0,01 | 169 | 12 (19 j) | 75,7 |
| S3 | 219 | 2,23 (11) | 0,04 | 171 | 7 (18 j) | 75,9 |
| S4 | 212 | 2,20 (11) | 0,01 | 165 | 5 (24 j) | 75,6 |
| S5 | 202 | 2,07 (10) | 0,04 | 155 | 5 (20 j) | 74,8 |

Un international revient le mardi vers 75 ou 76 de condition et retrouve son club le samedi vers 95 (+20 en quatre jours) :
cinq changements à la 60e en match amical le ménagent. **Titulaires sous 75 en octobre** (cible : moins de 15 %) : 1 à
4 % chez les gros prêteurs (clubs européens dont les nations appellent 6 joueurs ou plus, 14 à 17 par saison), 1 à 2 %
chez les autres européens, 0 % ailleurs. **Blessures par club et par saison** : 5,5 à 7,6 chez les gros prêteurs (6,0 en
moyenne sur cinq saisons), dont 0,1 à 0,5 en sélection ; 5,4 à 6,2 chez les autres européens (5,8) ; 4,6 à 5,1 chez les
autres clubs de D1 (4,8).

**Force des 14 sélections** (moyenne du onze, entre parenthèses ses réservistes parmi les 23), au début de S1 :
Allemagne 81,7 (0), Angleterre 81,2 (0), Italie 80,1 (0), France 79,7 (0), Espagne 80,0 (0), Portugal 79,5 (15),
Argentine 80,4 (13), Brésil 79,1 (17), Croatie 78,3 (11), Pays-Bas 77,9 (9), Belgique 76,3 (12), Côte d'Ivoire 76,1 (6),
Maroc 76,0 (8), Sénégal 74,7 (10). Rangs sur cinq saisons : Brésil 8, 7, 7, 7, 7 ; Argentine 7, 9, 6, 6, 5 ; Portugal
6, 8, 8, 8, 8 (ils étaient 12e et 13e sans réserve, § 1.3). Ces trois nations appellent 11 à 21 réservistes : leurs
joueurs de nos clubs sont rarement assez bons ; les cinq grandes n'en appellent aucun.

### Coût

- **CPU** : 20 à 24 ms par trêve en moyenne, 32 au plus, 50 à 56 ms de durée avec la base (deux saisons au calme) ;
  environ 90 ms par saison, +1 % d'une saison de 8,5 à 9,5 s. Repère : un samedi complet, environ 164 ms.
- **Poids** (`measure:weight -- --archive`, trois saisons, avec et sans sélections, compact) : 6,37, 7,10, 7,88 et 8,69 Mo à la création puis après 1, 2
  et 3 saisons, contre 6,32, 7,02, 7,76 et 8,54 sans les sélections : +0,05 Mo à la création (les réserves, les matchs de
  la saison), puis environ 35 Ko par saison, 4 à 5 % de la croissance d'une carrière archivée (cible : moins de 50 Ko).
  Les deux colonnes de `PlayerSave`, ajoutées sans réécrire la table, sont dans les deux mesures.

## 15. Mise en œuvre et mesures (18/11, N3)

Livré en une mise en ligne : les cycles, les éliminatoires, les matchs amicaux autour d'eux, les deux tournois d'été,
leurs écrans, les titres des joueurs. Écarts au cahier, tous mesurés :

1. **Cinq changements à la 60e dans tout match léger**, éliminatoires et tournoi compris (§ 4.7 en donnait trois, à la
   60e, à la 70e et à la 80e, à un match qui compte) : avec trois, les clubs de la Coupe des Lauriers montaient à 1,31
   fois les blessures des autres clubs de D1 (`measure:balance -- --world-only`, une saison), au-dessus de la limite de
   1,3 ; avec cinq, 1,29. C'est le réglage que prévoyait le § 11 (« le nombre de changements de la simulation légère »).
2. **Le tournoi n'est écrit qu'une fois joué**, au passage de saison : avant, l'onglet Sélections calcule son tirage dès
   les éliminatoires finies (pur, le même que celui du passage). Aucune mécanique des trêves (« Prochain match »,
   « Simuler jusqu'à… », calendrier, alertes) ne peut ainsi prendre ses matchs pour une trêve.
3. **Aucune blessure de juin ne passe l'été** (§ 3.3 en laissait courir jusqu'en août) : le passage de saison rend à
   chaque joueur sa pleine condition et le guérit, règle de toujours, que le tournoi, joué au début du passage, suit.
4. **Une seule force par cycle**, celle de son ouverture (`NationSave.strength`, millièmes de point attendu du 23 de la
   première trêve, `rankFormations`) : elle départage les éliminatoires, les groupes du tournoi (§ 4.4 voulait la force au
   tirage) et apparie les matchs amicaux.
5. **Le relevé de fin de saison garde sa version 1**, un champ facultatif de plus (`internationalTitles`) : la version 2
   du § 10 aurait rendu illisibles les relevés déjà écrits, que le lecteur refuse dans une autre version.
6. **Deux colonnes de plus que le § 10** : `NationSave.strength` (écart 4) et `PlayerSave.internationalTitles` (les tournois
   gagnés par chaque joueur, pour sa fiche, quel que soit son club ; « int.eu:2028 »). Le titre va aux joueurs du vainqueur
   qui ont joué le tournoi, une minute au moins : un appelé resté sur le banc n'en a pas (sa fiche aurait dit « pas encore
   sélectionné » à côté de son titre).

### Les six cibles (`measure:balance -- --world-only`, 3 graines)

| | Buts / match | Domicile | Nuls | Extérieur |
| --- | --- | --- | --- | --- |
| Une saison (éliminatoires) | 2,60 | 43,6 % | 25,3 % | 31,1 % |
| Premières divisions | 2,64 | 43,5 % | 25,7 % | 30,8 % |
| Deuxièmes divisions | 2,58 | 43,8 % | 24,9 % | 31,3 % |
| Trois saisons (le tournoi de 2028 compris) | 2,60 | 43,6 % | 25,2 % | 31,2 % |

Les buts restent à 2,60 : la base des buts reste à 1,31. **Blessures des clubs européens** (matchs de club, par club et
par saison, comme au 17/11) : 1,29 fois celles des autres clubs de D1 en Coupe des Lauriers et 1,23 en Coupe des Fanions
sur une saison ; 1,26 et 1,22 sur trois saisons, tournoi d'été compris (la mesure compte désormais par club et par saison :
un club européen une saison ne l'est pas toujours la suivante). Limite : 1,3. −0,16 point en championnat dans les quatre
jours qui suivent un match européen.

### Cinq saisons (`measure:seasons -- --seasons=5`, jumeau 2 de la démo)

| Tournoi | Groupes | Vainqueur | Joueurs de nos clubs | Condition au 1er match de championnat | Blessés au 1er match | CPU / durée |
| --- | --- | --- | --- | --- | --- | --- |
| Coupe du Vieux Continent 2028 | A : FRA, CRO, POR · B : GER, ITA, BEL | Portugal, contre la France | 81 | 100,0 (les autres 100,0) | 0 | 16 / 32 ms |
| Coupe des Hémisphères 2030 | A : BRA, NED, SEN, POR · B : ITA, ENG, ARG, ESP | Italie, contre l'Argentine | 95 | 100,0 (les autres 100,0) | 0 | 15 / 36 ms |

**Règle de récupération** : le tournoi se joue au début du passage de saison, qui rend ensuite à chaque joueur sa pleine
condition et le guérit ; le premier match de championnat vient sept semaines plus tard. Ses joueurs commencent la saison
à 100 de condition, comme les autres, et aucun n'est blessé.

**Crédibilité** (§ 11) : 50 cycles complets, éliminatoires et tournoi, depuis l'état de juin, pour chaque tournoi. Les
cinq grandes, le Brésil, l'Argentine et le Portugal font 80 et 88 % des titres de la Coupe du Vieux Continent (états de
2028 et 2030), 76 et 78 % de ceux de la Coupe des Hémisphères ; la nation la plus titrée en fait 16 à 24 % (l'Allemagne,
puis la France en 2030 aux Hémisphères), aucune plus de 30 %.

**Trêves** : 202 à 220 joueurs de nos clubs appelés par trêve, 2,1 à 2,3 par club de D1 ; titulaires sous 75 en octobre,
1 à 5 % chez les clubs européens qui prêtent le plus. Blessés en sélection : 11 à 20 par saison sur cette graine (5 à 12
dans la mesure du 18/11 de N2). Même espérance avec le programme de N3 qu'avec celui de N2, 2,4 à 2,7 blessés de nos
clubs par trêve (400 tirages de chaque trêve d'une saison, mêmes appelés) : l'écart tient au tirage.

### Coût

- **CPU** : 15 à 16 ms par tournoi (32 à 36 ms de durée avec la base), une fois tous les deux ans au passage de saison ;
  une trêve d'éliminatoires coûte ce que coûtait une trêve de matchs amicaux.
- **Poids** (`measure:weight -- --archive`, trois saisons, avec et sans sélections, compact) : 6,46, 7,19, 7,94 et
  8,75 Mo à la création puis après 1, 2 et 3 saisons, contre 6,41, 7,11, 7,81 et 8,60 sans les sélections : environ 33 Ko
  par saison, le tournoi de 2028 et ses 9 matchs compris.

## 16. Mise en œuvre et mesures (19/11, N4 et N4b)

Livré en une mise en ligne, le direct avec : l'offre, la mission et son objectif, la liste et la composition du
sélectionneur, ses matchs au moteur complet, simulés ou en direct, et leurs écrans. Écarts au cahier, tous voulus :

1. **Une trêve ou un tournoi du sélectionneur se joue par étapes** (§ 5.2, « des dates où la partie s'arrête ») : chaque
   étape rejoue la session depuis son début, sans rien écrire de plus que ce qu'elle joue (`playNationalStep`,
   `src/db/national-team.ts` ; `runBreak`, `runTournament`, purs). Ce qu'elle rejoue est gardé à sa première étape :
   les 23 de chaque nation et leur condition à sa première date (`NationSave.squad`, colonne de plus que le § 10) ; les
   matchs du sélectionneur tels que le moteur complet les a joués (`InternationalMatch.outcome`, colonne de plus) ; les
   autres, légers, rejoués aux mêmes graines. Les lignes des joueurs ne sont écrites qu'à la fin de la session, comme
   une trêve d'une autre partie. Une partie sans sélectionneur joue ses trêves et ses tournois comme avant
   (`playInternationalBreak`, `playSummerTournament`), et les autres nations jouent leurs matchs du jour comme sans lui
   (`national-team.test.ts`).
2. **Son tournoi se joue en juin quand sa nation est qualifiée**, ses matchs écrits une fois joués : sa saison finit
   avec lui (`SeasonNotFinishedError` avant), le passage de saison le résume sans le rejouer (`writtenTournament`).
   Sans sélectionneur qualifié, le tournoi se joue toujours au passage de saison (§ 15).
3. **Une mission par ligne** (`CoachSpell`) : l'objectif du cycle en cours, réécrit à l'ouverture de chaque cycle, et le
   nombre de tournois dépassés (+5 de prestige chacun) ; les tournois de la mission se lisent dans ses matchs.
4. **Démission entre deux trêves**, pas seulement au passage de saison : jamais pendant une trêve ou un tournoi commencé,
   ni pendant un match en direct.
5. **Pas d'offre à un sélectionneur en poste**, et la nation qu'il vient de quitter (sa saison ou la précédente) n'en
   fait pas.
6. **Les amicaux de l'adjoint passent aussi par le moteur complet**, simulés sans arrêt : seuls les matchs de sa nation
   le font (« seuls les matchs de la nation dirigée utilisent le moteur complet »).
7. **Couleurs des nations** (`NATION_COLORS`, `src/lib/nation-colors.ts`) : des couleurs du jeu pour les maillots des
   visages et les initiales du direct, jamais un écusson.

### Coût (`npm run measure:coach`, deux jumeaux 2 de la démo, deux saisons)

L'un dirige l'Allemagne, la nation la plus forte d'Europe, dès sa première saison, l'autre aucune nation ; tout est simulé
comme le fait « Simuler », l'adjoint décidant. L'Allemagne ne se qualifie pas pour la Coupe du Vieux Continent 2028
(0-0 aux Pays-Bas, 0-4 en Italie) : la fédération met fin à la mission en mars 2028. Le second jumeau reprend alors la
France, qualifiée, pour mesurer un tournoi d'été joué par étapes. Deux passages de la mesure (le compteur de CPU de
Windows avance par pas de 15,6 ms) :

| | Sélectionneur | Sans sélectionneur |
| --- | --- | --- |
| Une trêve (CPU, deux dates, 14 matchs) | 76 à 89 ms | 33 à 37 ms |
| Une trêve (durée, base comprise) | 100 à 108 ms | 61 à 65 ms |
| Matchs du moteur complet par saison | 8 (ses deux matchs de chaque trêve) | 0 |
| Arrêts par saison, les amicaux à l'adjoint | 3,5 (4 la première saison, 3 la seconde) | — |
| Son match en direct | coup d'envoi 31 à 62 ms, puis 12 à 19 ms par quart d'heure ; la dernière étape 47 à 78 ms, la fin de la trêve comprise | — |
| Son tournoi d'été en juin (France, sortie en poule) | 2 étapes, 62 ms de CPU (122 ms de durée) | 15 à 16 ms au passage de saison (§ 15) |
| Un passage de saison | 1,16 à 1,28 s | 1,05 à 1,31 s |

Une trêve dirigée coûte environ 45 ms de plus qu'une autre : ses deux matchs au moteur complet (environ 15 ms chacun) et la
session rejouée à son étape. Elle reste en deçà d'une date de club (172 à 185 ms). Rien ne change pour une partie sans
sélectionneur : ses trêves et ses tournois passent par le même code qu'avant.
