---
name: moteur-de-match
description: À utiliser pour écrire ou modifier la simulation de match, la progression des joueurs, l'IA des clubs, ou tout code sous src/engine/. Couvre le déterminisme, la structure des fonctions pures et les tests attendus.
---

# Moteur de simulation

## Principe

Le moteur est une bibliothèque de fonctions pures. Aucune n'accède à Prisma, au réseau, à l'horloge
système ou à `Math.random()`. Une fonction reçoit un état, retourne un résultat, et ne fait rien d'autre.

```ts
// bon
export function simulateMatch(home: TeamState, away: TeamState, rng: Rng): MatchResult

// mauvais : accède à la base, non testable, non rejouable
export async function simulateMatch(fixtureId: string): Promise<void>
```

## Aléatoire

Un seul générateur, à graine, injecté en paramètre. Jamais de source d'aléatoire globale.

```ts
// src/lib/rng.ts
import seedrandom from "seedrandom";
export type Rng = () => number;
export const makeRng = (seed: string): Rng => seedrandom(seed);
```

La graine d'un match se dérive de la partie et de clés stables du match (saison, journée, slugs des
clubs), jamais d'un compteur global ni de `Fixture.id` : c'est un cuid, différent d'une base à l'autre.

```ts
const rng = makeRng(matchRngSeed(save.seed, season.startYear, fixture.round, homeSlug, awaySlug));
```

Même règle pour les joueurs dans le moteur : ils sont identifiés par `PlayerSave.playerKey`
(`slug du club initial#squadSlot`, ou `youth:année:club:rang` pour un jeune arrivé en cours de partie),
pas par `PlayerSave.id`, pour qu'une égalité de note se départage de la même façon partout.

Conséquence : rejouer une journée donne le même résultat. Si ce n'est pas le cas, c'est qu'une source
d'aléatoire ou de temps s'est glissée dans le moteur — cherche-la avant toute autre hypothèse.

## Modèle de match

Ne pas simuler 90 minutes action par action au début. Partir d'un modèle simple et vérifiable :

1. Calculer une force d'attaque et de défense par équipe à partir des attributs des onze titulaires,
   pondérée par la ligne du slot occupé, la familiarité au slot, la forme et le moral (voir plus bas).
2. En déduire un nombre d'occasions attendu pour chaque équipe (avantage du terrain inclus).
3. Tirer les buts depuis une loi de Poisson avec ce paramètre.
4. Attribuer buteurs et passeurs par tirage pondéré sur les attributs offensifs des joueurs sur le terrain.
5. Générer les événements (cartons, blessures) avec des probabilités faibles et documentées.

## Deux périodes et mi-temps

Un match se joue en deux appels de `simulateHalf(state, rng, period)` (`match.ts`) : `h1` de 1' à 45', `h2` de 46'
au coup de sifflet (les arrêts de jeu, 0 à 5 minutes, ne suivent que la seconde période). Chaque période tire la
moitié des buts, cartons et blessures attendus, avec sa propre graine : `halfRngSeed(matchRngSeed(...), "h1" | "h2")`.
La force est recalculée au début de chaque période sur les joueurs présents, la ligne étant partagée entre les slots
du dispositif, vides compris : une équipe à 10 est plus faible.

- `MatchState` (données pures, stockées telles quelles dans `Fixture.liveState`) : phase, score, événements,
  apparitions closes, blessures, et par équipe le dispositif, les slots (`ON`, `INJURED`, `SENT_OFF`), le banc,
  les remplacements faits (`MAX_SUBSTITUTIONS` = 5 par match) et les avertis.
- En première période, un blessé laisse son slot vide jusqu'à la pause ; en seconde, il est remplacé aussitôt tant
  qu'il reste des changements. Les remplacements tactiques (3 prévus, 55'–85') n'ont lieu qu'en seconde période.
  Un exclu n'est jamais remplacé et son slot reste vide, quel que soit le dispositif.
- Mi-temps : `automaticHalfTimeChoice` (clubs IA, simulation rapide, club dirigé sans choix) remplace seulement les
  blessés, par le meilleur `ratingAt` au slot. `applyHalfTimeChoice` valide et applique un choix (dispositif, joueur
  par slot, remplacements datés de 46', sortants clos à 45') et lève `HalfTimeChoiceError` sinon.
- `simulateMatch(home, away, matchSeed, formations?)` = h1, mi-temps automatique des deux côtés, h2. Le club dirigé
  joue h1 dans `playNextMatchday(saveId, { pauseManagedMatch: true })` puis h2 dans `resumeLiveMatch` : sans
  changement, le résultat est identique à un match joué d'une traite.

**Événements persistés.** `eventsToPersist(events, involvesManagedClub)` (`match.ts`) : tous les événements pour un
match du club dirigé, seulement les buts (avec leur passeur) pour les autres (`OTHER_MATCH_EVENT_TYPES`, `balance.ts`),
seuls lus à l'écran (scores des autres matchs pendant le direct). Le filtre s'applique à l'écriture
(`recordFinishedMatches`), après les stats de saison, la forme et les blessures, calculées sur le match complet en
mémoire : il ne change ni tirage ni score. Une saison passe de 23 600 à 5 800 lignes de `MatchEvent` par partie.

Au découpage, sur 10 000 matchs : 2,85 → 2,84 buts par match, 45,7 → 46,1 % de victoires à domicile, Bayern-Monza
82,9 % inchangé.

## Postes, familiarité et composition

Un joueur a un poste précis (12 valeurs, `src/engine/positions.ts`) et `positionGroup(position)` donne sa
ligne : GK, DF (RB, CB, LB), MF (CDM, CM, CAM, RM, LM), FW (RW, LW, ST).

**Familiarité.** `ratingAt(player, slot) = overall × familiarity(player.position, slot, postes secondaires)`,
fonction pure, non arrondie (`player.id` est la `playerKey`, d'où viennent les postes secondaires). Hors poste
principal et secondaire, le facteur vient de `GROUP_FAMILIARITY` (`balance.ts`), table explicite par ligne du
joueur et ligne du slot :

| Joueur ↓ / slot →            | GK  | DF   | MF   | FW   |
| ---------------------------- | --- | ---- | ---- | ---- |
| GK                           | 1   | 0,4  | 0,4  | 0,4  |
| DF                           | 0,4 | 0,92 | 0,8  | 0,6  |
| MF                           | 0,4 | 0,8  | 0,92 | 0,8  |
| FW                           | 0,4 | 0,6  | 0,8  | 0,92 |
| poste secondaire (toute ligne) | –   | 0,97 | 0,97 | 0,97 |

Même poste : 1 (`SAME_POSITION_FAMILIARITY`), qui l'emporte sur la diagonale ; poste secondaire : 0,97
(`SECONDARY_POSITION_FAMILIARITY`), qui l'emporte sur la table, même vers une autre ligne (un DC dont un poste
secondaire est MDC y vaut 0,97, pas 0,8) ; autre poste de la même ligne : 0,92 ; ligne voisine : 0,8 ; ligne
opposée (défense ↔ attaque) : 0,6 ; gardien hors des buts ou joueur de champ dans les buts : 0,4. La table est
symétrique ; `positions.test.ts` en couvre chaque case.

**Postes secondaires.** `secondaryPositions(playerKey, primary)` (`positions.ts`), pure, rien en base : 0, 1 ou 2
postes (25 / 55 / 20 %, `SECONDARY_POSITION_COUNT_WEIGHTS`), graine `secondary:playerKey`, tirés parmi les voisins
plausibles du poste principal (`SECONDARY_POSITION_NEIGHBOURS`, `balance.ts`), le second parmi les voisins restants.
Un gardien n'en a jamais. Un joueur a donc les mêmes postes secondaires dans toutes les parties. Ils profitent à
`selectLineup`, `resolveLineup`, aux remplacements et à `teamStrength` (via `playerFamiliarity`) ; l'IA des clubs
(`planSquad`) compte toujours ses rôles sur le poste principal seul. Toucher à la table ou au facteur déplace la
calibration : sur 10 000 matchs, 2,81 → 2,85 buts par match et Bayern-Monza 78,6 → 82,9 % à leur introduction.

**Composition.** `selectLineup(squad, formation = DEFAULT_FORMATION)` (`src/engine/lineup.ts`) : un dispositif
est une liste de 11 slots (`Position`), par défaut le 4-3-3 GK, RB, CB, CB, LB, CDM, CM, CM, RW, ST, LW.
Affectation gloutonne : pour chaque slot dans l'ordre, le meilleur `ratingAt` parmi les disponibles, blessés
exclus, égalités départagées par `playerKey`. Un DD à 70 passe donc devant un DC à 74 (68,08) au slot RB.
Banc : le gardien remplaçant d'abord, puis les meilleures notes.

**Dispositifs et composition enregistrée.** `src/engine/formations.ts` : 7 dispositifs (`FORMATION_NAMES`), chacun
11 slots ordonnés avec leur `Position` et leurs coordonnées (x, y en %, attaque vers le haut). Une partie stocke
la composition par **index de slot** : ne jamais réordonner les slots d'un dispositif (le 4-3-3 garde l'ordre
historique, celui des clubs IA). Le club dirigé a `ClubSave.formation` et `ClubSave.lineup`
(`{ starters: [{ slot, playerKey }], benchOrder }`, validé par Zod dans `src/db/lineup.ts`, en lecture comme en
écriture). `resolveLineup(formation, saved, squad)` part de la composition enregistrée : un slot dont le joueur
est blessé, absent de l'effectif ou déjà titulaire plus tôt est recomplété par l'affectation gloutonne ; sans
composition, c'est `selectLineup` dans le dispositif. `playNextMatchday` l'utilise pour le club dirigé ; les
clubs IA restent en 4-3-3 automatique. `changeFormation` réaffecte un onze d'un dispositif à l'autre (même
poste, puis même ligne, puis automatique).

**Le moteur utilise `ratingAt` du slot occupé, jamais `overall` seul :**

- force d'équipe (`teamStrength`, `match.ts`) : la valeur de chaque titulaire — ses attributs pondérés par
  `ATTACK_WEIGHTS` / `DEFENSE_WEIGHTS` de la ligne du slot — est multipliée par `familiarity(position, slot)`,
  puis par la forme et le moral, et répartie à parts égales entre les titulaires de la ligne. Un joueur
  aligné hors de son poste affaiblit l'équipe : toute modification de la table ou des facteurs déplace la
  calibration ;
- remplacement : entre au slot le remplaçant au meilleur `ratingAt` pour ce slot ;
- remplacement tactique : sort le joueur de champ titulaire au plus faible `ratingAt` dans son slot.

Les tirages de buteur, passeur et carton restent pondérés par la **ligne** du slot (`SCORER_SLOT_WEIGHTS`…).

Chaque constante d'équilibrage vit dans un fichier `src/engine/balance.ts` avec un commentaire disant
ce qu'elle représente. Aucun nombre magique disséminé dans la logique.

## Tests attendus

Toute modification du moteur s'accompagne de tests Vitest :

- **Déterminisme** : deux appels avec la même graine donnent un résultat strictement identique.
- **Plausibilité statistique** (`match.test.ts`, sur le vrai monde avec `selectLineup`, donc hors poste
  compris) : sur 10 000 matchs simulés, la moyenne de buts par match tombe dans une
  fourchette réaliste (2,4 à 3,2), et la meilleure équipe gagne nettement plus souvent que la plus faible.
- **Bornes** : aucun score négatif, aucun attribut hors de 1–99, aucune minute hors de 1–90.

Un test statistique doit lui-même utiliser une graine fixe pour ne pas devenir instable.

## Calendrier

`generateSchedule(clubs, firstMatchday, rng)` (`src/engine/schedule.ts`) tire les appariements d'un double
round-robin (graine `scheduleRngSeed(save.seed, code, startYear)`). Les dates dépendent du monde de la partie
(`Save.worldVersion`, appliqué par `seasonFixtures`, `src/db/fixtures.ts`) :

- **1** : une journée par semaine depuis le troisième samedi d'août, comme toujours (empreinte épinglée dans
  `fixtures.test.ts` : même graine, même calendrier qu'avant les deuxièmes divisions).
- **2** : `matchdayDates(roundCount, startYear)`, pure et sans tirage, place les journées sur les 40 samedis
  (`SEASON_SATURDAYS`) du troisième samedi d'août à la mi-mai : jusqu'à 40 journées, samedis répartis, le premier et le
  dernier compris (34 journées : 6 samedis de repos, 38 : 2) ; au-delà, tous les samedis et un mardi par journée de plus,
  répartis entre deux samedis (46 : 6 mardis, 42 : 2). Toutes les compétitions commencent et finissent le même jour.

Les appariements ne changent pas d'un monde à l'autre : seules les dates. La graine d'un match dépend de la journée
(`round`) et des clubs, jamais de la date. `playNextMatchday` joue la prochaine **date** : une partie 2 compte
46 dates par saison, dont des mardis et des samedis où le club dirigé ne joue pas. D'où « Prochain match » en monde 2
(`playUntilNextMatch`, `src/db/simulation.ts`) : les dates qui précèdent son prochain match, par tranches de
`SIMULATION_MAX_MATCHDAYS` (5) via `simulateMatchdays`, le client rappelant jusqu'à `done`, puis sa date par
`playMatchdayAction` (mi-temps, direct). Mêmes transactions qu'en jouant chaque date : aucun effet sur le rejeu.

Défaut connu, hors monde 2 : l'alternance domicile/extérieur de `generateSchedule` laisse des séries (8 matchs de suite
à l'extérieur vus pour un club). La corriger changerait les calendriers des parties 1 : à faire derrière le monde.

Le niveau d'un club à la création dépend du niveau de sa compétition (`clubLevelFromRank(rank, count, tier)`,
`CLUB_LEVEL_BY_TIER`) : 78 → 60 en première division, inchangé, 64 → 52 en deuxième. La calibration de
`match.test.ts` reste mesurée sur les premières divisions.

## Montées et descentes

`applyPromotionRelegation(standings, rules)` (`src/engine/promotion.ts`), pure : pour chaque pays (préfixe du code,
`en` pour `en.1` et `en.2`) qui a une compétition de niveau 1 et une de niveau 2 parmi les classements, les N derniers
du niveau 1 descendent et les N premiers du niveau 2 montent, N venant de `PROMOTION_RELEGATION` (`balance.ts`) :
`en` 3, `es` 3, `it` 3, `de` 2, `fr` 2. Pas de barrages. Les classements sont ceux de `computeStandings` : une égalité
de points se tranche comme au classement affiché (différence de buts, buts marqués, puis slug). Un pays à une seule
division ne bouge pas (toutes les parties `worldVersion` 1) ; un pays à deux divisions sans règle, ou trop petit pour
sa règle, fait échouer le passage de saison. Les échanges étant symétriques, chaque division garde sa taille (18, 20,
22 ou 24, toujours paire pour le round-robin).

Finances au changement de division : `financesAfterMove(finances, reason)` (`economy.ts`), pure. Un promu reçoit au
moins le bas des plages de la première division (budget, masse salariale, réputation), un relégué est ramené au plus
au haut de celles de la deuxième ; chaque chiffre bouge seul, et seulement vers la nouvelle division. Rien d'autre ne
change : ni joueurs, ni contrats, ni salaires (un relégué peut donc payer plus que sa masse salariale).

Équilibrage des deux divisions (mesuré par `npm run measure:balance`, réglé dans `balance.ts`) :

- Jeunes par division : `generateYouthPlayer` lit la réputation du club dans la plage de **sa** division
  (`CLUB_REPUTATION_BY_TIER`) et donne une note dans la plage des jeunes de cette division (`YOUTH_OVERALL_BY_TIER` :
  45–60 en première, inchangée ; 42–55 en deuxième). `YouthClub.tier` est la division actuelle du club.
- Ventes pour masse salariale : en présaison, avant les décisions d'effectif, un club IA dont la masse salariale dépasse
  son budget salarial vend ses joueurs les mieux payés aux autres clubs IA (`planWageSales`, `transfer-ai.ts`, pure) :
  meilleure offre de `saleBids`, jamais sous `WAGE_SALE_MIN_FEE_SHARE` (80 %) de la valeur, 20 joueurs et deux gardiens
  au moins, jusqu'à rentrer dans la masse ; transfert payant, budgets mis à jour. Graine `wageSaleRngSeed`. En pratique
  surtout un relégué de haut de tableau ; aucun club n'est en dépassement dans les démos.
- Laissés après mesure : la plage de niveau de deuxième division (son champion vaut le 15e de première au départ) et
  les finances au changement de division (un tiers des promus redescend aussitôt, un tiers des relégués remonte).
- Calibration épinglée : première division dans `match.test.ts`, deuxième dans `match-d2.slow.test.ts` (2,4–3,2 buts,
  40–50 % à domicile, 20–28 % de nuls, champion de deuxième aussi fort que le 15e de première).

Côté base (`src/db/promotion.ts`) : `computeSeasonMoves` lit les matchs joués des saisons qui se ferment,
`applySeasonMoves` écrit `Season.movements` (les clubs qui quittent la compétition de chaque saison, liste vide sinon)
et met à jour `ClubSave.competitionId` et les finances avant la présaison ; `getCountryMoves` les relit pour le panneau
« Saison terminée ».

## Progression des joueurs

La progression se calcule en fin de saison, pas en continu : âge, temps de jeu, potentiel, et une part
d'aléatoire à graine. Un joueur jeune avec du temps de jeu progresse ; un joueur de plus de 30 ans décline.
La courbe est une fonction pure testable, isolée dans `src/engine/progression.ts`.
