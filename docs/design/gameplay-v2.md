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

### Retenu (05/11, corrigé le 06/11)

- **Réputation** (`reputationAfterSeason`, `src/engine/reputation.ts`) : clubs IA et club dirigé, dans les deux mondes. **Corrigée le 06/11.** La règle de départ (±1 par place d'écart au rang attendu, ±5 au plus, montée +4, descente −4) resserrait chaque division, le premier attendu ne pouvant que perdre et le dernier que gagner : écart-type des réputations −20 % en D1 et −13,5 % en D2 en cinq saisons, les dix divisions hors de ±10 %. Désormais une **cible**, la réputation que la création donne au club classé à son rang final dans sa division (`reputationTarget`) : la réputation d'un club qui reste dans sa division en fait **25 %** du chemin (`REPUTATION_TARGET_SHARE`, arrondi pareil vers le haut et vers le bas). **Écart au cahier** : un promu ou un relégué prend **d'un coup** la cible de son rang équivalent dans sa nouvelle division (`rankInNextDivision` : les promus aux dernières places de celle du dessus, dans l'ordre de leur classement, le champion de D2 anglaise 18e ; les relégués aux premières de celle du dessous). À 25 % pour eux aussi, les gros clubs relégués arrivaient en D2 avec 65 à 78 de réputation (plage 40–60) et y restaient plusieurs saisons : 14 divisions sur 30 (trois graines) sortaient de ±10 %, jusqu'à +25 %. Les cibles d'une division sont ses réputations de création, une par rang (test lent). Le rang attendu reste le rang de réputation dans la division, **un club par rang** (à réputation égale, le plus haut plafond salarial, puis le slug) ; le plafond ne suivant plus le rang, l'objectif de classement du club dirigé prend le rang de sa dotation (`SeasonBudget`), que le passage calcule avec les plafonds de la saison close.
- **Dotation** (`seasonFinances`, `applySeasonFinances`) : comme le cahier, sauf le report. Elle remplace le plancher des promus et le plafond des relégués (`financesAfterMove`) : le rang de réputation dans la nouvelle division les donne. Coefficient d'un club IA : son seul objectif de classement ; du club dirigé : ses objectifs (V3), 1 sans eux. **Report réservé au club dirigé (06/11)** : les clubs IA, qui ne dépensent qu'en présaison, voyaient leur budget doubler en cinq saisons (×2,3 en D1, ×2,9 en D2) ; ils repartent chaque saison de leur dotation × leur coefficient, plus les primes de coupe et les ventes de la présaison. Le détail de la dotation du club dirigé est gardé dans `SeasonBudget` (migration d'ajout `…_season_budget`), sur sa saison de championnat, écrit à la création (son budget de départ) et à chaque passage.
- **Plafond salarial, une vraie limite (06/11)** : masse salariale × **1,20** (`WAGE_BUDGET_MARGIN`), entre **50 %** (`WAGE_BUDGET_FLOOR_SHARE`, `wageBudgetFloor`, retouche du 06/11) et 100 % de la table de création à son rang (`clubFinances`, `wageBudgetFor`) ; à la création sur l'effectif complet, après la présaison (`applyCreationWageBudgets`), à chaque passage sur la masse de fin de saison, avant les départs (`payrollsOf`). Pour le club dirigé, la marge suit le coefficient de ses objectifs : × 1,10 à 0,70, × 1,20 à 1,00, × 1,30 à 1,40, en ligne droite entre (`managedWageMargin`). Avant, la masse ne faisait que 44 % du plafond en D1 (61 % en D2) et la marge permettait vingt recrues types. **Plancher** : un club qui a beaucoup vendu ou perdu ses fins de contrat garde de quoi reconstruire ; il joue dès la création pour un tiers des clubs de D1 (la moitié du haut de D1, dont la table est large : leur marge passe de 3,2 à 3,4 recrues types), presque jamais en D2 (0 à 13 % des clubs selon la saison). Une partie existante reçoit la règle à son prochain passage de saison.
- **Marché quand la marge salariale ne paie plus personne (06/11)** : une entrée que la seule marge vide le sait (`wageBound` : avec assez de marge, elle proposerait quelqu'un). « Mes besoins » propose alors les joueurs que la marge paie encore au poste du point faible, même moins bien notés, le meilleur à ce poste d'abord, marqués « Dans tes moyens » (`affordableAt`), son introduction donnant la marge ; sans personne dans ses moyens, une entrée montre à la place d'une liste vide la marge restante (ou le dépassement du plafond) et trois façons d'en retrouver : vendre un joueur (vers l'onglet Vendre), libérer un contrat depuis sa fiche (vers l'effectif ; la moitié de ce qui lui reste dû), attendre la saison prochaine et son plafond recalculé (`WageLimit`). En français et en anglais ; `e2e/market.spec.ts` couvre les deux cas, sur ordinateur et sur téléphone. Au Lyon des E2E, la première recrue de « Mes besoins » (7,7 M€ de salaire) laisse 930 k€ de marge : dix joueurs dans ses moyens, le premier noté 68 au poste d'arrière droit (le titulaire, 71).
- **Carte Finances** (onglet Club) : budget, masse salariale et marge, puis la dernière dotation : dotation et rang de réputation, bonus ou malus des objectifs avec leur coefficient (« Ni bonus ni malus » à 1,00 : des objectifs peuvent s'annuler), report, budget de la saison, plafond salarial ; « Budget de départ » la première saison.
- **Mesure** (`npm run measure:seasons`, six saisons d'un jumeau 2 de la démo, l'adjoint aux commandes, base locale ; 4 minutes ; `-- --seed=S` pour une autre partie), avec le plancher. Début de chaque saison, clubs IA, graine de la démo ; recrue type : 25 ans, la note médiane des onze meilleurs du club ; les tiers de réputation en annexe du rapport du script :

| Mesure | S1 | S2 | S3 | S4 | S5 | S6 | S7 |
|---|---|---|---|---|---|---|---|
| Masse des dotations / création, D1 et D2 | 1,000 | 1,000 | 1,000 | 1,000 | 1,000 | 1,000 | 1,000 |
| Dotation / création moyenne, D1 | 1,00 | 0,96 | 1,00 | 0,95 | 1,00 | 1,01 | 1,04 |
| Dotation / création moyenne, D2 | 1,00 | 1,21 | 1,19 | 1,30 | 1,21 | 1,23 | 1,25 |
| Budget / création moyen, D1 | 1,00 | 1,02 | 1,06 | 1,01 | 1,07 | 1,06 | 1,08 |
| Budget / création moyen, D2 | 1,00 | 1,15 | 1,16 | 1,25 | 1,17 | 1,19 | 1,29 |
| Masse salariale / plafond (médiane), D1 | 0,83 | 0,80 | 0,80 | 0,84 | 0,84 | 0,82 | 0,78 |
| Masse salariale / plafond (médiane), D2 | 0,83 | 0,81 | 0,82 | 0,86 | 0,85 | 0,85 | 0,86 |
| Plafond au plancher / à la table, D1 | 27 % / 0 % | 32 % / 2 % | 42 % / 1 % | 37 % / 2 % | 36 % / 0 % | 32 % / 1 % | 34 % / 2 % |
| Plafond au plancher / à la table, D2 | 0 % / 4 % | 9 % / 5 % | 9 % / 10 % | 13 % / 6 % | 6 % / 8 % | 10 % / 11 % | 12 % / 22 % |
| Recrues types, par le budget / par la marge salariale (médianes), D1 | 3,0 / 3,4 | 2,8 / 3,8 | 2,9 / 3,8 | 2,8 / 3,2 | 2,9 / 3,1 | 3,0 / 3,7 | 3,3 / 5,0 |
| Recrues types, par le budget / par la marge salariale (médianes), D2 | 2,8 / 3,3 | 2,4 / 3,7 | 2,3 / 3,3 | 2,2 / 2,5 | 2,2 / 2,6 | 1,9 / 2,6 | 2,1 / 2,2 |
| Clubs dont les salaires limitent les achats, D1 | 21 % | 12 % | 20 % | 37 % | 38 % | 32 % | 14 % |
| Clubs dont les salaires limitent les achats, D2 | 37 % | 15 % | 24 % | 46 % | 37 % | 35 % | 49 % |
| Réputation moyenne, D1 / D2 | 72,4 / 50,0 | 72,3 / 50,2 | 72,0 / 50,4 | 72,0 / 50,4 | 71,7 / 50,5 | 71,5 / 50,6 | 71,2 / 50,7 |
| Écart-type des réputations, D1 / D2 (moyenne des divisions, tous les clubs) | 10,65 / 6,07 | 10,55 / 6,09 | 10,57 / 6,01 | 10,31 / 6,01 | 10,54 / 6,00 | 10,64 / 5,93 | 10,73 / 5,96 |

Avant le plancher (même graine) : masse à 80 à 88 % du plafond, salaires limitant 23 à 61 % des clubs de D1, marge de 2,5 à 3,8 recrues types en D1.

Étalement des réputations sur trois parties (graines `demo-2026-27`, `mesure-2`, `mesure-3`) : écart le plus grand de l'écart-type d'une division à celui de S1, de S1 à S7 :

| Règle | Démo | mesure-2 | mesure-3 | Divisions hors de ±10 % |
|---|---|---|---|---|
| Départ (±1 par place), cinq saisons, démo | D1 −20 %, D2 −13,5 % (moyennes) | — | — | 10 / 10 |
| 25 % pour tous | 24,9 % (it.2) | 20,6 % (en.2) | 24,5 % (fr.2) | 14 / 30 |
| **Retenue** : 25 %, promu ou relégué à sa cible | 11,7 % (fr.2) | 10,6 % (fr.2) | 6,8 % (en.2) | **2 / 30** |
| Retenue, avec le plancher | 13,0 % (fr.2) | 11,8 % (de.1) | 6,1 % (en.2) | **2 / 30** |
| Avec le plancher, pire division de D1 | 6,1 % (en.1) | 11,8 % (de.1) | 5,0 % (de.1) | 1 / 15 |
| Avec le plancher, moyennes D1 / D2, S7 / S1 | +0,7 % / −1,8 % | −2,0 % / −4,2 % | −0,2 % / −2,6 % | |

Les exceptions se resserrent lentement : la D2 française (18 clubs, les résultats les plus serrés), 6,11 → 5,38 en S7 sur la démo, et la D1 allemande sur `mesure-2`, 10,81 → 9,66. Un pas partiel vers des cibles tirées de résultats bruités resserre un peu, d'autant plus que les résultats suivent mal la réputation ; ailleurs, la D1 comme la D2 tiennent.

Club dirigé (Lyon), son budget réel et recalculé avec le coefficient maximal puis minimal (le budget du club dirigé ne rejaillit sur rien dans une partie jouée par l'adjoint), en M€ et en multiple du budget de création :

| Saison | Division | Dotation | Coef. du jeu | Plafond | Masse salariale | Budget réel | Coefficient 1,40 | Coefficient 0,70 |
|---|---|---|---|---|---|---|---|---|
| S1 | D1 | 77,2 | 1,00 | 56,1 | 46,7 | 77,2 (1,00) | 77,2 (1,00) | 77,2 (1,00) |
| S2 | D1 | 89,8 | 1,25 | 62,7 | 42,8 | 151,0 (1,96) | 164,4 (2,13) | 101,6 (1,32) |
| S3 | D1 | 89,8 | 1,00 | 62,7 | 27,8 | 165,7 (2,15) | 208,3 (2,70) | 114,1 (1,48) |
| S4 | D1 | 77,2 | 0,90 | 54,9 | 10,0 | 152,5 (1,97) | 212,4 (2,75) | 111,2 (1,44) |
| S5 | D2 | 17,8 | 0,90 | 13,6 | 2,1 | 92,2 (1,19) | 131,1 (1,70) | 68,1 (0,88) |
| S6 | D2 | 15,8 | 0,90 | 12,3 | 0,5 | 60,3 (0,78) | 87,6 (1,14) | 45,1 (0,58) |
| S7 | D2 | 5,2 | 0,90 | 5,3 | 0,4 | 34,9 (0,45) | 51,1 (0,66) | 26,2 (0,34) |

0,70 est la borne du cahier ; avec ses valeurs, le plus bas atteignable est 0,80. L'adjoint ne renouvelant aucun contrat (dette ci-dessous), la masse salariale du club dirigé fond (46,7 → 0,4 M€) ; le plancher lui garde un plafond de quoi reconstruire, au plancher dès S2 (62,7 M€ en D1, 13,6 à 5,3 M€ en D2 selon son rang), quand sans lui il tombait à 0,6 M€.

- **Cibles du cahier.** « La dotation reste du même ordre que le budget de création » : **tenue** (masses identiques ; par tiers, de 0,75 à 1,83 fois en moyenne de S2 à S7 ; un club de 0,12 à 5,00 fois, selon son rang de réputation, la pente du haut de D2 étant forte). « Le plafond salarial reste la vraie limite des achats » : **tenue depuis le 06/11** : avec le plancher, la masse fait 78 à 86 % du plafond (médianes), la marge permet 2,2 à 5,0 recrues types (médianes ; 3,4 en D1 et 3,3 en D2 à la création), du même ordre que le budget (1,9 à 3,3), et les salaires limitent les achats de 12 à 49 % des clubs selon la saison et la division (0 à 5 % en D1 avant le 06/11).
- **Dérives.** (1) Budgets des clubs IA : bornés, 1,01 à 1,08 fois la création en moyenne en D1, 1,15 à 1,29 en D2 (×2,3 et ×2,9 avant le 06/11) ; le plus grand, 4,26 fois (Ajaccio, fr.2, S7 : une dotation de haut de D2 pour un club du bas à la création). (2) Réputation : moyenne de D1 72,4 → 71,2, de D2 50,0 → 50,7 ; le premier attendu, sans montée ni descente, perd 1,1 point par saison en moyenne (sa cible est au mieux la sienne) ; l'étalement tient (ci-dessus). (3) Le club dirigé joué par l'adjoint : voir les dettes.
- **Six cibles d'équilibrage (06/11)** (`measure:balance -- --world-only`, une saison complète du monde 2 sur trois graines) : 2,64 buts par match, 25,1 % de nuls, 43,6 % de victoires à domicile, 55,2 points d'écart entre le 1er et le dernier, forme des onze de 35,3 à 75,3 (34,7 à 72,5 avec le plancher), le plus faible gagne 23,2 % : les six tiennent, plancher compris. Les corrections n'agissant qu'aux passages de saison, trois d'entre elles relues sur les saisons 2 à 6 des trois parties de `measure:seasons` (les nuls tirés des points : 3 × matchs − points) : 2,65 buts par match, 25,1 % de nuls (23,6 à 26,2 % selon la saison), 53,1 points d'écart (50,2 à 55,0) ; avec le plancher, 2,66, 25,0 % (23,5 à 26,2 %) et 53,1 ; avant les corrections, 2,65, 25,2 % et 53,7.

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

### Retenu (05/11)

- **Stockage** : `SeasonObjective` (migration d'ajout `…_season_objectives`) : saison, type, imposé, choisi, par l'adjoint, variante du classement, cible, dépassement, issue ; une ligne par type et par saison (les trois proposés gardés, l'issue seulement pour les imposés et le choisi) ; cascade depuis la partie et depuis la saison, index sur chaque clé étrangère. La même migration ajoute `PlayerSeasonStats.starts` (titularisations, comptées depuis : Jeunesse en a besoin). Ouverts à la création de la partie et à chaque passage de saison ; une partie d'avant eux n'en a qu'à partir de sa saison suivante (coefficient 1 au passage).
- **Règles** (`src/engine/objectives.ts`, pures) : celles du cahier, avec ces écarts.
  1. Classement « Xe ou mieux » : **X = le rang attendu** (marge du cahier +2 en D1 et +3 en D2, ramenée à 0 par la mesure : atteint ou dépassé 69 % → 55 %) ; jamais la dernière place, là où personne ne descend (D2, partie 1 : X plafonné à l'avant-dernière place). Dépassé : trois places de mieux ; le maintien, trois places au-dessus de la zone.
  2. Coupe : la cible est **au moins un tour après l'entrée du club** : les clubs de D1 sont exemptés du tour préliminaire, leurs « seizièmes » auraient été atteints au tirage (bas de D1 : huitièmes). Dépassé : deux tours de plus ; la victoire finale compte comme le tour 7.
  3. Objectif au choix : trois des quatre, tirés du flux de la saison ; **Jeunesse n'étant pas toujours proposé**, l'adjoint prend alors le premier proposé (ordre Jeunesse, Spectacle, Solidité, Bonne gestion).
  4. Spectacle et Solidité : « attendu » = les buts attendus du moteur pour l'effectif du départ, dans son dispositif, face à l'adversaire moyen de sa division, **× 0,93** (`EXPECTED_SEASON_GOALS_FACTOR` : une saison donne 94 % des buts attendus pour et 91 % contre ; sans ce facteur, Spectacle était atteint 15 % du temps et Solidité 48 %). Jeunesse : l'âge au 1er juillet de la saison. Bonne gestion : le solde des transferts du 1er juillet au 30 juin, ventes de la présaison comprises.
  5. Confiance du président (`boardConfidence`) : 50, plus des points par objectif selon où il en est (classement +30, +20, +5, −10, −25 pour dépassé, atteint, en bonne voie, en danger, manqué ; coupe +15, +10, +2, −5, −10 ; choisi +10, +10, +2, −5, −10), réécrite après chaque match du club : 57 au début d'une saison avec une coupe. Affichée seulement.
  6. Coefficient : valeurs du cahier ; le plus bas atteignable est 0,80.
- **Écrans** : l'écran de début de saison (`/season-start`, sous Club) : dotation détaillée, plafond, objectifs imposés et choix ; la carte Objectifs de l'Accueil ; « Objectifs du président » et la confiance dans l'onglet Club ; le bilan de la saison et la pastille « Objectifs : 2/3 » de sa carte PNG. « En danger » en ambre.
- **Mesure** (`npm run measure:seasons`, cinq saisons d'un jumeau 2 de la démo, l'adjoint aux commandes) : l'objectif que la saison de chaque club IA lui aurait donné, jugé avec les règles du jeu ; 985 clubs-saisons. Après les corrections du 06/11 (six saisons, trois graines, 1 182 clubs-saisons chacune) : classement 56 à 57 %, coupe 49 à 50 %, Jeunesse 45 à 46 %, Spectacle 26 à 30 %, Solidité 30 à 32 %, Bonne gestion 99 à 100 % ; les cibles du classement et de la coupe tiennent.

| Objectif | Dépassé | Atteint | Manqué | Atteint ou dépassé | D1 | D2 |
|---|---|---|---|---|---|---|
| Classement | 28 % | 26 % | 45 % | **55 %** | 55 % | 54 % |
| Coupe | 9 % | 40 % | 50 % | **50 %** | 53 % | 47 % |
| Jeunesse | — | 43 % | 57 % | 43 % | 29 % | 55 % |
| Spectacle | — | 31 % | 69 % | 31 % | 31 % | 30 % |
| Solidité | — | 31 % | 69 % | 31 % | 31 % | 31 % |
| Bonne gestion | — | 98 % | 2 % | 98 % | 97 % | 100 % |

Par tiers de réputation, le classement va de 40 % (haut de D2 : la montée) à 65 % (bas de D2), la coupe de 37 % (bas de D2) à 59 % (milieu de D1). **Cibles** : le classement environ une saison sur deux (55 %), la coupe un peu moins souvent (50 %) : tenues. À savoir : Bonne gestion est presque toujours atteinte par les clubs IA, qui n'achètent guère ; pour le joueur, c'est vendre autant qu'il achète. Jeunesse dépend de la division (29 % en D1, 55 % en D2). Le club dirigé, joué par l'adjoint : Spectacle (Jeunesse non proposé) puis Jeunesse quatre saisons, coefficients 1,25, 1,00, 0,90, 0,90, 0,90.

## Dettes

Chantier « dettes » du 06/11 (branche `dettes`, un commit par point ; base locale, rien contre Neon).

- **Marché, performance : réglée.** Mesuré sur une base locale de 24 parties de monde 2 (Lyon et Caen à leur création, Lyon en deuxième saison, 20 parties de remplissage), serveur de production. Une navigation dans le jeu depuis l'accueil de la partie (les quatre entrées d'Acheter arrivent ensemble : on passe de l'une à l'autre sans requête), lignes lues par Postgres, avant → après :

| Page | Lyon | Caen | Lyon, saison 2 | Lignes renvoyées (Lyon) | Envoyé (Lyon) | Temps (Lyon) |
|---|---|---|---|---|---|---|
| Acheter | 44 199 → 1 573 | 44 199 → 2 347 | 57 481 → 4 617 | 6 107 → 638 | 29 Ko → 29 Ko | 90 → 51 ms |
| Vendre | 19 948 → 860 | 19 951 → 864 | 26 388 → 2 672 | 717 → 134 | 30 Ko → 30 Ko | 68 → 29 ms |
| Écran avancé, joueurs libres | 629 → 309 | 633 → 313 | 5 175 → 3 577 | 69 → 68 | 316 Ko → 23 Ko | 40 → 28 ms |
| Écran avancé, clubs | 10 356 → 523 | 10 360 → 608 | 12 061 → 7 204 | 5 337 → 182 | 361 Ko → 41 Ko | 91 → 19 ms |

  Premier chargement d'une page (en-tête compris) : Acheter 49 256 → 1 694 lignes, l'écran avancé 752 → 420 Ko bruts (62 → 45 Ko compressés). Ce qui reste : de petites tables que Postgres lit en entier dans cette base, et par index en production (Season, 370 lignes ; Transfer, 882) ; Club (198 lignes, données du monde), lue en entier à chaque chargement de relation, en production aussi ; en saison 2, le décompte de l'onglet clubs (l'index des 4 900 joueurs de la partie et la visibilité des pages modifiées par la saison) et les retraités relus par la liste des joueurs libres. Comment : par l'id du club dirigé, jamais par un filtre de relation sur `ClubSave` (Prisma en fait une jointure dont Postgres sous-estime les joueurs d'un club) ; les offres de Vendre par lots de clubs dans l'ordre des enchères ; les propositions par note et par potentiel jusqu'à ce qu'aucun joueur restant ne puisse entrer dans une entrée ; la liste des clubs triée et paginée par la base ; les tableaux de l'écran avancé dessinés dans le navigateur. Migration d'ajout `…_market_indexes` : `ClubSave(saveId, isManaged)`, `ClubSave(saveId, reputation)`, `PlayerSave(saveId, overall, wage)`, `PlayerSave(saveId, potential, overall, wage)`, environ 195 Ko par partie (2,4 % d'une partie de cette base). Les mêmes résultats qu'avant, prouvés contre l'implémentation d'avant recopiée : `sale-quotes.test.ts`, `market-proposals-equivalence.test.ts` (quatre parties et graines, la démo, marge, budget et réputation aux bornes, après trois journées), `market-lists.test.ts`, `header.test.ts`.
- **Revente : réglée.** Un joueur à un an de contrat s'achète 60 % de sa valeur et se revendait au mercato suivant 80 à 120 % de sa valeur. Désormais, jusqu'à la veille du même jour un an après sa dernière arrivée au club dirigé, la meilleure offre IA est plafonnée (`resaleCap`) : 110 % du prix payé pour un joueur acheté, 50 % de sa valeur du jour pour un joueur libre (`balance.ts`) ; la règle du mercato d'arrivée reste la première. Le plafond ne tire rien (mêmes clubs, mêmes salaires, mêmes contrats ; seules les offres au-dessus y descendent, le plus réputé de ceux qui l'offrent fait la meilleure) ; Vendre et la fiche le disent en une phrase, en français et en anglais, dès que le plafond s'applique. Le cas qui posait problème (`resale-cap.test.ts`) : Martinelli (78, un an de contrat, valeur 30,16 M€) acheté 18,10 M€ en juillet trouvait 30,84 M€ en janvier, désormais 19,91 M€, que la vente paie ; un joueur libre de 3,5 M€ de valeur, 1,75 M€ au lieu de 4,02 M€ ; plus de plafond un an après.
- **Point faible du marché : réglée.** D'abord un poste vide (plus aucun joueur disponible pour le tenir, blessés et suspendus compris), noté 0 ; puis un poste tenu hors poste (« Hors poste » : ni à son poste, ni à un poste secondaire, ni dans sa ligne), le moins bien noté d'entre eux ; puis le titulaire le moins bien noté, comme avant ; le premier du dispositif à égalité (`weakSpotOf`, `elevenOf`). « À faire » et l'introduction de Mes besoins disent pourquoi. Tests du moteur : poste vide (blessure, suspension), hors poste, égalités, la dépanne et le poste secondaire qui n'en sont pas.
- **L'adjoint ne renouvelait aucun contrat : réglée, en mode de mesure.** `advanceToNextSeason(saveId, { assistantContracts: true })`, passé par `measure:seasons`, `measure:divisions` et leurs tests seulement, jamais par le jeu : les contrats échus du club dirigé ne finissent plus au passage, sa présaison les décide comme celle d'un club IA (`planSquad` : prolongations, libérations, recrues libres), à sa place parmi eux par réputation, avec son plafond et son propre flux. Lyon joué par l'adjoint (graine de la démo) : 25, 25, 24, 24, 25, 25, 25 joueurs de S1 à S7, masse salariale 46,7, 45,5, 39,1, 46,1, 55,5, 55,2, 58,3 M€ (avant : 25 → 6 joueurs, 46,7 → 0,4 M€, descente en S4) ; seconde graine : 25 joueurs, 47,8 à 55,3 M€. Sans l'option, rien ne change (empreinte d'un passage identique avant et après). Les chiffres du club dirigé des tableaux de V2 et V3 ci-dessus datent d'avant.
- **Calendrier du monde 1 : retirée.** Plus aucune partie n'y naît : le formulaire de création ne passe pas de monde, `createSave` prend `DEFAULT_WORLD_VERSION` (2), le défi passe 2. Les parties 1 existantes gardent leur calendrier.
- **Avertissements sslmode de pg : réglée dans le code.** `pgConnection` écrit `verify-full` les `sslmode` `prefer`, `require` et `verify-ca` d'une URL distante, ce que pg en fait déjà, sans son avertissement ; aucune variable à changer sur Vercel.

Restent ouvertes :

- **Les joueurs retraités restent dans `PlayerSave`**, sans club, comme les joueurs libres : la liste des joueurs libres, son décompte et les propositions les relisent, environ 270 de plus par saison (en saison 2, 533 lignes sans club pour 259 joueurs libres). Il faudrait les marquer (une colonne, une migration).
- **Le décompte de l'onglet clubs** lit l'index de tous les joueurs de la partie (environ 4 900 entrées, et autant de contrôles de visibilité une fois la saison jouée) pour afficher « N joueurs » et le nombre de pages.
- **Premier chargement d'une page de la partie** (rafraîchissement, lien direct) : 140 à 470 Ko bruts, 33 à 51 Ko compressés ; l'écran avancé y garde le HTML de ses cinquante lignes, visages compris (420 et 474 Ko), quand une navigation n'en envoie que les données (23 et 41 Ko).
- **La table `Club`** (198 lignes de données du monde) est lue en entier à chaque chargement de relation qui la touche ; un cache en mémoire l'enlèverait partout.
- **Un club peu réputé** (Caen) lit davantage pour ses propositions : 1 468 lignes de `PlayerSave` contre 840 pour Lyon, son point faible très bas (46) laissant Mes besoins et Bonnes affaires descendre loin.
- **Poste vide et meilleur poste** : un poste vide, noté 0, est aussi le meilleur poste des Pépites, Bonnes affaires et Stars, qui s'y affichent à « +51 » ; cas rarissime (moins de onze joueurs disponibles).

## Ordre et méthode

V1 → V2 → V3, sur une branche `gameplay-v2` partie de `main` après la mise en ligne du gameplay v1. Méthode habituelle : un commit par changement cohérent ; tsc, lint et Vitest verts à chaque commit ; E2E complets en fin de chantier ; `measure:balance` avant/après pour V1 et V2 ; migrations d'ajout uniquement, SQL montré ; base locale ; rien contre Neon ; rien de poussé sans demande ; FR et EN, tutoiement. Mise en ligne calée après un changement de semaine du défi si le moteur change (V1).
