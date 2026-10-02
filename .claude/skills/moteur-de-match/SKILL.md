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

## Postes, familiarité et composition

Un joueur a un poste précis (12 valeurs, `src/engine/positions.ts`) et `positionGroup(position)` donne sa
ligne : GK, DF (RB, CB, LB), MF (CDM, CM, CAM, RM, LM), FW (RW, LW, ST).

**Familiarité.** `ratingAt(player, slot) = overall × familiarity(player.position, slot)`, fonction pure, non
arrondie. Le facteur vient de `GROUP_FAMILIARITY` (`balance.ts`), table explicite par ligne du joueur et ligne
du slot :

| Joueur ↓ / slot → | GK  | DF   | MF   | FW   |
| ----------------- | --- | ---- | ---- | ---- |
| GK                | 1   | 0,4  | 0,4  | 0,4  |
| DF                | 0,4 | 0,92 | 0,8  | 0,6  |
| MF                | 0,4 | 0,8  | 0,92 | 0,8  |
| FW                | 0,4 | 0,6  | 0,8  | 0,92 |

Même poste : 1 (`SAME_POSITION_FAMILIARITY`), qui l'emporte sur la diagonale ; autre poste de la même ligne :
0,92 ; ligne voisine : 0,8 ; ligne opposée (défense ↔ attaque) : 0,6 ; gardien hors des buts ou joueur de champ
dans les buts : 0,4. La table est symétrique ; `positions.test.ts` en couvre chaque case.

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

## Progression des joueurs

La progression se calcule en fin de saison, pas en continu : âge, temps de jeu, potentiel, et une part
d'aléatoire à graine. Un joueur jeune avec du temps de jeu progresse ; un joueur de plus de 30 ans décline.
La courbe est une fonction pure testable, isolée dans `src/engine/progression.ts`.
