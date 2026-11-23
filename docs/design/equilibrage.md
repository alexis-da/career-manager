# Chantier « équilibrage » (23/11/2026)

Quatre réglages du moteur, demandés le 23/11, branche `equilibrage`. Mesures : `npm run measure:balance -- --world-only`
(trois graines, une saison complète d'une partie 2 chacune ; puis `--seeds=6 --seasons=3` : 18 saisons), sur des bases
locales dédiées, le code de `main` (e7c97b0) et celui de la branche. Le CPU : les deux codes l'un après l'autre, rien
d'autre ne tournant. Penaltys et échauffourées : la section « Choice events on real squads » de la même mesure
(`-- --choices-from=f.json --choice-matches=20000` : 20 000 matchs entre les onze des clubs IA de dates de championnat
d'une mesure du monde, leur forme, leur condition et leur âge d'alors, chaque option jouée jusqu'au coup de sifflet
final, les événements suivants décidés par l'adjoint, sur les mêmes flux ; les mêmes situations pour les deux codes).

## 1. Penalty : un choix

**Avant** : les trois meilleurs tireurs, chacun avec la chance des tirs au but (son tir contre le gardien) ; le mieux noté
avait toujours la meilleure chance, l'adjoint le prenait toujours : aucun choix.

**Règle** (`penaltyChance`, `src/engine/choices.ts`) : la chance part de celle des tirs au but, puis

- sa **forme** : 0,4 point de chance par point d'écart à 50, multiplié par 1 + la pression (sous pression, la forme compte
  davantage, dans les deux sens) ;
- sa **condition à cette minute** (`fitnessAt`) : 0,5 point par point d'écart à 85, ce qu'a un titulaire à une limite :
  un remplaçant frais contre les jambes d'un titulaire en fin de match ;
- la **pression**, de 0 à 1 (`penaltyPressure`) : la minute (0,3 au coup d'envoi, 1 à la 90e et en prolongation) fois le
  score vu du club (1 à égalité ou mené d'un but, 0,8 en menant d'un but, 0,6 mené de deux, 0,4 en menant de deux, 0,2
  au-delà) ; elle retire 5 points × (pression − 0,5) à chacun ;
- son **expérience face à la pression** (`penaltyExperience`) : de −1 à 21 ans à +1 à 31 ans, × 12 points × la pression ;

bornée comme aux tirs au but (55 % à 90 %), arrondie au pour cent : ce que la carte montre est ce qui est joué. L'adjoint
prend la meilleure chance, le mieux noté à chance égale.

**Pourquoi l'âge.** Forme et condition seules départagent mal trois coéquipiers : la même forme pour les trois dans un
penalty sur sept, la même condition dans près d'un sur deux, et le mieux noté a souvent la meilleure forme (ses buts la
montent). Même à des poids extrêmes, le mieux noté restait le meilleur choix dans 60 % des penaltys au mieux. La pression
doit donc toucher les tireurs différemment : par leur expérience, l'âge du jour du match (`SquadPlayer.age`, donné aux
joueurs du club dirigé par `playNextMatchday`, aux sélectionnés par leurs convocations, gardé par l'état du direct ; un
état d'avant n'en a pas : 26 ans, neutre).

**Carte** : la pression dans la situation (« Peu de pression », « Pression moyenne : l'expérience et la forme comptent »,
« Grosse pression : l'expérience et la forme comptent encore plus »), et sous la chance de chaque tireur sa forme en mots
(en forme dès 56, en petite forme jusqu'à 44), sa condition et son âge : « en forme · condition 64 · 31 ans ».

**Mesure** (37 094 penaltys sur de vrais effectifs, 20 000 matchs, les mêmes situations pour les deux codes) :

| | Avant | Après |
| --- | --- | --- |
| Le mieux noté est le meilleur choix | 100 % | 49,8 % |
| à la 15e / 30e / 60e / 75e | 100 % | 54,8 / 53,1 / 47,9 / 43,4 % |
| Chance du tireur de l'adjoint (moyenne) | 75,3 % | 77,9 % |
| Écart entre le meilleur et le moins bon des trois | 2,3 points | 8,4 points |

Chaque tireur contre celui de l'adjoint, en points au coup de sifflet final (par penalty) :

| Tireur | Avant | Après | L'adjoint le prend |
| --- | --- | --- | --- |
| Le mieux noté | 0,000 | −0,023 | 49,8 % |
| Le 2e | −0,008 | −0,031 | 29,0 % |
| Le 3e | −0,016 | −0,039 | 21,2 % |

## 2. Échauffourée : un pari

**Avant** : « Protester » multipliait par 1,08 les buts attendus du club au segment suivant une fois sur deux, et avertissait
le capitaine trois fois sur dix : le score changeait dans 1,4 % des échauffourées.

**Règle** (`applyOption`, `src/engine/choices.ts` ; `balance.ts`) : « Calmer tes joueurs » ne change rien. « Protester » est un
pari sur les deux segments suivants de la période de jeu (jusqu'à la 90e au plus) : une fois sur deux l'équipe se
transcende, ses buts attendus × 2 ; sinon elle perd la tête et laisse des espaces, ceux de l'adversaire × 1,95
(`MatchModifiers.boosts`, `GoalBoost`, gardés par l'état du direct) ; et, quoi qu'il arrive, le capitaine averti trois fois
sur dix, exclu s'il l'était déjà. La carte le dit : « Un pari : tes joueurs peuvent se transcender, ou perdre la tête et
laisser des espaces. X risque un jaune » ou, déjà averti, « … risque le rouge ». L'adjoint calme toujours.

**Tableau des effets** (37 094 échauffourées sur de vrais effectifs, les mêmes situations pour les deux codes ; Δ : les
points de l'option moins ceux de « Calmer », par échauffourée ; mieux, moins bien : la part où l'option a rapporté plus de points, ou moins ; score changé : l'écart
final n'est pas celui de « Calmer ») :

| Capitaine | Option | Δ points | ± | Mieux | Moins bien | Score changé | Jaune | Rouge |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tous, avant | Protester | +0,001 | 0,001 | 0,3 % | 0,3 % | 1,4 % | 30,4 % | 2,5 % |
| tous, après | Protester | +0,004 | 0,007 | 6,5 % | 7,1 % | 29,4 % | 30,4 % | 2,5 % |
| non averti, avant | Protester | +0,003 | 0,001 | 0,4 % | 0,1 % | 1,0 % | 30,4 % | 0 % |
| non averti, après | Protester | +0,011 | 0,007 | 6,6 % | 6,9 % | 29,4 % | 30,3 % | 0 % |
| déjà averti, avant | Protester | −0,030 | 0,008 | 0,2 % | 2,3 % | 5,5 % | 30,6 % | 30,6 % |
| déjà averti, après | Protester | −0,067 | 0,023 | 4,6 % | 9,4 % | 29,8 % | 30,6 % | 30,6 % |

En moyenne, « Protester » vaut « Calmer » à 0,004 point près (cible : ±0,02) ; le score final change dans
29,4 % des échauffourées, le résultat dans 13,6 %. Avec un capitaine déjà averti, le pari coûte
0,067 point : le rouge, trois fois sur dix.

## 3. Trêve hivernale

**Règle** (`src/engine/schedule.ts`) : dans une saison avec trêves, les championnats d'Espagne, d'Italie, d'Allemagne et
de France ne jouent ni samedi ni mardi du 21 décembre au 3 janvier (lu sur les dates : les semaines 19 et 20 en 2026-27,
18 et 19 quand la saison commence le 21 août) ; l'Angleterre joue pendant les fêtes. Mêmes premier et dernier samedis,
toutes les journées : les deux journées des fêtes passent aux mardis des deux premières semaines de la saison (18 et
25 août en 2026-27), quand tous les joueurs sont frais et qu'aucun club ne joue l'Europe ; chaque championnat garde ses
samedis de repos (les 34 journées, deux : 24 octobre et 13 mars en 2026-27, au lieu des 31 octobre et 6 mars) et ses
mardis (les 38 : 16 mars, et 19 janvier pour le 29 décembre ; les 42 en jouent huit). Ordre des mardis
(`WINTER_BREAK_TUESDAY_WEEKS`) : 0, 1, 30, 22, 23, 35, 38, 2, 31, ceux qui ne touchent ni coupe ni Europe, sans celui des
fêtes (semaine 19), les veilles de trêve internationale (2 et 31) en dernier : un international y jouerait samedi, mardi et
vendredi. L'Espagne en 2026-27 : le 19 décembre, puis le 9 janvier ; ses mardis les 18 et 25 août, 19 janvier et 16 mars
(au lieu des 29 décembre et 16 mars). Jamais trois matchs en moins de sept jours : `breaks.test.ts`, coupe et Europe
comprises, sur cinq saisons. Coupe et Europe ne bougent pas : une 6e journée européenne tombe le 22 décembre les saisons
qui commencent le 21 août (2027-28, 2032-33).

**Les mardis essayés.** D'abord les mardis de mars, avril et mai pour les D1 à 38 journées et tous les samedis pour celles
à 34, puis les mardis d'août et les samedis de repos gardés (la règle retenue) : sur trois graines (9 saisons), les
blessures des clubs de la Coupe des Lauriers à 1,33 ou 1,34 fois celles des autres dans les deux cas, 1,32 sans la trêve
hivernale, 1,26 avec le code de `main`. Sur six graines (18 saisons, ci-dessous) : 1,28 avec la règle retenue, 1,22 avec
`main`. Ce rapport varie d'environ 0,05 d'une mesure de trois graines à l'autre.

**Quand** : `Save.winterBreakFrom` (migration d'ajout `20261123150000_winter_break`) : posé avec `breaksFrom` à la création
d'une partie 2, au prochain passage de saison d'une partie 2 d'avant (la saison en cours garde ses dates), jamais pour
un défi ni une partie 1.

**Mesure** (clubs IA, tous leurs matchs : championnat, coupe, Europe ; par club et par saison) :

Six graines, trois saisons chacune (18 saisons) :

| Espagne, Italie, Allemagne, France | Avant | Après | Angleterre, avant → après |
| --- | --- | --- | --- |
| Décembre : matchs par club | 5,5 | 4,0 | 5,6 → 5,6 |
| Décembre : blessures par club | 0,68 | 0,50 | 0,74 → 0,71 |
| Janvier : matchs par club | 5,6 | 5,0 | 6,6 → 6,6 |
| Janvier : condition des titulaires au coup d'envoi | 93,4 | 94,3 | 90,0 → 89,9 |
| Janvier : titulaires sous 85 | 17,5 % | 14,3 % | 29,3 % → 29,2 % |
| Janvier : blessures par club | 0,70 | 0,65 | 0,90 → 0,88 |
| Saison : blessures par club | 4,86 | 4,92 | 5,75 → 5,76 |
| Saison : condition des titulaires au coup d'envoi | 96,2 | 95,3 | 94,1 → 94,1 |

En janvier, les quatre pays jouent un match de moins par club et ont moins de titulaires fatigués (14,3 % sous 85 au
lieu de 17,5 %), et un peu moins de blessés (−7 %) ; en décembre, un quart de blessés en moins. Sur la saison, rien ne
change (+1 %) : les deux journées des fêtes se jouent en août, au début de la saison, quand tous sont frais. L'Angleterre,
témoin, ne bouge pas.

## 4. Buts par match

`BASE_GOALS_PER_TEAM` 1,31 → 1,35. Les six cibles (`gameplay-v1.md`), une saison de trois graines, puis trois saisons de six graines :

| Mesure | Cible | Avant, 3 graines × 1 saison | Après | Avant, 6 graines × 3 saisons | Après |
| --- | --- | --- | --- | --- | --- |
| Buts par match | 2,6 à 2,8 | 2,60 | 2,68 | 2,59 | 2,66 |
| Nuls | 24 à 27 % | 25,3 % | 24,7 % | 25,4 % | 25,1 % |
| Victoires à domicile | 43 à 46 % | 43,6 % | 44,2 % | 43,6 % | 43,9 % |
| Écart 1er − dernier | 50 à 60 pts | 53,4 | 53,4 | 52,4 | 52,7 |
| Forme des onze en fin de saison | environ 30 à 75 | 35,7 à 72,0 | 35,6 à 75,8 | 33,6 à 72,1 | 31,0 à 75,8 |
| Le plus faible gagne (≥ 1 pt d'écart) | 20 à 25 % | 23,7 % | 24,0 % | 24,2 % | 24,1 % |

Premières divisions, 6 graines × 3 saisons : 2,61 → 2,69 buts ; deuxièmes : 2,57 → 2,62. La calibration de `match.test.ts`
(2,5 à 2,8 buts, 42 à 46 % à domicile, 23 à 27 % de nuls, Bayern bat Monza plus de 75 fois sur 100) passe telle quelle.

Blessures des clubs européens (par club et par saison, rapportées à celles des autres clubs de D1 ; limite 1,3) :

| Groupe | Avant, 18 saisons | Après, 18 saisons |
| --- | --- | --- |
| Coupe des Lauriers | 1,22 (5,7 blessures par club et par saison) | 1,28 (6,0) |
| Coupe des Fanions | 1,18 (5,5) | 1,23 (5,8) |
| Autres clubs de D1 | 1,00 (4,7) | 1,00 (4,7) |

Sur trois graines (9 saisons), les mêmes mesures donnaient 1,26 avant, et de 1,32 à 1,34 après selon le placement des
mardis (1,32 sans la trêve hivernale) : la mesure varie d'environ 0,05, et la limite de 1,3 tient sur 18 saisons.

## 5. CPU

CPU d'une date des clubs (`playNextMatchday`, ce processus : moteur, Prisma, pg), les deux codes l'un après l'autre :

| Mesure | Avant | Après |
| --- | --- | --- |
| Trois graines, trois saisons (558 dates) : moyenne | 187 ms | 184 ms |
| médiane | 187 ms | 172 ms |
| 90e centile | 328 ms | 328 ms |

L'âge des joueurs n'est lu que pour le club dirigé, en une requête de son seul effectif : le lire pour les quelque
5 000 joueurs d'une date coûtait 6 à 9 ms de plus à chaque date.

## 6. Écarts et précisions

- **Expérience** : la demande nommait la forme, la condition et la pression ; la pression agit aussi par l'expérience de
  chaque tireur (son âge), sans quoi la cible d'une fois sur deux n'était pas atteignable (60 % au mieux).
- **Échauffourée** : le risque du pari n'est pas que le carton ; une fois sur deux, l'équipe perd la tête (l'adversaire
  marque davantage), pour que « Protester » reste à ±0,02 point de « Calmer » tout en changeant le score près d'une fois
  sur trois.
- **Trêve hivernale** : les deux journées des fêtes se jouent les mardis des deux premières semaines d'août, et non à la
  suite de la trêve, pour ne pas charger les clubs européens ; chaque championnat garde ses samedis de repos (ceux des D1
  à 34 journées passent des 31 octobre et 6 mars aux 24 octobre et 13 mars en 2026-27) ; coupe et Europe inchangées ;
  dans une partie en cours, à partir de sa saison suivante.
- **Âge** : lu pour le seul club dirigé (et les sélectionnés), une requête de son effectif à chaque date où il joue.
- **Défi de la semaine** : ses parties n'ont pas de trêves, donc pas de trêve hivernale ; penalty, échauffourée et buts
  changent ses matchs.

## 7. Contrôles

- `tsc` et lint : aucune erreur. Vitest : 225 fichiers, 1 976 tests. Suite lente : 77 fichiers, l'empreinte de
  `season-v2.slow.test.ts` et celle de `match-fingerprint.test.ts` refaites (la base des buts change tous les matchs).
- E2E : 273 tests, 265 au premier passage, les huit autres relancés et verts. Sept attendaient trois matchs en août pour
  un club français, qui en a maintenant cinq, dont les mardis 18 et 25 août (`match.spec.ts`, `simulation.spec.ts`,
  `two-divisions.spec.ts`, où le Paris FC joue sa 6e journée le 12 septembre). La finale européenne avait été coupée par
  la mise en veille du poste (`ERR_NETWORK_IO_SUSPENDED`) ; seule, elle passe en 16 s, toujours 2-2 et 3-4 aux tirs au
  but.
- Le navigateur de Playwright 1.63 (révision 1243) manque sur le poste depuis le déplacement du dépôt : la suite a tourné
  avec le shell 1255 installé, par une configuration locale non commitée ; la CI installe le sien.
- Build de production : réussi, la migration d'ajout appliquée sur une base locale :
  `ALTER TABLE "Save" ADD COLUMN "winterBreakFrom" INTEGER;`.
