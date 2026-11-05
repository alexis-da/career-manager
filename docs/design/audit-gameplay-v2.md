# Audit gameplay v2 : finances, objectifs de saison, dispositifs

Audit fait le 05/11/2026 sur la branche `gameplay` (dernier commit `b1526aa`). Rien n'a été modifié dans le dépôt par cet audit. Les références fichier:ligne sont celles du commit `b1526aa` (les corrections du direct faites en même temps ne touchent à aucun fichier cité).

## En-tête

- **Partie mesurée** : monde 2 (premières et deuxièmes divisions, coupes nationales), graine `demo-2026-27` (`DEMO_SEED`, `src/db/test-support.ts:14`), créée par `createSave` sur la base locale `latewinner_dev`, propriétaire jetable `test-owner-audit-1793870901226` (REGISTERED).
- **Club dirigé** : `olympique-lyonnais` (`DEMO_CLUB_SLUG`), sans composition enregistrée ni transfert : l'adjoint joue tout, comme `scripts/measure-d2-balance.ts`.
- **Clubs retenus** (France, classés par réputation à la création, club dirigé exclu) :

| rôle | club | division | rang 2024-25 | réputation | note moyenne du onze |
|---|---|---|---|---|---|
| D1 haut | paris-saint-germain-fc | fr.1 | 1 | 90 | 77,5 |
| D1 milieu | toulouse-fc (9e des 17 clubs IA) | fr.1 | 10 | 71 | 67,3 |
| D1 bas | montpellier-hsc | fr.1 | 18 | 55 | 61,9 |
| D2 haut | fc-lorient | fr.2 | 1 | 60 | 64,6 |
| D2 milieu | grenoble-foot-38 | fr.2 | 9 | 51 | 59,0 |
| D2 bas | sm-caen | fr.2 | 18 | 40 | 53,1 |
| dirigé | olympique-lyonnais | fr.1 | 6 | 80 | 73,1 |

- **Durée de la simulation** : 53 s en tout. Création 3,6 s, saison 1 25,1 s (52 dates), passage à la saison 2 1,5 s, saison 2 22,6 s (52 dates), suppression 0,5 s.
- **Nettoyage** : la partie et son propriétaire sont supprimés dans un `finally` (cascade depuis `User`). Contrôlé après coup : 0 propriétaire, 0 partie restants. Base : 20 parties et 39 utilisateurs avant, 20 et 39 après.
- **Méthode** : quatre photos de la partie (s0 création, s1 fin de saison 1 avant `advanceToNextSeason`, s2 juste après le passage, s3 fin de saison 2), puis analyses hors base. Scripts et sorties dans `C:\Users\alexi\AppData\Local\Temp\claude\b0ca2048926b13a7\2546053c-7c6a-4b47-84f7-0e5249fed187\scratchpad\audit\` : `sim.ts` (simulation), `analyze.ts` et `extra.ts` (Q1, Q2), `formations.ts` (Q3, calcul pur et saisons sur le papier), sorties `analysis.md`, `extra.md`, `formations.md`.

## Résumé

- **Finances.** Le budget est une dotation unique, fixée à la création d'après le rang 2024-25. Ensuite, il ne bouge que par les primes de coupe, les transferts du club dirigé et deux bornes au changement de division. Pas de recettes, pas de salaires payés, pas de renouvellement. Sur deux saisons, les 198 budgets n'ont bougé que des primes de coupe (121,3 M€ par saison pour tout le monde) : aucun club IA n'a payé un seul euro de transfert.
- **Masse salariale.** Elle ne change qu'au passage de saison (retraites, fins de contrat, prolongations, jeunes). Le plafond salarial est large : aucun club ne le dépasse, la vente forcée des clubs IA (`planWageSales`) ne s'est jamais déclenchée.
- **Objectifs.** La réputation prédit bien le classement (rho de Spearman 0,80 en moyenne), avec assez de dispersion pour des objectifs non triviaux : 71 à 73 % des clubs de D1 finissent à 3 places ou moins de leur rang de réputation, 58 à 63 % en D2. Rien n'existe pour stocker ou juger un objectif ; `boardConfidence` dort en base.
- **Dispositifs.** Seul contre des 4-3-3, un club IA gagnerait peu à choisir son dispositif (+0,3 à +1,5 point par saison), surtout les faibles (5-3-2). Si tous choisissent, les buts chutent de 12 à 14 % : le calibrage repose sur deux 4-3-3. Sans recalibrage, les buts (2,31 à 2,36) et les victoires à domicile (42,5 à 42,8 %) sortent de leur plage, nuls et écart arrivent au bord. Avec `BASE_GOALS_PER_TEAM` à 1,39-1,42, les six cibles reviennent à leurs valeurs d'aujourd'hui : c'est de la variété, pas un levier d'équilibrage.

---

## Q1. Finances

### 1.1 À la création

`createSave` donne à chaque club `clubFinances(initialRank, clubCount, tier)` (`src/db/saves.ts:219-228`, `src/engine/economy.ts:48-59`) :

- force de rang `s = (N − rang) / (N − 1)` (`src/engine/curves.ts:25`), 1 pour le champion 2024-25, 0 pour le dernier ;
- budget et plafond salarial : interpolés entre le dernier et le champion de la division avec `s²` (l'argent se concentre en haut), arrondis à 100 000 € (`BUDGET_STEP`, `src/engine/balance.ts:159`) ;
- réputation : interpolée avec `s` (linéaire).

| constante (`balance.ts`) | D1 dernier → champion | D2 dernier → champion |
|---|---|---|
| `CLUB_BUDGET_BY_TIER` (l. 141) | 5 → 150 M€ | 1 → 20 M€ |
| `CLUB_WAGE_BUDGET_BY_TIER` (l. 147) | 20 → 200 M€ / saison | 5 → 30 M€ / saison |
| `CLUB_REPUTATION_BY_TIER` (l. 153) | 55 → 90 | 40 → 60 |

Exemple, Lyon : 6e sur 18, `s = 12/17 = 0,71`, `s² = 0,50` : budget 5 + 145 × 0,50 = 77,2 M€, plafond 20 + 180 × 0,50 = 109,7 M€, réputation 55 + 35 × 0,71 = 80.

La **masse salariale** n'est pas tirée du plafond. C'est la somme des contrats générés pour chaque joueur (`src/db/saves.ts:262-266`, `generateContract`, `economy.ts:119-125`) : `wageFor` (`economy.ts:93-98`) lit `WAGE_BY_OVERALL` et `WAGE_AGE_FACTOR` (`balance.ts:227-244`). La note du joueur vient du niveau du club, lui aussi tiré du rang 2024-25 (`clubLevelFromRank`, `src/engine/generation.ts:53-56`, `CLUB_LEVEL_BY_TIER`, `balance.ts:18-21`). Les jeunes arrivent avec `wageFor` (`src/engine/youth.ts:140`). Résultat : la masse salariale vaut 28 à 67 % du plafond en D1 (médiane 44 %), 43 à 98 % en D2 (médiane 61 %).

### 1.2 Ce qui fait bouger le budget (toutes les écritures de `ClubSave.budget`)

| cause | où | qui | effet |
|---|---|---|---|
| Primes de coupe | `src/db/cup.ts:146-160`, `cupPrize` (`src/engine/cup.ts:108-117`), `CUP_ROUND_PRIZES` et suivantes (`balance.ts:191-193`) | tous les clubs, dans la transaction du match | +0,1 / 0,25 / 0,5 / 1 / 2 M€ par tour gagné, finale 5 M€ (vainqueur) ou 2,5 M€ (finaliste) : 8,85 M€ au plus par saison |
| Montée | `applySeasonMoves` (`src/db/promotion.ts:172-181`), `financesAfterMove` (`economy.ts:66-79`) | clubs promus, au passage | au moins le bas de la D1 : budget ≥ 5 M€, plafond ≥ 20 M€, réputation ≥ 55 |
| Descente | idem | clubs relégués | au plus le haut de la D2 : budget ≤ 20 M€, plafond ≤ 30 M€, réputation ≤ 60 |
| Ventes forcées des clubs IA | `src/db/preseason.ts:207-266`, `planWageSales` (`src/engine/transfer-ai.ts:193-230`) | un club IA au-dessus de son plafond, en présaison | indemnité versée par l'acheteur IA, jamais sous 80 % de la valeur (`WAGE_SALE_MIN_FEE_SHARE`, `balance.ts:770`) |
| Achat du club dirigé | `makeTransferOffer` (`src/db/transfers.ts:298-302`, `320-321`) | club dirigé et club vendeur | −indemnité / +indemnité, refus si indemnité > budget |
| Vente du club dirigé | `sellPlayer` (`transfers.ts:442-459`) | club dirigé et acheteur IA | +indemnité / −indemnité |
| Libération par le club dirigé | `releasePlayer` (`transfers.ts:409-415`), `releaseCompensation` (`transfers.ts:137-138`) | club dirigé | −50 % des salaires restants (`RELEASE_COMPENSATION_SHARE`, `balance.ts:759`) |

Rien d'autre n'écrit le budget. Signer un joueur libre ou prolonger ne coûte rien au budget : seul le plafond est contrôlé (`transfers.ts:352`, `381`). Le code n'a ni billetterie, ni droits TV, ni sponsors, ni prime de classement : `CLAUDE.md:438` le dit (« ni recettes ni objectifs du président, le jeu n'en a pas »). Les salaires ne sont jamais payés : le plafond est une borne, pas une dépense.

### 1.3 Ce qui fait bouger la masse salariale et le plafond

- **Pendant une saison : rien.** Aucun transfert IA en cours de saison ; le club dirigé ne peut agir que pendant un mercato (`transferWindowAt`, `src/engine/world.ts`, contrôlé par `managedContext`, `transfers.ts:140-147`). Vérifié : 0 club sur 198 a vu sa masse changer pendant une saison.
- **Au passage** (`advanceToNextSeason`, `src/db/season.ts:68-265`) :
  - la progression change notes et valeurs, jamais les salaires (`season.ts:174-206`) ;
  - retraites (`season.ts:159-162`) ;
  - contrats échus du club dirigé : ses joueurs partent libres, personne ne les prolonge à sa place (`season.ts:163-166`) ;
  - clubs IA (`planSquad`, `src/engine/squad-ai.ts:89-189`, appliqué par `preseason.ts:268-304`) : prolongation au salaire `max(actuel, wageFor)` (`squad-ai.ts:127-133`), libération des autres, signature de joueurs libres à `wageFor` tant que le plafond tient (`squad-ai.ts:140-150`) ;
  - deux jeunes par club (`preseason.ts:160-192`).
- **Le plafond** ne bouge qu'au changement de division (`financesAfterMove`).

### 1.4 Pourquoi le budget n'est pas renouvelé

`clubFinances` n'est appelé qu'à la création (`saves.ts:225`). `advanceToNextSeason` n'écrit le budget qu'à travers `applySeasonMoves` (`season.ts:214`) et la présaison (`season.ts:217`). Il n'existe aucun flux récurrent : ni dotation annuelle, ni recettes, ni charges. Le budget est un **stock** : la dotation de départ, plus les primes de coupe et les ventes, moins les achats. Un joueur qui dépense tout au premier mercato ne retrouvera de l'argent qu'en vendant ou par la coupe.

### 1.5 Les chiffres de la partie mesurée

Budget, masse salariale et plafond (M€) aux quatre moments :

| club | budget s0 | s1 | s2 | s3 | masse s0 | s1 | s2 | s3 | plafond s0 | s2 | division s0 → s2 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| paris-saint-germain-fc | 150,0 | 150,25 | 150,25 | 152,0 | 85,5 | 85,5 | 81,1 | 81,1 | 200,0 | 200,0 | fr.1 → fr.1 |
| toulouse-fc | 37,1 | 37,1 | 37,1 | 37,1 | 25,1 | 25,1 | 26,1 | 26,1 | 59,9 | 59,9 | fr.1 → fr.1 |
| montpellier-hsc | 5,0 | 5,75 | 5,75 | 5,75 | 10,7 | 10,7 | 10,1 | 10,1 | 20,0 | 20,0 | fr.1 → fr.2 |
| fc-lorient | 20,0 | 20,0 | 20,0 | 20,75 | 18,7 | 18,7 | 17,3 | 17,3 | 30,0 | 30,0 | fr.2 → fr.2 |
| grenoble-foot-38 | 6,3 | 6,55 | 6,55 | 6,55 | 7,5 | 7,5 | 7,3 | 7,3 | 12,0 | 20,0 | fr.2 → fr.1 |
| sm-caen | 1,0 | 1,35 | 1,35 | 1,45 | 3,3 | 3,3 | 3,2 | 3,2 | 5,0 | 5,0 | fr.2 → fr.2 |
| olympique-lyonnais (dirigé) | 77,2 | 78,95 | 78,95 | 79,7 | 46,7 | 46,7 | 42,8 | 42,8 | 109,7 | 109,7 | fr.1 → fr.1 |

Chaque variation, par cause :

| club | saison 1 | passage | saison 2 |
|---|---|---|---|
| PSG | 5e (60 pts) ; coupe : battu en 8es, +0,25 (16es gagnés) | budget inchangé ; masse −4,3 : 2 retraites (−4,6), 2 jeunes (+0,2) | 2e (69 pts) ; coupe : battu en demies, +1,75 |
| Toulouse | 13e (36 pts) ; battu en 16es, 0 | budget inchangé ; masse +1,0 : 2 libérés (−0,4), 1 retraite (−0,9), 1 joueur libre signé (+2,0), 2 prolongations (+0,3), 2 jeunes (+0,1) | 12e (43 pts) ; battu en 16es, 0 |
| Montpellier | 17e (25 pts), **relégué** ; battu en quarts, +0,75 | descente sans effet : budget 5,75 ≤ 20, plafond 20 ≤ 30, réputation 55 ≤ 60 ; masse −0,6 : 1 libéré, 1 retraite, 2 jeunes | 11e de fr.2 (44 pts) ; 0 |
| Lorient | 6e de fr.2 (56 pts) ; battu en 16es, 0 | masse −1,4 : 3 libérés (−1,9), 1 signé (+0,3), 2 jeunes (+0,2) | 2e de fr.2 (67 pts), donc promu au passage suivant (non joué) ; battu en quarts, +0,75 |
| Grenoble | 2e de fr.2 (62 pts), **promu** ; battu en 8es, +0,25 | montée : plafond 12 → 20 (plancher de D1), réputation 51 → 55, budget inchangé (6,55 ≥ 5) ; masse −0,2 | 16e de fr.1 (31 pts) ; 0 |
| Caen | 16e de fr.2 (30 pts) ; tour préliminaire et 16es gagnés, +0,35 | masse −0,1 : 2 libérés, 2 jeunes | 15e de fr.2 (40 pts) ; préliminaire gagné, +0,1 |
| Lyon (dirigé) | **champion** (73 pts) ; battu en demies, +1,75 | budget inchangé ; masse −3,9 : 2 contrats échus partis libres (−3,2), 1 retraite (−0,9), 2 jeunes (+0,2) ; effectif 25 → 24 | 3e (67 pts) ; battu en quarts, +0,75 |

Contrôles sur les 198 clubs, tous vérifiés : la variation du budget pendant chaque saison est exactement la somme des primes de coupe (0 écart) ; au passage, le budget vaut exactement `financesAfterMove` + indemnités (0 écart) ; aucune masse salariale ne change pendant une saison.

Au passage de la saison 2 (`meta.json`) : 160 retraites, 96 joueurs libres sortis du monde, 2 contrats échus au club dirigé, 355 prolongations, 272 libérations et 19 signatures par les clubs IA, 396 jeunes, **0 vente salariale, 0 € d'indemnité**.

Les 26 montées et descentes (budget, plafond, réputation, s1 → s2) :

| effet de `financesAfterMove` | clubs |
|---|---|
| budget | aucun changement : les promus avaient déjà plus de 5 M€, les relégués moins de 20 M€ |
| plafond relevé à 20 M€ | grenoble-foot-38 (12,0), albacete (13,2), blackburn-rovers-fc (18,7), us-catanzaro (18,6) |
| réputation relevée à 55 | grenoble-foot-38 (51), albacete (51) |
| réputation ramenée à 60 | fc-st-pauli-1910 (63), tottenham-hotspur-fc (61), rcd-espanyol-de-barcelona (61), le-havre-ac (61), parma-calcio-1913 (62) |
| rien du tout | les 15 autres |

Par division (M€, min / médiane / max) :

| moment | division | budget | budget total | masse salariale | masse / plafond | clubs au-dessus du plafond | masse / budget (médiane) |
|---|---|---|---|---|---|---|---|
| s0 | D1 | 5,0 / 41,4 / 150,0 | 5 246,8 | 7,4 / 28,9 / 112,0 | 0,28 / 0,44 / 0,67 | 0 | 0,75 |
| s0 | D2 | 1,0 / 5,8 / 20,0 | 765,3 | 3,1 / 6,9 / 18,7 | 0,43 / 0,61 / 0,98 | 0 | 1,21 |
| s1 | D1 | 5,0 / 41,7 / 151,8 | 5 341,3 | 7,4 / 28,9 / 112,0 | 0,28 / 0,44 / 0,67 | 0 | 0,73 |
| s1 | D2 | 1,0 / 5,8 / 28,8 | 792,1 | 3,1 / 6,9 / 18,7 | 0,43 / 0,61 / 0,98 | 0 | 1,19 |
| s2 | D1 | 5,0 / 41,7 / 151,8 | 5 439,3 | 7,3 / 27,8 / 107,8 | 0,25 / 0,44 / 0,66 | 0 | 0,70 |
| s2 | D2 | 1,0 / 5,3 / 20,3 | 694,1 | 3,1 / 6,9 / 17,3 | 0,34 / 0,58 / 1,00 | 0 | 1,31 |
| s3 | D1 | 5,0 / 42,8 / 158,8 | 5 546,4 | 7,3 / 27,8 / 107,8 | 0,25 / 0,44 / 0,66 | 0 | 0,67 |
| s3 | D2 | 1,0 / 5,3 / 22,1 | 708,3 | 3,1 / 6,9 / 17,3 | 0,34 / 0,58 / 1,00 | 0 | 1,31 |

Primes de coupe : 121,3 M€ par saison dans le monde (saison 1 : 94,5 en D1, 26,8 en D2 ; saison 2 : 107,2 et 14,2). C'est 2 % de l'argent total. Un vainqueur touche 8,75 à 8,85 M€ : beaucoup pour un club de D2 (1 à 20 M€ de budget), rien pour un grand.

### 1.6 Ce que cela veut dire en jeu

- **Les budgets des clubs IA ne servent presque à rien.** Un club IA n'achète jamais, sauf lors d'une vente forcée (aucune en deux saisons). Son budget ne limite que ses offres pour un joueur que tu vends (`saleBids`, `transfer-ai.ts:146-176`, pas d'offre au-dessus du budget) ; il grossit quand tu lui achètes un joueur.
- **Le plafond salarial ne contraint presque personne.** Masse au plus à 67 % du plafond en D1. Les ventes forcées, prévues pour les relégués, ne partent jamais : les relégués sont déjà sous les bornes de la D2. Monter ou descendre ne change donc presque rien aux finances.
- **Pour toi, le budget ne se recharge pas.** Lyon a 77 M€ et 63 M€ de marge salariale par saison ; une fois dépensés, seules les ventes et la coupe (8,85 M€ au mieux) rendent de l'argent. En D2, le budget est souvent inférieur à une saison de salaires (médiane 0,8 saison) : un club de D2 ne peut presque pas acheter.
- **Tes contrats échus partent sans remplaçant.** En simulation pure, Lyon perd 2 joueurs à 3,2 M€ au premier passage. C'est voulu : le joueur décide, et « À faire » liste les contrats qui finissent dès le 1er janvier (`expiringContracts`, `src/db/dashboard.ts:267-271`). Un joueur qui ne regarde pas perd des titulaires sans contrepartie.

Pistes, sans les concevoir : une dotation annuelle par division et classement (droits TV), une prime de classement, des salaires payés par semaine sur le budget, ou au moins un budget de mercato recalculé à chaque été depuis la réputation.

---

## Q2. Objectifs de saison

### 2.1 Les données qui existent

| donnée | où | état |
|---|---|---|
| Rang 2024-25 | `Club.initialRank` (`prisma/schema.prisma:38`) | fixe, référence |
| Réputation | `ClubSave.reputation` (`schema.prisma:159`), tirée du rang (`economy.ts:57`) | ne change qu'à une montée ou descente (vérifié : 0 club sur 198 autrement). Ne suit pas les résultats. |
| Confiance du président | `ClubSave.boardConfidence` (`schema.prisma:160`) | 50 partout, lue et écrite nulle part dans `src` ni `app` |
| Force de l'effectif | `averageStarterRating(selectLineup())` (`src/engine/lineup.ts:266-269`), `squadStandard` (`src/engine/squad-ai.ts:61-64`), `formationStrength` et `expectedGoals` (`src/engine/strength.ts:73-90`) | calculable à tout moment, pur |
| Classement | `computeStandings` (`src/engine/standings.ts:45`), `getStandings` (`src/db/standings.ts`) | recalculé depuis les `Fixture` |
| Bilan de saison | `SeasonResult` (`schema.prisma:336-367`) : rang, points, trophées, `cupRound`, `promoted`, `relegated`, meilleur joueur | club dirigé seulement, écrit au passage (`src/db/season-results.ts:204-224`) |
| Coupe | `Fixture.round`, `winnerClubSaveId`, `decidedBy` ; `cupRunOf` (`src/engine/cup.ts:119-130`) | tous les clubs |
| Âge | `PlayerSave.birthDate`, `ageInYears` (`src/lib/dates.ts:2`) | tous les joueurs |
| Temps de jeu | `PlayerSeasonStats` (`schema.prisma:310-330`), une ligne par saison de compétition | en coupe, seulement les joueurs du club dirigé (`src/db/matchday.ts:293-297`) |
| Masse salariale, plafond, budget | `getClubFinances` (`src/db/club.ts:11-18`) | tous les clubs |
| Historique des mouvements | `Transfer`, `Season.movements` | tous les clubs |

### 2.2 Réputation et classement final

Corrélation de rang (rho de Spearman) entre la réputation au coup d'envoi et le rang final, par championnat :

| saison | championnat | clubs | rho réputation | rho force du onze | écart moyen de rang | champion (son rang de réputation) | 1re réputation : rang final | pts 1er − dernier |
|---|---|---|---|---|---|---|---|---|
| 1 | de.1 | 18 | 0,90 | 0,90 | 2,0 | bayer-04-leverkusen (2e) | fc-bayern-munchen 5e | 85 − 12 |
| 1 | en.1 | 20 | 0,78 | 0,76 | 3,2 | aston-villa-fc (6e) | liverpool-fc 4e | 79 − 20 |
| 1 | es.1 | 20 | 0,87 | 0,91 | 2,3 | villarreal-cf (5e) | fc-barcelona 3e | 80 − 23 |
| 1 | fr.1 | 18 | 0,76 | 0,79 | 2,8 | olympique-lyonnais (6e) | paris-saint-germain-fc 5e | 73 − 16 |
| 1 | it.1 | 20 | 0,81 | 0,84 | 2,7 | ssc-napoli (1re) | ssc-napoli 1er | 83 − 19 |
| 1 | de.2 | 18 | 0,79 | 0,79 | 2,8 | sv-07-elversberg (3e) | 1-fc-koln 2e | 68 − 25 |
| 1 | en.2 | 24 | 0,79 | 0,80 | 3,9 | bristol-city-fc (6e) | leeds-united-fc 6e | 97 − 37 |
| 1 | es.2 | 22 | 0,85 | 0,86 | 2,7 | cd-mirandes (3e) | levante-ud 6e | 90 − 24 |
| 1 | fr.2 | 18 | 0,79 | 0,82 | 2,8 | paris-fc (2e) | fc-lorient 6e | 68 − 25 |
| 1 | it.2 | 20 | 0,81 | 0,79 | 2,7 | spezia-calcio (3e) | sassuolo-calcio 2e | 82 − 22 |
| 2 | de.1 | 18 | 0,74 | 0,78 | 2,8 | fc-bayern-munchen (1re) | fc-bayern-munchen 1er | 73 − 22 |
| 2 | en.1 | 20 | 0,83 | 0,80 | 2,4 | liverpool-fc (1re) | liverpool-fc 1er | 90 − 24 |
| 2 | es.1 | 20 | 0,80 | 0,85 | 3,1 | club-atletico-de-madrid (3e) | fc-barcelona 5e | 79 − 27 |
| 2 | fr.1 | 18 | 0,89 | 0,89 | 2,1 | as-monaco-fc (3e) | paris-saint-germain-fc 2e | 73 − 24 |
| 2 | it.1 | 20 | 0,79 | 0,81 | 2,4 | ssc-napoli (1re) | ssc-napoli 1er | 74 − 27 |
| 2 | de.2 | 18 | 0,78 | 0,76 | 2,8 | hamburger-sv (2e) | fc-st-pauli-1910 2e | 74 − 25 |
| 2 | en.2 | 24 | 0,82 | 0,84 | 3,4 | leeds-united-fc (1re ex æquo) | tottenham-hotspur-fc 2e | 89 − 38 |
| 2 | es.2 | 22 | 0,79 | 0,78 | 3,3 | rcd-espanyol-de-barcelona (1re ex æquo) | levante-ud 5e | 81 − 24 |
| 2 | fr.2 | 18 | 0,79 | 0,77 | 2,7 | fc-annecy (7e) | fc-lorient 2e | 68 − 18 |
| 2 | it.2 | 20 | 0,81 | 0,85 | 2,8 | juve-stabia (5e) | parma-calcio-1913 5e | 72 − 32 |

Moyennes : rho 0,82 (D1) et 0,81 (D2) en saison 1, 0,81 et 0,80 en saison 2. La masse salariale prédit aussi bien (rho 0,84 en D1, 0,81-0,82 en D2) : réputation, masse et force du onze viennent toutes du rang 2024-25. Le club le mieux réputé, seul en tête, n'est champion que 4 fois sur 20 (6 en comptant les ex æquo de la saison 2).

Par tiers de réputation, dans chaque championnat :

| saison | division | tiers | clubs | rang final moyen | écart-type | min-max | position normalisée (0 = 1er) | finit dans son tiers | écart moyen au rang attendu |
|---|---|---|---|---|---|---|---|---|---|
| 1 | D1 | haut | 33 | 4,2 | 2,4 | 1-10 | 0,17 | 88 % | 2,3 |
| 1 | D1 | milieu | 33 | 11,1 | 3,3 | 4-17 | 0,55 | 64 % | 3,4 |
| 1 | D1 | bas | 30 | 15,6 | 3,3 | 8-20 | 0,80 | 73 % | 2,1 |
| 1 | D2 | haut | 35 | 5,1 | 3,0 | 1-12 | 0,21 | 74 % | 2,9 |
| 1 | D2 | milieu | 34 | 11,0 | 4,6 | 2-20 | 0,51 | 50 % | 3,6 |
| 1 | D2 | bas | 33 | 16,7 | 3,9 | 8-24 | 0,80 | 76 % | 2,5 |
| 2 | D1 | haut | 33 | 4,7 | 3,4 | 1-15 | 0,20 | 79 % | 2,2 |
| 2 | D1 | milieu | 33 | 11,0 | 3,9 | 3-19 | 0,54 | 61 % | 2,8 |
| 2 | D1 | bas | 30 | 15,1 | 3,5 | 6-20 | 0,78 | 70 % | 2,7 |
| 2 | D2 | haut | 35 | 5,9 | 3,9 | 1-13 | 0,25 | 69 % | 3,3 |
| 2 | D2 | milieu | 34 | 10,1 | 4,7 | 1-21 | 0,46 | 50 % | 3,4 |
| 2 | D2 | bas | 33 | 16,8 | 3,9 | 8-24 | 0,80 | 82 % | 2,3 |

Écart entre le rang final et le rang de réputation (`extra.md`) :

| saison | division | à 2 places ou moins | à 3 ou moins | à 4 ou moins | 3 places mieux ou plus | 3 places moins bien ou plus | 5 places moins bien ou plus |
|---|---|---|---|---|---|---|---|
| 1 | D1 | 55 % | 73 % | 82 % | 22 % | 23 % | 6 % |
| 1 | D2 | 49 % | 63 % | 73 % | 22 % | 28 % | 15 % |
| 2 | D1 | 64 % | 71 % | 81 % | 16 % | 20 % | 10 % |
| 2 | D2 | 44 % | 58 % | 70 % | 26 % | 27 % | 13 % |

### 2.3 Coupe selon la division et la réputation

Tour où chaque club est éliminé (« finale » = finaliste battu), par tiers de réputation dans sa division :

| saison | division | tiers | clubs | éliminés au tour | tours gagnés (moy.) | au moins en quarts | primes moy. (M€) |
|---|---|---|---|---|---|---|---|
| 1 | D1 | haut | 33 | 16es 5, 8es 9, quarts 6, demies 6, finale 3, vainqueur 4 | 2,15 | 58 % | 2,2 |
| 1 | D1 | milieu | 33 | 16es 16, 8es 8, quarts 6, demies 2, finale 1 | 0,91 | 27 % | 0,5 |
| 1 | D1 | bas | 30 | 16es 15, 8es 10, quarts 4, demies 1 | 0,70 | 17 % | 0,2 |
| 1 | D2 | haut | 35 | prélim. 7, 16es 18, 8es 6, quarts 3, vainqueur 1 | 0,77 | 11 % | 0,4 |
| 1 | D2 | milieu | 34 | prélim. 11, 16es 17, 8es 4, quarts 1, finale 1 | 0,74 | 6 % | 0,3 |
| 1 | D2 | bas | 33 | prélim. 20, 16es 9, 8es 3, demies 1 | 0,58 | 3 % | 0,1 |
| 2 | D1 | haut | 33 | 16es 4, 8es 10, quarts 9, demies 4, finale 3, vainqueur 3 | 2,03 | 58 % | 1,9 |
| 2 | D1 | milieu | 33 | 16es 17, 8es 7, quarts 3, demies 2, finale 2, vainqueur 2 | 1,12 | 27 % | 1,1 |
| 2 | D1 | bas | 30 | 16es 14, 8es 10, quarts 5, demies 1 | 0,90 | 20 % | 0,3 |
| 2 | D2 | haut | 35 | prélim. 3, 16es 22, 8es 5, quarts 2, demies 3 | 0,80 | 14 % | 0,3 |
| 2 | D2 | milieu | 34 | prélim. 14, 16es 15, 8es 4, quarts 1 | 0,59 | 3 % | 0,1 |
| 2 | D2 | bas | 33 | prélim. 21, 16es 8, 8es 4 | 0,42 | 0 % | 0,1 |

Vainqueurs : saison 1, 1-fc-koln (D2), manchester-city-fc, athletic-club, lille-osc, acf-fiorentina ; saison 2, ogc-nice, ss-lazio, sv-werder-bremen, crystal-palace-fc, fc-barcelona. La coupe est bien plus ouverte que le championnat : rho (division puis réputation contre tours gagnés) 0,31 et 0,37 seulement.

### 2.4 Âge et temps de jeu (championnat, `PlayerSeasonStats`)

| saison | division | âge au 1er juillet | joueurs | part de l'effectif | part des minutes | minutes moy. | 0 minute | ≥ 1 800 min | note moy. |
|---|---|---|---|---|---|---|---|---|---|
| 1 | D1 | ≤ 19 | 375 | 15,6 % | 0,7 % | 68 | 84 % | 1 % | 55,7 |
| 1 | D1 | 20-21 | 206 | 8,6 % | 3,8 % | 638 | 34 % | 16 % | 63,2 |
| 1 | D1 | 22-23 | 325 | 13,5 % | 12,1 % | 1 289 | 12 % | 37 % | 66,4 |
| 1 | D1 | 24-26 | 528 | 22,0 % | 30,8 % | 2 019 | 5 % | 63 % | 68,7 |
| 1 | D1 | 27-29 | 483 | 20,1 % | 31,8 % | 2 277 | 4 % | 73 % | 70,3 |
| 1 | D1 | 30-32 | 318 | 13,3 % | 17,0 % | 1 851 | 6 % | 56 % | 68,3 |
| 1 | D1 | ≥ 33 | 165 | 6,9 % | 3,7 % | 774 | 31 % | 22 % | 63,6 |
| 1 | D2 | ≤ 19 | 413 | 16,2 % | 0,9 % | 90 | 80 % | 2 % | 48,2 |
| 1 | D2 | 20-21 | 258 | 10,1 % | 4,7 % | 721 | 32 % | 17 % | 52,2 |
| 1 | D2 | 22-23 | 342 | 13,4 % | 12,9 % | 1 493 | 11 % | 40 % | 55,2 |
| 1 | D2 | 24-26 | 561 | 22,0 % | 31,5 % | 2 225 | 4 % | 64 % | 58,3 |
| 1 | D2 | 27-29 | 522 | 20,5 % | 32,7 % | 2 480 | 3 % | 75 % | 59,3 |
| 1 | D2 | 30-32 | 299 | 11,7 % | 14,3 % | 1 894 | 7 % | 56 % | 57,3 |
| 1 | D2 | ≥ 33 | 155 | 6,1 % | 2,9 % | 746 | 32 % | 21 % | 52,5 |
| 2 | D1 | ≤ 19 | 456 | 19,1 % | 0,6 % | 46 | 87 % | 1 % | 55,1 |
| 2 | D1 | 20-21 | 155 | 6,5 % | 3,2 % | 707 | 31 % | 17 % | 63,4 |
| 2 | D1 | 22-23 | 254 | 10,6 % | 10,5 % | 1 427 | 8 % | 42 % | 67,2 |
| 2 | D1 | 24-26 | 520 | 21,7 % | 28,2 % | 1 875 | 5 % | 59 % | 68,6 |
| 2 | D1 | 27-29 | 529 | 22,1 % | 34,2 % | 2 232 | 3 % | 71 % | 69,9 |
| 2 | D1 | 30-32 | 366 | 15,3 % | 20,3 % | 1 919 | 5 % | 58 % | 69,0 |
| 2 | D1 | ≥ 33 | 113 | 4,7 % | 3,1 % | 939 | 21 % | 27 % | 64,5 |
| 2 | D2 | ≤ 19 | 509 | 20,0 % | 1,3 % | 102 | 80 % | 2 % | 48,8 |
| 2 | D2 | 20-21 | 208 | 8,2 % | 4,0 % | 753 | 34 % | 18 % | 52,5 |
| 2 | D2 | 22-23 | 293 | 11,5 % | 9,9 % | 1 336 | 14 % | 36 % | 55,0 |
| 2 | D2 | 24-26 | 538 | 21,1 % | 30,0 % | 2 206 | 4 % | 64 % | 58,0 |
| 2 | D2 | 27-29 | 532 | 20,9 % | 32,9 % | 2 450 | 2 % | 73 % | 59,2 |
| 2 | D2 | 30-32 | 366 | 14,4 % | 19,7 % | 2 136 | 4 % | 62 % | 57,9 |
| 2 | D2 | ≥ 33 | 100 | 3,9 % | 2,2 % | 874 | 31 % | 23 % | 52,8 |

Par club (min / médiane / max) :

| saison | division | minutes des ≤ 21 ans | minutes des ≥ 30 ans | âge moyen des 11 plus utilisés | joueurs utilisés (médiane) |
|---|---|---|---|---|---|
| 1 | D1 | 0,0 / 2,3 / 19,5 % | 0,0 / 19,4 / 50,7 % | 24,8 / 26,8 / 28,8 | 19 sur 25 |
| 1 | D2 | 0,0 / 4,5 / 17,3 % | 0,0 / 17,5 / 49,7 % | 24,1 / 26,6 / 28,7 | 20 sur 25 |
| 2 | D1 | 0,0 / 1,6 / 20,9 % | 0,0 / 22,2 / 59,1 % | 25,5 / 27,0 / 29,3 | 19 sur 25 |
| 2 | D2 | 0,0 / 3,3 / 18,7 % | 0,0 / 20,6 / 58,1 % | 25,1 / 26,8 / 29,7 | 19 sur 25 |

Les moins de 20 ans font 16 à 20 % des effectifs et jouent moins de 1,3 % des minutes : deux jeunes arrivent par club et par saison, et l'IA ne les fait jouer que si leur note les met dans le onze. Au club dirigé, sans composition enregistrée, 21 joueurs sur 25 ont joué en saison 1 (19 sur 24 en saison 2).

### 2.5 Masse salariale face au budget

Voir le tableau du 1.5 : en D1, la masse vaut 0,44 du plafond et 0,7 du budget (médianes) ; en D2, 0,6 du plafond et 1,2 à 1,3 fois le budget. Aucun club n'est au-dessus de son plafond, à aucun des quatre moments. Un objectif « rester sous le plafond » serait aujourd'hui toujours atteint.

### 2.6 Objectifs que ces données permettent

- **Classement** : un rang attendu = rang de réputation dans sa division (ou rang de force du onze, aussi bon). Bande de ±3 places : atteinte par 71 à 73 % des clubs de D1, 58 à 63 % en D2. « Finir dans son tiers » : 79 à 88 % pour le tiers haut de D1, 50 % seulement pour le milieu de D2. On peut écrire des objectifs par tiers : titre ou podium pour les deux ou trois premiers, « top 6 » pour le tiers haut, « première moitié » ou « ±3 places » pour le milieu, maintien pour le bas (en D1 le tiers bas finit 15e en moyenne, et 6 à 10 % des clubs finissent 5 places ou plus sous leur attente).
- **Montée et maintien** : directement lisibles (`SeasonResult.promoted`, `relegated` ; `Season.movements`).
- **Coupe** : par division et tiers. D1 haut : « au moins les quarts » (58 %). D1 milieu ou bas : « passer les 16es » (environ 50 %). D2 : « gagner un tour » (0,4 à 0,8 tour gagné en moyenne selon le tiers). `SeasonResult.cupRound` le garde déjà pour le club dirigé.
- **Jeunes** : minutes des ≤ 21 ans ou d'un jeune arrivé (`PlayerSeasonStats`, `birthDate`). L'IA leur donne 1,6 à 4,5 % des minutes (médiane) : « 5 % des minutes aux ≤ 21 ans » ou « 900 minutes à un jeune » serait un vrai choix pour toi.
- **Finances** : finir sous le plafond est trivial aujourd'hui. Utile seulement avec des salaires payés ou un plafond plus serré.

### 2.7 Ce qui manque

- Aucune table pour un objectif, une attente ou un jugement ; `boardConfidence` existe sans usage ; aucune conséquence (ni prime, ni renvoi, ni budget).
- La réputation ne bouge qu'avec les montées et descentes (`financesAfterMove`) : une attente tirée d'elle reste figée sur le classement 2024-25, alors que les effectifs évoluent (jeunes, progression, retraites). Il faudrait la faire suivre les résultats, ou fixer l'attente sur la force du onze au coup d'envoi.
- Pas d'historique des saisons des clubs IA (seul le club dirigé a un `SeasonResult` ; les tableaux se recalculent depuis les `Fixture`).
- Les minutes de coupe ne sont gardées que pour le club dirigé : un objectif de temps de jeu doit se limiter au championnat ou à lui.
- Aucun modèle de points attendus côté produit ; il est facile à écrire avec `expectedGoals` (`strength.ts:73-79`) et une loi de Poisson (fait dans `formations.ts` pour Q3).

---

## Q3. Dispositifs

### 3.1 Les sept dispositifs

`FORMATION_NAMES` (`src/engine/formations.ts:9`), emplacements dans `FORMATIONS` (`formations.ts:27-103`, dans l'ordre où la composition automatique les remplit ; une composition enregistrée les désigne par index), profil dans `FORMATION_PROFILES` (`src/engine/balance.ts:284-292`).

| dispositif | onze postes, dans l'ordre des emplacements | attaque | défense | DF / MF / FW |
|---|---|---|---|---|
| 4-3-3 (IA, défaut) | GK, RB, CB, CB, LB, CDM, CM, CM, RW, ST, LW | 1,03 | 0,97 | 4 / 3 / 3 |
| 4-4-2 | GK, RB, CB, CB, LB, RM, CM, CM, LM, ST, ST | 1 | 1 | 4 / 4 / 2 |
| 4-2-3-1 | GK, RB, CB, CB, LB, CDM, CDM, RW, CAM, LW, ST | 1,02 | 0,99 | 4 / 3 / 3 |
| 4-1-4-1 | GK, RB, CB, CB, LB, CDM, RM, CM, CM, LM, ST | 0,98 | 1,02 | 4 / 5 / 1 |
| 3-5-2 | GK, CB, CB, CB, CDM, CDM, RM, CAM, LM, ST, ST | 1,01 | 0,99 | 3 / 5 / 2 |
| 3-4-3 | GK, CB, CB, CB, RM, CM, CM, LM, RW, ST, LW | 1,05 | 0,95 | 3 / 4 / 3 |
| 5-3-2 | GK, RB, CB, CB, CB, LB, CM, CDM, CM, ST, ST | 0,95 | 1,05 | 5 / 3 / 2 |

Deux mécanismes font la force d'un dispositif :

- **le profil** multiplie l'attaque et la défense (`formationStrength`, `src/engine/strength.ts:82-90`) ;
- **la composition** : la valeur d'une ligne est partagée entre ses emplacements (`teamStrength`, `strength.ts:50-70`). Une ligne compte par sa moyenne, pas par son nombre : un 4-1-4-1 ne fait jouer que le meilleur attaquant dans sa ligne d'attaque, un 3-4-3 doit aligner quatre joueurs de côté alors que les effectifs n'en ont que quatre (`SQUAD_ROLES`, `balance.ts:667-678`). Exemple, aj-auxerre (club médian de fr.1) : le 3-4-3, profil le plus offensif, a moins d'attaque que le 4-3-3 (68,0 contre 71,3) et quatre joueurs hors poste ; le 5-3-2 a la meilleure défense (73,6 contre 67,9).

| dispositif (aj-auxerre) | attaque | défense | attaque / défense | note moy. du onze | joueurs hors poste |
|---|---|---|---|---|---|
| 4-3-3 | 71,3 | 67,9 | 1,050 | 68,8 | 1 |
| 4-4-2 | 65,2 | 68,6 | 0,951 | 67,8 | 2 |
| 4-2-3-1 | 69,5 | 69,1 | 1,005 | 68,3 | 2 |
| 4-1-4-1 | 66,3 | 70,1 | 0,946 | 68,4 | 3 |
| 3-5-2 | 64,7 | 67,4 | 0,960 | 66,8 | 4 |
| 3-4-3 | 68,0 | 64,6 | 1,051 | 67,4 | 4 |
| 5-3-2 | 64,1 | 73,6 | 0,871 | 67,8 | 1 |

### 3.2 Tout ce qui les référence

**Moteur**
- `src/engine/formations.ts:9` (`FORMATION_NAMES`), `:14` (`DEFAULT_FORMATION_NAME`, « The formation of AI clubs »), `:27-103` (`FORMATIONS`, postes et place x/y), `:105-112` (`isFormationName`, `formationPositions`).
- `src/engine/balance.ts:280-292` (`FORMATION_PROFILES`), `:303-308` (`BASE_GOALS_PER_TEAM` calibré avec deux 4-3-3 : « two 4-3-3s, as AI clubs play, score about 15 % more »), `:667-678` (`SQUAD_ROLES`, gabarit des effectifs).
- `src/engine/strength.ts:50-70` (`teamStrength`), `:82-90` (`formationStrength`), `:99-102` (`expectedGoalDifference`), `:113-127` (`compareFormations`, égalités tranchées par l'ordre de `FORMATION_NAMES`).
- `src/engine/lineup.ts:49` (`DEFAULT_FORMATION`), `:119-123` (`selectLineup`), `:145-152` (`selectRestedLineup`), `:161-196` (`resolveLineup`, titulaires enregistrés par index d'emplacement), `:217-263` (`changeFormation`).
- `src/engine/match.ts:171` et `:233` (dispositif de `TeamLive` et du choix à la pause), `:333-336` (`liveStrength` : profil appliqué à chaque segment), `:429-438` (`startingTeam` vérifie que chaque titulaire est à un poste du dispositif), `:454-466` (`startMatch`, 4-3-3 par défaut des deux côtés), `:988-1048` (`applyHalfTimeChoice`, changement de dispositif), `:1241-1253` (`simulateMatch`).

**Base et données**
- `prisma/schema.prisma:161` (`ClubSave.formation`, TEXT, défaut « 4-3-3 »), `:162` (`ClubSave.lineup`), `:362` (`SeasonResult.formation`, texte libre) ; migration `prisma/migrations/20261002150000_club_lineup/migration.sql:1-3`.
- `src/db/lineup.ts:13` (`formationSchema = z.enum(FORMATION_NAMES)`), `:22-28` (`savedLineupSchema` : `starters` = `{ slot: 0..10, playerKey }`, `benchOrder`, `instruction`), `:36-48` (`lineupInputSchema`), `:58-66` (`parseFormation` retombe sur le 4-3-3, `parseSavedLineup`), `:216-232` (`saveManagedLineup`).
- `src/db/matchday.ts:126-138` (`lineupOf` : un club IA joue `DEFAULT_FORMATION_NAME` sans lire `ClubSave.formation`), `:490-492`.
- `src/db/live-state.ts:39` (dispositif de chaque équipe dans `Fixture.liveState`, `z.enum(FORMATION_NAMES)`), `src/db/live-match.ts:98`, `:135`, `:158`.
- `src/db/opponent.ts:153-164` (aperçu de l'adversaire : lit `ClubSave.formation` du club IA, toujours « 4-3-3 » en base, alors que le match ne la lit pas).
- `src/db/season-results.ts:40-49`, `:137` (dispositif du club dirigé dans le bilan).

**Écrans**
- `app/saves/[id]/lineup/_components/lineup-editor.tsx:11`, `:163`, `:220-229` (sélecteur, terrain, `changeFormation`).
- `app/saves/[id]/lineup/_components/formation-panel.tsx:127-196` (profil, forces, comparatif de `FORMATION_NAMES`, « Comparer les {count} dispositifs »).
- `app/saves/[id]/lineup/_lib/formation-profile.ts:5-66` (`FORMATION_LEANS`, seuils de 4 et 8 points, `PROFILE_SCALE` = le plus grand écart des profils).
- `app/saves/[id]/lineup/_lib/editor-moves.ts:59-73` (composition automatique par dispositif).
- `app/saves/[id]/live/_components/half-time.tsx:136`, `:183-186`, `:382-389` et `app/saves/[id]/live/_lib/half-time-moves.ts:217-246` (dispositif à la pause).
- `app/saves/[id]/_components/pitch.tsx:31-37`, `:97` (placement x/y), `next-match-hero.tsx:118`, `opponent-sheet.tsx:59`, `:78`.
- Messages : `src/i18n/messages/*/lineup-plan.json` (`formationPanel`), `lineup.json`, `half-time.json`, `dashboard.json`, `dashboard-hero.json`, `actions.json`. Les noms de dispositif ne sont pas traduits (« 4-3-3 » partout).

**Tests épinglés**
- `src/engine/formations.test.ts` : 11 emplacements, un gardien, le nom égal aux lignes (défenseurs, puis milieux + attaquants), emplacements distincts, gardien le plus bas, ordre historique du 4-3-3.
- `src/engine/strength.test.ts:42` (ordre de `FORMATION_NAMES`), `:58-59` (favori : 3-4-3 ou 4-3-3 ; outsider : 5-3-2 ou 4-1-4-1).
- `src/engine/match.test.ts:796-808` (4-4-2 neutre, attaque et défense de sens opposés) et la calibration (2,64 buts, 44 % à domicile, 24 % de nuls) jouée en 4-3-3 des deux côtés ; `match-season.test.ts`, `match-d2.slow.test.ts`, `match-cup.slow.test.ts`, `match-fingerprint.test.ts` (matchs en 4-3-3 par défaut).
- `app/saves/[id]/lineup/_components/formation-panel.test.tsx:132-186` (une ligne par dispositif ; texte anglais « Compare the 7 formations » en dur), `formation-profile.test.ts`, `editor-moves.test.ts`, `app/saves/[id]/live/_lib/half-time-moves.test.ts`, `src/engine/lineup.test.ts`, `src/db/lineup.test.ts`, `src/db/live-state.test.ts:135` (dispositifs tournants dans les 600 matchs), états v1 `src/db/data/live-state-v1-*.json`.
- E2E : `e2e/starting-instruction.spec.ts:67` (`toHaveCount(7)`), `e2e/team.spec.ts:426` (`toHaveLength(7)`), `lineup.spec.ts`, `half-time.spec.ts`, `lineup-candidates.spec.ts`, `secondary-positions.spec.ts` (ordre des emplacements du 4-3-3 et du 4-4-2).

**Mesures** : `scripts/measure-balance.ts:501-527` (dispositifs sur équipes synthétiques), `:1372-1411` (dispositifs sur effectifs réels, contre le club médian de fr.1).

### 3.3 Ajouter un dispositif

- **Code** : le nom dans `FORMATION_NAMES`, ses onze emplacements dans `FORMATIONS` (x, y distincts, gardien le plus bas, nom conforme aux lignes), son profil dans `FORMATION_PROFILES`. Le type `Record<FormationName, …>` force le profil : un oubli ne compile pas. Le profil doit garder attaque et défense de sens opposés (`match.test.ts:805-807`).
- **Postes** : seulement les 12 du jeu. Pas de piston ni d'avant-centre de soutien : un 3-4-1-2, un losange (4-3-1-2), un 4-4-1-1, un 5-4-1 ou un 4-5-1 s'écrivent avec eux. Les effectifs suivent `SQUAD_ROLES` (2 par rôle, 4 CB, 3 CM) : un dispositif qui demande trois joueurs d'un rôle à deux (3 CAM, 3 ST, 4 joueurs de côté) aligne des joueurs hors poste (familiarité 0,92 à 0,6, `balance.ts:123-126`) et perd de la force.
- **Écrans** : ils suivent seuls (`FORMATION_NAMES`, `{count}`). À vérifier : le terrain à 360 px (le 5-3-2 met déjà cinq joueurs de front, 88 px chacun) et l'échelle des barres de profil (`PROFILE_SCALE` grandit si un profil dépasse ±5 %).
- **Tests** : changer les « 7 » en dur (`formation-panel.test.tsx:186`, `starting-instruction.spec.ts:67`, `team.spec.ts:426`) ; revoir `strength.test.ts:58-59` si le nouveau devient le meilleur d'un favori ou d'un outsider. `formations.test.ts` le couvre sans changement.
- **Données enregistrées** : aucune migration. `ClubSave.formation` est un texte et `ClubSave.lineup` garde des index d'emplacement de son propre dispositif : ajouter ne touche aucune ligne. En revanche, **renommer, retirer ou réordonner** les emplacements d'un dispositif existant casserait les compositions enregistrées (`parseFormation` retombe sur le 4-3-3 et `resolveLineup` replacerait les joueurs par index, `lineup.ts:171-179`) et refuserait les directs en pause (`live-state.ts:39`).
- **Mesures** : `measure-balance` lit `FORMATION_NAMES`, ses tableaux s'allongent seuls.

### 3.4 Les clubs IA pourraient-ils choisir leur dispositif ?

Oui, simplement :

- **Où** : `lineupOf` (`src/db/matchday.ts:130-133`), qui donne aujourd'hui `DEFAULT_FORMATION_NAME` à tout club IA. Une fonction pure du moteur choisirait, par exemple `compareFormations(effectif, { strength: adversaire dans son 4-3-3 probable, atHome }).best` à chaque match, ou un choix par saison contre le club médian de la division.
- **Déterminisme** : `compareFormations` est pure, sans tirage, égalités tranchées par l'ordre de `FORMATION_NAMES` (`strength.ts:125`). Rejouer la même graine donne le même choix.
- **Cohérence** : l'aperçu de l'adversaire (`opponent.ts:153-164`) et le comparatif de la composition (qui juge contre « l'adversaire dans son dispositif ») doivent appeler la même fonction. Le direct garde le dispositif de chaque équipe dans `liveState` : simuler et regarder restent identiques si le choix est fait avant `startMatch`. Mieux vaut que l'IA ne réagisse pas au dispositif du joueur : le comparatif du joueur deviendrait circulaire.
- **Coût** : sept compositions par club et par match. Négligeable : une saison de 3 758 matchs avec le choix à chaque match tourne en quelques secondes dans mon script.
- **Calibrage** : c'est le vrai coût. `BASE_GOALS_PER_TEAM` (1,23) est calé sur deux 4-3-3, le deuxième profil le plus offensif. Tout dispositif choisi est en moyenne moins offensif : les buts baissent (voir 3.5). Il faudrait recalibrer, puis repasser `match.test.ts`, `match-season.test.ts`, `match-d2.slow.test.ts`, `match-cup.slow.test.ts` et `measure:balance` / `measure:divisions`.

### 3.5 Estimation de l'effet (calcul pur)

**Gain du meilleur dispositif face au 4-3-3**, pour chaque club de la partie mesurée : composition automatique de l'adjoint dans chaque dispositif (`selectRestedLineup`, forme 50, fitness 100), `formationStrength`, puis écart de buts attendu (`expectedGoals`) contre le club médian de sa division en 4-3-3, domicile et extérieur moyennés ; points attendus par une loi de Poisson contre tous les clubs de sa division en 4-3-3.

Meilleur dispositif contre le club médian (198 clubs) :

| effectifs | 4-3-3 | 4-4-2 | 4-2-3-1 | 4-1-4-1 | 3-5-2 | 3-4-3 | 5-3-2 |
|---|---|---|---|---|---|---|---|
| saison 1 (création) | 40 | 8 | 24 | 44 | 3 | 27 | 52 |
| saison 2 (après le passage) | 37 | 8 | 23 | 42 | 7 | 27 | 54 |

Gain par tiers de force dans la division (saison 1 ; la saison 2 donne les mêmes ordres de grandeur) :

| division | tiers | clubs | note moy. du onze | gain xGD / match (club médian) | gain max | gain pts / match (Poisson) | ≈ pts / saison | dispositifs choisis |
|---|---|---|---|---|---|---|---|---|
| D1 | forts | 33 | 75,5 | +0,014 | +0,063 | +0,009 | +0,3 | 4-3-3 14, 3-4-3 8, 4-1-4-1 6, 4-2-3-1 4, 4-4-2 1 |
| D1 | moyens | 33 | 68,9 | +0,050 | +0,200 | +0,030 | +1,0 | 4-1-4-1 11, 4-3-3 7, 4-2-3-1 6, 3-4-3 4, 5-3-2 4, 3-5-2 1 |
| D1 | faibles | 30 | 62,3 | +0,106 | +0,222 | +0,026 | +0,9 | 5-3-2 23, 4-1-4-1 5, 4-3-3 1, 4-2-3-1 1 |
| D2 | forts | 35 | 62,3 | +0,046 | +0,160 | +0,031 | +1,0 | 4-3-3 11, 3-4-3 7, 4-2-3-1 6, 4-1-4-1 6, 4-4-2 3, 3-5-2 1, 5-3-2 1 |
| D2 | moyens | 34 | 58,0 | +0,062 | +0,258 | +0,037 | +1,3 | 4-1-4-1 11, 4-3-3 6, 3-4-3 6, 4-2-3-1 5, 5-3-2 3, 4-4-2 2, 3-5-2 1 |
| D2 | faibles | 33 | 53,8 | +0,105 | +0,209 | +0,036 | +1,2 | 5-3-2 21, 4-1-4-1 5, 4-4-2 2, 4-2-3-1 2, 3-4-3 2, 4-3-3 1 |

Corrélation entre la note du onze et le gain en points : −0,30 (−0,25 en saison 2). Exemples (France, écart de buts attendu par match contre le club médian) :

| club | note | 4-3-3 | 4-4-2 | 4-2-3-1 | 4-1-4-1 | 3-5-2 | 3-4-3 | 5-3-2 | meilleur | gain |
|---|---|---|---|---|---|---|---|---|---|---|
| paris-saint-germain-fc | 77,5 | +0,63 | +0,60 | +0,53 | +0,62 | +0,54 | +0,61 | +0,53 | 4-3-3 | 0 |
| olympique-lyonnais | 73,1 | +0,35 | +0,34 | +0,30 | +0,35 | +0,15 | +0,32 | +0,31 | 4-1-4-1 | +0,003 |
| toulouse-fc | 67,3 | −0,44 | −0,40 | −0,50 | −0,42 | −0,41 | −0,34 | −0,34 | 3-4-3 | +0,107 |
| montpellier-hsc | 61,9 | −0,80 | −0,80 | −0,81 | −0,83 | −0,92 | −1,01 | −0,68 | 5-3-2 | +0,127 |
| fc-lorient | 64,6 | +0,83 | +0,91 | +0,82 | +0,85 | +0,82 | +0,90 | +0,71 | 4-4-2 | +0,077 |
| grenoble-foot-38 | 59,0 | +0,29 | +0,15 | +0,22 | +0,17 | +0,12 | +0,16 | +0,21 | 4-3-3 | 0 |
| sm-caen | 53,1 | −0,40 | −0,34 | −0,57 | −0,33 | −0,51 | −0,45 | −0,32 | 5-3-2 | +0,075 |

Lecture :

- Le gain vient surtout du profil, et il suit le principe de G1 : un pourcentage de défense en plus retire des buts proportionnels aux buts de l'adversaire, un pourcentage d'attaque en ajoute en proportion des siens. L'outsider gagne à fermer (5-3-2 : −8 % d'attaque, +8 % de défense face au 4-3-3), le favori garde le 4-3-3. La composition ajoute du bruit propre à chaque effectif (Lorient préfère le 4-4-2, Toulouse le 3-4-3).
- En buts, les faibles gagnent sept fois plus que les forts (+0,11 contre +0,014 par match). En points, l'écart se resserre : fermer le jeu donne surtout des nuls. Partout, c'est **1 point par saison environ**, jamais plus de 2 à 3 pour un club.

**Effet sur une saison entière, modèle de Poisson** (λ du moteur au coup d'envoi, effectifs de la saison 1, forme 50, les 3 758 matchs de championnat) :

| variante | buts / match (λ) | nuls | victoires à domicile | écart de points attendu 1er − dernier | le plus faible gagne (écart ≥ 1) | dispositifs joués |
|---|---|---|---|---|---|---|
| A : tous en 4-3-3 (aujourd'hui) | 2,78 | 23,5 % | 44,7 % | 40,9 | 24,6 % | 4-3-3 partout |
| B : meilleur de la saison (club médian) | 2,46 | 25,7 % | 43,3 % | 38,6 | 24,4 % | 5-3-2 27 %, 4-1-4-1 22 %, 4-3-3 20 %, 3-4-3 14 %, 4-2-3-1 12 %, 4-4-2 4 %, 3-5-2 1 % |
| C : meilleur à chaque match | 2,43 | 25,8 % | 43,2 % | 38,1 | 24,3 % | 5-3-2 32 %, 4-3-3 20 %, 4-1-4-1 18 %, 3-4-3 15 %, 4-2-3-1 10 %, 4-4-2 4 %, 3-5-2 1 % |

(L'écart de points attendu n'a pas de hasard : il est plus petit qu'un écart réel.)

**Saisons sur le papier avec le moteur.** Les 3 758 matchs de championnat de la saison 1, dans l'ordre du vrai calendrier de la partie, joués par `simulateMatch`. Effectifs de la création figés (fitness 100, ni blessure ni suspension reportées, pas d'événements à choix), forme qui évolue après chaque match comme dans `recordFinishedMatches` (`nextForm`). Dix répétitions par variante, les mêmes graines d'une variante à l'autre : 187 900 matchs en 325 s.

- A : tous en 4-3-3 (aujourd'hui).
- B : chaque club dans son meilleur dispositif de la saison, contre le club médian de sa division.
- C : à chaque match, le meilleur dispositif contre le 4-3-3 probable de l'adversaire, lieu compris.
- B*, C* : les mêmes, buts recalibrés. Recalibrage fait dans le seul processus du script (l'attaque de chaque profil × c, ce qui revient à `BASE_GOALS_PER_TEAM` × c^2,4) : 1,39 pour B*, 1,42 pour C*, au lieu de 1,23.

| mesure (cible du cahier) | A : 4-3-3 | B | C | B* recalibré | C* recalibré |
|---|---|---|---|---|---|
| Buts par match (2,6 à 2,8) | 2,67 | **2,36** | **2,31** | 2,68 | 2,68 |
| Nuls (24 à 27 %) | 24,3 % | 26,5 % | 27,0 % | 24,6 % | 24,5 % |
| Victoires à domicile (43 à 46 %) | 44,3 % | **42,8 %** | **42,5 %** | 44,0 % | 44,1 % |
| Écart 1er − dernier (50 à 60 pts) | 55,5 | 52,3 | 50,8 | 55,4 | 54,9 |
| Forme des onze, champion / dernier (environ 30 à 75) | 66,8 / 39,7 | 65,1 / 40,3 | 64,2 / 40,6 | 66,5 / 39,9 | 65,5 / 40,1 |
| Forme, extrêmes sur 100 championnats | 31,8 à 77,2 | 32,6 à 73,5 | 31,0 à 71,8 | 29,3 à 75,7 | 30,5 à 73,4 |
| Le plus faible gagne, écart ≥ 1 (20 à 25 %) | 23,6 % | 23,8 % | 23,7 % | 23,6 % | 23,7 % |
| Club le plus fort champion | 31 / 100 | 33 / 100 | 31 / 100 | 31 / 100 | 30 / 100 |

En gras : hors de la plage du cahier. Par division, sans recalibrage, la D2 tombe à 2,29-2,33 buts et 27,3-27,8 % de nuls (au-dessus de la plage).

Qui y gagne quand tous les clubs choisissent (points par saison, moyenne des répétitions) :

| division, tiers de force | clubs | A (pts) | B − A | C − A | B* − A | C* − A |
|---|---|---|---|---|---|---|
| D1, forts | 33 | 65,8 | −1,8 | −2,4 | −0,3 | −0,4 |
| D1, moyens | 33 | 50,6 | 0,0 | 0,0 | +0,3 | +0,1 |
| D1, faibles | 30 | 33,5 | +0,7 | +1,0 | −0,3 | +0,1 |
| D2, forts | 35 | 67,9 | −1,2 | −1,5 | +0,1 | −0,1 |
| D2, moyens | 34 | 53,9 | −0,8 | −1,1 | −0,1 | 0,0 |
| D2, faibles | 33 | 39,5 | +0,8 | +1,0 | −0,1 | +0,1 |

Repère : les deux vraies saisons de la partie d'audit donnent 2,70 et 2,67 buts, 24,4 et 23,8 % de nuls, 44,2 et 45,2 % à domicile, 58,2 et 51,2 points d'écart, des onzes de 32,3 à 72,2 et de 37,5 à 71,4, 22,0 et 24,0 % de victoires du plus faible. La variante A sur le papier est donc proche du vrai jeu.

### 3.6 Ce que cela ferait aux six cibles

- **Sans recalibrage** : les buts chutent de 12 à 14 % (2,67 → 2,31 à 2,36), sous la cible ; les nuls montent de 2 à 3 points (27 %, au bord haut ; au-dessus en D2) ; les victoires à domicile passent sous 43 % ; l'écart 1er − dernier baisse de 3 à 5 points (50,8, au bord bas) ; la forme se resserre un peu ; les victoires du plus faible ne bougent pas (+0,1 à +0,2 point) : fermer le jeu change des défaites en nuls, pas en victoires. Les forts perdent 1,2 à 2,4 points par saison, les faibles en gagnent 0,7 à 1.
- **Avec `BASE_GOALS_PER_TEAM` recalibré à 1,39-1,42** : les six cibles reviennent à leurs valeurs d'aujourd'hui, à la précision de la mesure près. Aucun tiers ne gagne ni ne perd plus de 0,4 point par saison.
- **Conclusion** : le choix du dispositif par l'IA n'est pas un levier d'équilibrage. C'est de la variété (des outsiders en 5-3-2, des 4-1-4-1) et de la cohérence (le comparatif de ta composition jugerait l'adversaire dans le dispositif qu'il jouera vraiment). Son prix : un recalibrage des buts et les tests épinglés de la calibration. Si tu le fais, garde un choix pur avant le coup d'envoi, le même pour le match, le direct et l'aperçu.

### 3.7 Limites

- Une seule graine, une seule partie, deux saisons ; le club dirigé est passif (aucun transfert, aucune composition enregistrée).
- Q3 sur le papier : effectifs figés au coup d'envoi, pas de fatigue entre les matchs ni de blessure reportée, pas d'événements à choix ; le choix C juge l'adversaire dans son 4-3-3, pas dans le dispositif qu'il choisit vraiment.
- Le modèle de Poisson ignore l'usure, les poids des quarts d'heure et la règle de l'adjoint : il sert à comparer les dispositifs, les saisons du moteur à mesurer les cibles.
