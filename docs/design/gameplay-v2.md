# Gameplay v2 : dispositifs, budget de saison, objectifs

Cahier rédigé le 05/11/2026 à partir des retours de jeu et de l'audit `docs/design/audit-gameplay-v2.md`. Il suit `gameplay-v1.md` (dont les règles et les cibles d'équilibrage restent valables). Chiffres « départ » à calibrer, « cibles » à atteindre.

## Décisions (validées le 05/11)

- Plus de dispositifs, avec variantes (4-3-3 à plat, offensif, défensif…). **Les clubs IA choisissent le leur** selon leur effectif ; le moteur est recalibré pour garder les six cibles.
- **Nouveau budget chaque saison**, donné par la direction, plus **la moitié** du budget non dépensé.
- **Objectifs de saison** : 2 imposés (classement, coupe) + 1 au choix parmi 3. Résultat → coefficient sur le budget suivant.
- Échecs : **budget réduit seulement**, confiance du président affichée, **jamais de renvoi**.
- Nom : « Objectifs » (le mot « Défi » reste réservé au défi de la semaine).

## V1 — Dispositifs (sans migration)

Règle absolue : ne jamais renommer l'identifiant ni réordonner les emplacements d'un dispositif existant (les compositions enregistrées en dépendent). Seul le **libellé affiché** peut changer.

| Dispositif (libellé) | Milieu et attaque | Existe ? | Profil départ (att. / déf.) |
|---|---|---|---|
| 3-4-3 | MD, MC, MC, MG · AD, BU, AG | oui | +5 / −5 |
| 4-3-3 offensif | MC, MOC, MC · AD, BU, AG | nouveau | +5 / −5 |
| 3-4-2-1 | MD, MC, MC, MG · MOC, MOC · BU | nouveau | +4 / −4 |
| 4-2-3-1 étroit | MDC, MDC · MOC, MOC, MOC · BU | nouveau | +3 / −3 |
| 4-3-3 sentinelle (l'actuel « 4-3-3 ») | MDC, MC, MC · AD, BU, AG | oui | +3 / −3 |
| 4-3-3 à plat | MC, MC, MC · AD, BU, AG | nouveau | +2 / −2 |
| 4-2-3-1 large (l'actuel « 4-2-3-1 ») | MDC, MDC · AD, MOC, AG · BU | oui | +2 / −1 |
| 3-4-1-2 | MD, MC, MC, MG · MOC · BU, BU | nouveau | +2 / −2 |
| 3-5-2 | MDC, MDC, MD, MOC, MG · BU, BU | oui | +1 / −1 |
| 4-4-2 losange | MDC, MC, MC, MOC · BU, BU | nouveau | +1 / −1 |
| 4-4-2 à plat (l'actuel « 4-4-2 ») | MD, MC, MC, MG · BU, BU | oui | 0 / 0 |
| 4-4-1-1 | MD, MC, MC, MG · MOC · BU | nouveau | 0 / 0 |
| 4-3-3 défensif | MDC, MDC, MC · AD, BU, AG | nouveau | −1 / +1 |
| 4-1-4-1 | MDC, MD, MC, MC, MG · BU | oui | −2 / +2 |
| 4-4-2 défensif | MD, MDC, MDC, MG · BU, BU | nouveau | −3 / +3 |
| 5-3-2 | MC, MDC, MC · BU, BU (5 défenseurs) | oui | −5 / +5 |
| 5-4-1 | MD, MC, MC, MG · BU (5 défenseurs) | nouveau | −6 / +6 |

Défenses : 4 défenseurs = DD, DC, DC, DG ; 3 = DC, DC, DC ; 5 = DD, DC, DC, DC, DG. Les profils existants gardent leurs valeurs de G1.

- **Choix des clubs IA** : une fonction pure, la même pour le match, l'aperçu de l'adversaire et les tests. Elle prend le dispositif qui maximise les points attendus de l'effectif disponible (composition automatique de chaque dispositif, formule du moteur) face à un adversaire moyen de sa division. Recalculée avant chaque match, pour tenir compte de la fatigue et des suspensions.
- **Recalibrage** : la base des buts (et au besoin le domicile) est réajustée pour que les six cibles de `gameplay-v1.md` tiennent avec l'IA qui choisit. Mesure de la répartition des dispositifs choisis par l'IA, par division et par niveau.
- **Écran** : le choix du dispositif est groupé par famille (4 défenseurs, 3, 5), avec le libellé, le profil et, en tête, les 3 meilleurs pour ton effectif. Le comparatif complet reste accessible. Lisible à 390 px. L'aperçu de l'adversaire affiche son dispositif.

### Retenu (05/11)

- **Identifiants et libellés** : les sept dispositifs de G1 gardent leur identifiant et l'ordre de leurs emplacements (`src/db/lineup.test.ts` relit une composition enregistrée de chacun) ; les dix nouveaux s'appellent `4-3-3-attacking`, `3-4-2-1`, `4-2-3-1-narrow`, `4-3-3-flat`, `3-4-1-2`, `4-4-2-diamond`, `4-4-1-1`, `4-3-3-defensive`, `4-4-2-defensive` et `5-4-1`, dans l'ordre du tableau (`FORMATION_NAMES`). Libellés dans `formations.label` (en anglais « 4-3-3 holding », « 4-2-3-1 wide », « 4-4-2 flat »…), familles par le nombre de défenseurs (`formationFamily`). Profils de départ du tableau, gardés tels quels.
- **Choix de l'IA** (`chooseFormation`, `src/engine/formation-choice.ts`, pure) : pour chacun des dix-sept, la composition de l'adjoint (`selectRestedLineup` : blessés et suspendus écartés, fatigués reposés), puis ses points attendus (`expectedPoints` : buts attendus du moteur, loi de Poisson, domicile et extérieur moyennés) face à l'adversaire moyen de la division (`averageOpponent` : un onze synthétique au niveau moyen de `CLUB_LEVEL_BY_TIER`, 69 en D1 et 58 en D2, en 4-3-3 sentinelle, Équilibré) ; égalité au premier de `FORMATION_NAMES`. L'adversaire moyen plutôt que celui du jour : l'aperçu ne dépend pas de ta composition, et les deux choix ne se répondent pas. Appelée par la journée (`lineupOf`, championnat et coupe), l'aperçu de l'adversaire (`getOpponentPreview` ; `src/db/opponent.test.ts` compare l'aperçu au match joué) et les tests du moteur, qui jouent chaque club dans le dispositif qu'il choisit. 0,44 ms par club, 0,09 s par journée de 198 clubs (sélection de la composition allégée, résultats identiques).
- **Recalibrage** : `BASE_GOALS_PER_TEAM` 1,23 → **1,31**, domicile 1,12 inchangé. À 1,23, l'IA qui choisit faisait tomber les buts à 2,48 et monter les nuls à 26,3 % (les clubs faibles se ferment) ; à 1,31, les six cibles reviennent à leur place. Trois saisons complètes du monde 2 (`measure:balance -- --world-only`, graines 1 à 3) :

| Mesure | Avant (IA en 4-3-3, base 1,23) | IA qui choisit, base 1,23 | Après (base 1,31) | Cible |
|---|---|---|---|---|
| Buts par match | 2,65 | 2,48 | 2,64 | 2,6 à 2,8 |
| Nuls | 24,4 % | 26,3 % | 25,1 % | 24 à 27 % |
| Victoires à domicile | 44,2 % | 42,8 % | 43,6 % | 43 à 46 % |
| Écart 1er − dernier | 56,0 pts | 53,9 pts | 55,2 pts | 50 à 60 pts |
| Forme des onze en fin de saison | 35,2 à 73,8 | 36,2 à 71,1 | 35,3 à 73,7 | environ 30 à 75 |
| Le plus faible gagne (≥ 1 pt d'écart) | 23,2 % | 23,1 % | 23,2 % | 20 à 25 % |

- **Répartition des dispositifs choisis** (matchs de championnat et de coupe des clubs IA, mêmes saisons ; niveau : la note moyenne de leur onze face au niveau moyen de la division, ±3) : les dix-sept sont joués, aucun plus de 14 % du temps ; les plus faibles se ferment, les plus forts s'ouvrent. Les moins choisis : 4-4-2 défensif (0,5 % en D1, 1,3 % en D2) et 3-5-2 (0,8 %, 1,9 %).

| Division | Niveau | Matchs | Les plus choisis |
|---|---|---|---|
| D1 | tous | 11 040 | 4-3-3 offensif 13,8 %, 5-3-2 12,2 %, 4-1-4-1 11,1 %, 3-4-2-1 10,3 %, 4-3-3 sentinelle 7,8 % |
| D1 | sous la moyenne | 3 412 | 5-3-2 32,6 %, 5-4-1 21,2 %, 4-1-4-1 10,5 %, 4-3-3 défensif 8,6 % |
| D1 | autour | 3 689 | 4-3-3 offensif 13,0 %, 4-1-4-1 12,8 %, 3-4-2-1 10,9 %, 4-3-3 à plat 8,8 % |
| D1 | au-dessus | 3 939 | 4-3-3 offensif 26,3 %, 3-4-2-1 17,2 %, 4-3-3 sentinelle 11,3 %, 4-1-4-1 10,1 % |
| D2 | tous | 12 557 | 3-4-2-1 13,8 %, 4-1-4-1 11,7 %, 5-3-2 11,4 %, 4-3-3 offensif 9,0 %, 5-4-1 8,5 % |
| D2 | sous la moyenne | 3 268 | 5-3-2 27,1 %, 5-4-1 21,5 %, 4-1-4-1 13,6 %, 4-3-3 défensif 7,4 % |
| D2 | autour | 5 659 | 3-4-2-1 14,0 %, 4-1-4-1 11,8 %, 4-3-3 offensif 9,1 %, 4-2-3-1 large 9,0 % |
| D2 | au-dessus | 3 630 | 3-4-2-1 23,6 %, 4-3-3 offensif 16,4 %, 4-1-4-1 9,8 %, 4-2-3-1 étroit 8,2 % |

- **Effet de chaque dispositif avec un effectif idéal** (`measure:balance -- --formations-only` : un onze idéal de niveau 70 dans chacun, face à un onze égal en 4-3-3 sentinelle, 20 000 matchs) : tous entre −0,053 et +0,015 pt/match, aucun ne domine ; le choix vient de l'effectif (ses postes et ses notes), pas du dispositif.

| Dispositif | Profil | Pts/match | Écart au 4-3-3 sentinelle |
|---|---|---|---|
| 3-4-3 | +5 / −5 | 1,345 | −0,027 |
| 4-3-3 offensif | +5 / −5 | 1,361 | −0,011 |
| 3-4-2-1 | +4 / −4 | 1,328 | −0,044 |
| 4-2-3-1 étroit | +3 / −3 | 1,325 | −0,047 |
| 4-3-3 sentinelle | +3 / −3 | 1,372 | 0 |
| 4-3-3 à plat | +2 / −2 | 1,388 | +0,015 |
| 4-2-3-1 large | +2 / −1 | 1,354 | −0,018 |
| 3-4-1-2 | +2 / −2 | 1,336 | −0,037 |
| 3-5-2 | +1 / −1 | 1,320 | −0,053 |
| 4-4-2 losange | +1 / −1 | 1,362 | −0,010 |
| 4-4-2 à plat | 0 / 0 | 1,365 | −0,008 |
| 4-4-1-1 | 0 / 0 | 1,355 | −0,017 |
| 4-3-3 défensif | −1 / +1 | 1,356 | −0,016 |
| 4-1-4-1 | −2 / +2 | 1,362 | −0,011 |
| 4-4-2 défensif | −3 / +3 | 1,338 | −0,035 |
| 5-3-2 | −5 / +5 | 1,359 | −0,013 |
| 5-4-1 | −6 / +6 | 1,344 | −0,028 |

- **Écran** : dans la composition, un bouton qui dit le dispositif (`lineup-formation`) ouvre une feuille (`FormationPicker`), depuis le pied de l'écran sous 1024 px, à droite au-dessus : les trois meilleurs pour ton effectif (`rankFormations`, classés comme un club IA les classe : la composition de l'adjoint dans chacun, face à l'adversaire moyen de ta division), puis les dix-sept par famille (4 défenseurs, 3, 5), chacun avec son libellé, son profil et ses points attendus, l'actuel marqué. Le comparatif complet reste dans le panneau du dispositif. L'aperçu de l'adversaire montre son dispositif et son profil (`opponent-formation`), celui que la journée lui fera jouer.
- **Mise en ligne** : le moteur change (chaque club IA joue le dispositif qu'il choisit) ; à caler après un changement de semaine du défi.

## V2 — Budget de saison et réputation

### Réputation qui suit les résultats
- En fin de saison, la réputation du club évolue selon l'écart entre son rang final et son rang attendu (rang de réputation dans sa division) : départ ±1 point de réputation par place d'écart, borné à ±5 ; montée +4, relégation −4. Clubs IA compris.
- La réputation sert déjà au refus des joueurs sur le marché : elle suit désormais les résultats. Si elle n'est pas stockée par partie, colonne d'ajout.

### Budget de la direction
- À chaque nouvelle saison, pour chaque club : **budget = dotation × coefficient des objectifs + 50 % du budget non dépensé**.
- **Dotation** : la fonction de la création (`clubFinances`), appliquée au rang de réputation et à la division de la nouvelle saison. Le **plafond salarial** est recalculé de la même façon (sans coefficient).
- **Coefficient** (club dirigé) : 1 de base, puis selon les objectifs de la saison écoulée (V3) : classement dépassé +0,20, atteint +0,10, manqué −0,15 ; coupe dépassé +0,10, atteint +0,05, manqué −0,05 ; objectif choisi atteint +0,10, manqué 0. Borné à 0,70–1,40. Clubs IA : coefficient selon le seul classement (mêmes valeurs).
- Les primes de coupe restent ajoutées pendant la saison.
- Le **report** de 50 % concerne le budget de transferts ; les ventes de la saison y sont déjà comprises.
- **Parties existantes** : la saison en cours se termine normalement ; au passage à la saison suivante, la dotation s'applique avec un coefficient de 1 (pas d'objectifs rétroactifs).
- **Garde-fou** : mesurer sur 5 saisons simulées le budget des clubs (haut, milieu, bas de D1 et D2). Cible : la dotation reste du même ordre que le budget de création, et le plafond salarial reste la vraie limite des achats.

### Affichage
- **Écran de début de saison** (avant le premier match) : « La direction t'accorde X M€ » avec le détail (dotation, bonus ou malus des objectifs, report), le nouveau plafond salarial, et le choix de l'objectif (V3).
- Onglet **Club**, carte Finances : budget, détail de la dernière dotation, plafond et marge salariale.

### Retenu (05/11)

- **Réputation** (`reputationAfterSeason`, `src/engine/reputation.ts`) : les valeurs de départ du cahier (±1 par place, ±5 au plus, montée +4, descente −4), clubs IA et club dirigé, dans les deux mondes. Le rang attendu est le rang de réputation dans la division pendant la saison, **un club par rang** : à réputation égale, le plus haut plafond salarial d'abord (le rang qu'avait le club), puis le slug. Avec les ex aequo au meilleur rang, la somme des rangs attendus d'une division tombait sous celle des rangs finaux : toutes les réputations glissaient (−4, −51, −60, −35, −39 points aux cinq premiers passages) et la masse des dotations gonflait (×1,03 à 1,06). Un club par rang : −1, −3, −17, +4, +6 points, masse ×1,000.
- **Dotation** (`seasonFinances`, `applySeasonFinances`) : comme le cahier. Elle remplace le plancher des promus et le plafond des relégués (`financesAfterMove`) : le rang de réputation dans la nouvelle division les donne. Coefficient d'un club IA : son seul objectif de classement ; du club dirigé : ses objectifs (V3), 1 sans eux. Le détail de la dotation du club dirigé est gardé dans `SeasonBudget` (migration d'ajout `…_season_budget`), sur sa saison de championnat, écrit à la création (son budget de départ) et à chaque passage.
- **Carte Finances** (onglet Club) : budget, masse salariale et marge, puis la dernière dotation : dotation et rang de réputation, bonus ou malus des objectifs avec leur coefficient (« Ni bonus ni malus » à 1,00 : des objectifs peuvent s'annuler), report, budget de la saison, plafond salarial ; « Budget de départ » la première saison.
- **Mesure** (`npm run measure:seasons`, cinq saisons d'un jumeau 2 de la démo, l'adjoint aux commandes, base locale ; 3 minutes). Début de chaque saison, clubs IA ; les tiers de réputation en annexe du rapport du script :

| Mesure | S1 | S2 | S3 | S4 | S5 | S6 |
|---|---|---|---|---|---|---|
| Masse des dotations / création, D1 et D2 | 1,000 | 1,000 | 1,000 | 1,000 | 1,000 | 1,000 |
| Dotation / création moyenne, D1 | 1,00 | 0,97 | 1,05 | 1,02 | 1,08 | 1,07 |
| Dotation / création moyenne, D2 | 1,00 | 1,23 | 1,26 | 1,34 | 1,31 | 1,34 |
| Budget / création moyen, D1 | 1,00 | 1,59 | 1,98 | 2,13 | 2,31 | 2,31 |
| Budget / création moyen, D2 | 1,00 | 1,87 | 2,35 | 2,62 | 2,75 | 2,86 |
| Masse salariale / plafond (médiane), D1 | 0,44 | 0,45 | 0,43 | 0,46 | 0,44 | 0,47 |
| Masse salariale / plafond (médiane), D2 | 0,61 | 0,63 | 0,63 | 0,62 | 0,65 | 0,68 |
| Clubs dont les salaires limitent les achats, D1 | 0 % | 0 % | 2 % | 5 % | 3 % | 2 % |
| Clubs dont les salaires limitent les achats, D2 | 2 % | 10 % | 20 % | 18 % | 29 % | 34 % |
| Réputation moyenne, D1 haut / bas | 85,4 / 60,4 | 85,0 / 63,3 | 84,7 / 63,1 | 84,2 / 63,3 | 83,8 / 63,1 | 83,4 / 63,6 |
| Réputation moyenne, tous les clubs IA | 60,8 | 60,8 | 60,8 | 60,7 | 60,8 | 60,8 |

Club dirigé (Lyon), son budget réel et recalculé avec le coefficient maximal puis minimal (le budget du club dirigé ne rejaillit sur rien dans une partie jouée par l'adjoint), en M€ et en multiple du budget de création :

| Saison | Division | Dotation | Coef. du jeu | Budget réel | Coefficient 1,40 | Coefficient 0,70 |
|---|---|---|---|---|---|---|
| S1 | D1 | 77,2 | 1,00 | 77,2 (1,00) | 77,2 (1,00) | 77,2 (1,00) |
| S2 | D1 | 89,8 | 1,15 | 142,0 (1,84) | 164,4 (2,13) | 101,6 (1,32) |
| S3 | D1 | 89,8 | 1,25 | 183,7 (2,38) | 208,3 (2,70) | 114,1 (1,48) |
| S4 | D1 | 89,8 | 1,15 | 195,3 (2,53) | 230,0 (2,98) | 120,1 (1,56) |
| S5 | D2 | 20,0 | 0,90 | 115,6 (1,50) | 143,0 (1,85) | 74,0 (0,96) |
| S6 | D2 | 20,0 | 0,90 | 75,8 (0,98) | 99,5 (1,29) | 51,0 (0,66) |

0,70 est la borne du cahier ; avec ses valeurs, le plus bas atteignable est 0,80.

- **Cibles du cahier.** « La dotation reste du même ordre que le budget de création » : **tenue** (masses identiques ; par tiers, de 0,65 à 1,74 fois en moyenne ; un club de 0,22 à 8,25 fois, selon son rang de réputation, la pente du bas de D2 étant forte). « Le plafond salarial reste la vraie limite des achats » : **pas tenue, et déjà pas à la création** : la masse salariale ne fait que 44 % du plafond en D1 (61 % en D2) et une recrue type coûte cinq à huit fois son salaire annuel : le budget permet trois achats, la marge salariale vingt (D1). Le report rapproche la D2 de la cible (34 % des clubs limités par les salaires en S6), pas la D1 (2 %). Leviers, non appliqués (à décider) : rapprocher `CLUB_WAGE_BUDGET_BY_TIER` des masses salariales générées (environ la moitié en D1), ou réduire le report.
- **Dérives signalées.** (1) Les budgets des clubs IA doublent en cinq saisons (×2,3 en D1, ×2,9 en D2) : ils ne dépensent qu'en présaison, et le report de 50 % se cumule vers 2 × dotation × coefficient ; un tiers dépasse 3 fois la création (D2 milieu, S4 et S6) et un club 13,7 fois (Sampdoria, it.2). Borné, mais l'argent dort. (2) Le club attendu 1er ne peut que perdre et le dernier que gagner : −2,8 points par saison en moyenne pour le premier attendu (38 cas) ; la réputation se resserre dans chaque division (D1 haut 85,4 → 83,4, D1 bas 60,4 → 63,6). Inhérent à la règle ; à revoir si l'écart doit tenir. (3) Joué par l'adjoint, le club dirigé ne renouvelle aucun contrat : son effectif fond (25 → 6 joueurs) et il descend en S4 ; artefact du mode adjoint, d'avant V2.

## V3 — Objectifs de saison (migration d'ajout)

### Objectifs imposés
- **Classement** (selon le rang attendu par la réputation, dans la division) :
  - rang attendu 1 à 3 en D1 : « Finir dans le top 3 » (dépassé : titre) ;
  - D2, rang attendu 1 à 4 : « Monter en Division 1 » (dépassé : titre de D2) ;
  - clubs du bas (rang attendu dans la zone de relégation ou juste au-dessus) : « Se maintenir » (dépassé : finir 3 places au-dessus de la zone) ;
  - sinon : « Finir Xe ou mieux », X = rang attendu + 2 en D1, + 3 en D2 (dépassé : 3 places de mieux que X).
- **Coupe** (selon le tiers de réputation) : haut de D1 → quarts ; milieu de D1 → huitièmes ; bas de D1 et haut de D2 → seizièmes ; reste de D2 → passer un tour. Dépassé : deux tours de plus.

### Objectif au choix (3 propositions parmi 4, tirées de la graine de la saison)
| Objectif | Atteint si |
|---|---|
| Jeunesse | un joueur de 21 ans ou moins compte au moins 15 titularisations en championnat |
| Spectacle | buts marqués en championnat ≥ attendu × 1,10 (attendu d'après la force de l'effectif au départ) |
| Solidité | buts encaissés en championnat ≤ attendu × 0,90 |
| Bonne gestion | solde des transferts de la saison ≥ 0 |

- Le choix se fait sur l'écran de début de saison et ne se change plus. Sans choix avant le premier match, l'adjoint choisit Jeunesse.

### Suivi
- **Accueil** : carte « Objectifs » avec la progression de chacun (en bonne voie / en danger / atteint / manqué).
- **Club** : « Objectifs du président » avec le détail, et la **confiance du président** (la colonne `boardConfidence` existante, enfin utilisée : elle monte et descend avec la progression des objectifs, affichage seulement).
- **Fin de saison** : le bilan des objectifs apparaît dans le récapitulatif de saison et sur la carte PNG de fin de saison (« Objectifs : 2/3 »).
- Pas de renvoi.

### Stockage
- Objectifs de chaque saison du club dirigé (type, cible, statut, choisi ou imposé), gardés pour l'historique : table d'ajout liée à la saison, suppression en cascade avec la partie, index sur chaque clé étrangère (test existant).

## Ordre et méthode

V1 → V2 → V3, sur une branche `gameplay-v2` partie de `main` après la mise en ligne du gameplay v1. Méthode habituelle : un commit par changement cohérent ; tsc, lint et Vitest verts à chaque commit ; E2E complets en fin de chantier ; `measure:balance` avant/après pour V1 et V2 ; migrations d'ajout uniquement, SQL montré ; base locale ; rien contre Neon ; rien de poussé sans demande ; FR et EN, tutoiement. Mise en ligne calée après un changement de semaine du défi si le moteur change (V1).
