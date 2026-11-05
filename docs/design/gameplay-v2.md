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
