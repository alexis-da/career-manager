# Simulation légère des autres pays : proposition gardée pour plus tard

Proposition du chantier « cpu » (11/11/2026), **non codée**, sur décision de l'utilisateur : on la garde pour plus
tard. Deux étapes intermédiaires ont été faites à la place (section « Ce qui est déjà fait »).

## Pourquoi

L'offre Hobby de Vercel compte 4 h de Fluid Active CPU par mois (règle « Budget CPU Vercel » de CLAUDE.md). Le 11/11, la
production en était à 3 h 46, environ 1 h par jour. Une fois les préchargements retirés, l'essentiel du CPU est le jeu
lui-même, et d'abord les journées : chaque journée d'une partie 2 joue tous les matchs du monde.

Profil d'une journée d'une partie 2 avant les deux étapes : 245 ms de CPU sous profileur, environ 205 ms sans lui
(`process.cpuUsage()` sur 20 journées, en local, base dédiée).

| Poste | Part |
|---|---:|
| Choix du dispositif des clubs IA (`chooseFormation`) | 35 % |
| Simulation des matchs (`simulateMatch`) | 13 % |
| Client Prisma et pilote pg | ≈ 25 % |
| Node et ramasse-miettes | ≈ 21 % |
| Le reste de `src/db` (orchestration) | 6 % |

Les matchs des quatre autres pays sont environ 80 % des matchs d'une date, soit à peu près 60 des 75 matchs d'une date de
championnat. Le joueur n'en voit que les scores, les classements, les buteurs du direct et les joueurs qu'il recrute.

## Principe

- **Pour une partie qui l'a seulement.** Une colonne d'ajout sur `Save`, fixée à la création (comme `worldVersion`) : les
  parties existantes restent jouées comme avant, au tir près. Seules les nouvelles parties en profitent.
- **Matchs concernés.** Ceux dont aucun club n'est du pays du club dirigé, en championnat comme en coupe. Le pays du club
  dirigé garde le moteur complet, segments, événements, statistiques et direct compris.
- **Le tirage.** Les buts attendus de chaque équipe viennent de la force de son onze probable : le dispositif du mois
  (déjà gardé, voir plus bas), `formationStrength` et `expectedGoals`, avec l'avantage du terrain. Les buts sont ensuite
  tirés par une loi de Poisson, sur le flux du match (`matchRngSeed`, un suffixe à lui). Les minutes des buts sont tirées
  des poids par quart d'heure (`REGULATION_GOAL_WEIGHTS`), pour `Fixture.goalTimes`, que le direct lit pour les autres
  matchs. Pour une coupe nulle à 90 minutes, la prolongation et les tirs au but sont tirés de la même façon.
- **Ce qui disparaît pour ces clubs.** Ni événement par joueur, ni carton, ni blessure, ni statistique de saison, et
  aucune écriture de `PlayerSave` à chaque journée. Forme, condition et discipline restent figées : 50, 100, rien. Ce
  sont les écritures qui coûtent, côté Prisma et pg, autant que le moteur.
- **Ce qui ne change pas.** Le marché (prix, offres, transferts entre pays), les montées et descentes (classements
  finaux), les réputations et dotations, les objectifs des clubs IA (sur le rang final), les jeunes et les retraites.

## Progression des joueurs étrangers

La progression de fin de saison (`progressPlayer`, `src/engine/progression.ts`) lit les minutes jouées de la saison
(`GROWTH_BY_MINUTES` : 0,25 à 0 minute, 0,6 à 900, 1 à partir de 2 250). Sans statistiques, ces minutes seraient
estimées à partir du rang du joueur dans le onze probable de son club. Par exemple : environ 2 800 minutes pour un
titulaire, 900 pour un remplaçant du banc, 200 hors du groupe. Ces valeurs seraient à recalibrer avec
`npm run measure:seasons` et `npm run measure:divisions`, pour que valeurs, notes et « Pépites » ne dérivent pas au fil
des saisons.

## Gain attendu

Estimé le 11/11, avant les deux étapes : de 245 ms à 70 à 100 ms par journée sous profileur (−60 à −70 %), soit environ
30 minutes de CPU par jour en production au rythme du 11/11. Le gain qui reste après les deux étapes est à remesurer
avec `scratchpad/cpu/profile-matchdays.ts` (journées d'une partie 2 sur une base dédiée), le script du chantier « cpu ».

## À l'écran

- La fiche d'un joueur étranger n'aurait plus de statistiques de saison (matchs, buts, passes), une forme de 50 et une
  condition de 100 : masquer ces lignes ou les signaler (« championnat simulé »).
- Les clubs étrangers joueraient toujours au complet, sans blessé ni suspendu.
- Une recrue venue de l'étranger arriverait fraîche, ses statistiques comptées à partir de son arrivée.
- Le direct garderait les buts des autres matchs (`goalTimes`), sans buteur pour ceux de l'étranger.

## Risques

- **Équilibre.** Les six cibles de `match.test.ts` et `measure:balance` ne valent plus pour l'étranger : il faudrait
  vérifier que le tirage léger donne les mêmes buts, nuls et victoires à domicile que le moteur complet. Les valeurs et
  les « Pépites » peuvent dériver si les minutes estimées sont mal réglées.
- **Deux simulations à maintenir.** Tout changement du moteur complet (forme, fatigue, dispositifs) devrait être reporté
  dans le tirage léger, ou assumé comme une différence.
- **Le défi de la semaine** joue une partie 2 avec le club du défi : la mise en ligne doit se faire au changement de
  semaine (le lundi après 00:00 UTC), comme celle du choix mensuel du dispositif.

## Effort

4 à 6 jours : la colonne et sa lecture, le tirage pur et ses tests (déterminisme, distribution des scores contre le
moteur complet), les minutes estimées et leur calibrage sur plusieurs saisons, les écrans (fiche joueur, direct), puis
les mesures (`measure:balance`, `measure:seasons`, `measure:divisions`, `measure:weight`).

## Ce qui est déjà fait

1. **Notes au poste calculées une fois par effectif** (11/11, en ligne le jour même) : `restedLineups`
   (`src/engine/lineup.ts`) classe les joueurs disponibles à chaque poste une fois pour les dix-sept dispositifs. Les
   résultats ne changent pas. Choix du dispositif d'un club : 0,37 → 0,19 ms ; une journée : 203 → 181 ms de CPU en
   local.
2. **Dispositif des clubs étrangers choisi une fois par mois** (préparé le 11/11, mise en ligne prévue le lundi 16/11
   après 00:00 UTC, au changement de semaine du défi) : les clubs IA des quatre autres pays choisissent leur dispositif à
   leur premier match de chaque mois du jeu, ceux du pays du club dirigé toujours avant chaque match.
