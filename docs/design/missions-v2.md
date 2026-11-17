# Missions v2 : trois missions par jour, jetons, série, boutique et collection

Cahier rédigé le 17/11/2026 et **validé le même jour**, avec les décisions de la section suivante. Il remplace la mission
du jour unique, en ligne depuis le 17/11 (`58bfa7a`, règle « Mission du jour » de `CLAUDE.md`), qui manque d'intérêt faute
de récompense. Les effets de la boutique sont mesurés sur les vrais effectifs d'une partie à deux divisions de la base de
test (§ 2.5).

## Décisions de la validation (17/11)

1. Barème des gains validé (§ 2.1).
2. Prix et limites de la boutique validés (§ 2.3).
3. Série : les lots exclusifs suivent les cycles accomplis au total. **Protège-série** en boutique : 50 jetons, un seul
   en réserve, il pardonne un jour manqué et se consomme tout seul (§ 2.2).
4. Jeune prometteur : invendable pendant son premier contrat, achetable hors mercato, le joueur choisit sa ligne,
   **compté dans le plafond salarial** : achat refusé avec un message clair si la marge ne suffit pas (§ 2.4).
5. Rallonge de budget : 5 %.
6. La mission difficile reste. À la place d'un remplacement : **« Changer de mission »**, gratuit, une fois par jour et
   par joueur : une des trois missions, au choix, retirée de façon déterministe dans le même palier, jamais une mission
   déjà commencée (§ 1.1).
7. Titres affichés à côté du prénom dans le classement public du défi.
8. Jetons de bienvenue : 10 par mission v1 accomplie, au plus 100, crédités une seule fois (§ 5.3).
9. Nom : jetons / tokens.
10. Boutique dans un onglet « Récompenses » sous Club ; solde de jetons visible sur la carte des missions de l'Accueil.

## Décisions d'Alexis (17/11)

- **3 missions par jour et par joueur** : une facile, une moyenne, une difficile, tirées de façon déterministe du jour et
  du joueur, avec un bonus si les trois sont faites. Toujours aucune mission dans les parties de défi.
- **Jetons** gagnés par les missions, gardés par joueur (pas par partie), qui suivent le joueur à la connexion Google.
  **Ils ne se perdent jamais.**
- **Série** : jours consécutifs avec au moins une mission faite ; bonus au 3e jour, gros lot au 7e (jetons et cosmétique
  exclusif), puis cycle de 7 jours.
- **Boutique**, dans une carrière normale seulement : jeune prometteur, soin express, stage de forme, rallonge de budget.
  Limites par saison et par carrière.
- **Cosmétiques et prestige** : titres de manager, badges d'accomplissement, cadres de la carte de fin de saison (aucun nom
  de club, aucune marque), gagnés par la série, achetés en boutique ou débloqués par des accomplissements.

Ce qui ne change pas : aucune simulation en plus, aucune mission ni boutique dans le défi, le déterminisme (`Save.seed`,
`Save.currentDate`), le moteur pur, les migrations d'ajout uniquement.

---

## 1. Les missions

### 1.1 Règles

- **Un jour** : le jour UTC, comme le défi. Les trois missions du jour sont les mêmes dans toutes les carrières du joueur,
  sauf celles du défi. Chacune avance dans n'importe laquelle d'entre elles ; une mission faite le reste.
- **Tirage** : chaque palier a son flux, `mission:{joueur}:{jour}:{palier}`, et son propre tirage pondéré, comme en v1
  (`dailyMissionKind`) : jamais la mission de la veille dans le même palier. Les trois pools sont disjoints : jamais deux
  fois la même mission le même jour.
- **Vérifiables avec les données existantes**, marquées au moment de l'action (§ 6) : la fin d'un match du club dirigé
  (score, titulaires, simulé ou en direct), une pause du direct (changement, consigne, décision sur un événement),
  l'enregistrement d'une composition.
- **Faisables en une session** : la facile en une ou deux minutes, la moyenne en un match en direct (ou quelques matchs
  simulés), la difficile en deux à quatre matchs en direct pour un club moyen. Un seul match en direct peut faire les
  trois.
- **Changer de mission** (décision 6) : une fois par jour et par joueur, gratuit, sur une des trois missions au choix,
  jamais sur une mission commencée (avancement 0) ni faite. La nouvelle est tirée dans le même palier, d'un flux à elle
  (`mission:{joueur}:{jour}:{palier}:change`), jamais la mission remplacée ni celle de la veille : déterministe, la même
  quoi qu'il arrive. Le changement est gardé avec le jour (§ 5.1).

### 1.2 Pool par palier

Probabilités d'un club moyen (buts attendus 1,31 par équipe, `BASE_GOALS_PER_TEAM`) : marquer 73 %, deux buts ou plus
38 %, aucun but encaissé 27 %, victoire environ 37 %. « Matchs » : combien il en faut en moyenne.

**Facile** (+10 jetons), en simulé comme en direct :

| Mission | Faite quand | Part | Matchs | Nouvelle ? |
|---|---|---|---|---|
| Joue un match | un match du club joué jusqu'au bout | 25 % | 1 | oui (`PLAY_MATCH`) |
| Joue 3 matchs | trois matchs du club, toutes compétitions | 20 % | 3 | v1 (`PLAY_MATCHES`) |
| Marque au moins un but | un match où le club marque | 20 % | 1,4 | oui (`SCORE`) |
| Enregistre ta composition | l'action « Enregistrer » de la composition | 20 % | 0 | oui (`SAVE_LINEUP`) |
| Titularise un joueur de 21 ans ou moins | un titulaire de 21 ans ou moins à la date du match | 15 % | 1 | v1 (`START_YOUTH`) |

**Moyenne** (+20 jetons), 70 % de direct :

| Mission | Faite quand | Part | Matchs |
|---|---|---|---|
| Joue ton prochain match en direct | un match en direct jusqu'au bout, même en accéléré | 25 % | 1 en direct |
| Fais un changement pendant un match en direct | un remplacement du joueur à une pause | 15 % | 1 en direct |
| Change de consigne pendant un match en direct | une consigne du joueur à une pause | 15 % | 1 en direct |
| Décide toi-même d'un événement du direct | une carte d'événement validée par le joueur (`MatchDecision.assistant = false`) ; nouvelle (`LIVE_DECISION`) | 15 % | 1 en direct (chaque match en direct en a au moins un) |
| Gagne un match | une victoire, tirs au but compris | 15 % | 2,7 |
| Garde ta cage inviolée | aucun but encaissé | 15 % | 3,7 |

**Difficile** (+40 jetons), tout en direct :

| Mission | Faite quand | Part | Matchs en direct |
|---|---|---|---|
| Gagne un match en direct | une victoire, tirs au but compris | 35 % | 2,7 (1,8 pour un favori, 5 pour un relégable) |
| Gagne un match en direct en faisant un changement | une victoire avec au moins un remplacement du joueur (`TeamLive.manual`) ; nouvelle (`LIVE_WIN_COACHED`) | 25 % | 2,7 |
| Marque deux buts dans un match en direct | deux buts ou plus ; nouvelle (`LIVE_SCORE_TWO`) | 20 % | 2,6 |
| Garde ta cage inviolée en direct | aucun but encaissé ; nouvelle (`LIVE_CLEAN_SHEET`) | 20 % | 3,7 |

Écartées : « fais une recrue ou une vente » et toute mission du mercato (refusées hors fenêtre, la plupart des jours) ;
« remonte un retard », « gagne de deux buts d'écart » (10 à 15 % des matchs : trop longues pour une session).

### 1.3 Ce que ça change à la v1

Les huit missions de la v1 restent, réparties dans les paliers ; sept nouvelles s'ajoutent (`ALTER TYPE … ADD VALUE`).
La carte de l'Accueil passe de une à trois lignes. Les missions déjà faites en v1 comptent pour la série (§ 5.3).

---

## 2. Économie

### 2.1 Gains

| Source | Jetons | Quand |
|---|---|---|
| Mission facile | 10 | à son accomplissement |
| Mission moyenne | 20 | idem |
| Mission difficile | 40 | idem |
| Les trois du jour | +30 | à la troisième |
| Série, 3e jour du cycle | +50 | à la première mission du jour |
| Série, 7e jour du cycle | +150 et un cosmétique exclusif | idem |

Maximum d'une journée : 100 jetons, 150 un 3e jour de cycle, 250 un 7e.

### 2.2 Règle exacte de la série

- **Un jour compte** quand au moins une des trois missions est faite ce jour UTC, dans une carrière hors défi.
- **La série** est le nombre de jours comptés consécutifs ; elle vit jusqu'à la fin du jour qui suit le dernier jour
  compté. Un jour sans mission la remet à 0 ; le jour compté suivant la remet à 1.
- **Le cycle** : jour du cycle = ((série − 1) modulo 7) + 1. Le bonus tombe quand le jour compté atteint le 3e ou le 7e
  jour du cycle (série 3, 7, 10, 14…), une fois par jour.
- **Les cosmétiques exclusifs** suivent les cycles accomplis, comptés au total et **jamais perdus** : une série cassée
  retarde le lot suivant, n'efface pas ceux gagnés ni le compte des cycles. Proposition de suite : cycle 1 → cadre Bronze,
  2 → titre « Assidu », 3 → cadre Argent, 4 → badge « Un mois », 5 → titre « Increvable », 6 → cadre Or, 7 → badge
  « Sept semaines », 8 → cadre Lauriers d'or. Ensuite, les jetons seuls.
- Les jetons ne se perdent jamais : ni série cassée, ni partie supprimée, ni partie de défi.
- **Protège-série** (décision 3) : 50 jetons, un seul en réserve, acheté une fois pour toutes, au niveau du joueur. Quand
  un jour compté suit un seul jour manqué (le dernier jour compté est l'avant-veille), le protège-série se consomme tout
  seul : le jour manqué est pardonné (gardé comme tel), la série continue (+1 pour le jour compté) et le cycle avec elle.
  Deux jours manqués ou plus : la série repart à 1 et le protège-série reste en réserve. Tant qu'il est en réserve, une
  série dont le dernier jour compté est l'avant-veille reste affichée vivante (« Ton protège-série la gardera »).

### 2.3 Boutique et limites

Articles de carrière, achetés dans une carrière normale, jamais dans le défi ni pendant une pause du direct. « Saison » :
la saison en cours de la carrière, remise à zéro à `advanceToNextSeason`.

| Article | Prix | Effet | Par saison | Par carrière |
|---|---|---|---|---|
| Stage de forme | 40 | toute l'équipe à 100 de condition, tout de suite (avant le prochain match) | 5, une fois par date | — |
| Soin express | 60 | un blessé du club : les jours restants divisés par deux, arrondi au-dessus (4 jours restants au moins) | 3 | — |
| Rallonge de budget | 200 | +5 % de la dotation de la saison (`SeasonBudget`), au moins 100 000 €, au budget transferts | 1 | — |
| Jeune prometteur | 350 | un joueur de 17 ans rejoint le club (§ 2.4) | 1 | 3 |

Au niveau du joueur, hors carrière : **protège-série** 50 (un seul en réserve, § 2.2) ; cosmétiques (§ 3) : titres 250
jetons, cadres 400. Toute la boutique s'ouvre depuis une carrière normale ; rien dans une partie de défi.

### 2.4 Le jeune prometteur

- Généré comme les jeunes de présaison (`generateYouthPlayer`), mais au sommet de la plage de sa division plus 3 (63 en
  D1, 58 en D2) et avec un écart de potentiel de 25 à 30 (88 à 93 en D1, 83 à 88 en D2), à 17 ans. Le joueur choisit sa
  ligne : gardien, défense, milieu ou attaque.
- **Déterministe** : flux `shop-youth:{Save.seed}:{n}`, n le rang de l'achat dans la carrière ; clé `shop-{saison}-{n}`. Les
  mêmes achats donnent les mêmes jeunes.
- Contrat de 3 saisons au salaire des jeunes (100 à 210 k€), **compté dans le plafond salarial** (décision 4) : si la
  masse salariale plus son salaire dépasse le plafond, l'achat est refusé avant tout débit, avec le salaire et ce qui
  manque (« Son salaire, 210 k€, dépasse ta marge de 120 k€ : vends ou libère un joueur, ou attends la saison prochaine »).
- **Invendable et non libérable pendant ce premier contrat** : sinon la boutique changerait des jetons en euros (il vaut
  6 M€ en D1, 2,4 M€ en D2, trois fois une rallonge).
- Hors mercato aussi : c'est un jeune du centre de formation, pas un transfert (aucune ligne `Transfer`).

### 2.5 Effet mesuré sur l'équilibrage

**Méthode.** Les points attendus du moteur (`expectedPoints` : buts attendus, loi de Poisson, meilleur dispositif et sa
composition automatique) sur les vrais effectifs d'une partie à deux divisions de la base de test, en lecture seule, face
à l'adversaire moyen de la division. Pour situer : en championnat de France à 18 clubs (34 matchs), **deux rangs voisins
sont séparés de 2,15 points en moyenne en D1** (3,0 au milieu du classement) **et de 1,86 en D2** (1,5 au milieu).

| Article | Effet par usage | Mesure (club fort, moyen, faible) |
|---|---|---|
| Stage de forme | titulaires de champ à 85 (match en semaine, trois jours après un match complet) remis à 100 | D1 +0,077, +0,084, +0,055 point sur le match ; D2 +0,076, +0,087, +0,071 |
| Soin express | le meilleur titulaire de champ de retour ; une blessure moyenne (7 à 42 jours, 24,5) raccourcie de 12 jours, environ 2 matchs | D1 +0,022, +0,080, +0,030 point par match ; D2 +0,035, +0,147, +0,014 |
| Rallonge (+5 %) | 7,5 M€ (Marseille), 1,85 M€ (Auxerre), 0,25 M€ (Troyes) : un joueur de 26 ans de 68, 60 ou 47 de note | aucun ne serait titulaire : 0 ; seulement un appoint sur un achat plus gros |
| Jeune prometteur | D1 : 63, potentiel 91 → 66,5, 71,2, 77,4, 81,5 après 1 à 4 saisons (300, 900, 2 250 minutes) ; D2 : 58 → 72,4 après 3 saisons | une fois formé : +0,02 à +0,04 point par match, environ +1 point par saison |

**Au maximum des limites** : environ +1 point la première saison (5 stages : 0,4 ; 3 soins : 0,1 à 0,9 selon le blessé ;
rallonge : 0,1 à 0,3, estimé), soit un demi-rang en D1. Jusqu'à +4 points vers la sixième saison, une fois les trois jeunes formés, soit 1,5 à
2 rangs.

**Les objectifs restent crédibles** : celui de classement suit le rang de réputation, qui suit les résultats (un quart du
chemin chaque saison) : un club rendu plus fort par la boutique se voit fixer plus haut. Coupe, Spectacle et Solidité
bougent à peine ; Bonne gestion n'est pas touchée (ni rallonge ni jeune ne sont des transferts, et le jeune est
invendable). Seule Jeunesse devient plus facile avec un jeune de 63 dans un club faible. À vérifier après la mise en
ligne avec /admin (§ 7).

### 2.6 Une semaine selon l'assiduité

Sept jours d'affilée (un cycle complet : +50 et +150), sauf le profil D.

| Profil | Par jour | Missions | Les trois | Série | **Semaine** | Mois (4 semaines) |
|---|---|---|---|---|---|---|
| A | 1 mission (la facile) | 70 | 0 | 200 | **270** | 1 080 |
| B | 2 missions (facile, moyenne) | 210 | 0 | 200 | **410** | 1 640 |
| C | les 3 | 490 | 210 | 200 | **900** | 3 600 |
| D | 2 missions, 4 jours sur 7 | 120 | 0 | 50 | **170** | 680 |

Ce qu'une saison permet d'acheter au maximum : 5 stages (200), 3 soins (180), la rallonge (200) et un jeune (350), soit
**930 jetons**.

| Profil | Ce qu'il achète en un mois |
|---|---|
| A | tout le contenu d'une saison (930), puis un titre tous les deux mois |
| B | une saison complète, et un cadre ou deux titres |
| C | deux saisons complètes s'il en joue deux, et le reste du catalogue de cosmétiques (2 600) en deux mois |
| D | un jeune, une rallonge et quelques stages |

La série pèse 74 % des gains du profil A : revenir chaque jour paie plus que tout faire un seul jour, ce qui est le but.

---

## 3. Cosmétiques

Tous affichés sans nom de club ni marque ; identifiants dans un catalogue du code (`src/lib/cosmetics.ts`), jamais
renommés. Le joueur en équipe un de chaque sorte : un titre, un badge mis en avant et un cadre.

### 3.1 Titres de manager

Affichés sur la pastille du manager (Club), sous la saison de la carte de fin de saison, et dans le classement public du
défi à côté du prénom (décision 7 ; comptes Google, seuls classés).

| Titre (FR / EN) | Obtention |
|---|---|
| Novice / Rookie | par défaut |
| Assidu / Regular | série : 2e cycle accompli |
| Increvable / Relentless | série : 5e cycle accompli |
| Maître du direct / Live master | 50 matchs joués en direct jusqu'au bout |
| Tacticien / Tactician | 25 missions de consigne ou de changement en direct |
| Formateur / Youth coach | 30 missions « Titularise un joueur de 21 ans ou moins » |
| Champion / Champion | un titre de champion de D1 |
| Roi de coupe / Cup king | une coupe nationale gagnée |
| Le Professeur / The Professor | boutique, 250 |
| Le Stratège / The Strategist | boutique, 250 |
| L'Insubmersible / The Unsinkable | boutique, 250 |
| Le Bâtisseur / The Builder | boutique, 250 |

### 3.2 Badges d'accomplissement

Jamais en vente ; tous dans la collection, un mis en avant.

| Badge | Obtention |
|---|---|
| Première mission | une mission faite |
| Journée parfaite | les trois missions d'un jour |
| Centurion | 100 missions faites |
| Une semaine | série : 1er cycle |
| Un mois | série : 4e cycle |
| Sept semaines | série : 7e cycle |
| En direct | un premier match en direct jusqu'au bout |
| Dix en direct | 10 victoires en direct |
| Muraille | 10 missions de cage inviolée |
| Champion de D1 · Champion de D2 · Promu · Coupe · Doublé | palmarès d'une saison terminée (`SeasonResult`) |
| Feuille de route | les trois objectifs d'une saison atteints ou dépassés |
| Podium du défi | top 10 du défi de la semaine (compte Google) |

### 3.3 Cadres de la carte de fin de saison

Une bordure et un ornement en SVG autour de la carte PNG (1200 × 630 et 1080 × 1080), sans texte ajouté. Le cadre fait
partie de l'adresse de la carte (`&frame=`), pour que le cache garde une image par cadre (§ 6).

| Cadre | Obtention |
|---|---|
| Nuit (bleu nuit, l'actuel) | par défaut |
| Bronze | série : 1er cycle |
| Argent | série : 3e cycle |
| Or | série : 6e cycle |
| Lauriers d'or | série : 8e cycle |
| Lauriers | un titre de champion (D1 ou D2) |
| Étoile double | un doublé |
| Néon | boutique, 400 |
| Damier | boutique, 400 |
| Aurore | boutique, 400 |
| Rayures | boutique, 400 |

Catalogue en vente : 4 titres (1 000) et 4 cadres (1 600), **2 600 jetons**.

---

## 4. Écrans

| Où | Quoi |
|---|---|
| Accueil, sous le héros | la carte « Missions du jour » : trois missions, la série et son cycle, le solde de jetons |
| Carte « À demain » | missions faites aujourd'hui, jetons gagnés, ce qui reste, le prochain lot de série |
| Club, nouvel onglet « Récompenses » | jetons et journal, série et lots, boutique de la carrière, cosmétiques en vente, collection |
| Fiche d'un blessé du club | raccourci « Soin express · 60 » (limite restante) |
| Composition, condition basse | raccourci « Stage de forme · 40 » |
| Partie de défi | ni carte de missions ni boutique ; l'onglet Récompenses montre jetons et collection, et dit pourquoi pas de boutique |

Une seule action orange pleine par écran : l'Accueil garde « Jouer le match » ; dans Récompenses, l'orange n'apparaît
qu'à la confirmation d'un achat. Les icônes sont en SVG (lucide), jamais des emoji. Les maquettes ci-dessous notent les
icônes entre crochets.

### 4.1 Accueil, 390 px

```
┌──────────────────────────────────────────┐
│ MISSIONS DU JOUR        [flamme] 3 jours │
│                         [jeton] 340      │
│                                          │
│ [✓] FACILE · +10                   1/1   │
│     Joue un match                        │
│ [ ] MOYENNE · +20                  0/1   │
│     Fais un changement en direct         │
│     À la mi-temps, ouvre Coaching.       │
│ [ ] DIFFICILE · +40                0/1   │
│     Gagne un match en direct             │
│ ──────────────────────────────────────── │
│ Les trois : +30                 ● ○ ○    │
│ Série  ● ● ● ○ ○ ○ ○                     │
│        1 2 3 4 5 6 7                     │
│        J3 +50 gagné · J7 : +150 et cadre │
│        Bronze                            │
└──────────────────────────────────────────┘
```

Toutes faites : « Les trois : +30 gagnés », puis « Demain : trois nouvelles missions ». Série cassée : « Ta dernière série a
duré 5 jours. Une mission aujourd'hui en lance une nouvelle. »

### 4.2 Carte « À demain », 390 px

```
┌──────────────────────────────────────────┐
│ À DEMAIN                                 │
│ Ton prochain match : contre …            │
│ ──────────────────────────────────────── │
│ [jeton] +30 aujourd'hui · solde 370      │
│ Missions 2/3 · reste : Gagne un match    │
│ en direct (+40)                          │
│ [flamme] 3 jours d'affilée · J3 +50 gagné│
└──────────────────────────────────────────┘
```

### 4.3 Club → Récompenses, 390 px

```
 [Club] [Défi] [Palmarès] [Récompenses]

┌──────────────────────────────────────────┐
│ TES JETONS                          370  │
│ +40  Gagne un match en direct   auj.     │
│ +30  Les trois missions         auj.     │
│ −60  Soin express               hier     │
│ Tout le journal ›                        │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│ BOUTIQUE · SAISON 2027-28                │
│ Stage de forme                  40       │
│ Toute l'équipe à 100 de condition.       │
│ 4 sur 5 cette saison           [Acheter] │
│ ──────────────────────────────────────── │
│ Soin express                    60       │
│ Un blessé revient deux fois plus vite.   │
│ 3 sur 3 cette saison           [Acheter] │
│ ──────────────────────────────────────── │
│ Rallonge de budget             200       │
│ +1,9 M€ au budget transferts.            │
│ 1 sur 1 cette saison           [Acheter] │
│ ──────────────────────────────────────── │
│ Jeune prometteur               350       │
│ Un joueur de 17 ans, note 63, potentiel  │
│ élevé, invendable trois saisons.         │
│ 1 sur 1 · 2 sur 3 dans la carrière       │
│                                [Acheter] │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│ COLLECTION                               │
│ [Titres] [Badges] [Cadres]               │
│ Le Tacticien                 [Équiper]   │
│ Assidu                       équipé      │
│ Le Professeur · 250        [Acheter]     │
│ Increvable · série, 5e cycle [cadenas]   │
└──────────────────────────────────────────┘
```

Confirmation d'un achat, feuille depuis le bas : le prix, ce qu'il fait, le solde après, et « Confirmer · 350 »
(orange). Pour le jeune : le choix de sa ligne avant de confirmer.

---

## 5. Données

Migrations d'ajout uniquement. Aucune colonne sur `PlayerSave` (table chaude, `fillfactor` 50).

### 5.1 Missions

```sql
-- Les sept nouvelles missions (le type existant s'étend)
ALTER TYPE "MissionKind" ADD VALUE 'PLAY_MATCH';
ALTER TYPE "MissionKind" ADD VALUE 'SCORE';
ALTER TYPE "MissionKind" ADD VALUE 'SAVE_LINEUP';
ALTER TYPE "MissionKind" ADD VALUE 'LIVE_DECISION';
ALTER TYPE "MissionKind" ADD VALUE 'LIVE_WIN_COACHED';
ALTER TYPE "MissionKind" ADD VALUE 'LIVE_SCORE_TWO';
ALTER TYPE "MissionKind" ADD VALUE 'LIVE_CLEAN_SHEET';
CREATE TYPE "MissionTier" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- Une mission d'un palier d'un jour
CREATE TABLE "MissionTask" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "day" DATE NOT NULL,
  "tier" "MissionTier" NOT NULL,
  "kind" "MissionKind" NOT NULL,
  "target" INTEGER NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "changedFrom" "MissionKind",            -- la mission remplacée par « Changer de mission »
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  PRIMARY KEY ("userId", "day", "tier")
);
CREATE INDEX "MissionTask_day_idx" ON "MissionTask"("day");

-- Le jour d'un joueur : ce qu'il a fait, et la série qu'il fait
CREATE TABLE "MissionDay" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "day" DATE NOT NULL,
  "done" INTEGER NOT NULL DEFAULT 0,      -- missions faites, 0 à 3
  "countedAt" TIMESTAMP(3),               -- la première : le jour compte pour la série
  "allDoneAt" TIMESTAMP(3),               -- la troisième
  "streak" INTEGER,                       -- jours d'affilée, celui-ci compris
  "best" INTEGER,                         -- record du joueur
  "cycles" INTEGER,                       -- cycles de 7 jours accomplis, au total
  "changedAt" TIMESTAMP(3),               -- « Changer de mission » utilisé ce jour
  "shieldedAt" TIMESTAMP(3),              -- jour manqué pardonné par le protège-série
  PRIMARY KEY ("userId", "day")
);
CREATE INDEX "MissionDay_day_idx" ON "MissionDay"("day");
```

### 5.2 Jetons, boutique, cosmétiques

```sql
-- Le solde, tenu dans la même transaction que chaque écriture du journal
ALTER TABLE "User" ADD COLUMN "tokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD CONSTRAINT "User_tokens_not_negative" CHECK ("tokens" >= 0);
-- Les cosmétiques équipés, le protège-série en réserve, et les compteurs des accomplissements
ALTER TABLE "User" ADD COLUMN "title" TEXT, ADD COLUMN "badge" TEXT, ADD COLUMN "frame" TEXT;
ALTER TABLE "User" ADD COLUMN "streakShield" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "liveMatches" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "liveWins" INTEGER NOT NULL DEFAULT 0;

-- Le journal : chaque jeton gagné ou dépensé, une ligne, une clé unique par joueur
CREATE TYPE "TokenReason" AS ENUM ('MISSION', 'ALL_THREE', 'STREAK', 'WELCOME', 'PURCHASE');
CREATE TYPE "ShopItem" AS ENUM ('FITNESS_CAMP', 'EXPRESS_CARE', 'BUDGET_TOP_UP', 'PROMISING_YOUTH', 'STREAK_SHIELD', 'COSMETIC');
CREATE TABLE "TokenEntry" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "key" TEXT NOT NULL,                    -- « mission:2026-11-18:HARD », « streak:2026-11-18 », « purchase:<uuid> »
  "reason" "TokenReason" NOT NULL,
  "amount" INTEGER NOT NULL,              -- gain positif, dépense négative
  "day" DATE,                             -- le jour UTC d'une mission ou d'un bonus
  "saveId" TEXT REFERENCES "Save"("id") ON DELETE SET NULL,  -- la carrière d'un achat
  "item" "ShopItem",                      -- l'article d'un achat
  "cosmetic" TEXT,                        -- le cosmétique acheté
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId", "key")
);
CREATE INDEX "TokenEntry_createdAt_idx" ON "TokenEntry"("createdAt");

-- Les achats d'une carrière, pour ses limites et ce qu'ils ont fait
CREATE TABLE "ShopPurchase" (
  "id" TEXT PRIMARY KEY,                  -- l'identifiant de la demande, venu du navigateur : un double envoi bute dessus
  "saveId" TEXT NOT NULL REFERENCES "Save"("id") ON DELETE CASCADE,
  "item" "ShopItem" NOT NULL,
  "seasonStartYear" INTEGER NOT NULL,
  "price" INTEGER NOT NULL,
  "effect" JSONB NOT NULL,                -- le joueur, les jours, le montant ; validé par Zod à la lecture
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ShopPurchase_saveId_item_seasonStartYear_idx" ON "ShopPurchase"("saveId", "item", "seasonStartYear");

-- Ce que le joueur possède ; le catalogue est dans le code
CREATE TYPE "CosmeticSource" AS ENUM ('STREAK', 'SHOP', 'ACHIEVEMENT');
CREATE TABLE "PlayerCosmetic" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "cosmetic" TEXT NOT NULL,
  "source" "CosmeticSource" NOT NULL,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "cosmetic")
);
```

`ShopPurchase` est une table de partie : toujours lue par `saveId`, après `requireOwnedSave`. Le jeune invendable se lit
dans ses achats (`effect.playerKey`, saison d'achat + 3) par `sellPlayer` et `releasePlayer`, une requête de plus sur ces
deux actions seulement.

### 5.3 Passer de la v1 à la v2 sans perdre l'historique

La clé `(userId, day)` de `DailyMission` ne peut pas porter trois missions, et la changer ne serait pas un ajout.
**Proposition :** `DailyMission` reste telle quelle, jamais modifiée ni supprimée, comme historique de la v1. La v2 écrit
dans `MissionDay` et `MissionTask` à partir du jour de sa mise en ligne.

- **La série et le record** à la jonction : la première mission v2 d'un joueur cherche son dernier jour compté dans
  `MissionDay`, sinon dans `DailyMission` (une mission v1 accomplie compte comme un jour compté). La série v1 se poursuit et
  le record est repris dans `MissionDay.best`. Passé le premier jour, `MissionDay` suffit.
- **/admin** lit `DailyMission` pour les jours d'avant la bascule et les nouvelles tables ensuite.
- **Jetons de bienvenue** (décision 8) : à la première vue des missions v2, 10 jetons par mission v1 accomplie
  (`DailyMission.completedAt`), au plus 100, une seule fois (clé `welcome-v1` du journal, écrite même à 0 pour ne plus
  recompter).
- **Variante écartée** : recopier la v1 dans les nouvelles tables par la migration. Des missions écrites par l'ancien code
  pendant le déploiement (Vercel migre avant de servir le nouveau) seraient perdues.

### 5.4 Crédit unique, côté serveur

- Aucun montant ne vient du navigateur. Les gains sont écrits par le serveur, après la transaction du pas (§ 6) ; les
  dépenses par la Server Action d'achat.
- **Chaque écriture du journal a sa clé** : `mission:{jour}:{palier}`, `all-three:{jour}`, `streak:{jour}`,
  `purchase:{id}`. Elle est insérée avec `ON CONFLICT ("userId", "key") DO NOTHING RETURNING`, et le solde n'est mis à jour
  que si la ligne est neuve, dans la même transaction. Deux onglets, deux clics ou un nouvel essai ne créditent qu'une
  fois.
- **Un achat** se fait en une transaction : carrière verrouillée (`lockSave`), joueur verrouillé (`SELECT … FOR UPDATE`),
  limites comptées, conditions vérifiées (un blessé, aucune pause du direct, saison en cours), puis l'achat (clé =
  l'identifiant de la demande), le débit et l'effet. Un double envoi bute sur la clé et renvoie le premier résultat. Le
  solde ne peut pas passer sous 0 (`CHECK`).
- **Contrôle** : la somme du journal de chaque joueur égale son solde ; /admin le vérifie (§ 7).

### 5.5 Fusion à la connexion Google

Dans la transaction de la connexion (`moveHistory`) :

| Quoi | Règle |
|---|---|
| Jetons | toutes les lignes du journal de l'anonyme passent au compte, leur clé préfixée `merge:{anonyme}:` ; le solde du compte reçoit celui de l'anonyme. Rien ne se perd, rien ne se recrédite. |
| Missions | `MissionTask` et `MissionDay` passent au compte. Un jour que les deux ont garde celui qui a le plus de missions faites ; puis les séries, les records et les cycles sont refaits jour après jour, comme `moveMissions` en v1, sans bonus rétroactif. |
| Cosmétiques | l'union des deux collections ; les cosmétiques équipés du compte restent, sinon ceux de l'anonyme. |
| Protège-série | en réserve si l'un des deux en avait un (un seul au plus). |
| Compteurs | additionnés. |
| Achats | ils suivent leurs carrières, qui suivent déjà le joueur. |

---

## 6. Coût CPU Vercel

Aucune simulation en plus, aucun match rejoué.

| Moment | Coût |
|---|---|
| Fin d'un match du club, pause du direct, enregistrement d'une composition | la requête de contexte de la v1, qui lit désormais les trois missions du jour (une requête), et rien d'écrit si le pas n'avance aucune mission |
| Une mission faite | une courte transaction : la mission, le jour, le journal et le solde ; au plus 3 par jour et par joueur, 5 avec les bonus |
| Accueil | une requête (missions, jour, solde), plus une écriture à la première vue du jour |
| Achat | une transaction à la demande du joueur ; le jeune est généré par une fonction pure, sans simulation |
| Accomplissements | à l'écriture qui les fait (fin de match, passage de saison), après la transaction ; `INSERT … ON CONFLICT DO NOTHING` |
| Carte de fin de saison | environ 440 ms de dessin par carte : le cadre est dans l'adresse, donc un dessin de plus par cadre choisi, gardé 30 jours |

Volume : 3 lignes de mission et au plus 5 lignes de journal par joueur actif et par jour.

---

## 7. Risques et surveillance

| Risque | Parade | Ce que /admin montre |
|---|---|---|
| Inflation : des soldes qui montent sans fin | les limites de saison bornent la boutique ; le catalogue de cosmétiques (2 600) sert de puits ; de nouveaux cosmétiques peuvent s'ajouter | jetons émis par jour (par source) et dépensés (par article), solde médian, 90e centile et maximum, part des émis qui sont dépensés |
| Jetons changés en euros | jeune invendable trois saisons ; rallonge plafonnée à 5 %, une par saison | ventes refusées pour ce motif |
| Doubles gains | clé unique du journal, crédit côté serveur, transaction | contrôle somme du journal = soldes, alerte en cas d'écart |
| Multiplier les carrières pour la boutique | les missions sont par joueur, pas par carrière ; les jetons restent la limite ; 1 carrière sans compte, 3 avec | achats par joueur et par carrière ; carrières qui touchent les limites |
| Missions faciles sans effort (simulation en un clic) | voulu pour la facile ; la moyenne et la difficile demandent le direct | taux de réussite par palier et par mission |
| Difficile hors de portée d'un club faible (5 matchs pour une victoire en direct) | la mission vaut pour toutes les carrières du joueur ; variante à décider (§ 9) | réussite de la difficile selon le rang de réputation du club |
| Équilibre : objectifs trop faciles avec la boutique | effets mesurés (§ 2.5) ; la réputation relève les objectifs | objectifs atteints dans les saisons avec et sans achats ; achats par article et par saison |
| Défi faussé | ni mission, ni boutique, ni effet de jeu dans une partie de défi ; les cosmétiques n'agissent sur rien | — |
| Déterminisme | les achats sont des choix du joueur, comme un transfert ; le jeune vient de la graine de la carrière | — |
| Jetons d'un anonyme perdus | même sort que ses carrières : purge après 30 jours sans visite ; Google ou lien de reprise les gardent | jetons partis avec les purges |

La section /admin « Missions et jetons » remplace celle de la v1 : missions proposées et faites par palier et par mission,
journées parfaites, séries en cours par longueur et cycles accomplis ; jetons émis et dépensés, soldes et contrôle du
journal ; achats par article ; objectifs avec et sans achats.

---

## 8. Ordre de construction et tests

1. Pool à trois paliers, `MissionTask` et `MissionDay`, carte de l'Accueil, et la jonction avec la v1, sans jetons. Tests
   purs du tirage (parts, pools disjoints, jamais la mission de la veille) et tests en base.
2. Journal, solde, gains et série avec ses bonus ; fusion Google. Tests du crédit unique : deux crédits simultanés, un
   nouvel essai, deux onglets.
3. Boutique de carrière avec ses limites, le jeune invendable et les raccourcis. Tests du déterminisme (mêmes achats, mêmes
   jeunes) et des refus.
4. Cosmétiques : catalogue, collection, cadres de la carte (`SEASON_CARD_VERSION` augmentée), titres.
5. /admin, Nouveautés, guide, confidentialité (journal des jetons, collection), CLAUDE.md. E2E à 390 et 1280 px,
   FR et EN.

Chaque étape est en ligne seule, comme les compteurs de la v1.

---

## 9. Points tranchés

Tous, à la validation du 17/11 : voir « Décisions de la validation » en tête du cahier. Le cahier vaut référence pour
le chantier « missions v2 » ; ce qui s'en écarte en le codant y est noté.
