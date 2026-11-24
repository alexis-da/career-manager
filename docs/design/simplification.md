# Chantier « simplification » : l'adjoint s'occupe du reste

Cahier rédigé le 24/11/2026, **validé le 24/11** avec ses propositions, sauf le point 5 : l'alerte « joueur important »
ne vient que quand l'adjoint compte laisser partir un titulaire (§ 13). Les faits viennent du code au 24/11 (`1700ec5`,
après l'équilibrage) et de deux bases locales (une carrière 2 neuve, une autre après une saison).

## Décisions d'Alexis (24/11)

Une logique de jeu plus casual : le joueur passe un bon moment sans avoir à tout gérer.

1. **Plus de plafond salarial.** Le budget de transferts est la seule limite d'argent. Pour qu'on ne signe pas
   gratuitement tous les meilleurs joueurs libres :
   - une **prime à la signature** des joueurs libres, payée sur le budget (un pourcentage de leur valeur) ;
   - un **effectif de 30 joueurs au plus** : achat ou signature refusés au-delà, avec un message clair.

   Tout ce qui parle de salaire disparaît des écrans. Les clubs IA suivent la même règle. Les salaires peuvent rester en
   interne s'ils servent au calcul des valeurs ou des contrats.
2. **Contrats gérés par l'adjoint par défaut.** Il prolonge les joueurs utiles et laisse partir les autres ; une alerte
   seulement pour un joueur important. Le joueur peut reprendre la main : un réglage dans Club → Réglages, et toujours
   joueur par joueur.
3. **Composition gérée par l'adjoint par défaut.** Avant chaque match, il aligne le meilleur onze, en tenant compte de la
   fatigue, des blessures et des suspensions, dans le dispositif choisi par le joueur. Dès que le joueur enregistre sa
   propre composition, elle est respectée ; un réglage rend la main à l'adjoint.
4. **Moins d'alertes.** « À faire » montre les 3 plus importantes, les autres derrière « Voir tout ». Dispositifs : les 3
   conseillés d'abord, les 14 autres derrière « Voir tous ».
5. **Ventes proposées par l'adjoint.** Il suggère de vendre les joueurs qui ne jouent jamais (critères chiffrés), à
   accepter en un geste, pendant les mercatos. Les fenêtres restent.

## Contraintes

- **Rien de perdu** dans les carrières existantes :
  - aucune donnée supprimée, aucune colonne retirée ;
  - une composition enregistrée reste celle du joueur ;
  - une annonce, une seule fois.
- **Migrations d'ajout uniquement**, sans `UPDATE` des lignes existantes.
- **Déterminisme et moteur pur.** Ce que décide l'adjoint (le onze, les contrats, les ventes proposées) est une fonction
  pure de l'état de la partie. Elle ne tire aucun hasard nouveau ; une prolongation reprend le flux des clubs IA.
- **Défi de la semaine** : toutes ses parties d'une semaine jouent les mêmes règles (§ 10).
- **Écrans** : lisibles à 390 et 360 px, en français et en anglais, une seule action orange pleine par écran.

---

## 0. Vue d'ensemble

| L'adjoint… | Quand | Le joueur garde | Réglage |
|---|---|---|---|
| aligne le onze reposé dans le dispositif du joueur | avant chaque match, simulé ou en direct | le dispositif, la consigne de départ, les changements du direct ; sa propre composition s'il en enregistre une | « Composition », Club → Réglages ; « Rendre la main à l'adjoint » sur la Composition |
| prolonge les joueurs utiles, laisse partir les autres | au passage de saison | un choix par joueur (prolonger, laisser partir), à tout moment ; « Prolonger maintenant » au mercato | « Contrats », Club → Réglages |
| prévient quand il compte laisser partir un titulaire | du 1er janvier au 30 juin | la décision sur sa fiche | — |
| propose de vendre ceux qui ne jouent pas | pendant un mercato | « Vendre » en un geste, ou « Garder » | — |
| range « À faire » : 3 lignes, puis « Voir tout » | à chaque chargement de l'Accueil | toutes les lignes, d'un geste | — |

Le joueur ne gère plus de salaires. Il a toujours :
- un budget, qui paie les achats, les primes des joueurs libres et les libérations ;
- un effectif de 30 joueurs au plus.

---

## 1. Argent : le budget, seule limite

### 1.1 Ce qui disparaît

Aujourd'hui, le salaire n'est **jamais débité** du budget : il ne sert qu'à remplir un plafond (`ClubSave.wageBudget`).
Les portes que ce plafond ferme, toutes retirées :

| Porte | Où | Après |
|---|---|---|
| Achat : masse + salaire > plafond (`wage_budget_exceeded`) | `makeTransferOffer` | retirée ; refus nouveau à 30 joueurs (`squad_full`, § 1.4) |
| Joueur libre : même porte | `signFreeAgent` | retirée ; la prime est payée sur le budget (§ 1.3) et le même refus à 30 |
| Prolongation : même porte | `renewContract` | retirée ; le salaire est le plancher du joueur (`max(salaire, wageFor)`), sans champ à saisir |
| Salaire trop bas (`wage_too_low`) | `evaluateOffer`, `evaluateRenewal` | ne peut plus arriver : chaque offre porte le salaire demandé ; `fee_too_low` et `club_reputation_too_low` restent |
| Acheteurs IA sans marge salariale, sautés | `walkSaleBids` | retirée ; un club à 30 joueurs est sauté à sa place |
| Vente forcée d'un club IA au-dessus de son plafond | `planWageSales`, en présaison | retirée : elle ne s'est jamais déclenchée (audit du 06/11, `measure:seasons`) |
| Recrue libre d'un club IA, sous son plafond | `planSquad` (`trySign`) | la prime sur son budget à la place |
| Propositions : salaire demandé sous la marge | `proposeSignings` (`isEligible`), `wageBound`, entrée `affordable`, filtre SQL `highestWagePaid` de `chooseRows` | retirés : restent la réputation et le prix (la prime pour un libre) sous le budget |
| Jeune prometteur : salaire sous la marge (`wage_budget`) | boutique, `src/db/shop.ts` | retirée ; refus à 30 joueurs |

### 1.2 Ce que les salaires gardent, en interne

**La valeur n'en dépend pas.** `marketValueFor` se calcule sur la note, l'âge et le potentiel ; le prix demandé par un
club, sur la valeur et les saisons de contrat restantes (`ASKING_PRICE_BY_SEASONS_LEFT`).

`PlayerSave.wage` reste écrit à chaque contrat, par les mêmes règles qu'aujourd'hui (`wageFor`, ⌈salaire × 1,1⌉ à un
transfert, `max(salaire, wageFor)` à une prolongation). Plus rien ne le montre. Il ne sert plus qu'à deux calculs :

1. **Le coût d'une libération** : la moitié des salaires restant dus (`releaseCompensation`), payée sur le budget. C'est
   le seul endroit où un salaire devient de l'argent. L'écran le dit en montant : « Coût : 1,2 M€, la moitié de ce qui lui
   reste dû ».
2. **Le départage de deux réputations égales** (`reputationRanks`). Il passe par `ClubSave.wageBudget`, qui reste calculé
   comme aujourd'hui (`applySeasonFinances`, `applyCreationWageBudgets`) sans jamais s'afficher. Ce rang fixe la dotation,
   le rang attendu et l'objectif de classement : le garder évite qu'une dotation bouge dans les carrières existantes.

Le reste ne lit plus les salaires : marché, offres des clubs IA, présaison, écrans, mesures. `SeasonBudget.wageBudget`
reste écrit, mais n'est plus lu.

### 1.3 La prime à la signature

**Retenu** (§ 13, point 1) :
- la prime vaut 25 % de la valeur du joueur le jour de la signature (`marketValueFor`) ;
- elle est arrondie à 10 000 € au-dessus, avec 50 000 € au moins (`SIGNING_BONUS_SHARE`, `SIGNING_BONUS_MIN`,
  `balance.ts`).

Elle est payée sur le budget, comme un prix :
- **refus** si elle dépasse le budget (`insufficient_budget`) : « Ton budget ne paie pas sa prime à la signature
  (1,3 M€). » ;
- **trace** : elle est écrite comme indemnité (`fee`) de la ligne `Transfer` de type `FREE`. Elle compte donc dans le solde
  de « Bonne gestion », comme un achat. Les records de l'Histoire, qui lisent les seuls `TRANSFER`, ne bougent pas ;
- **clubs IA** : même prime, sur leur budget, pour leurs recrues de présaison (`planSquad`) ;
- **revente** : un joueur arrivé libre garde la limite d'aujourd'hui pendant un an, la moitié de sa valeur
  (`RESALE_CAP_VALUE_PERCENT`). C'est toujours plus que sa prime.

Exemples, aux courbes de `balance.ts`. Le prix demandé est celui d'un joueur semblable sous contrat (trois saisons, 1,1 ×
la valeur). Le salaire est ce que le joueur libre prend aujourd'hui sur la marge salariale, chaque saison.

| Joueur libre | Valeur | Prime (25 %) | Prix demandé | Salaire d'aujourd'hui |
|---|---|---|---|---|
| 58, 29 ans | 1,01 M€ | 0,26 M€ | 1,11 M€ | 0,34 M€ |
| 62, 20 ans, potentiel 74 | 4,39 M€ | 1,10 M€ | 4,83 M€ | 0,36 M€ |
| 65, 26 ans, potentiel 68 | 5,03 M€ | 1,26 M€ | 5,53 M€ | 0,90 M€ |
| 68, 27 ans, potentiel 70 | 6,24 M€ | 1,56 M€ | 6,86 M€ | 1,20 M€ |
| 70, 33 ans | 3,50 M€ | 0,88 M€ | 3,85 M€ | 1,71 M€ |
| 74, 27 ans, potentiel 79 | 19,80 M€ | 4,95 M€ | 21,78 M€ | 2,74 M€ |

**Repères**, sur une carrière 2 neuve :
- médiane des budgets : 37,5 M€ en D1, 5,4 M€ en D2 ;
- onze moyen : 71 en D1, 60 en D2 ;
- vivier de 120 joueurs libres à la création (le meilleur noté 70, 13,2 M€), 271 après une saison (le meilleur noté 74).

**Ce qu'on en attend.** Un libre reste quatre fois moins cher qu'un achat. Il n'est plus gratuit : un club de D2 paie près
d'un tiers de son budget médian pour un 68. Un écart, accepté : les vétérans, dont la valeur chute après 30 ans, coûtent
peu. La mesure du club « gourmand » (§ 11) le surveille.

### 1.4 Trente joueurs au plus

`SQUAD_LIMIT = 30` (`balance.ts`), pour tous les clubs. Compte : les joueurs sous contrat du club, non retraités.

- **Club dirigé** : refus `squad_full` d'un achat, d'un joueur libre et du jeune prometteur quand l'effectif compte déjà 30
  joueurs.
  - « Ton effectif compte déjà 30 joueurs, le maximum : vends ou libère un joueur avant d'en recruter un autre. »
  - "Your squad already has 30 players, the maximum: sell or release one before signing another."
- **Ventes et libérations** : jamais refusées par ce plafond.
- **Jeunes de l'intersaison** (deux par club et par saison) : ils ne prennent que les places libres jusqu'à 30, et l'écran
  de début de saison le dit (§ 13, point 2).
- **Clubs IA** : leur effectif vise toujours 20 à 25 joueurs (`SQUAD_SIZE_MIN`, `SQUAD_SIZE_MAX`). Ils n'approchent
  30 qu'en achetant au club dirigé, ce qu'aucun contrôle ne bornait : un club IA à 30 n'enchérit plus.
- **Carrière d'avant au-delà de 30** : elle garde tous ses joueurs. Elle ne recrute plus avant d'être redescendue sous 30.

### 1.5 Les clubs IA

- `planWageSales` part. Elle ne s'est jamais déclenchée ; ses tests partent avec elle.
- `planSquad` reste la même :
  - mêmes prolongations (elles ignoraient déjà le plafond) et mêmes libérations ;
  - mêmes recrues par rôle jusqu'à 20 joueurs, même lâcher au-delà de 25 ;
  - seule la limite d'une recrue change : sa prime, sur le budget du club. Ce budget est sa nouvelle dotation, posée juste
    avant la présaison, et ce qu'il y dépense lui manque ensuite pour enchérir sur les joueurs du club dirigé.
- **Offres pour les joueurs du club dirigé** : aucune marge salariale, et aucun club à 30 joueurs. Le flux de chaque devis
  se consomme autrement, donc **toutes les offres changent** le jour de la mise en ligne. Elles changent déjà chaque jour
  (`saleRngSeed` par date).
- **Achats entre clubs IA** : il n'y en a plus aucun, puisque seule la vente forcée en faisait.

---

## 2. Contrats : l'adjoint prolonge et laisse partir

Aujourd'hui, **personne ne prolonge** les joueurs du club dirigé. Tout contrat échu part libre au passage de saison, le
1er juillet. Une prolongation ne se fait qu'au mercato : de février à juin, le joueur ne peut plus rien. La règle de
l'adjoint existe pourtant déjà : `advanceToNextSeason(…, { assistantContracts: true })`, réservée aux mesures et aux
tests, qui fait passer le club dirigé par `planSquad` comme un club IA.

### 2.1 La règle de l'adjoint

Au passage de saison, pour chaque contrat du club dirigé qui finit le 30 juin, dans cet ordre :

1. **Le choix du joueur**, s'il en a fait un sur la fiche (§ 2.3) : prolonger ou laisser partir.
2. **Sinon, la règle des clubs IA** (`wantsToKeep`, `squad-ai.ts`), qui est la définition de « joueur utile ». Le niveau
   de l'effectif est la note moyenne de ses 16 meilleurs (`squadStandard`). L'adjoint prolonge :
   - un espoir : 23 ans ou moins, potentiel au niveau de l'effectif ;
   - jusqu'à 32 ans, un joueur dont la note est au plus 5 points sous ce niveau ;
   - après 32 ans, un joueur noté au niveau lui-même ;
   - et celui dont le rôle manquerait, faute de remplaçant sur le marché.

   Il laisse partir les autres, libres, comme aujourd'hui.
3. **La prolongation** :
   - même salaire que celui d'un club IA (`max(salaire, wageFor)`, invisible) ;
   - même durée tirée : 1 à 5 saisons, 2 au plus après 33 ans (`contractYears`) ;
   - même flux, celui du club (`squadPlanRngSeed`).

Ce que l'adjoint **ne fait pas**, au contraire du mode des mesures :
- il ne rompt jamais un contrat en cours (pas de lâcher au-delà de 25 joueurs) ;
- il ne recrute pas, sauf exception (§ 13, point 4) : il signe des joueurs libres seulement quand
  l'effectif tombe sous 20 joueurs ou 2 gardiens, les rôles manquants d'abord, prime payée sur le budget, et l'écran de
  début de saison le dit.

Ce qu'il a fait est gardé pour l'écran de début de saison, sur la ligne de dotation de la saison qui s'ouvre :
`SeasonBudget.contractMoves` (prolongés et leur fin de contrat, partis, recrues et leur prime).

### 2.2 Le joueur important et son alerte

**Joueur important** : l'un des onze que l'adjoint alignerait dans le dispositif du club si tout l'effectif était
disponible et frais. C'est `selectLineup`, calculé comme si personne n'était blessé ni suspendu (`importantPlayers`, pur).

**L'alerte** (point 5 tranché le 24/11) : une seule ligne de « À faire », du 1er janvier au 30 juin, pour les joueurs
importants dont le contrat finit le 30 juin **et que l'adjoint compte laisser partir** (la règle du § 2.1 ne les garde pas,
et le joueur n'a rien choisi). Un titulaire qu'il prolongera ne fait aucune alerte.
- Texte : « Fin de contrat le 30 juin : Koné (33 ans) », puis « Ton adjoint compte le laisser partir · décide sur sa
  fiche ».
- Lien : la fiche du joueur, ou l'effectif trié par contrat s'ils sont plusieurs.

C'est la seule alerte de contrat quand l'adjoint s'en occupe : `expiring-contracts` (tous les contrats) ne reste qu'en
mode joueur.

### 2.3 Reprendre la main

- **Club → Réglages, « Contrats »** (`Save.contractsByAssistant`, l'adjoint par défaut).
  - Coupé : aucun contrat n'est prolongé par l'adjoint, et « À faire » revient à `expiring-contracts`.
  - Les choix faits joueur par joueur restent appliqués dans les deux modes.
- **Joueur par joueur, à tout moment**, sur la fiche d'un joueur dont le contrat finit cette saison, mercato ouvert ou
  fermé : « À la fin de son contrat : Ton adjoint décide · Le prolonger · Le laisser partir »
  (`PlayerSave.contractChoice`).
  - Le choix est appliqué au passage de saison, et lève l'impasse de février à juin.
  - Sous « Ton adjoint décide », la fiche dit ce qu'il fera, d'après la règle du § 2.1.
  - En mode joueur, la première option se lit « Partir libre (par défaut) ».
- **« Prolonger maintenant »** reste au mercato, comme aujourd'hui. Seule la durée se choisit (1 à 5 saisons, 3 par
  défaut) : le champ du salaire part.

### 2.4 Libérer et vendre, sans salaire

**Libérer** ne change pas : même coût, la moitié de ce qui reste dû, et mêmes refus. Seul le texte change : « Il deviendra
joueur libre. Coût : {cost}, la moitié de ce qui lui reste dû sur son contrat. »

**Vendre** perd « Le joueur y gagnera {wage} par saison ».

La fiche d'un joueur d'un club IA ne dit plus « Sans prolongation, il partira libre en fin de saison ». C'est faux pour
lui : son club décide.

---

## 3. Composition : l'adjoint aligne le onze

### 3.1 Avant chaque match

- **Mode adjoint** (le défaut) : le club dirigé joue `selectRestedLineup` dans son dispositif (`ClubSave.formation`), avec
  la consigne de départ du joueur. C'est le onze reposé des clubs IA de son pays :
  - sans blessé ni suspendu de la compétition du match ;
  - un titulaire sous 75 de condition au coup d'envoi est reposé quand un remplaçant reposé vaut au plus 5 points de moins
    à son poste, 2 de plus par point de condition sous 75 (`maxRotationGap`) ;
  - le banc vient avec ce onze.

  Le joueur choisit le dispositif, jamais l'adjoint (les clubs IA, eux, le choisissent : `chooseFormation`).
- **Mode joueur** : sa composition enregistrée, comme aujourd'hui (`resolveLineup`) : un blessé ou un suspendu est remplacé
  au coup d'envoi, personne n'est reposé.
- **Le direct** ne change pas. Son onze de départ est celui du mode ; à chaque pause, le joueur change ce qu'il veut, pour
  ce match seulement.

Aujourd'hui, un joueur qui n'a jamais enregistré joue `selectLineup` : aucun repos, et l'éditeur le reconnaît (« Onze
automatique · pas encore enregistré »). Le mode adjoint remplace ce cas.

### 3.2 Ce que le joueur choisit sans prendre la main

- **Le dispositif et la consigne de départ** : en mode adjoint, les choisir les enregistre aussitôt, sans faire passer en
  mode joueur.
  - Le dispositif va dans `ClubSave.formation`.
  - La consigne va dans `ClubSave.lineup.instruction`, les titulaires et le banc gardés n'étant pas lus.
  - Un toast : « Dispositif enregistré : ton adjoint aligne son onze en 4-2-3-1 large ».
- **Tout geste sur un joueur** passe l'éditeur en brouillon : poser, échanger, envoyer au banc, choisir un candidat.
  « Enregistrer » le fait passer en mode joueur, « Annuler » revient au onze de l'adjoint.

### 3.3 Prendre la main, la rendre

- **Prendre la main** : enregistrer sa composition (`saveLineupAction`) écrit `Save.lineupByAssistant = false`.
- **La rendre**, deux chemins :
  - « Rendre la main à l'adjoint » sur la Composition (`lineup-hand-back`) ;
  - le réglage « Composition » de Club → Réglages.

  Les deux écrivent `true`. La composition enregistrée reste en base, sans être lue. Le bouton « Composition automatique »
  (`lineup-automatic`), qui figeait le onze de l'adjoint dans une composition enregistrée, part.
- **Défaut d'une carrière d'avant** (`lineupByAssistant` vide) : le mode joueur si `ClubSave.lineup` a des titulaires, le
  mode adjoint sinon (§ 13, point 6).

### 3.4 Ce qui suit le mode

| Écran ou règle | Mode adjoint | Mode joueur |
|---|---|---|
| Éditeur à l'ouverture | le onze de l'adjoint au prochain match (`automaticState`, comme celui du sélectionneur) | la composition enregistrée |
| Statut (`lineup-status`) | « Onze de ton adjoint · il le refait avant chaque match » | « Ton onze · enregistré » ou « … non enregistré » |
| Héros de l'Accueil | « Onze de l'adjoint · {dispositif} » | « Onze en {dispositif} » |
| Aperçu de l'adversaire, « Mon onze » | note moyenne du onze de l'adjoint (le match joué) | celle de la composition |
| « À faire » : titulaires blessés, suspendus, fatigués avant l'Europe | aucune ligne : il les remplace ou les repose | comme aujourd'hui |
| Vendre : le onze exclu des ventes | le onze de l'adjoint à effectif complet : un titulaire blessé n'apparaît plus dans les ventes | comme aujourd'hui |
| Point faible du marché | comme aujourd'hui sans composition (`selectLineup`) | comme aujourd'hui |

### 3.5 L'objectif Jeunesse

L'adjoint choisit Jeunesse quand le joueur ne choisit pas (`assistantObjective`) : 15 titularisations en championnat d'un
joueur de 21 ans ou moins. Un onze qui ne pense qu'à la note ne le cherche pas.

**Retenu** (§ 13, point 12) : quand l'objectif choisi est Jeunesse, le onze de l'adjoint titularise en championnat
son meilleur joueur de 21 ans ou moins. Il le fait dès que ce joueur vaut au plus 4 points de moins que le titulaire de son
poste, jusqu'à ses 15 titularisations. La mesure du club passif dit ce que ça coûte en points et ce que ça rapporte à
l'objectif.

---

## 4. Moins d'alertes

### 4.1 « À faire » : trois lignes

**Aujourd'hui** :
- 17 sortes de lignes, sans limite ;
- dans l'ordre où le code les pousse, pas par importance : le point faible, presque toujours là, passe avant un gardien
  manquant ;
- 3 à 6 lignes d'habitude pendant un mercato.

**Après** : un ordre explicite (`TODO_PRIORITY`, pur et testé). Les 3 premières s'affichent, les autres derrière « Voir
tout · {n} de plus » (`dashboard-alerts-more`).
- Le bouton ouvre la liste sur place, dans le navigateur, sans requête : un élément `<details>`, ou un petit composant
  client.
- Une liste vide dit « Rien à faire : ton adjoint s'occupe du reste. » (`alert-none`).

| Rang | Ligne | Condition |
|---|---|---|
| 1 | `goalkeepers` | moins de 2 gardiens |
| 2 | `injured-starters`, `suspended-starters` | mode joueur seulement |
| 3 | `coach-offer` | une offre de fédération ouverte |
| 4 | `important-contracts` (nouvelle) | contrats à l'adjoint : un titulaire en fin de contrat que l'adjoint compte laisser partir, du 1er janvier au 30 juin |
| 4 | `expiring-contracts` | contrats au joueur, comme aujourd'hui |
| 5 | `sale-proposals` (nouvelle) | mercato ouvert et au moins une vente proposée (§ 5) |
| 6 | `squad-full` (nouvelle) | mercato ouvert et 30 joueurs : « Effectif plein · 30 joueurs sur 30 » |
| 7 | `small-squad` | moins de 18 joueurs |
| 8 | `tired-starters` | mode joueur seulement, avant un match européen |
| 9 | `international-returns`, `international-callups`, `coach-call-up` | comme aujourd'hui |
| 10 | `booking-risks`, `europe-booking-risks` | comme aujourd'hui |
| 11 | `injured` | comme aujourd'hui |
| 12 | `weak-spot` | **mercato ouvert seulement** : hors mercato, rien à y faire |
| 13 | `coach-ended` | comme aujourd'hui |

Lignes qui partent :
- `offers` (la meilleure offre reçue) : `sale-proposals` la remplace, et l'onglet Vendre garde toutes les offres ;
- `full-squad` (« Effectif complet · rien à signaler ») : elle dirait le contraire d'« effectif plein ».

### 4.2 Dispositifs : trois d'abord

- **La feuille du dispositif** (`FormationPicker`), aujourd'hui : les 3 meilleurs, puis les 17 par famille, les trois
  premiers deux fois.
  - Après, d'abord « Les 3 conseillés pour ton effectif » (`formation-best`, même classement, `rankFormations`).
  - Puis l'actuel, s'il n'en est pas.
  - Puis « Voir tous les dispositifs · 14 » (`formation-show-all`), qui déplie les 14 autres par famille, sans les trois
    premiers (`formation-choice`).
- **Le comparatif du panneau** (`FormationPanel`, « Comparer les 17 dispositifs »), aujourd'hui dans l'ordre des noms.
  - Après, trié par écart de buts attendu contre le prochain adversaire : les 3 meilleurs, puis « Voir les 14 autres ».
- **Le panneau Coaching du direct** garde sa liste déroulante des 17 : c'est l'écran du joueur qui veut tout régler.

---

## 5. Ventes proposées par l'adjoint

### 5.1 Qui il propose

Pendant un mercato, l'adjoint propose de vendre un joueur du club dirigé quand **tout** ceci est vrai :

1. **Il ne joue pas.** Sur la période de référence : 2 titularisations au plus, et des minutes qui ne dépassent pas 10 % de
   celles du club (ses matchs officiels joués × 90), championnat, coupe et Europe comptés.
   - Mercato d'hiver : la saison en cours.
   - Mercato d'été : la saison terminée, dans ses lignes ou dans son archive (`readArchivedSeason`, statistiques
     comprises).
   - Il faut au moins 10 matchs officiels sur la période. Le premier été d'une carrière ne propose donc rien.
2. **Il était au club toute la période.** Aucune arrivée depuis son début : ses statistiques sont celles du club, et il
   n'est ni « arrivé à ce mercato » ni sous la limite de revente.
3. **L'adjoint n'en a pas besoin.** Il n'est ni dans le onze ni sur le banc (7) que l'adjoint alignerait avec tout
   l'effectif disponible. Ce critère protège un titulaire revenu d'une longue blessure.
4. **Il n'est pas protégé** :
   - ni l'un des 3 meilleurs gardiens du club ;
   - ni un espoir (`isProspect` : 23 ans ou moins, potentiel au niveau de l'effectif) ;
   - ni un jeune prometteur pendant son premier contrat (`academyLocks`).
5. **Un club l'achète.** `quoteSquad` donne une offre. Hors limite de revente, les offres valent 0,8 à 1,2 fois la valeur,
   environ 1,13 pour la meilleure de cinq.
6. **L'effectif tient** : 22 joueurs et 2 gardiens au moins après la vente, les propositions comptées dans l'ordre.

L'adjoint en montre 3 au plus, la meilleure offre d'abord. Un joueur que le joueur a gardé n'est plus proposé avant la fin
du mercato (`PlayerSave.saleKeptUntil`).

### 5.2 Un geste

- **Où** :
  - en tête de l'onglet Vendre, sous « Ton adjoint propose » (`market-sale-proposals`, une carte
    `market-sale-proposal` par joueur) ;
  - dans « À faire », une ligne (`sale-proposals`) : « Ton adjoint propose 2 ventes · Ils ne jouent pas · 6,1 M€ », vers
    l'onglet ;
  - l'onglet se nomme « Vendre · 2 proposées » quand il y en a.
- **La carte** :
  - le joueur (poste, note, âge) ;
  - pourquoi : « 1 titularisation, 74 minutes cette saison · ni titulaire ni remplaçant pour ton adjoint » ;
  - l'offre : « Fulham propose 3,4 M€ (vaut 3,1 M€) » ;
  - « Vendre · 3,4 M€ » (`sale-proposal-accept`) et « Garder » (`sale-proposal-keep`).

  L'orange de l'écran est le « Vendre » de la première carte. La carte « Meilleure offre » d'aujourd'hui passe en
  secondaire quand il y a des propositions.
- **« Vendre · 3,4 M€ »** vend aussitôt, sans dialogue : la carte a tout dit. `acceptSaleProposalAction` :
  - `requireOwnedSave`, puis Zod ;
  - la partie verrouillée (`lockSave`), ce que `sellPlayer` ne fait pas aujourd'hui ;
  - refus pendant un direct ;
  - la meilleure offre recalculée dans la transaction. Si l'acheteur ou le montant ont changé (une autre vente a vidé un
    budget), rien n'est vendu : « L'offre a changé : Brest propose maintenant 3,1 M€ », et la carte se met à jour.
  - Puis un toast : « Petit vendu à Fulham pour 3,4 M€ ».
- **« Garder »** retire la carte jusqu'à la fin du mercato.
- **Les autres ventes** gardent leur dialogue de confirmation : deux gestes.

---

## 6. Écran par écran

Pour chaque écran, ce qui part, ce qui arrive et ce qui change, avec les identifiants d'aujourd'hui. Toutes les clés de
messages vont par deux, FR et EN, mêmes arguments.

### 6.1 Accueil

- **Part** : la pastille « Salaires {payroll} / {wageBudget} » (`dashboard-payroll`, `[data-summary="payroll"]`,
  `dashboard.payrollPill`) et son orange à 90 % (`isPayrollHigh`, `_lib/payroll.ts`, avec ses tests). Le budget et le
  mercato restent.
- **Arrive** :
  - l'annonce, une fois, dans une carrière d'avant (`assistant-notice`, § 7) ;
  - les lignes nouvelles de « À faire » (§ 4.1, § 2.2, § 5.2).
- **Change** :
  - « À faire » : 3 lignes et « Voir tout » ;
  - la tuile Effectif : « 26 joueurs sur 30 » (`dashboard-squad`) ;
  - le héros, en mode adjoint : « Onze de l'adjoint · 4-3-3 sentinelle » (`dashboardHero.formation`) ;
  - la bulle `money` (§ 8) ;
  - les premières actions d'une partie de défi : « Voir l'effectif · Découvre tes joueurs, leur note et leur condition »,
    et « Choisir ta composition · Ton adjoint aligne déjà ton onze : choisis ton dispositif, ou fais-le toi-même ».

```
390 px, Accueil d'une carrière d'avant, au premier chargement après la mise en ligne
┌──────────────────────────────────────────┐
│ Budget 37,5 M€                           │
│ Mercato ouvert jusqu'au 31 janvier       │
│ ┌ PROCHAIN MATCH · JOURNÉE 20 ─────────┐ │
│ │ SAM. 16 JANV. · DOMICILE · D1        │ │
│ │   [TO]          VS          [MO]     │ │
│ │ [■ JOUER LE MATCH ■]                 │ │  ← l'orange de l'écran
│ │ [ Préparer ]          [ Simuler ▾ ]  │ │
│ │ Onze de l'adjoint · 4-3-3 sentinelle │ │
│ └──────────────────────────────────────┘ │
│ ┌ TON ADJOINT PREND LE RELAIS ─────────┐ │
│ │ Plus de plafond salarial : ton       │ │
│ │ budget est ta seule limite. Un       │ │
│ │ joueur libre coûte une prime, et ton │ │
│ │ effectif compte 30 joueurs au plus.  │ │
│ ├──────────────────────────────────────┤ │
│ │ J'aligne le onze avant chaque match, │ │
│ │ dans ton dispositif.                 │ │
│ │ Je prolonge tes joueurs utiles, et   │ │
│ │ je te préviens avant de laisser      │ │
│ │ partir un titulaire.                 │ │
│ │ Au mercato, je te propose de vendre  │ │
│ │ ceux qui ne jouent pas.              │ │
│ ├──────────────────────────────────────┤ │
│ │ [ Régler l'adjoint ]    [ Compris ]  │ │
│ └──────────────────────────────────────┘ │
│ (missions du jour, tuiles, objectifs)    │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

```
390 px, Accueil, « À faire » : trois lignes, le reste derrière « Voir tout »
┌──────────────────────────────────────────┐
│ À FAIRE                                  │
│ ┌──────────────────────────────────────┐ │
│ │ ! Fin de contrat le 30 juin : Koné   │ │
│ │   (33 ans). Ton adjoint compte le    │ │
│ │   laisser partir : décide sur sa     │ │
│ │   fiche                            › │ │
│ ├──────────────────────────────────────┤ │
│ │ € Ton adjoint propose 2 ventes       │ │
│ │   Ils ne jouent pas · 6,1 M€       › │ │
│ ├──────────────────────────────────────┤ │
│ │ + 2 blessés                          │ │
│ │   Mendy, retour le 23 janvier      › │ │
│ └──────────────────────────────────────┘ │
│ [ Voir tout · 2 de plus ]                │
│                                          │
│ Sans rien à faire :                      │
│ ┌──────────────────────────────────────┐ │
│ │ Rien à faire : ton adjoint s'occupe  │ │
│ │ du reste.                            │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

### 6.2 Effectif

- **Part** :
  - le résumé « masse salariale {payroll} / {budget} M€ » (`squad-summary`, `squad.wageBill`, `squad.payroll`) ;
  - la colonne Salaire (`squad-column-wage`, `squad.columns.wage`, son tri) ;
  - le salaire de la carte au survol (`player-card`, `player.wage`, `player.wagePerSeason`).
- **Arrive** : « 27 joueurs sur 30 » dans le résumé, en ambre à 30.
- **Reste** : le badge « Expire » et la colonne du contrat.

### 6.3 Composition

- **Part** :
  - « Composition automatique » (`lineup-automatic`) ;
  - le statut « Onze automatique · pas encore enregistré » (`lineup.notSaved`).
- **Arrive** :
  - la carte « Ton adjoint aligne le onze » en mode adjoint (`lineup-assistant`) ;
  - « Rendre la main à l'adjoint » en mode joueur (`lineup-hand-back`) ;
  - les statuts du § 3.4 ;
  - l'enregistrement direct du dispositif et de la consigne en mode adjoint.
- **Change** :
  - « Enregistrer » (`lineup-save`, l'orange de l'écran) n'apparaît qu'en brouillon ;
  - la feuille du dispositif (§ 4.2) ;
  - le comparatif du panneau (§ 4.2) ;
  - la bulle du tutoriel (§ 8).
- **Reste** : le raccourci « Stage de forme » (`lineup-camp`), qui sert dans les deux modes.

```
390 px, Équipe → Composition, l'adjoint aux commandes (par défaut)
┌──────────────────────────────────────────┐
│ [ Effectif ]  [■ Composition ■]          │
│ ┌ TON ADJOINT ALIGNE LE ONZE ──────────┐ │
│ │ Avant chaque match, il prend les     │ │
│ │ meilleurs selon la condition, les    │ │
│ │ blessures et les suspensions, dans   │ │
│ │ ton dispositif.                      │ │
│ └──────────────────────────────────────┘ │
│ Dispositif  [ 4-3-3 sentinelle     ▾ ]   │
│ Consigne (Attaquer |•Équilibré| Fermer)  │
│                                          │
│    (terrain : le onze du prochain        │
│     match, chaque joueur et sa note)     │
│ Au repos : Diallo (68 de condition)      │
│ Banc : Koné, Mendy, Faure, ...           │
│                                          │
│ Onze de ton adjoint · il le refait       │
│ avant chaque match                       │
│ Touche un joueur pour faire ton onze :   │
│ ton adjoint ne le changera plus.         │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

```
390 px, Composition, après un geste sur un joueur, puis enregistrée
┌──────────────────────────────────────────┐
│ Ton onze · modifications non             │
│ enregistrées                             │
│ [■ ENREGISTRER ■]       [ Annuler ]      │  ← orange ; « Annuler » revient au onze de l'adjoint
├──────────────────────────────────────────┤
│ Ton onze · enregistré. Ton adjoint       │
│ ne remplace qu'un blessé ou un           │
│ suspendu.                                │
│ [ Rendre la main à l'adjoint ]           │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

```
390 px, la feuille du dispositif
┌──────────────────────────────────────────┐
│ DISPOSITIF                            ✕  │
│ Les 3 conseillés pour ton effectif       │
│ ┌──────────────────────────────────────┐ │
│ │ 1er  4-2-3-1 large     1,62 pt/match │ │
│ │      Attaque 54 % · défense 46 %     │ │
│ ├──────────────────────────────────────┤ │
│ │ 2e   4-3-3 sentinelle  1,60 · Actuel │ │
│ │      Attaque 51 % · défense 49 %     │ │
│ ├──────────────────────────────────────┤ │
│ │ 3e   4-4-2 à plat      1,57 pt/match │ │
│ │      Attaque 50 % · défense 50 %     │ │
│ └──────────────────────────────────────┘ │
│ [ Voir tous les dispositifs · 14 ]       │
│                                          │
│ Dépliés : les 14 autres par famille      │
│ (4, 3 et 5 défenseurs), sans les 3       │
│ premiers ; l'actuel, s'il n'est pas      │
│ parmi eux, juste sous les trois.         │
└──────────────────────────────────────────┘
```

### 6.4 Fiche du joueur

Effectif, Composition, marché complet.

- **Part** :
  - la ligne « Salaire · {wage} / an » (`player.wage`, `player.wagePerYear`) ;
  - le champ du salaire de « Prolonger » (`renewal-wage`, `contract.offeredWage`) et ses refus (`wageBudgetExceeded`,
    `playerRefused`, `playerRefusedAsking`) ;
  - le salaire du dialogue de vente (`contract.bestOffer`).
- **Arrive** : le choix de fin de contrat (`player-contract-choice` : `contract-choice-assistant`, `contract-choice-renew`,
  `contract-choice-leave`), pour un joueur dont le contrat finit cette saison.
- **Change** :
  - `contract.renewDescription` : « Contrat actuel : jusqu'au {date}. » ;
  - `contract.releaseDescription` (§ 2.4) ;
  - `player.leavingFree`, en mode adjoint : « Ton adjoint le prolongera » ou « Ton adjoint le laissera partir » ;
  - les toasts `actions.contracts.renewed` et `renewedOpenEnded`, sans salaire.

```
390 px, la fiche d'un joueur en dernière année de contrat, contrats à l'adjoint
┌──────────────────────────────────────────┐
│ CONTRAT                                  │
│ Jusqu'au 30 juin 2027 · fin de saison    │
│ À la fin de son contrat :                │
│ (•) Ton adjoint décide : il le           │
│     prolongera, il est dans ton onze     │
│ ( ) Le prolonger                         │
│ ( ) Le laisser partir                    │
│                                          │
│ [■ Prolonger maintenant ■]               │  ← orange (Effectif) ; mercato ouvert seulement
│ [ Vendre ]          [ Libérer ]          │
├──────────────────────────────────────────┤
│ PROLONGER DIALLO                     ✕   │
│ Contrat actuel : jusqu'au 30 juin 2027   │
│ Durée  [1] [2] [■3■] [4] [5] saisons     │
│ Jusqu'au 30 juin 2029                    │
│ [■ CONFIRMER LA PROLONGATION ■]          │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

### 6.5 Marché : Acheter

- **Part** :
  - la pastille « Marge salariale » (`[data-summary="wage-room"]`, `market.wageRoom`) ;
  - l'étiquette « Dans tes moyens » (`market.tags.affordable`) ;
  - les introductions `weakSpotAffordable` et `weakSpotNoRoom` ;
  - le panneau `WageLimit` (`market-wage-limit` et ses quatre liens, les 9 clés `market.wageLimit.*`) ;
  - la ligne « Salaire par saison » de la confirmation (`market.confirm.wage`).
- **Arrive** :
  - « Effectif 27/30 » à côté du budget (`[data-summary="squad"]`) ;
  - la carte « Effectif plein » (`market-squad-full`), qui remplace les propositions à 30 joueurs ;
  - la ligne « Effectif · 28 sur 30 » de la confirmation.
- **Change** :
  - `market.contract` « Salaire {wage} · 3 saisons » devient « Contrat de 3 saisons » ;
  - `market.free` « Gratuit » devient « Prime à la signature {bonus} » (`market.bonus`) ;
  - « Prix » devient « Prime à la signature » dans la confirmation d'un libre ;
  - `market.confirm.description` : « Le prix le plus bas qu'il accepte, sur la durée standard. » ;
  - `market.signed.detail` : « Contrat de 3 saisons, jusqu'au {date}. » ;
  - la bulle `marketProposal` (§ 8).

```
390 px, Marché → Acheter, un joueur libre proposé
┌──────────────────────────────────────────┐
│ MARCHÉ                                   │
│ 37,5 M€ dispo · Effectif 27/30           │
│ [■ Acheter ■] [ Vendre · 2 proposées ]   │
│ Mes besoins · Pépites · Bonnes affaires  │
│ Ton point faible : arrière gauche        │
│ (note 64). Voici qui le comblerait.      │
│ ┌──────────────────────────────────────┐ │
│ │ Bon profil                           │ │
│ │ A. Martin · DG · 70 · 26 ans         │ │
│ │ Joueur libre · +6 au poste DG        │ │
│ │ Prime à la signature 1,3 M€          │ │
│ │ Contrat de 3 saisons                 │ │
│ │ [ Passer ]          [■ RECRUTER ■]   │ │  ← orange
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ RECRUTER A. MARTIN                   ✕   │
│ Prime à la signature          1,3 M€     │
│ Durée   3 saisons, jusqu'au 30/06/2029   │
│ Budget restant               36,2 M€     │
│ Effectif                    28 sur 30    │
│ [■ CONFIRMER ■]                          │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

```
390 px, Marché → Acheter, effectif plein
┌──────────────────────────────────────────┐
│ MARCHÉ                                   │
│ 37,5 M€ dispo · Effectif 30/30           │
│ [■ Acheter ■] [ Vendre · 2 proposées ]   │
│ ┌ EFFECTIF PLEIN ──────────────────────┐ │
│ │ 30 joueurs sur 30 : vends ou libère  │ │
│ │ un joueur avant d'en recruter un     │ │
│ │ autre.                               │ │
│ │ [ Voir les ventes proposées ]        │ │
│ │ [ Ouvrir l'effectif ]                │ │
│ └──────────────────────────────────────┘ │
│ (les propositions restent lisibles,      │
│ « Recruter » inactif)                    │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

### 6.6 Marché : Vendre

- **Arrive** :
  - « Ton adjoint propose » et ses cartes (§ 5.2) ;
  - le nom d'onglet « Vendre · {n} proposées ».
- **Change** :
  - `refusals.noOffer` : « Aucun club ne peut acheter ce joueur pour le moment : réputation ou budget insuffisants. » ;
  - la carte « Meilleure offre » perd son orange quand des propositions sont là.

```
390 px, Marché → Vendre, mercato d'hiver
┌──────────────────────────────────────────┐
│ [ Acheter ] [■ Vendre · 2 proposées ■]   │
│ TON ADJOINT PROPOSE                      │
│ ┌──────────────────────────────────────┐ │
│ │ B. Petit · MC · 64 · 29 ans          │ │
│ │ 1 titularisation, 74 minutes cette   │ │
│ │ saison · ni titulaire ni remplaçant  │ │
│ │ pour ton adjoint                     │ │
│ │ Fulham propose 3,4 M€ (vaut 3,1 M€)  │ │
│ │ [■ VENDRE · 3,4 M€ ■]   [ Garder ]   │ │  ← orange : un geste, la vente est faite
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ C. Roux · DC · 61 · 31 ans           │ │
│ │ Aucun match cette saison             │ │
│ │ Brest propose 2,7 M€ (vaut 2,6 M€)   │ │
│ │ [ Vendre · 2,7 M€ ]     [ Garder ]   │ │
│ └──────────────────────────────────────┘ │
│ TES AUTRES REMPLAÇANTS                   │
│ D. Faure · DG · vaut 4,0 M€              │
│ Lens propose 4,3 M€          [ Vendre ]  │  ← la vente de toujours, avec sa confirmation
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

### 6.7 Marché complet

- **Part** :
  - la marge salariale du bandeau (`transfers.banner.wageRoom`, `wageBudget`) ;
  - la colonne « Salaire demandé » des joueurs des clubs (`transfers.table.askedWage`) ;
  - les champs du salaire des dialogues de signature et d'offre (`transfers.dialogs.wage`, `wageRoom`).
- **Change** :
  - la colonne des joueurs libres devient « Prime » (`transfers.table.bonus`, `data-bonus` à la place de
    `data-asked-wage`) ;
  - `transfers.sheet.freeAgent` : « Joueur libre : prime à la signature {bonus}. » ;
  - `transfers.asking` : « {club} demande {price}. » ;
  - `transfers.dialogs.signDescription` : « Joueur libre : pas d'indemnité de transfert, une prime à la signature de
    {bonus}, payée sur ton budget. » ;
  - les toasts `actions.market.*`, sans salaire.
- **Reste** : la durée du contrat. Aucun filtre ne portait sur le salaire.

```
390 px, Marché complet → Joueurs libres
┌──────────────────────────────────────────┐
│ JOUEURS LIBRES                           │
│ Joueur        Poste  Note  Âge   Prime   │
│ A. Martin     DG     70    26   1,3 M€   │
│ L. Blanc      G      70    33   0,9 M€   │
│ J. Roche      BU     69    30   1,4 M€   │
│ (colonne « Salaire » remplacée par la    │
│ prime ; « Signer » sans champ salaire)   │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

### 6.8 Club

- **Finances, part** :
  - « Masse salariale » et sa barre (`club-payroll`, `club-wage-bar`) ;
  - la marge ou le dépassement (`club-wage-room`, `club.wageRoom`, `club.wageOverrun`) ;
  - le plafond de la dotation (`club-dotation-wage-budget`, `club.dotation.wageBudget`).
- **Finances, reste** : le reste de la dotation et les primes.
- **Réglages, arrive** : « Ton adjoint s'occupe de », deux interrupteurs en tête de la carte, sur le modèle de « L'adjoint
  joue les amicaux » (`role="switch"`, `useOptimistic`, action Zod sous `lockSave`, refusée pendant un direct) :
  - `settings-assistant-lineup` « Composition » ;
  - `settings-assistant-contracts` « Contrats ».

  L'ancre `#reglages` sert au lien de l'annonce.

```
390 px, Club → Club, la carte Finances
┌──────────────────────────────────────────┐
│ ┌ FINANCES ────────────────────────────┐ │
│ │ BUDGET                               │ │
│ │ 37,5 M€                              │ │
│ ├──────────────────────────────────────┤ │
│ │ Dotation de la saison 2027-28        │ │
│ │ 9e de réputation en D1     35,6 M€   │ │
│ │ Objectifs atteints          × 1,10   │ │
│ │ Report                    + 2,1 M€   │ │
│ │ Budget de la saison       41,3 M€    │ │
│ ├──────────────────────────────────────┤ │
│ │ Primes de la saison                  │ │
│ │ France — Coupe             0,8 M€    │ │
│ └──────────────────────────────────────┘ │
│ Retirés : masse salariale et sa barre,   │
│ marge ou dépassement, plafond salarial   │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

```
390 px, Club → Club, la carte Réglages
┌──────────────────────────────────────────┐
│ ┌ RÉGLAGES ────────────────────────────┐ │
│ │ TON ADJOINT S'OCCUPE DE              │ │
│ │ Composition                [ ● Oui ] │ │
│ │ Il aligne le meilleur onze avant     │ │
│ │ chaque match, dans ton dispositif.   │ │
│ │ Contrats                   [ ● Oui ] │ │
│ │ Il prolonge les joueurs utiles et    │ │
│ │ laisse partir les autres.            │ │
│ ├──────────────────────────────────────┤ │
│ │ Langue        [ Français | English ] │ │
│ │ Compte · Parties · Série · Tutoriel  │ │
│ │ Appli · Confidentialité              │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

### 6.9 Début de saison

- **Part** : la carte « Plafond salarial » (`SeasonWages` : `season-start-wages`, `-wage-budget`, `-payroll`,
  `-wage-room`, les 5 clés `seasonStart.wages.*`).
- **Arrive** : « Ton adjoint à l'intersaison » (`season-start-assistant`), lue dans `SeasonBudget.contractMoves`, après un
  passage seulement : prolongés, partis, recrues, jeunes, effectif sur 30.
- **Change** : l'introduction, « Avant ton premier match : le budget que t'accorde la direction, ce qu'a fait ton adjoint et
  tes objectifs. »

```
390 px, Club → début de saison, après le passage
┌──────────────────────────────────────────┐
│ SAISON 2027-28                           │
│ CAP SUR LA SAISON                        │
│ ┌ LA DIRECTION T'ACCORDE 41,3 M€ ──────┐ │
│ │ (dotation, objectifs, report :       │ │
│ │ inchangés)                           │ │
│ └──────────────────────────────────────┘ │
│ ┌ TON ADJOINT À L'INTERSAISON ─────────┐ │
│ │ Prolongés : Diallo (2030), Koné      │ │
│ │ (2029), Mendy (2028)                 │ │
│ │ Partis libres : Moreau, Petit        │ │
│ │ Signé : L. Blanc, gardien (0,9 M€)   │ │
│ │ Venus de l'académie : 2 jeunes       │ │
│ │ Effectif : 25 joueurs sur 30         │ │
│ └──────────────────────────────────────┘ │
│ Retirée : la carte Plafond salarial      │
│ (objectifs, choix : inchangés)           │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

### 6.10 Récompenses

Le jeune prometteur :
- **Part** :
  - « Salaire … compté dans ton plafond salarial » (`confirm.youthWage`) et « Marge salariale » (`confirm.youthRoom`) ;
  - « Hors de ta marge » (`confirm.tooExpensive`) ;
  - les refus `wage_budget` et `wageBudgetAny`.
- **Arrive** : le refus `squad_full` et « Il prend une place : 27 sur 30 ».
- **Reste** : la rallonge, sur le seul budget.

```
390 px, Club → Récompenses, le jeune prometteur
┌──────────────────────────────────────────┐
│ ┌ JEUNE PROMETTEUR · 350 ──────────────┐ │
│ │ 17 ans, note du sommet des jeunes    │ │
│ │ de ta division + 3, potentiel + 25   │ │
│ │ à 30. Contrat de 3 saisons, ni vente │ │
│ │ ni libération avant sa fin.          │ │
│ │ Il prend une place : 27 sur 30.      │ │
│ └──────────────────────────────────────┘ │
│ Effectif plein : « Ton effectif compte   │
│ déjà 30 joueurs : vends ou libère un     │
│ joueur avant de faire venir un jeune. »  │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

### 6.11 Ce qui ne change pas

- Le direct et le panneau Coaching.
- La Sélection du sélectionneur, dont l'adjoint fait déjà la composition.
- Le calendrier, le classement, la coupe, l'Europe, l'Histoire (le budget de fin de saison reste, et aucun salaire n'y
  figurait).
- `/admin`.

### 6.12 Pages publiques

- **Le guide** (`app/_content/how-to-play.ts`) :
  - la fin de « Le marché », qui parle de « marge salariale » et de « plafond » ;
  - « La composition », réécrite autour de l'adjoint ;
  - un paragraphe neuf sur les contrats et les ventes proposées.
- **L'accueil** :
  - le texte `landing.features.market.text`, « garde ta masse salariale sous son plafond » ;
  - le texte de remplacement `landing.screenshots.market.alt`, qui cite un salaire ;
  - **deux captures à refaire** dans chaque langue : `market-*.webp` montre « Salaire 1,5 M€ · 3 saisons », et
    `lineup-*.webp` prendra la carte de l'adjoint.
- **Les Nouveautés** : une entrée.
- `llms.txt` ne parle pas de salaire.
- Aucune donnée personnelle nouvelle : la page de confidentialité ne bouge pas.

---

## 7. Carrières existantes

- **Réglages au premier chargement** :
  - Composition : le mode joueur si une composition est enregistrée, le mode adjoint sinon (§ 3.3) ;
  - Contrats : l'adjoint (§ 13, point 3) ;
  - ventes proposées : partout, sans réglage.
- **Ce qui change aussitôt** :
  - plus de plafond ;
  - la prime et les 30 joueurs ;
  - les offres de vente recalculées ;
  - « À faire » à 3 lignes ;
  - le onze de l'adjoint, là où rien n'était enregistré.
- **Ce qui change au prochain passage de saison** : les contrats.
- **Rien de perdu** :
  - salaires, plafonds, dotations passées et compositions enregistrées restent en base ;
  - un effectif au-delà de 30 garde tous ses joueurs ;
  - un jeune prometteur garde son contrat.
- **L'annonce**, une carte de l'Accueil sous le héros (`assistant-notice`), dans chaque carrière créée avant la mise en
  ligne, jamais dans une partie de défi.
  - Elle dit ce que fait l'adjoint **dans cette carrière**. Une composition enregistrée y reste la sienne : « Ta
    composition enregistrée reste la tienne : rends-moi la main quand tu veux. »
  - « Régler l'adjoint » mène à Club → Réglages. « Compris » ou la croix la ferment pour de bon (`Save.assistantNoticeAt`).
  - Une carrière créée après la mise en ligne ne l'a pas : sa date est posée à la création.
  - Elle s'ajoute aux bulles et aux missions sans en retirer aucune. Le jour 1 d'un tutoriel, elle n'existe pas : c'est
    une carrière neuve.

---

## 8. Tutoriel

Aucune clé d'étape ne change et aucune étape n'est ajoutée. La version reste 2 : les tutoriels en cours gardent leur
liste, seuls des textes et deux règles changent.

| Étape ou bulle | Aujourd'hui | Après |
|---|---|---|
| `lineup` (écran) | cercle le poste du point faible ; toucher un poste, puis « Enregistrer » cerclé (`lineupPick`) | en mode adjoint, cercle le dispositif (`lineup-formation`) : « Je fais ton onze avant chaque match. Toi, choisis le dispositif ; touche un joueur si tu veux le faire toi-même. ». Le geste est d'ouvrir la feuille ; plus de suite vers « Enregistrer ». En mode joueur, comme aujourd'hui. |
| `lineup` (poussée de l'Accueil, jour 3) | « je te montre qui peut jouer à chaque poste » | « je te montre comment je fais ton onze » |
| `fitness` | un titulaire sous 75 : « Repose-le, ou touche « Composition automatique » » | **sans objet en mode adjoint**, qui repose lui-même : close `ADAPTED` sans bulle (règle nouvelle de `laterClosure` ; sinon, jamais due, elle finirait le tutoriel `EXPIRED`). En mode joueur, comme aujourd'hui, sans citer le bouton parti. |
| `market` (bulle du Marché) | « Voici un joueur pour ton point faible, dans tes moyens. » | « Voici un joueur pour ton point faible, que ton budget paie. » |
| bulle `money` (premiers pas) | « La masse salariale additionne les salaires d'une saison : toute signature qui dépasse son plafond est refusée. » | « Le budget transferts paie les achats et la prime d'un joueur libre. Ton effectif compte 30 joueurs au plus. » |
| calme du premier jour | cache budget, salaires, mercato | cache budget et mercato : la pastille des salaires n'existe plus |
| `squad`, `missions`, `objectives`, `simulate`, `judged`, jour 1 | — | inchangés |
| adieu (`farewell`) | « Mes conseils restent dans « À faire » » | inchangé |

Tests : `src/lib/tutorial.test.ts` (les textes de 140 caractères au plus, la clôture de `fitness`) et
`e2e/tutorial.spec.ts` (le texte `marketProposal`, la bulle de la Composition, la pastille des salaires de
`HIDDEN_ON_THE_FIRST_DAY`).

---

## 9. Missions

| Mission | Aujourd'hui | Après |
|---|---|---|
| `SAVE_LINEUP` « Enregistre ta composition » (facile, 20 %) | « Ouvre la composition et touche « Enregistrer » » | **sans objet**, et même contraire : elle pousse à prendre la main. Elle sort du tirage (poids 0, clé gardée, jamais renommée). Une mission du jour déjà tirée reste faisable jusqu'à minuit UTC. |
| `START_YOUTH` « Titularise un joueur de 21 ans ou moins » (facile, 15 %) | le joueur le place dans son onze | **retenu** (§ 13, point 7) : « Fais jouer un joueur de 21 ans ou moins ». Elle est faite dès qu'il joue une minute, titulaire ou entré en jeu ; un changement au direct suffit. Même clé, règle élargie, aide « Fais-le entrer pendant un match en direct. », plus de lien vers la composition. |
| les 13 autres | — | inchangées : les missions du direct sont des gestes aux pauses, que l'adjoint ne prend pas |

Nouveaux poids du palier facile : `PLAY_MATCH` 30, `PLAY_MATCHES` 25, `SCORE` 25, `START_YOUTH` 20. « Jamais la mission
de la veille » tient avec quatre missions. Les ventes proposées n'en font pas une mission : le cahier des missions écartait
déjà les missions du mercato, refusées la plupart des jours.

---

## 10. Défi de la semaine et jour de mise en ligne

Toutes les parties d'un défi partagent la graine et le club. Elles sont créées à la demande toute la semaine
(`createChallengeSave`). Une règle qui change les matchs ou le marché au milieu d'une semaine donnerait à ses joueurs des
parties différentes, et le classement comparerait des choses différentes : c'est la règle du 23/11.

Ce que le chantier change dans une partie de défi (10 journées, du 1er juillet à mi-octobre, mercato d'été ouvert
jusqu'au 31 août) :

| Changement | Effet sur une partie de défi |
|---|---|
| Composition de l'adjoint | **change les matchs** de qui n'enregistre pas sa composition : le onze reposé au lieu de `selectLineup`. C'est le « je ne change rien » du classement, dont les égalités se départagent à l'heure. |
| Plus de plafond, prime, 30 joueurs | **change le marché** du club du défi (qui il peut signer, et à quel prix) et **les offres** pour ses joueurs (flux des devis). La présaison de la création ne change pas : tous les clubs y ont 25 joueurs, personne ne signe. |
| Contrats de l'adjoint | aucun : aucun contrat ne finit avant le 30 juin |
| Ventes proposées | aucune : elles demandent une saison de référence de 10 matchs, et le premier été d'une carrière n'en a pas ; le mercato d'hiver vient après la 10e journée |
| Annonce | jamais dans une partie de défi |
| « À faire » à 3 lignes, dispositifs « Voir tous » | aucun : affichage seulement |

**Jour de mise en ligne.**
- Ce qui change les matchs ou le marché part un **lundi**, après 00:00 UTC, avant que quiconque ait une partie du défi
  de la semaine.
- Juste avant de pousser, deux lectures :
  - le classement public (`/fr/defi`, « Personne n'a encore terminé le défi cette semaine ») ;
  - en lecture seule dans Chrome, la ligne Défi de `/admin` (« aucune partie sur 20 · aucun joueur inscrit »).
- Sinon, le lundi suivant.
- Le chantier ne peut pas être prêt pour le lundi 30/11 : validation, code, mesures et contrôles complets. Au plus tôt le
  **lundi 7/12**, plus sûrement le **lundi 14/12**.

**Deux mises en ligne** (point 11, tranché le 24/11).
1. **N'importe quel jour, dès que les contrôles sont verts** : rien n'y touche une partie du défi.
   - « À faire » à 3 lignes et « Voir tout », dans l'ordre du § 4.1 avec les lignes d'aujourd'hui, le point faible
     pendant le mercato seulement ;
   - les dispositifs « 3 conseillés, puis Voir tous » ;
   - deux défauts relevés au § 5.2 et au § 2.4 :
     - la partie verrouillée pendant une vente ;
     - la fiche d'un joueur d'un club IA, qui dit à tort « partira libre ».
2. **Tout le reste**, d'un bloc, le lundi 7/12 s'il est prêt et vérifié, sinon le lundi 14/12, après 00:00 UTC.

---

## 11. Mesures avant la mise en ligne

Comment elles se font :
- sur une base locale dédiée, jamais `latewinner_dev`, une suite à la fois ;
- la référence est relevée sur `main` (`1700ec5`) avant le premier commit, puis le chantier, mêmes graines ;
- les résultats iront au cahier, dans un § 15 écrit au codage.

**À ajouter aux scripts** :
- `measure:seasons` relève déjà l'effectif de chaque club et les recrues de chaque présaison, sans les imprimer. Ses
  sections a, b et c parlent de plafond et de masse salariale ; elles passeront à l'effectif et aux primes.
- Le club dirigé et ses jumeaux auront un script neuf, `measure:assistant`, sur le modèle de `measure:coach` : deux
  jumeaux d'une partie 2, même graine.

| Mesure | Outil | Ce qu'on regarde | Cible |
|---|---|---|---|
| Six cibles d'équilibrage | `npm run measure:balance -- --seeds=6 --seasons=3` | buts 2,66, nuls 25,1 %, domicile 43,9 %, écart 1er − dernier 52,7, forme 31,0–75,8, le plus faible gagne 24,1 % (23/11) | chacune dans sa plage, sans écart sensible (± 0,02 but, ± 0,5 point) : les matchs ne bougent que par les recrues des clubs IA et le onze du club dirigé |
| Blessures des clubs européens | même mesure, section « Europe » | Lauriers 1,28, Fanions 1,23 | sous 1,3, sur 6 graines × 3 saisons |
| Budgets et effectifs des clubs IA, 5 saisons | `npm run measure:seasons -- --seasons=5` | budget au mercato d'été et en fin de saison, par division et par tiers ; part de la dotation dépensée en primes ; effectif min, médian, max par division ; clubs au-delà de 25, à 30 | effectifs de 20 à 25 comme aujourd'hui, aucun à 30 ; dotations inchangées, la part des primes dite |
| Joueurs libres signés | même mesure, section nouvelle | par saison : vivier au 1er juillet (taille, note médiane, meilleur) ; signés par les clubs IA (`preseason.signings` sans le club dirigé), leur note et leurs primes ; signés par le club dirigé ; le meilleur resté libre | autant de recrues qu'aujourd'hui (elles comblent des départs) ; leur note comparée |
| Club passif : la composition | `npm run measure:assistant`, 3 saisons | jumeau A : `selectLineup`, aujourd'hui ; jumeau B : le onze reposé ; les deux avec les contrats de l'adjoint. Points par match de championnat, rang, buts, coupe et Europe, blessures (nombre, jours), titulaires sous 75 au coup d'envoi, minutes des 21 ans ou moins, Jeunesse tenue ou non | B au moins aussi bon que A ; moins de blessures et de titulaires fatigués |
| Club passif : les contrats | même script | jumeau du jeu d'aujourd'hui (aucune prolongation) contre l'adjoint : effectif au 1er juillet, rang ; prolongés, partis, recrues, alertes « joueur important » par saison | l'effectif ne fond plus : 20 à 25 joueurs chaque été |
| Club gourmand | même script | un jumeau qui signe à chaque été les meilleurs joueurs libres que son budget paie, jusqu'à 30, pour un club de D1 au 10e rang de réputation et un de D2 ; note moyenne du onze, rang, budget ; la référence, le même gourmand sous le plafond d'aujourd'hui, sur `main` | un gain réel mais borné : la prime et les 30 joueurs mordent ; sinon, monter la prime (§ 13, point 1) |
| Ventes proposées | même script | à chaque mercato : joueurs proposés, offre sur valeur, effet sur le budget et l'effectif quand le jumeau les accepte toutes | 0 à 3 par mercato, jamais un titulaire, 22 joueurs au moins |
| Divisions | `npm run measure:divisions` | relégués qui remontent aussitôt, champion de D2 contre le 15e de D1 | comme aujourd'hui |
| CPU | `measure:balance`, « CPU par journée » ; création d'une partie ; l'Accueil pendant un mercato | une date d'une partie 2 : 184 ms en moyenne (médiane 172) ; une création : environ 4 s ; l'Accueil, qui lit déjà les devis de l'effectif, et en plus les statistiques de la période (une archive au plus) | à ± 5 % ; l'Accueil, quelques millisecondes de plus |
| Poids | `npm run measure:weight -- --seasons=3` | octets par saison | inchangé : six colonnes, aucune ligne par match |

**Après la mise en ligne**, la ligne Défi de `/admin` le lundi et ses erreurs sur 24 h. Hors de ce chantier, une section
« Adjoint » de `/admin` est possible : part des carrières en mode adjoint, ventes proposées acceptées, primes payées.

---

## 12. Données et migrations

**Une migration d'ajout**, `…_simplification` : six colonnes, aucune table, aucun `UPDATE`.

```sql
-- Réglages de l'adjoint, par carrière (docs/design/simplification.md) : la composition (vide pour une carrière d'avant :
-- le mode joueur si elle a une composition enregistrée), les contrats, l'annonce fermée.
ALTER TABLE "Save" ADD COLUMN "lineupByAssistant" BOOLEAN;
ALTER TABLE "Save" ADD COLUMN "contractsByAssistant" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Save" ADD COLUMN "assistantNoticeAt" TIMESTAMP(3);
-- Le choix du joueur pour un contrat qui finit (RENEW ou LEAVE), et une vente proposée gardée jusqu'à la fin du mercato.
ALTER TABLE "PlayerSave" ADD COLUMN "contractChoice" TEXT;
ALTER TABLE "PlayerSave" ADD COLUMN "saleKeptUntil" TIMESTAMP(3);
-- Ce que l'adjoint a fait des contrats au passage qui ouvre la saison : prolongés, partis, recrues.
ALTER TABLE "SeasonBudget" ADD COLUMN "contractMoves" JSONB;
```

- **Pourquoi sur `Save`** : les deux réglages sont des préférences de la carrière, comme `nationFriendlies`. Une carrière
  neuve est créée avec `lineupByAssistant = true` et `assistantNoticeAt` rempli.
- **Pourquoi sur `PlayerSave`** : deux colonnes vides, ajoutées sans réécrire la table (PostgreSQL 11 et plus), et lues
  avec l'effectif du club dirigé, déjà lu. Le `fillfactor` de 50 ne change rien.
- **Validation par Zod à la lecture** : `contractChoice` (`RENEW`, `LEAVE`) et `contractMoves`, comme les autres JSON.
- **Rien d'écrit dans une transaction de match** : les réglages et les gestes ont chacun leur petite transaction, la
  partie verrouillée.
- **Sans migration** :
  - la prime est l'indemnité (`fee`) de la ligne `Transfer` `FREE` ;
  - le plafond de 30 se compte ;
  - le mode adjoint de la composition se lit dans le réglage.
- **Rien n'est retiré** :
  - `ClubSave.wageBudget`, `SeasonBudget.wageBudget` et `PlayerSave.wage` restent, écrits comme aujourd'hui ;
  - les index `PlayerSave(saveId, overall, wage)` et `(saveId, potential, overall, wage)` aussi : le marché les lit encore
    par note et par potentiel.

---

## 13. Points tranchés (24/11)

Alexis a retenu les propositions, sauf le point 5 :

1. **La prime à la signature** : 25 % de la valeur, 50 000 € au moins (§ 1.3).
2. **Les jeunes de l'intersaison à 30 joueurs** : seulement aux places libres, l'effectif ne dépassant jamais 30.
3. **Les contrats des carrières d'avant** : à l'adjoint, comme une carrière neuve, annoncé.
4. **Les recrues de l'adjoint** : des joueurs libres seulement quand l'effectif tombe sous 20 joueurs ou 2 gardiens, prime
   payée, dit au début de saison.
5. **L'alerte du joueur important** : **seulement quand l'adjoint compte laisser partir un titulaire** (§ 2.2), et non pour
   chaque titulaire en fin de contrat.
6. **La composition d'une carrière d'avant qui en a une enregistrée** : laissée au joueur, en mode joueur.
7. **Les missions** : `SAVE_LINEUP` sort du tirage ; `START_YOUTH` devient « Fais jouer un joueur de 21 ans ou moins ».
8. **L'annonce** : une fois par carrière.
9. **Le point faible dans « À faire »** : pendant un mercato seulement.
10. **Les seuils des ventes proposées** : ceux du § 5.1 (2 titularisations et 10 % des minutes au plus, sur 10 matchs
    officiels au moins ; effectif plancher 22 et 3 gardiens gardés ; 3 propositions à la fois).
11. **La mise en ligne** : en deux fois (§ 10).
12. **L'objectif Jeunesse** : le onze de l'adjoint titularise le meilleur jeune quand il vaut au plus 4 points de moins
    que le titulaire, jusqu'à ses 15 titularisations (§ 3.5).

**Mesures obligatoires avant la seconde mise en ligne** (§ 11) : les six cibles d'équilibrage, budgets et effectifs des
clubs IA sur 5 saisons, joueurs libres signés et primes payées, résultats d'un club dirigé passif dont l'adjoint fait la
composition et les contrats, blessures des clubs européens (limite 1,3). Les captures du marché et de la composition de
la page d'accueil sont refaites, en français et en anglais, en noms fictifs.

---

## 14. Ordre de construction et tests

1. **Moteur pur**, chacun avec ses tests :
   - `signingBonus`, `SQUAD_LIMIT` ;
   - `planSquad` sans plafond, `walkSaleBids` sans marge, sans `planWageSales` ;
   - `proposeSignings` sans salaire ;
   - la règle de contrat de l'adjoint et `importantPlayers` ;
   - le onze de l'adjoint (et la règle Jeunesse si elle est retenue) ;
   - `saleProposals` (les six critères) ;
   - `TODO_PRIORITY`.
2. **Base et actions** :
   - la migration ;
   - `lineupOf` et `getManagedLineup` par mode ;
   - le passage de saison (choix du joueur, règle de l'adjoint, `contractMoves`) ;
   - la prime et le refus `squad_full` dans `makeTransferOffer`, `signFreeAgent` et la boutique ;
   - les actions : deux réglages, dispositif et consigne en mode adjoint, rendre la main, choix de contrat, vendre ou
     garder une proposition, fermer l'annonce.
3. **Écrans** :
   - retirer les salaires (§ 6 : environ quarante clés par langue, `_lib/payroll.ts`) ;
   - la Composition et ses deux modes ;
   - la fiche ;
   - le Marché (prime, 30, ventes proposées) ;
   - Club, le début de saison, l'Accueil (annonce, « À faire ») ;
   - les dispositifs « Voir tous ».
4. **Tutoriel, missions, premiers pas** ; guide, accueil public et ses quatre captures, Nouveautés ; `CLAUDE.md`. Ses
   règles à réécrire :
   - Accueil, Équipe, Marché, Lectures du marché ;
   - Réputation et budget de saison, Équilibrage des deux divisions ;
   - Composition et consigne de départ, Fatigue ;
   - Club, Début de saison ;
   - Missions, Tutoriel, Premiers pas.
5. **Mesures du § 11**, puis les contrôles habituels, une suite à la fois : tsc, lint, Vitest, suite lente, E2E complets,
   build.

**Tests qui suivent le changement.**

- **Vitest** :
  - `transfer-ai.test.ts` (`planWageSales`, `wage_too_low`, acheteurs sans marge), `squad-ai.test.ts` (recrues sous le
    plafond), `market-proposals.test.ts` et `market-proposals-equivalence.test.ts` (marge, `wageBound`, entrée
    `affordable`) ;
  - `saves.test.ts` et `season-v2.slow.test.ts` (plafonds, et l'empreinte des scores, à relancer : Lyon y joue sans
    composition enregistrée, donc en mode adjoint, mais à pleine condition chaque semaine, où le onze reposé est le même) ;
  - `transfers.test.ts`, `shop.test.ts`, `season-contracts.test.ts`, `sale-quotes.test.ts`, `club.test.ts` ;
  - `lineup-editor.test.tsx:98` (le onze non enregistré du club devient celui de l'adjoint), `formation-picker.test.tsx`
    (« chaque dispositif une fois »), `formation-panel.test.tsx`, `dashboard-todo.test.tsx` (ordre, liens), les tests des
    missions ;
  - côté écrans : `club-screen.test.tsx`, `season-start-screen.test.tsx`, `payroll.test.ts`, `refusal-message.test.ts`.
- **E2E** :
  - `dashboard`, `onboarding`, `tutorial`, `club`, `objectives`, `market` (le test de la marge salariale part en entier,
    avec l'aide `setManagedWageRoom` d'`e2e/db.ts`), `transfers`, `team`, `season-start`, `squad`, `lineup`,
    `starting-instruction` ;
  - l'aide `pickFormation` d'`e2e/helpers.ts`, qui devra déplier « Voir tous » ;
  - les jumeaux `cup-final-save.mts` et `europe-final-save.mts`, dont les finales sont épinglées sans composition
    enregistrée : à relancer, leur score peut changer si un finaliste est sous 75.

---

## 15. Mesures (24/11)

**Comment** : chaque mesure deux fois, mêmes graines, sur une base locale dédiée, jamais `latewinner_dev`.
- **Référence** : le jeu d'avant le chantier, relevé à `a5cbbdb` (main de la mise en ligne 1 et les seuls scripts de
  mesure), base `latewinner_simpl_base`.
- **Chantier** : à `4923fcb` pour les saisons et l'adjoint, à `46cbe8a` pour l'équilibrage et le poids, base
  `latewinner_simpl_after`.
- **Six cibles** : la référence est la mesure du 23/11, moteur inchangé depuis.

### 15.1 Six cibles et blessures européennes

`npm run measure:balance -- --seeds=6 --seasons=3` : 67 644 matchs de championnat.

| Cible | Référence (23/11) | Chantier |
|---|---|---|
| Buts par match | 2,66 | 2,66 |
| Nuls | 25,1 % | 25,1 % |
| Victoires à domicile | 43,9 % | 43,8 % |
| Écart 1er − dernier | 52,7 | 52,7 |
| Forme du onze en fin de saison | 31,0 à 75,8 | 31,2 à 74,5 |
| Le plus faible gagne (écart ≥ 1) | 24,1 % | 24,1 % |
| Blessures, Coupe des Lauriers / autres clubs de D1 | 1,28 | 1,29 |
| Blessures, Coupe des Fanions / autres clubs de D1 | 1,23 | 1,23 |
| CPU d'une date de partie 2 (moyenne · médiane) | 184 · 172 ms | 155 · 156 ms |
| Création d'une partie 2 | environ 4 s | 2,9 à 3,5 s |

Toutes les cibles tiennent, sans écart sensible (± 0,02 but, ± 0,5 point). Les blessures européennes restent sous 1,3.
Le CPU ne fait pas mieux par le chantier : c'est une autre journée de mesure, sans régression.

### 15.2 Clubs IA, cinq saisons

`npm run measure:seasons -- --seasons=5` : six saisons d'une partie 2 de la démo, Lyon passif, contrats à l'adjoint.

| | Référence | Chantier |
|---|---|---|
| Effectif des clubs IA, D1 (min · médiane · max) | 24 · 25 · 25 | 24 · 25 · 25 |
| Effectif des clubs IA, D2 (min · médiane · max) | 23 · 25 · 25 | 23 · 25 · 25 |
| Effectifs de clubs IA au-delà de 25 · à 30 (sur 2 167) | 0 · 0 | 0 · 0 |
| Joueurs libres signés par les clubs IA, 6 présaisons | 178, note moyenne 65,9 | 198, note moyenne 66,3 |
| Primes payées par les clubs IA | — | 213,9 M€ |
| Part de la dotation payée en primes, moyenne par saison | — | D1 0,3 à 1,7 %, D2 1,1 à 3,8 % |
| Budget médian D1 au 1er juillet → fin, S2 · S4 | 38,4 → 40,2 · 38,8 → 40,6 M€ | 38,4 → 40,1 · 37,4 → 38,4 M€ |
| Budget médian D2 au 1er juillet → fin, S2 · S4 | 6,3 → 6,4 · 5,8 → 5,8 M€ | 6,0 → 6,1 · 5,6 → 5,9 M€ |
| Effectif de Lyon au 1er juillet, S1 à S6 | 25, 25, 24, 24, 25, 25 | 25, 25, 23, 22, 24, 25 |

- **Effectifs** : la cible tient, de 20 à 25 joueurs comme avant, aucun club IA à 30.
- **Joueurs libres** : 11 % de recrues en plus, de note un peu meilleure. Elles comblent des départs : le plafond n'en
  arrête plus aucune.
- **Primes** :
  - les dotations sont inchangées ; un club IA y prend en moyenne 1 à 4 % ;
  - un club du bas de tableau qui perd beaucoup de joueurs paie jusqu'à 85 % (D1) et 95 % (D2) de la sienne. Il
    reconstruit son effectif, et repart de sa dotation la saison suivante.

### 15.3 Le club dirigé passif

`npm run measure:assistant -- --seasons=3 --lineup=game --contracts=game --sales=game` : jumeaux de Lyon, graine de la
démo, 3 saisons.

**Composition** : jumeau A, `selectLineup` (le meilleur onze, sans repos) ; jumeau B, le onze de l'adjoint du jeu. Les
deux avec les contrats de l'adjoint.

| Moyennes par saison | A | B |
|---|---|---|
| Points par match | 1,79 | 1,80 |
| Rang | 4,7 | 4,3 |
| Blessures (jours) | 7,3 (158 j) | 7,3 (150 j) |
| Titulaires sous 75 au coup d'envoi | 13 % | 1 % |
| Minutes des 21 ans ou moins | 3 526 | 3 853 |

La cible tient : B est au moins aussi bon que A (+0,01 point par match), avec autant de blessures, 8 jours d'absence de
moins et presque plus de titulaires fatigués. Ses jeunes jouent 327 minutes de plus par saison. C'est le résultat de la
référence, où B jouait le même onze reposé, enregistré à la main.

**Contrats** :

| Effectif au 1er juillet, S1 à S4 | Référence | Chantier |
|---|---|---|
| Personne ne décide (le jeu d'avant) | 25, 24, 19, 10 | 25, 24, 19, 10 |
| L'adjoint décide | 25, 25, 24, 24 (option de mesure, `planSquad`) | 25, 25, 23, 22 (la règle du jeu) |

- **L'effectif ne fond plus** : de 22 à 25 joueurs chaque été, contre 10 au troisième été sans personne.
- **Ce que fait l'adjoint** : 1, 3, puis 9 prolongations ; 1, 1, puis 3 départs en fin de contrat ; aucune recrue (jamais
  sous 20 joueurs).

**Club gourmand** : à chaque été, les meilleurs joueurs libres que le budget paie, jusqu'à 30, contre un jumeau passif.

| | Libres signés | Primes | Onze au 1er juillet | Points par match | Rang |
|---|---|---|---|---|---|
| Brentford (D1), référence sous le plafond | 19 | — | +1,9 | +0,06 | −2,3 |
| Brentford (D1), chantier | 11 | 14,8 M€ | +1,5 | +0,06 | −1,7 |
| Ajaccio (D2), référence sous le plafond | 17 | — | +2,8 | +0,20 | −2,7 |
| Ajaccio (D2), chantier | 7 | 4,9 M€ | +2,0 | +0,14 | −2,3 |

Le gain reste réel mais borné : les 30 joueurs et la prime mordent. La prime de 25 % (§ 13, point 1) est gardée.

**Ventes proposées** (le jumeau les accepte toutes) :

| Mercato | Proposées | Offre / valeur | Titulaires ou remplaçants proposés | Effectif avant → après |
|---|---|---|---|---|
| Été S1 (création) | 0 | — | 0 | 25 → 25 |
| Hiver S1 | 3 | 0,94 | 0 | 25 → 22 |
| Été S2 | 0 | — | 0 | 24 → 24 |
| Hiver S2 | 1 | 1,13 | 0 | 24 → 23 |
| Été S3 | 0 | — | 0 | 21 → 21 |
| Hiver S3 | 0 | — | 0 | 21 → 21 |

- **Cible tenue** : de 0 à 3 par mercato, jamais un titulaire, 22 joueurs au moins après une vente.
- **Bilan** : 4 ventes en tout, pour 14,3 M€.
- **Effectif de 21 à l'été S3** : il vient des fins de contrat du passage de saison, pas d'une vente. Il reste au-dessus du
  plancher de l'adjoint (20).

### 15.4 Poids d'une carrière

`npm run measure:weight -- --seasons=3` : une partie 2 de Lyon, chacune seule dans une base vide (`latewinner_simpl_wbase`
pour la référence, `latewinner_simpl_wafter` pour le chantier).

| Mo (compacts · réels) | Création | Après 1 saison | Après 2 saisons | Après 3 saisons |
|---|---|---|---|---|
| Référence | 6,46 · 7,10 | 12,34 · 15,48 | 18,10 · 21,64 | 23,95 · 25,78 |
| Chantier | 6,46 · 7,10 | 12,34 · 16,91 | 18,10 · 21,84 | 23,95 · 25,96 |

- **Données** : identiques, 39 506 lignes après trois saisons contre 39 515. Les six colonnes ne pèsent rien, et aucune
  ligne n'est ajoutée par match.
- **Espace réel** : il diffère de 0,2 Mo sur trois saisons, selon le moment où passe l'autovacuum. La cible tient.

### 15.5 Ce que les contrôles ont trouvé

- **Liste de l'onglet Vendre** (`46cbe8a`, E2E du marché) : en mode adjoint, le onze tenu hors des ventes ignorait la
  règle Jeunesse. Le jeune titularisé y était proposé à la vente, et le titulaire qu'il remplace en était écarté. Ce onze
  est maintenant celui de l'adjoint lui-même, tout l'effectif disponible et frais.
- **Parties de démo de `latewinner_test`** : celles du 6 et du 18/11 dataient d'avant le chantier. Elles sont refaites :
  la CI les construit de zéro, et Vitest comme la suite lente passent sur les nouvelles.
