# Historique de carrière

Cahier du chantier « historique », rédigé le 18/11/2026, **validé le 18/11** avec les décisions ci-dessous, qui
l'emportent sur le reste du texte. But : donner au joueur une
mémoire de sa carrière, qui donne envie de continuer (ce qui reste à conquérir, les records en cours, les joueurs en
route vers la légende) et de partager (une carte de carrière, comme celle de fin de saison).

Principe : **tout se lit dans l'existant**, sans migration, sans simulation ni écriture de plus. Le club dirigé ne change
jamais au cours d'une partie : sa carrière, c'est l'histoire de ce club depuis la création de la partie.

## Décisions de validation (18/11)

Toutes les recommandations du § 12 :

1. **Emplacement** : l'onglet Palmarès devient « Histoire » / « History », à la même adresse (`/seasons`).
2. **Invincibilité** : toutes compétitions, une défaite aux tirs au but comptée comme un nul.
3. **Meilleur total de points** : un record par division.
4. **Jeunes formés** : le centre de formation et les jeunes prometteurs de la boutique (signalés « Boutique »), la
   réussite mesurée par l'indice de légende.
5. **Indice de légende** : le barème du § 4, seuil 150, cinq légendes et « En route vers la légende » ; pas de onze de
   légende pour l'instant.
6. **Pas de records en plus** pour la première version.
7. **Carte de carrière** comme au § 5 ; pas de carte pour une partie de défi.
8. **Option A** (§ 7.4) : un relevé de fin de saison sur `SeasonResult` (buteurs exacts, triplés, note et valeur des
   joueurs, budget de fin de saison), écrit à chaque fin de saison à partir de la mise en ligne ; migration d'ajout
   uniquement.

## 1. Salle des trophées

Une vitrine, une tuile par sorte de trophée, avec le nombre et les saisons de chacun :

| Tuile                | Source                                                        | Parties                     |
| -------------------- | ------------------------------------------------------------- | --------------------------- |
| Champion de D1       | `SeasonResult.trophies` contient `champion`, compétition de niveau 1 | toutes                |
| Champion de D2       | le même trophée, compétition de niveau 2                      | parties 2                   |
| Coupe                | `trophies` contient `cup`                                     | parties 2 avec coupes       |
| Coupe des Lauriers   | `trophies` contient `europe` et `europeCode = eu.1`           | parties 2, saisons européennes |
| Coupe des Fanions    | `trophies` contient `europe` et `europeCode = eu.2`           | parties 2, saisons européennes |
| Montée               | `SeasonResult.promoted`                                       | parties 2                   |

- Chaque trophée porte sa saison au format du jeu (« 2028-29 », `seasonLabel`), la plus récente d'abord.
- **Ce qui reste à conquérir** : une tuile sans trophée reste visible, éteinte (« À conquérir »), seulement si le club
  peut encore la gagner dans ce monde (pas de coupe ni d'Europe dans une partie 1, pas de montée pour un club de D1).
  C'est le premier levier pour donner envie de continuer.
- Les finales perdues ne sont pas des trophées ; elles apparaissent dans le parcours (§ 2) et, comptées, sous la vitrine
  (« 2 finales perdues »).

## 2. Le parcours saison par saison

La liste des saisons terminées, la plus récente d'abord (celle du Palmarès d'aujourd'hui, enrichie). Pour chaque saison :

- la saison et la division (« 2028-29 · Division 1 », `competitionName`) ;
- le classement : rang, points, bilan V-N-D, et la marque CHAMPION, MONTÉE ou RELÉGATION ;
- la coupe : le tour atteint ou « Vainqueur » (`cupRound`, `cupLabel`) ;
- l'Europe : la compétition et le tour atteint, ou « Vainqueur » (`europeCode`, `europeStage`, `europeLabel`) ;
- les objectifs atteints sur le total (« Objectifs 3/4 », `SeasonObjective.outcome`, comme le bilan de la saison) ;
- le meilleur buteur du club, toutes compétitions (nom et buts, § 7.2) et le meilleur joueur (`SeasonResult.bestPlayer*`,
  déjà sur la carte de fin de saison) ;
- le budget de la saison, celui que la direction a donné (`SeasonBudget.budget`).

La saison en cours est en tête, marquée « En cours » : rang et points du moment, coupe et Europe où elles en sont, sans
trophée ni objectif clos. Chaque saison terminée mène, comme aujourd'hui, à son bilan (`/seasons/[seasonId]`).

## 3. Les records de la carrière

Tous les matchs officiels du club dirigé : championnat, coupe et Europe, saisons terminées et saison en cours.

| Record                         | Définition                                                                 | Égalité                         |
| ------------------------------ | -------------------------------------------------------------------------- | ------------------------------- |
| Plus large victoire            | le plus grand écart au score final (prolongation comprise, tirs au but exclus) | le plus de buts marqués, puis le plus ancien |
| Plus longue série d'invincibilité | matchs consécutifs sans défaite, d'une saison à l'autre ; un match perdu aux tirs au but compte comme un nul (son score) | la plus ancienne |
| Meilleur total de points       | les points d'une saison de championnat (`SeasonResult.points`), **un record par division** (34 à 46 matchs selon le pays et la division) | le moins de matchs, puis la plus ancienne |
| Meilleur buteur de l'histoire du club | le plus de buts pour le club pendant la carrière, toutes compétitions (§ 7.2) | le moins de matchs |
| Joueur le plus capé            | le plus de matchs pour le club pendant la carrière                          | le plus de buts                 |
| Plus gros transfert entrant    | le plus gros prix payé par le club (`Transfer` de type `TRANSFER` vers lui)  | le plus ancien                  |
| Plus gros transfert sortant    | le plus gros prix reçu par le club (`Transfer` de type `TRANSFER` depuis lui) | le plus ancien                 |
| Jeune formé le plus réussi     | parmi les jeunes du centre de formation du club, l'indice de légende le plus haut (§ 4) | la meilleure note actuelle |

- Chaque record dit son contexte : le score et l'adversaire, la compétition et le tour, la saison ; les dates de début et
  de fin d'une série ; le joueur, son poste et ses chiffres ; le club de l'autre côté d'un transfert (nom par
  `displayClubName`, comme partout dans une partie).
- **En cours** : une série d'invincibilité encore vivante le dit (« en cours, 14 matchs »), et quand la série en cours
  n'est pas le record, la ligne montre les deux (« record 23 · en cours 14 »). Un joueur encore au club, recordman ou
  à cinq buts du record, aussi. C'est le deuxième levier pour continuer.
- Jeunes formés : la clé du joueur dit son origine depuis le 15/09 (`youthPlayerKey` : `youth:{année}:{club}:{n}`), donc
  pour toutes les parties. Les jeunes prometteurs de la boutique (`shop-youth:{n}`) arrivent aussi à 17 ans dans le club :
  proposé de les compter, signalés « Boutique » (point à trancher).
- Un record sans candidat (aucune vente, aucun jeune) ne s'affiche pas.

Records possibles en plus, non demandés (point à trancher) : plus large défaite, plus longue série de victoires, le plus
de buts d'un joueur en une saison, meilleure attaque et meilleure défense d'une saison.

## 4. Les légendes du club

Les joueurs qui ont le plus marqué la carrière, classés par un **indice de légende** calculé sur leur passage au club :

| Ce qui compte                                                         | Points |
| --------------------------------------------------------------------- | ------ |
| un match joué pour le club, toutes compétitions                       | 1      |
| un but                                                                | 2      |
| une passe décisive                                                    | 1      |
| élu meilleur joueur de la saison (`SeasonResult.bestPlayerKey`)       | 15     |
| un titre de champion de D1, une Coupe des Lauriers, gagnés avec lui   | 20     |
| une Coupe des Fanions, une coupe, un titre de D2, gagnés avec lui     | 10     |
| une montée avec lui                                                   | 10     |

« Avec lui » : au moins 10 matchs pour le club cette saison-là. Repères : un titulaire joue 35 à 50 matchs par saison
(34 à 46 de championnat, la coupe, l'Europe), soit 50 à 70 points par saison avec ses buts et ses passes ; un attaquant
de 20 buts en fait environ 90.

- **Légende** : indice de 150 ou plus, soit environ trois saisons de titulaire, deux pour un buteur. Le Panthéon montre
  les cinq premières, chacune avec son poste, ses saisons au club (« 2026-27 → 2029-30 »), matchs, buts, passes,
  trophées et indice, et son visage (`PlayerFace`, aux couleurs du club).
- **En route vers la légende** : les trois joueurs encore au club qui ont le plus haut indice sous 150, avec ce qui leur
  manque (« encore 32 points »). Une carrière jeune n'a pas encore de légende : l'écran le dit (« Il faut environ trois
  saisons pleines ») et montre ceux qui sont en route.
- Option (point à trancher) : le « onze de légende », le meilleur indice à chaque poste d'un 4-3-3, pour la carte de
  carrière.

## 5. La carte de carrière

Une image PNG partageable, faite comme la carte de fin de saison (satori, `seasonCardResponse` pour modèle) :

- formats 1200 × 630 et 1080 × 1080 (`?format=square`), dans la langue de la page (`?lang=`) ;
- **aucun nom de club réel ni marque** : ni nom, ni initiales du club (des initiales désignent un vrai club), ni nom du
  manager (texte libre du joueur), ni nom de la partie (celui du club tant que le joueur n'en tape pas un) ; le club ne
  s'y montre que par ses couleurs, sur les maillots des visages, comme la carte de saison ; les noms des joueurs, tirés
  par la graine, y sont comme sur la carte de saison ;
- le contenu : « CARRIÈRE », les saisons (« 2026-27 → 2030-31 · 5 saisons »), le chemin des divisions (« D2 → D1 »),
  la vitrine en chiffres (« 2 championnats · 1 coupe · 1 Coupe des Lauriers · 1 montée »), deux records (la plus large
  victoire, la plus longue invincibilité), la première légende (visage, nom, matchs, buts), les objectifs atteints sur
  la carrière (« Objectifs 11/15 »), le titre porté (« MANAGER : CHAMPION ») ;
- **les cadres et titres de la collection** s'y portent comme sur la carte de saison (`frame=`, `title=`, dessinés pour
  leur seul propriétaire, `ownedCardDress`) ;
- son adresse dit l'état qu'elle montre : `/saves/[id]/seasons/card?format=…&lang=…&frame=…&title=…&n=5`, `n` le nombre
  de saisons terminées : une même adresse donne toujours la même image, gardée un an par le navigateur, 30 jours par le
  serveur (`unstable_cache`, comme `SEASON_CARD_VERSION` pour la carte de saison, un `CAREER_CARD_VERSION` à augmenter
  quand le dessin change) ;
- partage comme la carte de saison (`SeasonCardActions` : « Partager » le PNG carré seul là où le navigateur partage des
  fichiers, sinon « Enregistrer l'image », et « Copier le lien »).

Les textes publics ne changent pas : la carte ne s'ouvre qu'à son propriétaire, comme celle de saison. Tests
`forbiddenNamesIn` sur ses textes, comme pour la carte de saison.

## 6. Où ça s'affiche

**Recommandé : l'onglet Palmarès devient « Histoire »** (EN « History »), sous Club, à la même adresse (`/seasons`,
`nav-seasons`) : quatre onglets restent quatre (Club · Défi · Histoire · Récompenses), et le parcours saison par saison
y est déjà. Alternatives : un cinquième onglet (la bascule tient mal cinq libellés à 360 px), ou une page à part sans
onglet, ouverte depuis l'écran Club et le bilan de saison (moins trouvée). « Carrière » est écarté : en anglais, une
partie s'appelle déjà « career ».

L'écran Club garde ses trois dernières saisons (`ClubHonours`), avec une ligne de la vitrine (« 3 trophées ») et un lien
« Toute l'histoire ». Le bilan d'une saison qui bat un record le dit (« Nouveau record : 86 points »).

Sur l'onglet, l'orange plein est « Partager ma carrière » (l'action de jeu de la colonne y reste secondaire,
`OWN_ORANGE_ACTION`). Maquettes à 390 px (contenu de 358 px, marges de 16 px), de haut en bas :

```
┌────────────────────────────────────────┐
│ Club   Défi   [Histoire]   Récompenses │  bascule (SectionTabs)
└────────────────────────────────────────┘
┌────────────────────────────────────────┐  tête, bleu vif
│ TA CARRIÈRE                            │
│ 5 saisons · 2026-27 → 2030-31          │
│ D2 → D1 · 4 trophées · 1 montée        │
│ Objectifs atteints : 11/15             │
│ ┌────────────────────────────────────┐ │
│ │       Partager ma carrière         │ │  orange, 44 px
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
SALLE DES TROPHÉES
┌──────────────────┐ ┌──────────────────┐  2 tuiles par ligne
│ ×2               │ │ ×1               │
│ Champion de D1   │ │ Coupe            │
│ 2028-29 2030-31  │ │ 2029-30          │
└──────────────────┘ └──────────────────┘
┌──────────────────┐ ┌──────────────────┐
│ ×1               │ │ ×1               │
│ Coupe des        │ │ Montée           │
│ Lauriers 2030-31 │ │ 2026-27          │
└──────────────────┘ └──────────────────┘
┌──────────────────┐
│ Coupe des Fanions│  éteinte : « À conquérir » ;
│ À conquérir      │  Champion de D2 masqué, le club
└──────────────────┘  n'est plus en D2
2 finales perdues
RECORDS
┌────────────────────────────────────────┐
│ Plus large victoire               7-0  │
│ contre Racing Nord, D1, 2029-30        │
│ Invincibilité               23 matchs  │
│ 14/09/2029 → 22/02/2030 · en cours 9   │
│ Meilleur total, D1             86 pts  │
│ 2029-30, 2e · 38 matchs                │
│ Meilleur total, D2             91 pts  │
│ 2026-27, 2e · 46 matchs                │
│ Buteur de l'histoire          97 buts  │
│ K. Diallo · BU · 212 matchs            │
│ Le plus capé               241 matchs  │
│ M. Roy · MC · 2026-27 → 2030-31        │
│ Plus gros achat             38,5 M€    │
│ T. Baptiste, de Sporting Est, 2029-30  │
│ Plus grosse vente           52 M€      │
│ L. Morel, à Athletic Sud, 2030-31      │
│ Jeune formé                 E. Faure   │
│ formé en 2027 · 141 matchs · note 81   │
└────────────────────────────────────────┘
LÉGENDES
┌────────────────────────────────────────┐
│ (visage) K. Diallo              BU 485 │
│ 2026-27 → 2030-31 · 212 m · 97 b       │
│ 2 championnats · joueur de la saison ×2│
│ (visage) M. Roy                 MC 402 │
│ …                                      │
├────────────────────────────────────────┤
│ En route vers la légende               │
│ E. Faure · 128 · encore 22 points      │
└────────────────────────────────────────┘
SAISON PAR SAISON
┌────────────────────────────────────────┐
│ 2031-32 · Division 1          EN COURS │
│ 3e · 24 pts · Coupe : 8es              │
│ Lauriers : phase de ligue              │
├────────────────────────────────────────┤
│ 2030-31 · Division 1          CHAMPION │
│ 1er · 88 pts · 27-7-4                  │
│ Coupe : 16es · Lauriers : vainqueur    │
│ Objectifs 4/4 · Budget 96,4 M€         │
│ Buteur : K. Diallo 26                  │
│ Joueur de la saison : M. Roy 7,8       │
│                              Bilan  >  │  toute la carte mène au bilan
├────────────────────────────────────────┤
│ …                                      │
└────────────────────────────────────────┘
```

La carte de carrière, en carré (1080 × 1080), dans son cadre :

```
╔══════════════════════════════════════╗
║ LATE WINNER                CARRIÈRE  ║
║ 2026-27 → 2030-31 · 5 SAISONS        ║
║ D2 → D1                              ║
║                                      ║
║ 2 CHAMPIONNATS · 1 COUPE             ║
║ 1 COUPE DES LAURIERS · 1 MONTÉE      ║
║                                      ║
║ PLUS LARGE VICTOIRE  7-0             ║
║ INVINCIBILITÉ        23 MATCHS       ║
║                                      ║
║ (visage)  LÉGENDE : K. DIALLO        ║
║           212 matchs · 97 buts       ║
║                                      ║
║ Objectifs 11/15   MANAGER : CHAMPION ║
╚══════════════════════════════════════╝
```

À partir de 1024 px : la tête et la vitrine en haut ; puis deux colonnes, records et légendes à gauche, le parcours à
droite (le tableau du Palmarès d'aujourd'hui) ; à partir de `lg`, l'aperçu de la carte de carrière et ses boutons, comme
l'écran Club pour la carte de saison (un téléphone ne télécharge pas le PNG). FR et EN, aucun défilement de côté à 390
ni 360 px.

## 7. Les données

### 7.1 Sources, sans migration

| Ce qu'on montre                     | Saisons en cours           | Saisons terminées                                  | Depuis      |
| ----------------------------------- | -------------------------- | -------------------------------------------------- | ----------- |
| Trophées, rang, points, bilan       | `Fixture` (classement)     | `SeasonResult` (reconstruit une fois s'il manque)  | l'ouverture |
| Montées                             | —                          | `SeasonResult.promoted` (`Season.movements` aussi) | 23/10       |
| Coupe : tour, vainqueur             | `Fixture` de la coupe      | `SeasonResult.cupRound`, `trophies`                | 24/10       |
| Europe : tour, vainqueur            | `Fixture`, `Season.entrants` | `SeasonResult.europeCode`, `europeStage`, `trophies` | 17/11   |
| Objectifs atteints                  | —                          | `SeasonObjective.outcome`                          | 06/11       |
| Budget de la saison                 | `SeasonBudget`             | `SeasonBudget`                                     | 06/11       |
| Meilleur joueur                     | —                          | `SeasonResult.bestPlayer*`                         | l'ouverture |
| Buts, matchs, passes par joueur     | `PlayerSeasonStats`        | `PlayerSeasonStats`, ou l'archive (`SeasonArchive.stats`) | l'ouverture |
| Victoires, séries                   | `Fixture`                  | `Fixture`, ou l'archive (`SeasonArchive.fixtures`)  | l'ouverture |
| Transferts entrants et sortants     | `Transfer` (prix, date, clubs) | `Transfer` (jamais archivé ni supprimé)        | l'ouverture |
| Jeunes formés                       | `PlayerSave.playerKey`     | `PlayerSave.playerKey` (les retraités gardent leur ligne) | 15/09 |
| Identité des joueurs                | `PlayerSave`               | `PlayerSave` (jamais supprimé, `retired`)          | l'ouverture |

L'archive est sans perte pour les matchs et les statistiques d'une saison terminée (`src/lib/season-archive.ts`) : date
à la minute, tour, clubs, score, mi-temps, prolongation, tirs au but, vainqueur, temps des buts des autres matchs,
consignes du club dirigé ; par joueur et par compétition, matchs, titularisations, minutes, buts, passes, cartons.
Lecture : `readArchivedSeasonsOfClub` et `readArchivedSeason` (`src/db/season-archive.ts`), déjà utilisées par le
palmarès et les écrans.

### 7.2 Les statistiques d'un joueur pour le club

`PlayerSeasonStats` n'a pas de club : une ligne par joueur et par saison de compétition. Les matchs d'un joueur pour le
club sont ceux de ses lignes dans les compétitions du club (son championnat, sa coupe, sa compétition européenne) les
saisons où il en était, d'après `Transfer` (son club à chaque date, `clubAtDate`, comme la reconstruction du palmarès) :

- coupe et Europe : exact, seul le club dirigé y écrit des statistiques ;
- championnat : exact, sauf pour un joueur qui a changé de club **en cours de saison au sein du même championnat** : sa
  ligne mêle les deux clubs, et elle va au club où il a fini la saison (la règle du palmarès d'aujourd'hui). Rare : un
  transfert d'hiver entre deux clubs d'une même division, dont le club dirigé.

### 7.3 Ce qui n'existe plus, à cause de l'archivage

Clairement : **le détail des matchs des saisons terminées**. La suppression des lignes d'une saison archivée emporte les
événements et les décisions de ses matchs (cascade de `Fixture` vers `MatchEvent` et `MatchDecision`), et l'archive ne
les garde pas. En production, le passage du 16/11 a archivé 3 580 saisons et supprimé 1,86 million de lignes. Le
nettoyage des événements, quand il tourne en suppression (`EVENT_CLEANUP`), supprime de même les événements et décisions
des matchs du club dirigé des saisons terminées. Donc, pour une saison terminée :

- **plus** : qui a marqué et qui a fait la passe dans chaque match, la minute des buts du club dirigé (ses buts sont des
  événements, pas des `goalTimes`), les cartons et les blessures d'un match, les remplacements, les tireurs d'une séance
  de tirs au but, les décisions du joueur sur les cartes d'événement ;
- **donc impossibles** à calculer pour ces saisons : les triplés, le but le plus rapide, les buteurs de la plus large
  victoire, le plus de buts d'un joueur dans un match, les séances de tirs au but gagnées par un gardien ;
- **jamais gardés**, archivage ou non : la note et la valeur d'un joueur à la fin de chaque saison (seules les actuelles
  existent), le budget du club à la fin de chaque saison (seul celui du début, `SeasonBudget`), l'effectif à la fin de
  chaque saison (reconstructible, à peu près, par les transferts), les compositions des matchs.

Le cahier ne propose rien qui dépende de ces données.

### 7.4 Ce qu'il faudrait garder à l'avenir

Pour les saisons terminées après sa mise en ligne seulement (rien ne rend ce qui est parti), au choix :

- **A. Un relevé de fin de saison** sur `SeasonResult` : une colonne `highlights` (Json, migration d'ajout), écrite par
  `recordSeasonResult` dans la transaction de `advanceToNextSeason`, avant tout nettoyage ou archivage possible : les
  buteurs du club (les cinq premiers, exacts d'après les événements), ses triplés (joueur, match, adversaire), les
  buteurs de la plus large victoire de la saison, la note et la valeur de chaque joueur de l'effectif à la fin de la
  saison (la progression des jeunes formés), le budget à la fin. Environ 2 à 4 Ko par saison.
- **B. Les buts du club dirigé dans l'archive** : une version 2 du format (`SEASON_ARCHIVE_VERSION`), trois entiers par
  but du club (minute, buteur, passeur), environ 60 buts par saison ; le nettoyage et la suppression attendraient que
  l'archive les ait. Les feuilles de match des saisons passées retrouveraient leurs buteurs.
- **C. Rien** : l'historique du § 1 à 5 s'en passe.

Recommandé : **A**, petit et suffisant pour enrichir plus tard la carte et les légendes (progression des jeunes,
triplés). B seulement si le joueur doit pouvoir relire les feuilles de match anciennes.

## 8. Le coût

Aucune simulation, aucune écriture (sauf la reconstruction paresseuse d'un `SeasonResult` manquant, qui existe déjà).

**Lectures par affichage de l'onglet**, une dizaine de requêtes : les `SeasonResult` (et `ensureSeasonResults`), les
`SeasonObjective` clos, les `SeasonBudget`, les saisons du club (codes, `Season.entrants`), ses matchs des saisons en
cours (`Fixture` par club), ses saisons archivées (`readArchivedSeasonsOfClub`, avec leurs statistiques), les
statistiques des saisons en cours de ses joueurs, ses transferts (`Transfer` de la partie, filtrés sur le club : par
l'index `(saveId, date)`, quelques milliers de lignes après dix saisons), l'identité des joueurs retenus. Ordre de
grandeur à mesurer avant la mise en ligne : moins de 1 Mo lu et quelques dizaines de ms de CPU pour dix saisons.

**Mise en cache** : ce qui vient des saisons terminées ne change plus. Calculé une fois et gardé par le serveur
(`unstable_cache`, 30 jours, comme la carte de saison), sa clé : la partie, sa dernière saison terminée et un
`HISTORY_VERSION`. La saison en cours s'y ajoute à chaque affichage, à partir de ses seules lignes (rang, coupe, Europe,
matchs joués pour la série en cours). La carte de carrière : environ 440 ms de CPU à dessiner, une fois par état
(`n`), format, langue, cadre et titre, puis gardée.

Aucun index nouveau. Si la mesure montrait les transferts trop lents, un index `Transfer(saveId, toClubId)` et
`(saveId, fromClubId)` demanderait une migration d'ajout : pas avant la mesure.

## 9. Les parties existantes

Rien à migrer ni à recalculer à l'avance : le premier affichage lit ce qui existe.

- **Toutes les saisons terminées apparaissent**, celles d'avant le 22/10 reconstruites une fois, comme le Palmarès
  aujourd'hui (des saisons de parties 1, sans montée possible).
- **Vitrine** : les titres de champion de toutes les saisons ; les montées depuis le 23/10, les coupes depuis le 24/10
  (parties 2) ; les coupes d'Europe à partir des saisons européennes (une nouvelle partie 2 depuis le 17/11, ou la saison
  suivante d'une partie 2 d'avant). Les plus vieilles carrières datent de l'ouverture, le 09/10.
- **Parcours** : objectifs et budget « — » pour une saison terminée avant le 06/11 ; coupe « — » avant le 24/10 ; Europe
  « — » avant ses saisons européennes.
- **Records et légendes** : complets pour toutes les saisons, archivées ou non (scores, dates et statistiques sont
  gardés), avec l'approximation des transferts d'hiver du § 7.2. Les titularisations n'existent que depuis le 06/11 :
  aucun calcul ne s'en sert.
- **Le détail des matchs** des saisons terminées (§ 7.3) manque déjà ; rien ici n'en dépend.
- **Partie de défi** : son onglet montre ses saisons comme une autre partie ; pas de carte de carrière (point à trancher :
  une partie de défi est purgée une semaine après son défi).

## 10. Tests et mesures

- Moteur pur (`src/engine/career-history.ts`) : vitrine, records (égalités, séries à cheval sur deux saisons, tirs au
  but), indice de légende, attribution des statistiques au club (transferts d'hiver compris) ; données faites à la main.
- Base : une partie 2 jouée deux saisons et demie (suite lente), l'historique lu avant l'archivage, après l'archivage et
  après la suppression des lignes : identique (comme `season-archive.slow.test.ts` pour les autres écrans).
- Carte : ses textes sans nom de club réel ni marque (`forbiddenNamesIn`), son adresse stable, 404 pour un autre joueur.
- E2E : l'onglet à 1280, 390 et 360 px, FR et EN, sans défilement de côté ; le partage de la carte comme
  `season-card-share.spec.ts`.
- Mesure : lectures, octets et CPU d'un affichage sur un jumeau 2 de dix saisons, archivé, avant et après le cache.

## 11. Ordre de construction

1. Moteur pur et ses tests (vitrine, parcours, records, légendes).
2. Lecture en base (`src/db/career-history.ts`) : saisons en lignes et archivées, transferts, joueurs ; le cache.
3. L'onglet Histoire (renommé), ses sections, puis la ligne de l'écran Club et le « Nouveau record » du bilan.
4. La carte de carrière et son partage.
5. Mesure, E2E, Nouveautés et guide ; le relevé de fin de saison (§ 7.4 A) seulement s'il est retenu.

## 12. Points à trancher

1. **Emplacement** : l'onglet Palmarès devient « Histoire » / « History » (recommandé), un cinquième onglet, ou une page
   à part.
2. **Invincibilité** : toutes compétitions, une défaite aux tirs au but comptée comme un nul (recommandé), ou championnat
   seul.
3. **Meilleur total de points** : un record par division (recommandé), ou un seul, brut.
4. **Jeune formé** : centre de formation seul, ou aussi les jeunes prometteurs de la boutique (recommandé, signalés) ; et
   « réussi » = indice de légende (recommandé) ou matchs pour le club.
5. **Indice de légende** : les poids et le seuil de 150 du § 4 ; cinq légendes montrées ; le « onze de légende » en plus
   ou non.
6. **Records en plus** : plus large défaite, plus longue série de victoires, plus de buts d'un joueur en une saison,
   meilleure attaque et meilleure défense (aucun recommandé pour la v1).
7. **Carte de carrière** : contenu du § 5 (sans nom de club, sans initiales, sans nom du manager) ; dans une partie de
   défi, pas de carte (recommandé).
8. **À garder à l'avenir** (§ 7.4) : A, le relevé de fin de saison (recommandé), B, les buts du club dans l'archive, ou
   rien.

## 13. Mise en œuvre et mesures (18/11)

- **Relevé de fin de saison** : `SeasonResult.highlights` (migration d'ajout `20261118120000_season_highlights`, une
  colonne `JSONB` nullable), écrit par `recordSeasonResult` dans la transaction d'`advanceToNextSeason` ; la suite lente
  vérifie, sur une saison jouée, que le meilleur buteur relevé a autant de buts que ses lignes de statistiques.
- **Coût d'un affichage** (`npm run measure:history -- --seasons=10 --at=5,10 --repeat=20` : un jumeau 2 de la démo joué
  dix saisons, ses saisons terminées archivées et leurs lignes supprimées comme en production, CPU et durée moyennés sur 20
  affichages, poste local) :

  | Saisons terminées | À froid : requêtes | CPU | durée | En cache : requêtes | CPU | durée | Partie gardée |
  | ----------------- | ------------------ | --- | ----- | ------------------- | --- | ----- | ------------- |
  | 5                 | 50                 | 30 ms | 40 ms | 26                | 10 ms | 12 ms | 84 Ko        |
  | 10                | 50                 | 40 ms | 53 ms | 26                | 8 ms  | 12 ms | 161 Ko       |

  Plus de requêtes que la dizaine estimée au § 8 : Prisma lit chaque relation par une requête à part (le club et sa
  compétition, les clubs d'un match…) ; leur nombre ne grandit pas avec la carrière. Le parcours européen de la saison en
  cours en coûte 9 quand le club joue l'Europe (`clubEuropeRun`, partagé avec les objectifs). Le CPU reste autour de 10 ms
  par affichage une fois la partie terminée en cache, le rendu de la page en plus.
- **Carte de carrière** : 155 ms de CPU pour la dessiner en carré, 95 ms en paysage (moyenne de 10 dessins après un
  premier, poste local), une fois par nombre de saisons terminées, format, langue, cadre et titre, puis gardée.
