---
name: donnees-openfootball
description: À utiliser pour importer, mettre à jour ou déboguer les données de base du jeu (clubs, compétitions, calendriers) issues d'OpenFootball, et pour générer les attributs des joueurs. Couvre le format des fichiers, la normalisation des noms et les règles de licence.
---

# Données OpenFootball

## Source

[OpenFootball](https://github.com/openfootball) — données sous licence CC0 (domaine public). Pas de clé
d'API, pas de quota. Les fichiers sont téléchargés une fois et **commités dans le dépôt** sous
`prisma/seed/data/`, pour que le seed soit reproductible et fonctionne hors ligne.

Ne jamais appeler OpenFootball au runtime : c'est une source de seed, pas une API de production.

## Format des calendriers

`https://raw.githubusercontent.com/openfootball/football.json/master/<saison>/<code>.json`

Exemple : `2024-25/en.1.json` (Premier League). Codes usuels : `en.1`, `es.1`, `de.1`, `it.1`, `fr.1`.

```json
{
  "name": "English Premier League 2024/25",
  "matches": [
    {
      "round": "Matchday 1",
      "date": "2024-08-16",
      "time": "20:00",
      "team1": "Manchester United FC",
      "team2": "Fulham FC",
      "score": { "ht": [0, 0], "ft": [1, 0] }
    }
  ]
}
```

Points d'attention réels :

- `time` est parfois absent.
- `score` est absent pour un match non joué — c'est normal, le seed doit l'accepter.
- Les clubs n'ont **pas d'identifiant** : ils n'existent que comme chaîne dans `team1` / `team2`.
  C'est la chaîne qui fait la clé. Normaliser une fois (trim, espaces multiples, accents conservés) et
  construire un slug stable : `manchester-united-fc`.
- Le même club peut être orthographié différemment d'une saison à l'autre. Maintenir une table
  d'alias dans `prisma/seed/aliases.ts` plutôt que de corriger les fichiers source.

## Métadonnées des clubs

Le dépôt `openfootball/clubs` fournit stade, ville et année de fondation, en texte structuré :

```
Arsenal FC, 1886, @ Emirates Stadium, London
  | Arsenal | FC Arsenal
```

C'est un enrichissement **optionnel** : le seed doit fonctionner sans, avec les seuls noms issus des
calendriers. Ne pas bloquer l'import parce qu'un club n'a pas de stade renseigné.

## Attributs des joueurs

OpenFootball ne fournit ni effectifs ni notes. Les joueurs sont **générés**, de façon déterministe, à
partir de `Save.seed` :

1. Chaque club reçoit un niveau de base déduit de son classement final la saison précédente.
2. L'effectif est généré par poste (2 gardiens, 8 défenseurs, 8 milieux, 5 attaquants environ).
3. Les attributs sont tirés autour du niveau du club, avec une dispersion, puis bornés à 1–99.
4. L'âge suit une distribution réaliste ; le potentiel est l'attribut courant plus une marge décroissant
   avec l'âge.

Aucun nom de joueur réel n'est importé : les noms sont générés depuis des listes de prénoms et noms par
nationalité. Ça évite toute question de licence et de données personnelles, et ça rend chaque partie
différente.

## Licence

Les données OpenFootball sont CC0 : utilisables et redistribuables librement. En revanche, ne jamais
ajouter au dépôt des données scrapées d'un site commercial, ni les noms ou notes de joueurs issus d'un
jeu sous licence.
