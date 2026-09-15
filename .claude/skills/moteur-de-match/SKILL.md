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
   pondérée par poste, forme et moral.
2. En déduire un nombre d'occasions attendu pour chaque équipe (avantage du terrain inclus).
3. Tirer les buts depuis une loi de Poisson avec ce paramètre.
4. Attribuer buteurs et passeurs par tirage pondéré sur les attributs offensifs des joueurs sur le terrain.
5. Générer les événements (cartons, blessures) avec des probabilités faibles et documentées.

Chaque constante d'équilibrage vit dans un fichier `src/engine/balance.ts` avec un commentaire disant
ce qu'elle représente. Aucun nombre magique disséminé dans la logique.

## Tests attendus

Toute modification du moteur s'accompagne de tests Vitest :

- **Déterminisme** : deux appels avec la même graine donnent un résultat strictement identique.
- **Plausibilité statistique** : sur 10 000 matchs simulés, la moyenne de buts par match tombe dans une
  fourchette réaliste (2,4 à 3,2), et la meilleure équipe gagne nettement plus souvent que la plus faible.
- **Bornes** : aucun score négatif, aucun attribut hors de 1–99, aucune minute hors de 1–90.

Un test statistique doit lui-même utiliser une graine fixe pour ne pas devenir instable.

## Progression des joueurs

La progression se calcule en fin de saison, pas en continu : âge, temps de jeu, potentiel, et une part
d'aléatoire à graine. Un joueur jeune avec du temps de jeu progresse ; un joueur de plus de 30 ans décline.
La courbe est une fonction pure testable, isolée dans `src/engine/progression.ts`.
