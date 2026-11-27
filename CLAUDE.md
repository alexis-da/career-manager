# Career Manager

Jeu de gestion de carrière football en web, en français et en anglais. Projet personnel solo, développé avec Claude
Code.

## Stack

- Next.js (App Router) + TypeScript strict
- Prisma 7 + PostgreSQL
- Tailwind CSS
- Vitest (unitaire) · Playwright (E2E)
- Déploiement visé : Vercel

## Commandes

```bash
npm run dev            # serveur de dev
npm run build          # build de production
npm run db:local:init  # créer les bases locales latewinner_dev et latewinner_test (idempotent, psql)
npx prisma migrate dev # créer + appliquer une migration (base locale)
npx prisma studio      # inspecter la base
npm run test           # tests unitaires (Vitest)
npm run test:slow      # tests longs en base : saisons complètes (Vitest)
npm run test:e2e       # tests Playwright (arrête d'abord tout serveur sur 3100 et vide .next-e2e)
npm run test:e2e:quick # la sélection E2E que la CI joue à chaque push (création et journée, direct, marché, SEO, /admin)
npm run measure:balance # moteur : victoires par écart de force, effet de chaque facteur, dispositifs, consignes (de départ : -- --starting-only) et fatigue, saisons d'une partie 2 (-- --seasons=3 : trois saisons de chaque graine, le premier tournoi d'été compris ; base locale seulement) : six cibles, clubs européens, condition et blessures par pays et par mois (trêve hivernale), CPU par journée, penaltys et échauffourées sur de vrais effectifs (-- --lineups-out=f.json garde leurs onze ; -- --choices-from=f.json les mesure seuls, sans base)
npm run measure:divisions # équilibrage des deux divisions : six saisons d'une partie 2, l'adjoint gérant les contrats du club dirigé (base locale seulement)
npm run measure:seasons # budgets, plafonds, réputation (son étalement), objectifs, Europe (qualifiés, condition et charge des clubs européens, saison par saison), sélections (trêves, appelés, blessures, force des 14 nations, CPU) et tournois d'été (condition au premier match, crédibilité sur 50 cycles) : six saisons d'une partie 2, l'adjoint gérant les contrats du club dirigé (-- --seed=S pour une autre graine ; base locale seulement)
npm run measure:assistant # l'adjoint (chantier « simplification ») : jumeaux d'une partie 2, sa composition contre le meilleur onze sans repos, ses contrats contre aucun, un club « gourmand » de joueurs libres et ses ventes proposées, la progression de ses jeunes (-- --seasons=3 --lineup=game --contracts=game --sales=game ; --policy=YOUTH : sa consigne « Lancer les jeunes » ; --targets=N : ses jeunes ciblés, suivis ; base locale seulement)
npm run measure:coach  # sélectionneur : CPU d'une trêve dirigée contre une trêve sans lui, d'un match de sélection en direct et d'un tournoi joué par étapes en juin, deux jumeaux d'une partie 2 (-- --seasons=2 --nation=POR ; base locale seulement)
npm run measure:history # coût d'un affichage de l'onglet Histoire : requêtes et CPU, à froid et en cache, d'une carrière archivée de 5 et 10 saisons (-- --seasons=10 --at=5,10 ; base locale seulement)
npm run measure:weight # poids d'une carrière table par table, à la création puis après chaque saison (-- --seasons=3 --vacuum-every=5 --out=f.json, --archive : saisons terminées archivées, --no-europe : sans compétition européenne, pour comparer ; base locale dédiée et vide)
```

## Règles non négociables

**Déterminisme.** Une sauvegarde rejouée avec la même graine doit produire exactement la même saison.
Aucun appel à `Math.random()`, `Date.now()` ou `new Date()` dans le code de simulation : la graine vient
de `Save.seed`, la date courante vient de `Save.currentDate`. Toute violation est un bug, pas un détail.

**Le moteur est pur.** Les fonctions de `src/engine/` ne lisent ni n'écrivent la base. Elles prennent un
état en entrée et retournent un résultat. La persistance se fait dans la couche appelante. C'est ce qui
rend le moteur testable et rejouable.

**Données du monde vs état de partie.** Les tables de référence (`Club`, `Player`, `Competition`) viennent
d'OpenFootball et ne changent jamais pendant une partie. Tout ce qui évolue est suffixé `Save`
(`PlayerSave`, `ClubSave`) et porte un `saveId`. Ne jamais muter une table de référence depuis le jeu. La compétition
d'un club dans une partie est `ClubSave.competitionId` (initialisée depuis `Club.competitionId` à la création, seule
lecture de ce dernier dans une partie ; le défi de la semaine le lit aussi, pour tirer son club et l'afficher, ses parties
partant toutes du monde de départ) ; le classement et le palmarès d'une saison passée prennent leurs clubs dans ses
`Fixture`.
Le poste local ne touche jamais la production : les données de référence y arrivent **par migration**
(`prisma migrate deploy` au déploiement), un SQL idempotent généré depuis le plan du seed
(`scripts/generate-reference-migration.ts`, skill `prisma-migrations`), jamais par `npm run db:seed`.

**Bases de données : Postgres local, Neon pour la production seule.** Développement et tests tournent sur un
PostgreSQL 17 local (port 5432, utilisateur postgres) : `latewinner_dev` (`.env`, `DATABASE_URL` et `DIRECT_URL`)
et `latewinner_test` (`.env.test`, `DATABASE_URL_TEST`, pour les E2E **et** les tests Vitest en base,
`src/db/test-database.ts`), créées par `npm run db:local:init`, puis `npx prisma migrate deploy` et
`npm run db:seed` sur chacune. Une URL locale sans `sslmode` se connecte sans SSL (`pgConnection`, `cliDatabaseUrl`,
`src/db/database-url.ts`) ; une URL Neon garde son `sslmode`, `prefer`, `require` et `verify-ca` écrits `verify-full`
pour pg (`pgConnection`) : ce qu'il en fait déjà, sans son avertissement de sécurité, aucune variable à changer.
**Garde-fou : l'hôte doit être localhost pour toute
commande locale** (`assertLocalDatabase` : client Prisma, `prisma.config.ts`, seed, mesures, tests en base,
Playwright) ; une base distante n'est acceptée que sur Vercel (`VERCEL=1`) ou avec `ALLOW_REMOTE_DB=1` posée à la main,
sciemment. Neon (`damp-rain`, production) n'est atteint que par Vercel ; la branche Neon de test (`sparkling-darkness`)
n'existe plus pour nous. **Seule `main` est déployée ; une branche ne doit jamais atteindre Neon** : prévisualisations
Vercel désactivées (Ignored Build Step), aucune variable de base dans l'environnement Preview ; pousser une autre
branche ne sert qu'à la sauvegarder sur GitHub.

**Monde d'une partie (`Save.worldVersion`).** Fixé à la création, sans défaut en base : 1 = les cinq premières
divisions (toutes les parties d'avant les deuxièmes divisions, inchangées), 2 = premières et deuxièmes divisions
(`Competition.tier` 1 et 2), avec un calendrier où toutes les compétitions finissent le même jour (`matchdayDates`,
`src/engine/schedule.ts`). `DEFAULT_WORLD_VERSION` (`src/engine/world-version.ts`) vaut **2** : toute nouvelle partie
a les deux divisions, et le formulaire de création propose les 198 clubs, par pays puis par division. Les parties 1
existantes restent en monde 1, inchangées. Les tests en base qui n'ont pas besoin de deuxième division passent
**explicitement** `worldVersion: 1` à `createSave` (deux fois moins de lignes) et utilisent la démo 1
(`ensureDemoSave()`) ; la démo 2 (`ensureDemoSave(2)`, son propre propriétaire `demo-user-v2`) seulement où les
deuxièmes divisions comptent. Écrans d'une partie 2 : classement par pays puis Division 1 / Division 2, en-tête avec la
compétition actuelle du club, et **« Prochain match »** à la place de « Jouer la journée » : les dates qui précèdent
le prochain match du club, où seules les autres compétitions jouent, par tranches de 5 (`playUntilNextMatch`,
`src/db/simulation.ts`), puis sa date avec mi-temps et direct. Une partie 1 garde « Jouer la journée ».

**Moteur par segments (gameplay v1).** Cahier `docs/design/gameplay-v1.md`, source de vérité des chantiers G1 à G6
(branche `gameplay`). Un match se joue en six segments de 15 minutes (deux en prolongation), chacun avec son flux
(`…:s1` à `…:s6`, `…:e1`, `…:e2`) et la force des équipes recalculée à son début : un rouge, une blessure (remplacée
aussitôt) ou un changement compte dès le segment suivant. Profils de dispositif (`FORMATION_PROFILES`) et consignes
Attaquer / Équilibré / Fermer (`INSTRUCTION_EFFECTS`), données par la règle de l'adjoint (`assistantInstruction`) à tous
les clubs, qui revient à leur consigne de départ quand elle n'a rien à dire (Équilibré pour un club IA, règle
« Composition et consigne de départ »), sauf au club dirigé quand, en direct, son joueur en choisit une
(`giveInstruction`, règle « Remplacements et consigne en direct ») ; forme calmée (`FORM_RETENTION`). Les buts
viennent plus tard dans le match : un poids par quart d'heure (`REGULATION_GOAL_WEIGHTS`, de 0,76 à 1,38) et par période
de prolongation (`EXTRA_TIME_GOAL_WEIGHTS`), moyenne 1 (14 % des buts au premier quart d'heure, 21 % au dernier). Le
direct du club dirigé se joue segment par segment (`playOn`, `src/engine/live.ts`) : `Fixture.liveState`, en version 2,
garde l'état à chaque pause (un direct de version 1 se termine encore), et simuler ou regarder avec les décisions de
l'adjoint donnent le même match (`src/db/live-state.test.ts`, 600 matchs). Détails : skill `moteur-de-match`.

**Fatigue (gameplay v1, G2).** `PlayerSave.fitness` (0–100, affichée « Condition » / « Fitness ») pèse sur la part de
chaque joueur par deux facteurs, lus au début de chaque segment (`src/engine/fitness.ts`) : la fraîcheur, sa fitness au coup
d'envoi (`fitnessFactor`, × 1 − 0,0015 × (100 − fitness)), et l'usure, ce qu'il a perdu sur le terrain depuis
(`wearFactor`, × 1 − 0,010 × perte). Un joueur sur le terrain perd 5 points par segment (1,5 pour le gardien), garde sa
fitness de fin de match (`recordFinishedMatches`) et chacun récupère 5 points par jour jusqu'à 100, appliqués par
`playNextMatchday` au changement de date (`recoveredFitness`, `src/engine/fitness.ts`) ;
sous 70, son risque de blessure croît. Les clubs IA sortent le titulaire le plus fatigué aux minutes de changement et mettent
au repos un joueur sous 75 quand un reposé vaut au plus 5 points de moins à son poste, 2 de plus par point de condition sous
75 (`maxRotationGap` : 7 à 74, 15 à 70, 25 à 65 ; `selectRestedLineup`, `src/engine/lineup.ts`, depuis le 17/11 : à 5 points
fixes, les clubs européens, dont le banc décroche de leur onze au fil des saisons, laissaient 12 % puis 25 % de leurs
titulaires d'octobre sous 75, 1 à 4 % depuis) ; le club dirigé joue la composition de son joueur, ou, en mode adjoint, le
même onze reposé (règle « Simplification »). L'état du direct garde la fitness de chaque joueur (100 pour une pause d'avant). Les écrans montrent
la fitness au coup d'envoi du prochain match du club (`fitnessAtKickOff`, `src/db/fitness-view.ts`), le panneau Coaching
celle de la reprise ; vert dès 90, ambre sous 75, rouge sous 70 (`app/saves/[id]/_lib/fitness.ts`). Le moral reste dans le
moteur, neutre, et n'est affiché nulle part.

**Suspensions (gameplay v1, G3).** Cinq colonnes de `PlayerSave` (migration d'ajout `…_suspensions`, 0 par défaut) :
`leagueYellows` et `cupYellows`, les jaunes de chaque compétition depuis la dernière suspension ou le début de saison, et
les matchs encore à manquer : `suspendedMatches` après un rouge (le prochain match officiel du club, toute compétition),
`suspendedLeagueMatches` et `suspendedCupMatches` après le 5e jaune d'une compétition (son prochain match). Règles pures
dans `src/engine/discipline.ts` (`disciplineAfterMatch`, `YELLOWS_PER_SUSPENSION` 5, `SUSPENSION_MATCHES` 1), appliquées
par `recordFinishedMatches` à tous les joueurs des deux clubs, clubs IA compris : un suspendu purge le match sans jouer, un
exclu est suspendu et ses jaunes du match ne comptent pas, le 5e jaune remet le compte à 0 ; `advanceToNextSeason` remet
les jaunes à 0, une suspension restante se reporte. Un suspendu est indisponible comme un blessé (`isAvailable`,
`src/engine/lineup.ts` ; `withSuspensions`, `src/db/matchday.ts`, selon la compétition du match) : composition résolue,
composition automatique, banc, rotation des clubs IA. À l'écran, pour le club dirigé, `disciplineStatus`
(`src/db/discipline-view.ts`, pur) lit ses colonnes contre ce que le club joue encore (`managedMatchesAhead`) : suspendu
pour le prochain match (la compétition de ce match décide), suspendu plus tard dans l'autre compétition, ou à un jaune de
la suspension ; lu par `getLineupEditor`, `getManagedLineup` (`missingStarters` : un titulaire enregistré blessé ou
suspendu reste du onze, jamais proposé à la vente), `getPlayerProfiles` et `getDashboard` (`bookingRisks`) ; l'aperçu de
l'adversaire écarte ses suspendus. Badges (`PlayerBadges`, effectif, composition et fiche) : « Suspendu » en rouge,
« Suspendu en coupe / en championnat », « 4 jaunes », « 4 jaunes en coupe » en ambre (« Suspended », « Cup ban »,
« League ban », « 4 yellows », « 4 cup yellows ») ; un carton (`CardMark`) sur le terrain et le banc ; la composition
avertit qu'un titulaire suspendu sera remplacé. Une troisième compétition, européenne, a ses jaunes et sa suspension
(`europeYellows`, `suspendedEuropeMatches`, 3 jaunes : règle « Compétitions européennes ») : « Suspendu en Europe »,
« 2 jaunes en Europe » (« European ban », « 2 European yellows »).

**Événements à choix (gameplay v1, G4).** Pour le seul club dirigé : 1 à 3 par match (35 / 45 / 20 %), aux limites de
15', 30', 60' et 75', et à 105' une prolongation sur deux, tirés au coup d'envoi du flux `…:events` ; à chaque limite, le
type parmi ceux possibles à ce moment (`CHOICE_EVENT_WEIGHTS`) et ses joueurs du flux `…:event:15`, son issue du flux
`…:event:15:outcome` (`src/engine/choices.ts`, pur, `balance.ts` pour les valeurs ; aucun autre flux n'est décalé).
Catalogue v1 du cahier : penalty (le tireur parmi les trois meilleurs, sa chance affichée : règle « Penalty et
échauffourée »), coup franc (frapper ou combiner), joueur averti qui s'énerve, échauffourée (même règle), joueur touché,
joueur à bout (25 points de fitness perdus sur le
terrain, à partir de 75'), le club mène, le club est mené ou à égalité (une consigne jusqu'à la fin du temps
réglementaire : les trois consignes, Attaquer, Équilibré (l'option `STEADY`) et Fermer, chacune une fois, celle que le
club joue marquée « (actuelle) », `optionInstruction`, `currentInstructionOf` ; l'adjoint prend celle de sa règle). Les buts des événements sont pris sur ceux du club (`OWN_GOALS_WITH_CHOICE_EVENTS`, 0,89 sur ses buts
attendus) : décidés par l'adjoint, ils ne lui rapportent rien d'eux-mêmes. L'adjoint décide avec la même fonction pure
en simulation (`assistantChoices`, `simulateMatch`) et en direct quand le joueur saute la pause (« live-skip ») ; sinon
le joueur décide sur la carte d'événement (G5, règle « Match en direct »), la décision de l'adjoint présélectionnée. Chaque
décision est gardée dans `MatchDecision` (migration d'ajout `…_choice_events`, (fixtureId, sequence) unique), écrite
dans la transaction qui joue la suite, avant elle ; le fil du direct et la feuille de match la montrent avec son effet.

**Penalty et échauffourée (chantier « équilibrage », 23/11).** Cahier `docs/design/equilibrage.md`. Mesurés sur de vrais
effectifs (`npm run measure:balance`, section « Choice events on real squads » : les onze des clubs IA de dates de
championnat, leur forme et leur condition d'alors, chaque option jouée jusqu'au coup de sifflet final ; `--
--choices-from`). **Penalty** : les trois meilleurs tireurs (`shooting`), le mieux noté d'abord ; la chance de chacun
(`penaltyChance`, `src/engine/choices.ts`, pure, au pour cent près : ce que la carte montre est ce qui est joué) part de
celle des tirs au but (`shootoutChance`), puis sa forme (comptée d'autant plus que la pression monte), sa condition à
cette minute (`fitnessAt`, autour de `PENALTY_FITNESS_REFERENCE`), la pression (`penaltyPressure` : de 0,3 au coup
d'envoi à 1 à la 90e, fois le score, `PENALTY_PRESSURE_BY_LEAD`, nul ou mené d'un but le plus) et l'expérience face à
elle (`penaltyExperience`, l'âge du jour du match, `SquadPlayer.age` : posé pour le seul club dirigé par
`playNextMatchday`, en une requête de son effectif (lire l'âge des quelque 5 000 joueurs d'une date coûtait 6 à 9 ms de
CPU à chaque date), et par les convocations des sélections, gardé par l'état du direct, de −1 à 21 ans à +1 à 31, ×
`PENALTY_EXPERIENCE_CHANCE` × la pression) ; l'adjoint prend la meilleure chance. Forme et condition seules départagent
mal trois coéquipiers (le mieux noté restait le meilleur choix 60 % du temps au mieux) : l'expérience les départage.
Mesure : le mieux noté est le meilleur choix dans 49,8 % des penaltys (55 % à la 15e, 43 % à la 75e ; avant, 100 %), le
prendre d'office coûte 0,023 point par penalty. Carte : la pression après la question (`ChoiceEventView.pressure`,
`pressureLevel` : faible, moyenne, forte), et sous la chance de chaque tireur sa forme en mots, sa condition et son âge
(`form`, `fitness`, `age`, `choice-option-details`). **Échauffourée** : « Calmer » ne change rien ; « Protester » est un
pari sur les deux segments suivants de la période de jeu (`PROTEST_SEGMENTS`) : la moitié du temps l'équipe se
transcende (ses buts attendus × `PROTEST_GOALS`), sinon elle perd la tête (ceux de l'adversaire ×
`PROTEST_BACKFIRE_GOALS`), par `MatchModifiers.boosts` (`GoalBoost`, jusqu'à une minute jouée, gardés par l'état du
direct) ; et le capitaine averti trois fois sur dix, exclu s'il l'était déjà (la carte le dit,
`ChoiceEventView.booked`). Mesure : +0,004 point par match en moyenne contre « Calmer » (+0,011 capitaine non averti,
−0,067 averti) ; le score final changé dans 29 % des échauffourées, les points dans 14 % (6,5 % mieux, 7,1 % moins
bien), contre 1,4 % et 0,6 % avant.

**Remplacements et consigne en direct (gameplay v1, G5).** Le joueur change son équipe à toute pause de son match :
mi-temps, fin du temps réglementaire d'une coupe nulle, pause de la prolongation, et entre deux segments (15', 30', 60',
75'), ses remplacements datés de la minute suivante (`applyHalfTimeChoice`, `src/engine/match.ts`). Règle réelle :
5 remplacements au plus (un 6e en prolongation), en 3 fenêtres pendant le jeu (`MAX_SUBSTITUTION_WINDOWS`,
`TeamLive.windows`) ; la mi-temps et les pauses de la prolongation n'en prennent pas, ni le remplacement immédiat d'un
blessé, qui reste automatique ; chaque remplacement tactique pendant le jeu en ouvre une, celui de l'adjoint et celui d'un
événement compris, mais la règle ne lie que le joueur (`HalfTimeChoiceError` « no-window »). Dès son premier
remplacement (`applyManagerChoice`, `TeamLive.manual`), l'adjoint ne fait plus les siens, un blessé restant remplacé
aussitôt, et un événement qui sort un joueur demande alors une fenêtre. Sa consigne, donnée à une pause, tient jusqu'à
la fin de la période de jeu, temps réglementaire ou prolongation, quel que soit le score (`giveInstruction`) ; sans
consigne, la règle de l'adjoint. Sans décision ni changement ni consigne, le match reste celui de la simulation.

**Dispositifs (gameplay v2, V1).** Dix-sept (`FORMATION_NAMES`, `src/engine/formations.ts`), du profil le plus offensif
au plus défensif, en trois familles par leurs défenseurs (`formationFamily`, `FORMATION_FAMILIES` : 4, 3, 5) ; profils dans
`FORMATION_PROFILES` (`balance.ts`), ceux de G1 inchangés. Un nom est un identifiant, gardé par une composition
enregistrée (`ClubSave.formation`, `ClubSave.lineup` par index d'emplacement) et par un direct en pause : **ne jamais
renommer un dispositif ni réordonner ses emplacements** (test : `src/db/lineup.test.ts` relit une composition de chacun
des sept de G1). Seul le libellé change, message `formations.label` (zone `catalogs`) : le « 4-3-3 » est le « 4-3-3
sentinelle », le « 4-2-3-1 » le « 4-2-3-1 large », le « 4-4-2 » le « 4-4-2 à plat » ; aucun écran n'affiche l'identifiant.
**Les clubs IA choisissent leur dispositif** (`chooseFormation`, `src/engine/formation-choice.ts`,
pure) : de tous, avec la composition de l'adjoint dans chacun (`selectRestedLineup` : blessés et suspendus écartés,
fatigués reposés), celui qui rapporte le plus de points attendus (`expectedPoints` : buts attendus du moteur, loi de
Poisson, domicile et extérieur moyennés) face à l'adversaire moyen de leur division (`averageOpponent` : un onze de son
niveau moyen, `CLUB_LEVEL_BY_TIER`, en 4-3-3 sentinelle) ; égalité au premier de `FORMATION_NAMES`. La même fonction pour
le match (`lineupOf`, `src/db/matchday.ts`), l'aperçu de l'adversaire (`getOpponentPreview`, qui montre son dispositif
et son profil, `opponent-formation`), les trois meilleurs de l'écran de composition (`rankFormations`) et les tests
(`src/db/opponent.test.ts` compare l'aperçu au match joué). Le club dirigé garde le sien. **Quand :** les clubs du pays
du club dirigé, qu'il rencontre en championnat et en coupe, avant chaque match ; ceux des quatre autres pays à leur premier
match de chaque mois du jeu (chantier « cpu », mise en ligne du 11/11 : `aiLineupOf`, `src/db/matchday.ts`,
`monthlyFormation`), le dispositif alors choisi gardé sur leur ligne jusqu'au mois suivant (`ClubSave.formation` et
`ClubSave.formationMonth`, année × 100 + mois en UTC, `formationMonthOf`, migration d'ajout `…_formation_month`), leur onze
choisi à chaque match dans ce dispositif (`selectRestedLineup` ; `src/db/monthly-formation.test.ts`). Le joueur ne voit
que leurs scores, et peser les dix-sept dispositifs avant chacun de leurs matchs était une grande part du CPU d'une
journée. Base des buts recalibrée pour les six cibles : `BASE_GOALS_PER_TEAM` 1,23 → 1,31, puis 1,35 le 23/11 (chantier
« équilibrage » : 2,60 buts par match, au plancher de la cible, → 2,68 (2,66 sur 18 saisons)). Pour peser les dix-sept
dispositifs, l'effectif est classé une fois à chaque poste (`restedLineups`, `src/engine/lineup.ts`, chantier « cpu »,
11/11 : note au poste puis identifiant, les mêmes onze et bancs que `selectRestedLineup`, que `lineup.test.ts` compare
sur 200 effectifs tirés).

**Composition et consigne de départ (gameplay v1, G6).** La force d'une équipe a une seule source,
`src/engine/strength.ts` (`condition`, `teamStrength`, `formationStrength`, `expectedGoals`, `expectedGoalDifference`,
`compareFormations`), que le moteur et l'écran de la composition importent : l'éditeur recalcule dans le navigateur
l'attaque et la défense du onze qui jouerait (`resolveLineup` de son état, `EditorPlayer` : attributs, forme, moral,
fitness au prochain match), à côté de celles du onze probable du prochain adversaire (`OpponentPreview.strength`), et
compare les dix-sept dispositifs avec la composition de l'adjoint dans chacun, le meilleur étant le plus grand écart de buts
attendu contre lui, les deux Équilibré. La composition de l'adjoint (`automaticState`, « Composition automatique » de
l'éditeur du sélectionneur, le seul qui l'a encore ; `selectRestedLineup` : sans blessé ni suspendu, un fatigué sous 75
reposé quand un reposé vaut au plus 5 points de moins à son poste, 2 de plus par point de condition sous 75,
`maxRotationGap`) est celle que joue le club dirigé en mode adjoint (règle « Simplification ») ; en mode joueur sans
composition enregistrée, le match joue `selectLineup`. Consigne de départ (Attaquer,
Équilibré, Fermer) : choisie dans la composition, enregistrée avec elle dans `ClubSave.lineup` (`instruction`,
facultative, Équilibré sans elle, aucune migration), jouée par le club dirigé au coup d'envoi, simulé comme en direct
(`Lineup.instruction`, `TeamLive.startingInstruction`, absente pour Équilibré : l'état et le match d'avant) ; la règle de
l'adjoint y revient. Chaque équipe garde la consigne de chacun de ses segments et qui
l'a donnée (`TeamLive.instructions`, `InstructionSpan`, `src/engine/instructions.ts` : départ, adjoint, manager,
événement ; `MatchModifiers.givenBy` ; `instructionSourceAt`), lue par le direct. Effet mesuré par `npm run
measure:balance -- --starting-only` : petit, Fermer rapportant à l'outsider, Attaquer au seul net favori.

**Simplification (chantier « simplification », 24/11, mise en ligne du 25/11).** Cahier `docs/design/simplification.md`,
validé le 24/11 : un jeu plus casual, où l'adjoint s'occupe du quotidien. **Argent** : le budget transferts est la seule
limite, aucune porte de salaire (achat, joueur libre, prolongation, propositions du marché, jeune prometteur) ;
`PlayerSave.wage` reste écrit à chaque contrat mais n'est montré nulle part, et ne sert qu'au coût d'une libération
(`releaseCompensation`) et, par `ClubSave.wageBudget` (toujours calculé, jamais affiché), à départager deux réputations
égales (`reputationRanks`). Un joueur libre coûte une prime à la signature (`signingBonus`, `economy.ts` : 25 % de sa valeur
du jour, arrondie aux 10 000 € au-dessus, 50 000 € au moins, `SIGNING_BONUS_SHARE`, `SIGNING_BONUS_MIN`), payée sur le
budget et écrite comme indemnité de sa ligne `FREE` (le `TransferQuote.askingPrice` d'un libre) ; refus
`insufficient_budget` avec sa prime (`RefusalContext.bonus`). Trente joueurs au plus (`SQUAD_LIMIT`, `balance.ts`) :
achat, signature et jeune prometteur refusés à 30 (`squad_full`), ventes et libérations jamais, les jeunes de l'intersaison
aux seules places libres ; un club IA à 30 n'enchérit plus ; `planWageSales` est retirée, `planSquad` signe à la prime sur
son budget. Achats et signatures verrouillent la partie (`lockSave`). **Composition** (`Save.lineupByAssistant`, migration
d'ajout `…_simplification` : vrai à la création ; null pour une carrière d'avant, lu par `lineupByAssistantOf`,
`src/db/lineup.ts` : le joueur s'il a une composition enregistrée, l'adjoint sinon) : en mode adjoint, le club dirigé joue
avant chaque match le onze reposé des clubs IA dans le dispositif de son joueur, avec sa consigne de départ
(`managedLineup`, `src/engine/lineup.ts`) ; l'objectif Jeunesse choisi, le meilleur 21 ans ou moins titularisé en
championnat s'il vaut au plus 4 points de moins que le titulaire (`YOUTH_STARTER_MAX_GAP`), jusqu'à 15 titularisations ;
sous la consigne « Lancer les jeunes », ses jeunes aussi (règle « Consigne de l'adjoint »).
Le premier geste sur un joueur passe en mode joueur, enregistré aussitôt (règle « Composition enregistrée seule ») ;
« Rendre la main à l'adjoint » ramène l'adjoint. **Contrats**
(`Save.contractsByAssistant`, vrai par défaut, carrières d'avant comprises) : au passage de saison (présaison,
`runPreseasonInTransaction`, avant les jeunes et les clubs IA), un contrat du club dirigé qui finit le 30 juin suit le choix
de son joueur (`PlayerSave.contractChoice`, RENEW ou LEAVE, posé sur la fiche par `setContractChoiceAction`, effacé par un
nouveau contrat, une vente, une libération et au passage), sinon, en mode adjoint, la règle des clubs IA
(`contractOutcomes`, `decideContracts`, `src/engine/assistant-contracts.ts` : `wantsToKeep` contre `squadStandard`, selon sa
consigne, et le
rôle que les joueurs libres ne combleraient pas), sinon il part libre ; prolongé à `renewalWage` (le plus haut de son
salaire et de celui de sa note), pour une durée tirée du flux du club (`squadPlanRngSeed`). L'adjoint ne casse jamais un
contrat en cours et ne recrute (`assistantSignings`) que sous 20 joueurs ou 2 gardiens, à la prime, jamais un joueur qu'il
vient de laisser partir. Ce qu'il a fait est gardé sur la dotation de la saison (`SeasonBudget.contractMoves`, Json validé
par Zod, `contractMovesSchema`, `src/db/contracts.ts`) et montré au début de saison. Du 1er janvier au 30 juin, « À faire »
prévient seulement quand il compte laisser partir un titulaire (`important-contracts`, `importantPlayers` : le onze de
`selectLineup` avec tout l'effectif disponible) ; en mode joueur, `expiring-contracts` comme avant. **Ventes proposées**
(`getSaleProposals`, `src/db/sale-proposals.ts` ; règle pure `saleProposals`, `src/engine/sale-proposals.ts`) : pendant un
mercato, 3 joueurs au plus, la meilleure offre d'abord, qui ne jouent pas sur la période de référence
(`saleProposalPeriod` : la saison en cours l'hiver, la saison terminée l'été, lue dans son archive quand elle en a une,
`readArchivedYear` ; 2 titularisations et 10 % des minutes du club au plus, sur 10 matchs officiels du club au moins), au
club toute la période (aucune arrivée depuis son premier jour, ni un jeune d'une intersaison suivante, `youthIntakeYear`),
ni dans le onze ni sur le banc que l'adjoint alignerait avec tout l'effectif, ni l'un des 3 meilleurs gardiens, ni un
espoir, ni un jeune prometteur, ni sous la limite de revente, avec une offre, l'effectif gardant 22 joueurs et 2 gardiens.
« Vendre · 3,4 M€ » vend aussitôt à l'offre de la carte (`acceptSaleProposalAction`,
`app/saves/[id]/transfers/sale-proposal-actions.ts` : `sellPlayer` avec `expected` ; un autre acheteur ou un autre montant,
rien n'est vendu, `offer_changed` et l'offre du moment) ; « Garder » l'écarte jusqu'à la fin du mercato
(`PlayerSave.saleKeptUntil`, `keepSaleProposal`). Les offres sont celles de `quoteSquadWithBuyers`, lu une fois par
requête et partagé avec `quoteSquad`. **Réglages** : Club → Réglages, « Ton adjoint s'occupe de »
(`settings-assistant-lineup`, `settings-assistant-contracts`, sous `lockSave`, refusés pendant un direct) ; une carrière
d'avant a une fois l'annonce de l'Accueil (`assistant-notice`, `Save.assistantNoticeAt`, posé à la création d'une carrière
neuve). Missions : « Enregistre ta composition » (`SAVE_LINEUP`) reste au poids 0, en tête de son tirage, et n'est plus
comptée depuis la composition enregistrée seule ; « Fais jouer un joueur de 21 ans ou moins » (`START_YOUTH`) compte une
entrée en jeu (`MatchFacts.players`).
Mesures (24/11, cahier § 15) : `npm run measure:assistant` et les sections k, l et m de `npm run measure:seasons`
(effectifs, joueurs libres, primes).

**Composition enregistrée seule (chantier « effectif et adjoint », § 1, 25/11).** Cahier
`docs/design/effectif-adjoint.md`, validé le 25/11. Aucun bouton « Enregistrer » : chaque geste complet de l'éditeur
(placer, échanger, envoyer au banc puis remplir, ordonner le banc, dispositif, consigne de départ) est enregistré
aussitôt, sans délai d'attente : Next exécute les Server Actions d'un client l'une après l'autre, et « Jouer le match »
touché après un geste joue le onze affiché. La file est pure (`app/saves/[id]/lineup/_lib/save-queue.ts`, testée) : un
enregistrement en route à la fois, le dernier état en attente à la place des précédents, un onze incomplet jamais envoyé
(« Poste vide : choisis un joueur pour l'enregistrer »), un échec réseau réessayé à 2, 5 puis 15 s (`RETRY_DELAYS_MS`)
avant « Pas enregistrée : pas de réseau · Réessayer » (`lineup-retry`), « … · enregistrement… » après 400 ms sans
réponse seulement, et le navigateur qui demande avant de quitter la page tant qu'un geste n'est pas enregistré
(`beforeunload`). En mode adjoint, dispositif et consigne lui restent (`saveLineupPlanAction`, point 1.A) ; le premier
geste sur un joueur prend la main (`saveLineupAction`), qu'un encart dit une fois (`lineup-took-hand`, avec « Rendre la
main à l'adjoint ») ; « Annuler » (`lineup-cancel`) revient geste par geste sur ceux de la visite, celui qui a pris la
main la rendant. Chaque enregistrement porte ce que l'onglet croit enregistré (`expected` : dispositif, composition,
mode ; `sameAsExpected`, `sameSavedLineup`, `src/db/lineup.ts`), comparé dans la transaction, la partie verrouillée
(`LINEUP_TRANSACTION` : 15 s pour une connexion, 60 s en tout, derrière une date qui se joue) : `saved`, `unchanged` (un
renvoi) ou `conflict` (« Changée dans un autre onglet · Voir la dernière », `lineup-reload` : l'éditeur repart de la
page relue, rien d'écrasé), sans migration ; un joueur parti ailleurs (`not-in-squad`) recharge la composition. Ni toast
ni `revalidatePath` : la ligne d'état le dit (`lineup-status`, `data-save` : `saved`, `saving`, `incomplete`, `failed`,
`conflict`, `automatic` ; `data-busy` ; `role="alert"` pour un échec ou un conflit), et l'écran fait relire la partie en
partant (`router.refresh()` de `LineupScreen`, après un enregistrement seulement). La mission « Enregistre ta
composition » n'est plus comptée. Pendant un direct en attente (`liveMatchesOf` : `Save.liveFixtureId`,
`liveInternationalId`), la Composition est en lecture seule (`lineup-live`, « Match en direct », le reste `inert` ; «
Reprendre le match », `lineup-live-resume`, en orange sous 1024 px, la colonne au-dessus) et le serveur refuse
(`LineupLiveError`, raison « live »). L'éditeur du sélectionneur suit les mêmes règles (`saveCoachLineup` avec
`expected`, point 1.F). Sans « Enregistrer », l'orange de la Composition est l'action de jeu de la colonne
(`LINEUP_PATHS`, `game-actions.tsx`) : composer, puis jouer. Tests : `save-queue.test.ts`, `lineup-editor.test.tsx`,
`lineup.test.ts` (renvoi, conflit, joueur parti, direct), `e2e/lineup-autosave.spec.ts` (deux onglets, réseau coupé,
départ juste après un geste, lecture seule d'un direct à 1280, 390 et 360 px) ; un E2E attend la fin des enregistrements
(`expectLineupSaved`, `e2e/helpers.ts`), et une partie partagée rend la main à l'adjoint (`resetLineup`, `e2e/db.ts`).

**Consigne de l'adjoint (chantier « effectif et adjoint », § 2, 25/11).** `Save.assistantPolicy` (enum
`AssistantPolicy`, migration d'ajout `…_assistant_policy`, `BEST` par défaut, carrières d'avant comprises ;
`ASSISTANT_POLICIES`, `src/engine/assistant-policy.ts` ; **ne jamais renommer une valeur**) : « Meilleur onze » (`BEST`,
le jeu d'avant elle) ou « Lancer les jeunes » (`YOUTH`). Dans Club → Réglages, « Sa consigne » sous les deux
interrupteurs, à côté quand les Réglages ont la place (`settings-assistant-policy`, `setAssistantPolicyAction`, la
partie verrouillée, refusée pendant un direct ; grisée et expliquée quand le joueur a repris la composition et les
contrats), rappelée sur la carte de l'adjoint de la Composition (`lineup-assistant-policy`, « Consigne : … · Changer ›
», vers `#reglages`). Elle ne vaut que pour ce dont l'adjoint s'occupe. **Composition** (`selectAssistantLineup` avec
`AssistantYouth` : `policy`, `starter`, `prospects` ; `withYoungStarters`) : en championnat seulement, sous `YOUTH`,
jusqu'à trois (`YOUTH_POLICY_PER_MATCH`) joueurs de 21 ans ou moins au 1er juillet (`YOUTH_POLICY_MAX_AGE`), à 5 points
de marge au moins (`YOUTH_POLICY_MIN_ROOM`), sous 25 titularisations de championnat (`YOUTH_POLICY_STARTS`), disponibles
et reposés, le mieux noté d'abord, chacun à l'un de ses postes où il vaut au plus 10 points de moins que le titulaire
(`YOUTH_POLICY_MAX_RATING_GAP`), le plus petit écart d'abord ; le jeune de l'objectif Jeunesse d'abord, jusqu'à sa 15e
titularisation ; coupe et Europe gardent le meilleur onze. `BEST` rejoue l'ancien code (comparé à une copie de
l'ancienne fonction sur 300 effectifs tirés). Lu par le match (`managedModeOf`, `assistantYouthOf` : une requête de
plus, les titularisations des jeunes, sous `YOUTH` en championnat seulement), l'éditeur (`LineupEditor.policy`,
`youth`), l'aperçu et `keptOffSales`. **Contrats** (`wantsToKeep` avec la consigne) : sous `YOUTH`, un espoir (23 ans au
plus) est aussi prolongé dès que son potentiel atteint le niveau − 3 (`YOUTH_POLICY_PROSPECT_MARGIN`), un joueur de 30 à
32 ans doit valoir le niveau − 2 (`YOUTH_POLICY_VETERAN_AGE`, `YOUTH_POLICY_VETERAN_MARGIN`) au lieu de − 5 ; lu par la
présaison, la fiche et « À faire ». Mesures du cahier (§ 2.3, 15 clubs × 3 saisons) : minutes de championnat des 21 ans
et moins × 3 (364 → 1 083), progression + 58 %, − 0,014 ± 0,019 point par match. Vérifié sur le jeu le 26/11
(`npm run measure:assistant -- --seasons=3 --lineup=game --contracts=game --policy=YOUTH`, cahier § 8, contre `BEST`) :
Lyon et Metz, environ 1 100 minutes par jeune et par saison, progression par jeune + 2,95 contre + 2,00 et + 2,71 contre
+ 1,52, points par match 1,78 contre 1,80 et 1,68 contre 1,63. Tests : `src/engine/lineup.test.ts`,
`assistant-contracts.test.ts`, `src/db/assistant-policy.test.ts`, `e2e/assistant-policy.spec.ts`.

**Jeunes ciblés et entrées garanties (chantier « effectif et adjoint », § 9, 27/11).** Cahier § 9, règle validée le 27/11
telle que mesurée. Sous « Lancer les jeunes », en championnat, quand l'adjoint fait la composition (coupe, Europe,
sélections, `BEST` et composition du joueur inchangés) : ses **jeunes ciblés** (`youthTargets`, `src/engine/lineup.ts`)
sont ceux que le joueur marque « Le lancer », 3 au plus (`YOUTH_ENTRY_MAX_TARGETS`), dans l'ordre de ses marques, sinon
les 2 plus gros potentiels (`YOUTH_ENTRY_DEFAULT_TARGETS`) parmi ceux que la consigne lit (21 ans ou moins au 1er juillet,
5 points de marge, moins de 25 titularisations), jamais un gardien ; la titularisation de la règle précédente ne change
pas. Un ciblé qui ne démarre pas, disponible et reposé (75 ou plus), va sur le banc juste après le gardien remplaçant
(`Lineup.youthEntries`, `withYouthEntries`) et entre à la reprise de la 60e (`YOUTH_ENTRY_MINUTE`, daté de la 61e, une
fenêtre du club ; `bringYoungPlayersOn`, `src/engine/match.ts`), à son poste ou à un poste secondaire, à la place du
titulaire le plus fatigué de ce poste (`youthEntryOut`), jamais d'un autre ciblé ni du gardien ; de la 55e à la 60e, un
changement de fatigue n'est fait que s'il laisse la place aux entrées prévues (`youthEntriesDue`) ; jamais plus de 5
changements ; dès le premier changement du joueur en direct (`TeamLive.manual`), plus aucune. Aucun tirage de plus :
`BEST` et les clubs IA jouent les mêmes matchs au bit près, le direct sans changement est la simulation
(`TeamLive.youthEntries`, gardé par l'état du direct). **Les marques** : `Save.youthLaunches` (migration d'ajout
`…_youth_launches`, liste de `playerKey`, vide par défaut), écrites par `setYouthLaunch` (`src/db/youth-launches.ts`, la
partie verrouillée ; refus `not-eligible` et `full`, une marque retirée jamais refusée ; `setYouthLaunchAction`) : un
joueur de champ du club de 21 ans ou moins au 1er juillet (`canBeLaunched`, `keptYouthLaunches`,
`src/engine/youth-launches.ts`, pur) ; un joueur vendu ou libéré sort de la liste aussitôt (`forgetYouthLaunch`), un
parti libre, passé à 22 ans au 1er juillet ou devenu gardien au passage de saison (`keepValidYouthLaunches`, présaison)
et à chaque écriture ; un blessé ou un suspendu y reste, laissé de côté tant qu'il est indisponible. **Écrans** : la fiche
d'un tel joueur (`YouthLaunchField`, `player-youth-launch` avec `data-marked` et `data-inactive` « best » ou « byPlayer »,
le bouton `youth-launch-toggle` « Le lancer » / « Ne plus le lancer », refusé au-delà de 3 ;
`PlayerProfile.youthLaunch`, `YouthLaunchView`), la vue « Jeunes » de l'Effectif (`?vue=jeunes` l'ouvre ; la colonne
« Lancer », `squad-column-launch`, à la place du contrat, et `squad-young-launches` avec `data-marks` : les marques de
toutes les lignes ensemble, `useYouthLaunches`), Club → Réglages sous « Lancer les jeunes » (« Il lancera : X, Y · tes
choix » ou « · les plus gros potentiels », `getYouthLaunchPlan`, `settings-assistant-launches` avec `data-kind` et
`data-by-marks`, « Choisir › » vers la vue « Jeunes »), et le Coaching à la mi-temps et à la pause de la 60e
(`HalfTimeTeam.youthEntries`, `plannedYouthEntries`, `src/db/live-match.ts` ; `bestChange` : un blessé d'abord, puis
l'entrée prévue, raison `youth` ; « À la 61e, je fais entrer … », « À la reprise… », « Fais entrer… » une fois les
changements du joueur). Mesures du cahier (§ 9.3, quatre clubs, trois saisons) : au Bayern, 64 → 942 minutes par jeune
ciblé et par saison, progression + 2,67 → + 4,83 ; ailleurs 170 à 500 minutes de plus ; points dans le bruit d'une graine
(+ 0,005 par match). Tests : `src/engine/lineup.test.ts`, `src/engine/live.test.ts`, `src/engine/youth-launches.test.ts`,
`src/db/youth-launches.test.ts`, `app/saves/[id]/live/_lib/youth-entries.test.ts`, `half-time-moves.test.ts`,
`e2e/assistant-policy.spec.ts`.

**Évolution des joueurs (chantier « effectif et adjoint », § 3, 25/11).** `PlayerSave.previousOverall` (migration
d'ajout `…_previous_overall`, nullable) : la note d'avant la progression du dernier passage de saison, écrite par
l'`UPDATE` des joueurs d'`advanceToNextSeason` (`"previousOverall" = p."overall"`, aucune ligne de plus) ; null pour un
joueur arrivé depuis et tant que la partie n'a pas passé de saison (le club dirigé la lit alors dans le relevé de sa
saison passée). Le relevé de fin de saison garde aussi le potentiel (`SeasonResult.highlights.squad[].potential`,
facultatif, version inchangée). Moteur (`src/engine/progression.ts`, pur) : `expectedProgression`, la formule de
`progressPlayer` sans son tirage, que celle-ci appelle désormais dans le même ordre d'opérations (`progression.test.ts`
la compare à une copie de l'ancienne : une saison rejouée reste identique au bit près) ; `projectedLeagueMinutes`, les
minutes de championnat prolongées au prorata des matchs de championnat du club, 0 avant le premier. Lecture
(`PlayerProfile.progression`, `getPlayerProfiles`, `src/db/progression-view.ts`) : `last` (« ↑+4 ») et, pour le seul
club dirigé, `outlook` (minutes de championnat de la saison, progression attendue arrondie loin de zéro, bornes « sans
jouer » et « titulaire », ou le déclin) et `history` (la courbe, par les relevés) : trois requêtes de plus, seulement
quand la liste a des joueurs du club dirigé. **Effectif** : « 71 ↑+4 » sur la note (`player-last-progression`), la
colonne « Cet été », triable (« ↗ +3 prévu », `player-expected-progression`, dès +1 ; la 3e ligne d'une carte sur
téléphone), la phrase d'aide (`squad-help` : « Tes joueurs progressent l'été, d'autant plus qu'ils jouent en
championnat. »), et la vue « Jeunes · N » (`squad-young-toggle`, les 21 ans et moins à l'âge affiché,
`squad-young-intro` : la jauge des minutes à la place de la valeur, `player-league-minutes`, « potentiel 82 », « 1 240
min · ≈ +3 »). **Fiche** (`player-sheet-progression`) : la courbe (`player-progression-curve`, dès deux points), «
Potentiel 82 · marge 5 », « Cet été, environ +3 » avec la jauge et ses bornes, ou le déclin dès 31 ans au 1er juillet
suivant ; pour un joueur d'un club IA, son seul « ↑+3 ». Flèches dessinées, jamais des glyphes ; zones `squad` et
`player-sheet` (espace `progression`). Une carrière passée avant cette version n'a pas de « ↑ » pour les joueurs des
clubs IA avant son passage suivant. Tests : `progression.test.ts`, `src/db/progression.test.ts`,
`progression-view.test.ts`, `e2e/progression.spec.ts` (`e2e/progression-save.mts` : un jumeau 1 de la démo joué, passé,
puis rejoué six dates) à 1280, 390 et 360 px.

**Équilibrage des deux divisions.** Mesuré par `npm run measure:divisions` (six saisons d'un jumeau 2 de la démo, sur
base locale seulement) avant tout réglage, réglé dans `balance.ts` une chose à la fois, la calibration de
première division vérifiée après chaque changement (`match.test.ts`, chaque club dans le dispositif qu'il choisit :
2,5 à 2,8 buts, 42 à 46 % à domicile, 23 à 27 % de nuls, Bayern bat Monza plus de 75 fois sur 100) ; celle de deuxième
est épinglée dans `match-d2.slow.test.ts`, les deux sur une saison avec forme dans `match-season.test.ts`. Jeunes :
réputation et note lues dans la plage de la division du club (`YOUTH_OVERALL_BY_TIER`). Aucun club IA ne vend à un autre
depuis la simplification : sa vente forcée au-dessus de sa masse salariale (`planWageSales`) ne s'est jamais déclenchée.

**Montées et descentes (parties 2 seulement).** À chaque `advanceToNextSeason`, dans sa transaction : les classements
finaux (même ordre que le classement affiché), puis `applyPromotionRelegation` (`src/engine/promotion.ts`, pure) avec
`PROMOTION_RELEGATION` (`balance.ts`, par pays : 3 en Angleterre, Espagne, Italie ; 2 en Allemagne, France ; échanges
directs, sans barrages, tailles constantes). Le résultat du club dirigé note `SeasonResult.promoted` / `relegated`
(false pour une ligne reconstruite) ; avant la présaison, chaque club qui bouge change de `ClubSave.competitionId`, sa
réputation et ses finances suivant comme celles de tous les clubs (règle « Réputation et budget de saison ») ; joueurs et
contrats intacts ; `Season.movements` (Json validé par Zod, `src/db/promotion.ts`) garde sur chaque saison terminée les
clubs qui quittent sa compétition.
Une partie 1 n'a qu'une division par pays : aucun mouvement, `movements` reste null (test lent de non-régression).

**Réputation et budget de saison (gameplay v2, V2).** `ClubSave.reputation` (1–99) suit les saisons, clubs IA et club
dirigé, dans les deux mondes : à chaque `advanceToNextSeason`, `applySeasonReputations` (`src/db/season-finances.ts`)
lit les classements finaux, et la réputation d'un club qui reste dans sa division fait le quart du chemin
(`REPUTATION_TARGET_SHARE`, arrondi pareil vers le haut et vers le bas) vers sa cible, la réputation que la création
donne au club classé à son rang final dans sa division (`reputationTarget`, `clubFinances`) ; un promu ou un relégué
prend d'un coup celle du rang équivalent de sa nouvelle division : les derniers rangs de celle du dessus pour les promus,
dans l'ordre de leur classement (le champion de D2 anglaise y est 18e), les premiers de celle du dessous pour les relégués
(`rankInNextDivision`, `reputationAfterSeason`, `src/engine/reputation.ts`, pure). Les cibles d'une division étant ses
réputations de création, une par rang, ses réputations gardent leur étalement (écart-type par division et par saison,
section « Étalement des réputations » de `npm run measure:seasons`). Le rang attendu d'un club est son rang de réputation
dans sa division pendant la saison (`reputationRanks` : un club par rang, à réputation égale le plus haut plafond
salarial d'abord, puis le slug, pour qu'une division garde ses sommes : ses rangs attendus valent ses rangs finaux, ses
dotations son budget de création) ; à la création, sur les réputations et plafonds que la table donne à son rang d'origine
(`creationReputationRanks`), jamais sur la masse salariale que la graine tire : le rang qu'annoncent les cartes du choix du
club. Puis, avant la présaison, chaque club reçoit sa dotation
(`applySeasonFinances`, `seasonFinances`, `economy.ts`) : le budget de création (`clubFinances`) à son nouveau rang de
réputation dans sa nouvelle division, × son coefficient, + pour le seul club dirigé la moitié de son budget non dépensé
(`BUDGET_CARRY_OVER_SHARE`, ventes et primes comprises) : un club IA repart chaque saison de sa dotation, que son budget
jamais dépensé doublerait sinon. Son plafond salarial ne limite plus rien (règle « Simplification ») : il reste calculé,
pour départager deux réputations égales, sa masse salariale de fin de saison, lue avant tout départ (`payrollsOf`), × 1,20
(`WAGE_BUDGET_MARGIN`), entre la moitié (`WAGE_BUDGET_FLOOR_SHARE`,
`wageBudgetFloor`) et la totalité de celui de la table à son nouveau rang (`clubFinances`, `wageBudgetFor`) : un club
qui a beaucoup vendu ou perdu ses fins de contrat peut reconstruire ; pour le club dirigé, la marge suit son
coefficient, de × 1,10 à 70 à × 1,30 à 140 (`managedWageMargin`, `MANAGED_WAGE_MARGIN_RANGE`). À la création de même,
sur la masse de l'effectif complet, après la présaison (`applyCreationWageBudgets`) : la marge permet environ trois
recrues types, autant que le budget ; une partie d'avant la règle la reçoit à son prochain passage de saison.
Coefficient en centièmes, 70 à 140 (`budgetCoefficient`, `src/engine/objectives.ts`) : un club IA a celui de son seul
objectif de classement (`rankingObjective` sur son rang attendu, `rankingOutcome` sur son rang final : dépassé +20,
atteint +10, manqué −15), le club dirigé celui de ses objectifs (règle « Objectifs de saison »), 100 pour une saison
sans eux (une partie d'avant eux, au prochain passage). Le détail de la dotation du club dirigé est gardé par saison
dans `SeasonBudget` (migration d'ajout `…_season_budget`, une ligne par saison de championnat, écrite par
`createSave`, son budget de départ, puis à chaque passage de saison).

**Objectifs de saison (gameplay v2, V3).** Pour le seul club dirigé, sur chaque saison de championnat, `SeasonObjective`
(migration d'ajout `…_season_objectives`, avec `PlayerSeasonStats.starts`, les titularisations, comptées depuis),
ouverts par `openSeasonObjectives` (`src/db/objectives.ts`) à la création de la partie et à chaque passage de saison,
après la présaison et l'ouverture des coupes : le classement (`rankingObjective`, `src/engine/objectives.ts`, pur, sur
le rang de réputation : top 3, montée, maintien, ou finir à son rang attendu ou mieux, jamais la dernière place ; la marge
du cahier, +2 et +3, ramenée à 0 par la mesure, `FINISH_OBJECTIVE_MARGIN_BY_TIER`), la coupe quand le pays en
a une (`cupObjective` : quarts, huitièmes, seizièmes selon le tiers de réputation, au moins un tour après l'entrée ;
dépassée deux tours plus loin), l'Europe quand le club la joue (`europeObjective`, règle « Compétitions européennes »), et
trois des quatre objectifs au choix, tirés du flux de la saison
(`proposedObjectives`, `objectivesRngSeed`) : Jeunesse (un joueur de 21 ans ou moins au 1er juillet, 15 titularisations
en championnat), Spectacle (buts marqués ≥ attendus × 1,10), Solidité (buts encaissés ≤ attendus × 0,90 ; attendus :
`expectedSeasonGoals`, l'effectif du départ dans son dispositif face à l'adversaire moyen de sa division, × 0,93, ce
qu'une saison en donne, `EXPECTED_SEASON_GOALS_FACTOR`), Bonne gestion
(solde des transferts de la saison ≥ 0). Le joueur en choisit un sur l'écran de début de saison (`chooseObjective`, une
fois, avant le premier match du club de la saison, la partie verrouillée), sinon l'adjoint, dans la transaction qui
joue ce premier match (`ensureObjectiveChosen` : Jeunesse, ou le premier proposé). Où en est chacun : `objectiveProgress`
(pur ; `SeasonProgress` lu par `readSeasonProgress` : rang, matchs, parcours de coupe, titularisations, buts, solde) ; la
confiance du président (`ClubSave.boardConfidence`, `boardConfidence` : 50 et des points par objectif) est réécrite
après chaque match du club (`refreshBoardConfidence`), affichée seulement : jamais de renvoi. **Un début qui ne juge
pas** (chantier « première session », 12/11) : avant le 5e match de championnat du club de la saison
(`OBJECTIVES_JUDGED_FROM_MATCH`, `tooEarlyToJudge`, la saison pas finie), un objectif encore indécis s'affiche « Trop tôt
pour juger » (`objectiveStatus`, statut de vue `TOO_EARLY`, pastille neutre ; une issue déjà décidée reste montrée), et la
confiance tient à sa valeur d'ouverture, chaque objectif compté en bonne voie (`seasonConfidence`, lue telle quelle par
`getSeasonObjectives` pendant ce temps), « Il te laisse le temps de démarrer » ; l'objectif pris par l'adjoint le dit
(« Choisi par l'adjoint », et pendant ce temps une ligne de la carte Objectifs du tableau de bord). Après une défaite,
un mot de l'adjoint (`assistantWordAfter`, `src/lib/session-end.ts`, pur : sortie de coupe, trop tôt pour juger, défaite
de peu, lourde, ou sans plus ; zone `session-end`), sous le dernier match de l'Accueil et dans la carte « À demain ».
À `advanceToNextSeason`,
`closeSeasonObjectives` écrit l'issue des imposés et du choisi (`objectiveOutcome`) et donne le coefficient de la
dotation suivante (`budgetCoefficient` : classement +20 / +10 / −15, coupe +10 / +5 / −5, choisi +10 / 0, de 70 à 140).
Une partie d'avant eux n'en a qu'à partir de sa saison suivante. Les écrans les nomment par `objectiveGoal`,
`objectiveExceed` et `objectiveCurrent` (`app/saves/[id]/_lib/objectives.ts`), zone de messages `objectives`.

**Coupes nationales (parties 2 seulement).** `CUPS_ENABLED` (`src/engine/cup.ts`) vaut **true** : toute nouvelle
partie 2 a ses coupes dès sa création, une partie 2 d'avant les coupes les reçoit à son prochain passage de saison. À
false, le jeu n'en créerait plus aucune (`createSave({ …, cups })` reste pour un test qui en décide) ; une partie qui a
des coupes les garde de saison en saison. Une coupe par pays (`Competition.kind = CUP`, `xx.cup`, niveau 0,
« Pays — Coupe », arrivée par la migration de données `…_national_cups`), à élimination directe entre les clubs de ses
deux divisions : tour préliminaire entre les plus bas pour ramener le pays à 32, puis seizièmes à finale (`round` 1 à
6, N − 1 matchs). Ouverte (saison de coupe et tour préliminaire, `openCups`, `src/db/cup.ts`) à la création d'une
partie 2 et à chaque `advanceToNextSeason` (les parties 2 d'avant la coupe l'ont à la saison suivante) ; chaque tour est
tiré (`progressCups`) dans la transaction qui joue le dernier match du précédent, primes créditées sur
`ClubSave.budget`. Dates pures (`cupDates`, `src/engine/cup.ts`) : mercredis sans mardi de championnat, finale le samedi
après la dernière journée. Prolongation et tirs au but : skill `moteur-de-match`. Un match de coupe a sa propre graine
(`cupMatchRngSeed`) et n'écrit de stats que pour les joueurs du club dirigé. **Tout lecteur de championnat filtre
`competition.kind = "LEAGUE"`** (classement, montées et descentes, palmarès et carte, meilleur joueur, marché, résumé de
simulation), un lecteur de coupe `CUP`, d'Europe `EUROPE` ; `SeasonResult` reste une ligne de championnat, avec `cupRound`
et le trophée `cup` (et le parcours européen, règle « Compétitions européennes »).

**Écrans de la coupe.** Un match de coupe se nomme « Coupe — Tour préliminaire / 16es / 8es / Quarts / Demi-finale /
Finale », jamais « Journée N » (`stageLabel`, `app/saves/[id]/_lib/stage.ts`) ; son score porte « a.p. » et
« 5-3 t.a.b. » (`ScoreNotes`), son résultat pour le club vient de la séance. Le direct du club du joueur s'arrête deux
fois sur un match de coupe nul après 90 minutes : mi-temps (`Fixture.status` HALF_TIME), puis « Fin du temps
réglementaire » (REGULATION_END, un remplacement de plus) ; `advanceLiveMatch` reprend à la bonne pause, et sans
changement le match est celui joué sans pause. Page Coupe (`app/saves/[id]/cup`, `getCupBracket`,
`src/db/cup-view.ts`) et onglet « Coupe » sous Match pour une partie qui a une coupe ; palmarès (« Vainqueur de la
Coupe », « Coupe : quarts de finale »), carte (« COUPE », « DOUBLÉ », `cardBadge`) et panneau « Saison terminée ».

**Compétitions européennes (parties 2 seulement, chantier « europe », 17/11).** Cahier `docs/design/europe.md`, validé le
17/11. Deux compétitions inventées (`Competition.kind = EUROPE`, niveau 0, pays « Europe », arrivées par la migration de
données `…_european_competitions`, après la migration de schéma `…_european_competitions_schema` qui ajoute les valeurs
d'enum) : la **Coupe des Lauriers** (`eu.1`, « Laurel Cup » : les 4 premiers de chaque première division, 4 chapeaux de 5)
et la **Coupe des Fanions** (`eu.2`, « Pennant Cup » : ses 5e, 6e et vainqueur de coupe, 3 chapeaux ; un vainqueur déjà
qualifié par son rang, 1er à 6e, laisse sa place au 7e, comme sans vainqueur ; un vainqueur de D2 joue l'Europe), jamais
les deux. `EUROPE_ENABLED` (`src/engine/europe.ts`) vaut true : une nouvelle partie 2 les a dès sa saison 1, qualifiés par
`Club.initialRank` (la place de la coupe au 7e) ; une partie 2 d'avant les reçoit à son prochain `advanceToNextSeason`
(après les coupes, avant les objectifs, depuis les classements finaux et les vainqueurs de coupe : `europeQualifiersOf`,
`cupWinnersOf`), sa saison en cours inchangée ; **jamais une partie de défi** (`createChallengeSave` avec `europe: false`,
et son passage de saison n'en ouvre pas). `openEurope` (`src/db/europe.ts`) : une `Season` par compétition, ses clubs
dans `Season.entrants` (Json validé par Zod, `parseEuropeEntrants` : chemin RANK ou CUP, division, rang, chapeau,
réputation à l'ouverture), toute sa phase de ligue tirée (`drawLeaguePhase`, flux `{graine}:europe-draw:{année}:{code}` :
pour chaque paire de chapeaux, un ordre des cinq pays ; jamais deux clubs d'un pays, un match reçu et un visité contre
chaque autre chapeau, aucun nouvel essai) et la prime de participation créditée, après la dotation du club dirigé
(`SeasonBudget` n'en tient pas compte). Phase de ligue, `round` 1 à 6 : 6 matchs par club en Lauriers, 4 en Fanions, un
classement unique (`leaguePhaseTable` : points, différence, buts marqués, réputation à l'ouverture, slug) ; puis un
tableau fixe (`knockoutTies`) : barrages (`round` 7 : 5e-12e, 6e-11e, 7e-10e, 8e-9e), quarts (8 : le 1er contre le
vainqueur de 8e-9e…), demies (9), finale (10) **sur terrain neutre** (`isNeutralRound`, `MatchState.neutral`, gardé par
l'état du direct : ni l'un ni l'autre n'a `HOME_ADVANTAGE`) ; matchs secs chez le mieux classé de la phase de ligue,
prolongation et tirs au but comme la coupe (`isKnockout` : un match de coupe, ou européen après la phase de ligue). Chaque
tour créé par `progressEurope` dans la transaction qui joue le dernier match du précédent, avec les primes de chaque match
(`EUROPE_PRIZES`, `balance.ts` : participation 3 / 1,5 M€, victoire de phase de ligue 0,6 / 0,3, place en quarts 2 / 0,8,
quart gagné 3 / 1,2, demie 4 / 1,8, finale 8 et 4 / 3,5 et 1,75), créditées sur `ClubSave.budget`. Dates pures
(`europeDates`) : mercredis des semaines 4, 6, 8, 10, 14, 17, 24, 28 et 36 (sans tour de coupe ni mardi de D2), **finales
le samedi 29 mai** (la semaine après la finale de coupe : une saison avec l'Europe finit une semaine plus tard). Graine d'un
match : `europeMatchRngSeed` (son code compris : aucun flux du championnat ni de la coupe ne bouge). Discipline : jaunes
européens à part, **3 suspendent** pour le prochain match européen (`EUROPE_YELLOWS_PER_SUSPENSION`, `PlayerSave.europeYellows`
et `suspendedEuropeMatches`, `yellowsPerSuspension`), un rouge pour le prochain match officiel ; tout revient à 0 en fin de
saison. Stats d'un match européen : joueurs du club dirigé seulement, comme la coupe (`FinishedMatch.competition`). Un club
IA choisit son dispositif avant un match contre le club dirigé (`aiLineupOf`, `facesManaged`) : l'aperçu de l'adversaire
étranger est le match joué. Réputation : **bonus de cible** (`europeReputationBonuses`, `EUROPE_REPUTATION_BONUS` : Lauriers
+1 en quarts, +2 finaliste, +3 vainqueur ; Fanions +1 finaliste, +2 vainqueur ; plafond 99), ajouté à la cible, jamais à la
réputation (`applySeasonReputations`). Objectif imposé `EUROPE` (`ObjectiveKind`, ajouté en dernier) au club dirigé
qualifié : `europeObjective` par tiers de réputation parmi les clubs de sa compétition à l'ouverture (les quarts pour les
deux tiers hauts, les barrages pour le bas, dépassé deux tours plus loin ; le tiers haut visait les demies jusqu'au 17/11,
atteintes une saison sur trois ou quatre ; `EUROPE_STAGES` : 1 phase de ligue, 2 barrages, 3 quarts, 4 demies, 5 finale,
6 vainqueur), coefficient comme la coupe (`EUROPE_COEFFICIENT`), compté par la confiance du président ; `SeasonProgress.europe`
(`clubEuropeRun`). `SeasonResult.europeCode`, `europeStage` (1 à 5, la finale pour son vainqueur) et le trophée « europe »
(`EUROPE_TROPHY`). Rotation du club dirigé à la main : « À faire » signale avant un match européen ses titulaires sous
`ROTATION_FITNESS` (75) au coup d'envoi (`tired-starters`), et ses joueurs à 2 jaunes européens (`europe-booking-risks`).
Mesures du 17/11 (`measure:balance -- --world-only`, `measure:seasons`, `measure:weight -- --archive`) : section
« Europe » des deux premiers, et le cahier.

**Écrans de l'Europe.** Page Europe (`/saves/[id]/europe`, `getEuropeView`, `src/db/europe-view.ts` ; les dérivations,
statut, prochain match et prime, dans `app/saves/[id]/europe/_lib/europe.ts`, pur et testé) sous Match, après Coupe : la
dernière année européenne de la partie, la compétition du club dirigé d'abord (la Coupe des Lauriers s'il n'est pas
qualifié ; `?c=eu.1`, `?c=eu.2`), 404 sans saison européenne. Sa carte sur le bleu vif (`europe-card`, toujours celle de la
compétition du club : statut, cinq étapes comme la carte de la coupe, `europe-progress`, prochain match, prime en jeu),
la bascule (`europe-switch`, `europe-switch-eu1`, `-eu2`), le vainqueur une fois la finale jouée (`europe-winner`), le
classement de la phase de ligue (`europe-table`, `europe-table-row` avec `data-rank`, `data-managed`, `data-zone` :
pastille bleue du 1er au 4e, neutre du 5e au 12e ; le pays de chaque club), les matchs du club à côté à partir de `xl`
(`europe-matches`), puis le tableau (`europe-bracket`, `europe-round-7` à `10`, `europe-tie`, « À déterminer » avant la
fin de la phase de ligue, la finale « Terrain neutre », `europe-neutral`) ; aucun orange plein, l'action de jeu reste dans
la colonne. Partout ailleurs, un match européen se nomme par sa compétition et son tour (`stageLabel` : « Coupe des
Lauriers — 3e journée », « Coupe des Fanions — Finale » ; `isEuropeStage`, `stageNamesCompetition`, `isNeutralStage`) :
calendrier (étiquette « LAURIERS » ou « FANIONS » en vert, `data-europe`), feuille de match, direct (« Terrain neutre » à la
place du stade pour la finale ; les autres matchs, ceux de la même compétition ce jour-là), en-tête (`nextStage` avec son
code), résumé de simulation, héros de l'Accueil (le pays de chaque club, son rang et ses points de phase de ligue,
`europePreviews`), enjeu de « À demain » (`europeStakeOf` : élimination directe, finale, premier match de la phase de
ligue, une victoire pour les quatre ou les douze premiers, le rang de l'adversaire) et mot de l'adjoint après une
élimination (`europeExit`). `e2e/europe.spec.ts` couvre la page à 1280, 390 et 360 px, le calendrier, et une finale jouée
en direct jusqu'aux tirs au but (`e2e/europe-final-save.mts`, un jumeau 1 de la démo, Lyon-Naples le 12 août).

**Sélections nationales (chantier « sélections », N1 et N2, 18/11).** Cahier `docs/design/selections.md`, validé le 18/11
(les éliminatoires et les tournois, N3, règle suivante ; le sélectionneur, N4, viendra après validation des mesures). **Les 14 nations** sont les 14
nationalités du jeu, une par liste de noms (`NATIONS`, `NATION_CODES`, `src/engine/nations.ts`, pur : 9 d'Europe, 5 du
reste du monde ; `nationOfNationality` lit `PlayerSave.nationality`) ; aucune autre n'existe, aucune n'est ajoutée.
Chacune a sa **réserve « hors championnats »** : 23 joueurs que le jeu ne fait jouer qu'en sélection, tirés à l'ouverture
des nations de la partie (`generateReserve`, flux `{graine}:nation-reserve:{code}:{année}`), notés dans la plage de leur
nation (`NATION_RESERVE_LEVELS`, `balance.ts` : 62-70 pour les cinq grandes, 72-81 pour le Brésil, l'Argentine et le
Portugal, 69-77 pour les Pays-Bas, la Belgique et la Croatie, 66-74 pour le Maroc, le Sénégal et la Côte d'Ivoire),
leur potentiel jamais au-dessus de sa borne haute, vieillis à chaque passage de saison (`reserveAfterSeason` :
`progressPlayer` en titulaire, retraite à 34 ans et un joueur de 21 ans à sa place) ; gardée dans `NationSave` (migration
d'ajout `…_national_teams`, une ligne par nation et par partie, `reserve` validé par Zod, sélections et buts des
réservistes dans `reserveCaps` et `reserveGoals`, à part du JSON). **Une convocation** (`callUp`, pur) : les 3 meilleurs
gardiens, 7 défenseurs, 7 milieux et 4 attaquants de la nationalité, disponibles (ni blessés, ni libres, ni retraités),
de nos clubs ou de la réserve, puis les 2 meilleurs joueurs de champ restants ; un réserviste seulement là où il vaut mieux
(`readCallUps`, `src/db/nations.ts`, une requête `ROW_NUMBER` par nationalité et par ligne). La force d'une sélection est
celle d'un club IA : `rankFormations` sur ses 23, au niveau de la D1. **Les trêves** : 4 par saison, semaines 3, 8, 13 et 32
(`BREAK_WEEKS`, `breakWindows`, `src/engine/schedule.ts` : en 2026-27, 4-8 septembre, 9-13 octobre, 13-17 novembre,
26-30 mars), deux matchs, le vendredi et le mardi ; aucun match de club du mercredi d'avant au mercredi de la trêve. Une
saison avec trêves (`withBreaks`, `Save.breaksFrom` : posé à la création d'une partie 2, au prochain passage de saison
d'une partie 2 d'avant, jamais pour un défi ni une partie 1, `nationsFor`) a son propre calendrier : 36 samedis de club au
lieu de 40, puis les mardis de `BREAK_SEASON_TUESDAY_WEEKS` (19, 30, 2, 22, 35, 38, 0, 1, 23, 31 : deux pour les 38
journées, 29 décembre et 16 mars, six pour les 42, dix pour les 46 ; jamais la semaine d'un mercredi de coupe ou d'Europe
ni celle d'après, où un club jouerait mercredi, samedi et mardi), la coupe (`cupDates(…, true)` : seizièmes en semaine 15)
et l'Europe (`europeDates(…, true)` : 3e et 4e journées en semaines 9 et 11) déplacées ; toujours 62 dates de club ; les
lecteurs de ces dates (`seasonFixtures`, `openCups`, `progressCups`, `openEurope`, `progressEurope`, `getCupBracket`,
`getEuropeView`) prennent `seasonHasBreaks(breaksFrom, startYear)`, la saison en cours d'une partie d'avant ne bouge pas.
**Les matchs internationaux** sont dans `InternationalMatch` (même migration ; hors de `Fixture` et de `Season` : aucun
lecteur des matchs de club ne les voit), créés à l'ouverture de chaque saison (`openNations` : 56 matchs amicaux, une
journée d'un tourniquet des 14 nations par date, `friendliesOfRound`, qui continue de saison en saison). **Une trêve est
une étape de la partie** : `playNextMatchday` la joue d'un bloc quand elle vient avant la prochaine date des clubs
(`playInternationalBreak` : convocations à sa première date, dispositif choisi une fois, chaque match en **simulation
légère**, `playLightFriendly`, `src/engine/international.ts`, pur : buts attendus du moteur, Poisson par quart d'heure,
buteurs pondérés comme le moteur, 5 changements à la 60e, condition perdue comme en match, blessures au taux du moteur ;
graine `internationalMatchRngSeed`), puis en quelques requêtes ses résultats (`goalTimes`, `scorers`, et les joueurs du
club dirigé dans `managedPlayers`), la récupération des autres joueurs, les lignes de ceux qui ont joué (condition au
dernier jour, blessure, `PlayerSave.caps` et `internationalGoals`), et la date de la partie, le mardi. « Prochain match »
s'arrête après une trêve (`playUntilNextMatch`, `breakPlayed`) : le bouton dit alors « Passer la trêve »
(`SaveHeader.nextBreak`) ; « Simuler jusqu'à… » les traverse, et son résumé les raconte (`SimulationSummary.breaks`).
Un E2E qui mène une partie neuve au-delà du 3 septembre passe la trêve avant son match (`passInternationalBreak`,
`e2e/helpers.ts`).
Rien ne change à la forme ni à la valeur des joueurs. **Écrans** : `getManagedBreak` (`src/db/nations-view.ts`) dit la trêve
du club dirigé, « upcoming » dès son dernier match avant elle (ses appelés, la convocation même de la trêve) ou « back »
le jour de son retour ; l'Accueil en tire la ligne du héros (`hero-break`) et deux lignes d'« À faire »
(`international-callups`, puis `international-returns` : blessés en sélection et titulaires sous 75 au coup d'envoi) ;
l'effectif marque les appelés (« En sélection · SEN », `player-badge-called-up`) ; la fiche a sa section Sélection
(`player-sheet-international` : sélections et buts, convocation, blessure en sélection) ; le calendrier a une ligne par
trêve (`fixtures-break`, `getSeasonBreaks`) ; l'onglet **Sélections** sous Match (`/saves/[id]/internationals`,
`nav-internationals`, `getNationsView`, 404 sans nations) classe les 14 nations par force, avec leurs 23, la prochaine
trêve et les résultats de la dernière. Zone de messages `nations`. `e2e/internationals.spec.ts` passe la première trêve
d'une partie neuve à 1280, 390 et 360 px ; `nations.test.ts` et `nations.slow.test.ts` (une partie d'avant n'a ses trêves
qu'à sa saison suivante, deux jumeaux jouent la même trêve) ; mesures dans la section « Sélections nationales » de
`npm run measure:seasons` et au § 14 du cahier (18/11 : 2,60 buts par match comme avant ; environ 210 joueurs de nos clubs
appelés par trêve, 2,2 par club de D1, 13 au plus ; un international rentre vers 75 le mardi, 95 au samedi ; titulaires
sous 75 en octobre : 1 à 4 % chez les clubs européens qui prêtent le plus ; 20 à 24 ms de CPU par trêve ; 35 Ko par saison).

**Trêve hivernale (chantier « équilibrage », 23/11).** Dans une saison avec trêves, les championnats d'Espagne,
d'Italie, d'Allemagne et de France (`WINTER_BREAK_COUNTRIES`, `hasWinterBreak`, `src/engine/schedule.ts`) ne jouent ni
samedi ni mardi du 21 décembre au 3 janvier (`winterBreakDates`, lu sur les dates : les semaines 19 et 20 en 2026-27, 18
et 19 quand la saison commence le 21 août) ; l'Angleterre joue pendant les fêtes. Mêmes premier et dernier samedis,
toutes les journées : les deux journées des fêtes passent aux mardis des deux premières semaines (18 et 25 août en
2026-27), quand tous les joueurs sont frais et qu'aucun club ne joue l'Europe ; chaque championnat garde ses samedis de
repos (les 34 journées, deux : 24 octobre et 13 mars en 2026-27) et ses mardis (les 38 : 16 mars, et 19 janvier pour le
29 décembre ; les 42, huit), dans l'ordre de `WINTER_BREAK_TUESDAY_WEEKS` (0, 1, 30, 22, 23, 35, 38, 2, 31 : ceux des
trêves internationales sans celui des fêtes, la semaine 19, les veilles de trêve, 2 et 31, en dernier : un international
y jouerait samedi, mardi et vendredi) ; jamais trois matchs en moins de sept jours (`breaks.test.ts`, coupe et Europe
comprises, sur cinq saisons). Coupe et Europe inchangées (une 6e journée européenne tombe le 22 décembre les saisons qui
commencent le 21 août). `Save.winterBreakFrom` (migration d'ajout `…_winter_break`) : posé avec `breaksFrom` à la
création d'une partie 2 (`createSave`, option `winterBreak`, vraie par défaut), au prochain passage de saison d'une
partie 2 d'avant (`seasonHasWinterBreak`, `src/db/nations.ts` ; option `winterBreak: false` d'`advanceToNextSeason`),
jamais pour un défi ni une partie 1 ; `seasonFixtures` reçoit le drapeau de chaque championnat. Tests :
`breaks.test.ts`, `fixtures.test.ts`, `nations.test.ts`, `nations.slow.test.ts`, `winter-break.slow.test.ts` (une partie
d'avant garde sa saison, a la trêve à la suivante). Mesure (`npm run measure:balance`, section « By country and month »,
`-- --no-winter-break` pour comparer) : en janvier, les clubs IA des quatre pays 5,0 (5,6 avant) matchs par club, 14,3 %
(17,5 %) de titulaires sous 85 de condition au coup d'envoi, 0,65 (0,70) blessure par club ; l'Angleterre inchangée (6,6
matchs, 29 %, 0,9 blessure) ; sur la saison, rien ne change (+1 % de blessures), les blessures des clubs de la Coupe des
Lauriers à 1,28 fois celles des autres clubs de D1 (1,22 avant ; six graines, trois saisons).

**Éliminatoires et tournois d'été (chantier « sélections », N3, 18/11).** Cahier § 3.3, 3.4, 4 et § 15 (mise en œuvre et
mesures). Moteur pur `src/engine/tournaments.ts`. **Un cycle** : deux saisons d'éliminatoires aux trêves, puis un tournoi
en juin, la **Coupe du Vieux Continent** (`int.eu`, « Old Continent Cup ») d'abord, puis la **Coupe des Hémisphères**
(`int.world`, « Hemispheres Cup »), en alternance (`cycleOf`, `tournamentEnding`) ; `Save.cyclesFrom` (migration d'ajout
`…_international_tournaments`) : la première saison avec trêves d'une partie créée depuis (tournoi en juin 2028), la
saison suivante d'une partie d'avant (`cyclesFromFor`, `src/db/nations.ts` : juin 2029), jamais un défi ni une partie 1.
**Éliminatoires** (`cycleQualifiers`, ordre des nations tiré une fois par cycle, flux `{graine}:int-qual:{code}:{année}`) :
l'Europe (9) en une poule de matchs simples, 9 journées, 4 à domicile chacune, une nation au repos par journée
(`int.qual.eu`) ; la zone Monde (5) en aller-retour, 10 journées, en cycle Hémisphères seulement (`int.qual.world`) ; une
journée par trêve le vendredi, les journées de plus le mardi des dernières trêves (`QUALIFIER_DATES`). Les nations libres
d'une date jouent des **matchs amicaux** (`pairFriendlies` : les paires qui ne se sont pas vues depuis le plus longtemps,
puis les forces les plus proches ; à domicile celle qui a le moins reçu), toujours 7 matchs par date
(`seasonInternationalMatches`, à l'ouverture de chaque saison, `openNations`, sur l'historique des matchs de la partie).
Classements (`internationalTable`) : points, différence, buts, force à l'ouverture du cycle (`NationSave.strength`,
millièmes de point attendu, `rankFormations` du 23 de la première trêve), code. **Qualifiés** : les 6 premiers d'Europe
pour le Vieux Continent ; 5 d'Europe et 3 du Monde pour les Hémisphères. **Tirage** (`drawTournament`, flux
`{graine}:int-draw:{code}:{année}`) par chapeaux de deux ; deux groupes de 3 ou de 4, trois journées
(`groupFixtures`), demi-finales (1er contre 2e de l'autre groupe) et finale, **terrain neutre**, prolongation (le tiers des
buts attendus, `LIGHT_EXTRA_TIME_GOAL_SHARE`) et tirs au but en simulation légère (`playLightMatch` avec `knockout`) ;
5 dates en juin, à partir du vendredi qui suit la semaine des finales européennes (`tournamentDates` : 9, 13, 17, 21 et
25 juin 2028). **Tout match léger** a 5 changements à la 60e (`LIGHT_SUBSTITUTIONS`), éliminatoires et tournoi compris
(trois, de la 60e à la 80e, portaient les blessures des clubs de la Coupe des Lauriers à 1,31 fois celles des autres).
**Le tournoi se joue au passage de saison** (`playSummerTournament`, au début d'`advanceToNextSeason`, avant
`recordSeasonResult`) : ses matchs ne sont écrits qu'une fois joués (`InternationalMatch`, `startYear` de la saison qui
finit, `neutral`, `decidedBy`, tirs au but, `winner`) : aucune mécanique des trêves (bouton, simulation, calendrier) ne
les voit avant ; avant lui, l'écran calcule le tirage dès les éliminatoires finies. Le vainqueur : ses joueurs de nos
clubs qui ont joué le tournoi reçoivent le titre (`PlayerSave.internationalTitles`, « int.eu:2028 », `titleKey`) ; ceux du club dirigé vont dans le relevé
de la saison (`SeasonResult.highlights.internationalTitles`, champ facultatif, la version 1 gardée : un relevé d'avant reste
lu). **Règle de récupération** : le passage de saison rend à chaque joueur sa pleine condition et le guérit (règle de
toujours) ; un joueur du tournoi commence donc la saison suivante à 100, comme les autres, aucune blessure de juin ne passe
l'été. **Écrans** : l'onglet Sélections (`getNationsView` : `campaign`, `lastTournament`, `freshTournament`) dit le tournoi
du cycle dans la carte bleue (`internationals-campaign-line`), le classement des éliminatoires par zone
(`internationals-campaign`, `internationals-zone`, `internationals-zone-row` avec `data-qualified`), le tournoi tiré puis
joué (`internationals-tournament` avec `data-state` « drawn » ou « played » : `internationals-winner`, `internationals-group`,
`internationals-group-row`, `internationals-bracket`, `internationals-yours`), celui de juin d'abord la saison qui suit, et
l'étape de chaque match (« Éliminatoires, 3e journée », « Match amical », « Groupe A, 2e journée », « Demi-finale »,
« Finale ») ; la fiche, les titres (`player-international-titles`) ; l'Histoire, une section Sélections
(`history-internationals` : les titres de tes joueurs gagnés au club, `history-international-titles`, et tes
internationaux, leurs sélections et buts au club lus dans `managedPlayers`, `getClubInternationals`). Noms interdits :
`FORBIDDEN_NAMES` reçoit les compétitions officielles des sélections et les sigles des 14 fédérations. Tests :
`tournaments.test.ts`, `tournaments.slow.test.ts` (un cycle complet, son tournoi au passage de saison), `e2e/tournaments.spec.ts`
(`e2e/tournament-save.mts`). Mesures : section « Tournois d'été » de `npm run measure:seasons` et `npm run measure:balance --
--world-only --seasons=3` (18/11 : 2,60 buts par match ; blessures des clubs de la Coupe des Lauriers à 1,29 fois celles des
autres sur une saison, 1,26 sur trois, tournoi compris ; joueurs du tournoi à 100 de condition au premier match de la
saison suivante, aucun blessé ; les huit grandes nations font 76 à 88 % des titres de 50 cycles, aucune plus de 24 % ;
15 ms de CPU par tournoi ; environ 33 Ko par saison).

**Sélectionneur (chantier « sélections », N4 et N4b, 19/11).** Cahier § 5, 9.6 à 9.10 et § 16 (mise en œuvre). Le
joueur peut diriger une nation en plus de son club (`Save.nationCode`, une seule à la fois ; migration d'ajout
`…_national_coach`), jamais dans une partie de défi ni une partie 1. **L'offre** : à chaque passage de saison, dès la fin de
la première, une fois les nations ouvertes (`openCoachOffers`, `src/db/national-missions.ts`), au joueur sans sélection : le
prestige du manager (`managerPrestige`, `src/engine/national-coach.ts`, pur : réputation du club, + 5 par trophée de ses deux
dernières saisons, + 3 pour un titre de D2 ou une montée, + 10 au plus, + 5 par tournoi dépassé comme sélectionneur) contre le
seuil du rang de force de chaque nation (`OFFER_THRESHOLDS` : 85 du 1er au 5e, 75 du 6e au 10e, 65 du 11e au 14e), deux
fédérations au plus tirées par la graine (`nationalOffers`, flux `{graine}:coach-offers:{année}`), la nation qu'il vient de
quitter écartée ; gardée dans `NationSave.offeredIn`, ouverte jusqu'au premier match du club de la saison
(`offersStillOpen`) : l'écran de début de saison (`coach-offer`, sa feuille `coach-offer-sheet`, « Accepter le poste » son
seul orange) et « À faire » (`coach-offer`) ; « Pas maintenant » la retire, d'autres viendront à un passage suivant. **La
mission** (`CoachSpell`, une ligne par mission : nation, saisons, objectif du cycle en cours, tournois dépassés, sa fin) :
l'objectif de la fédération par tiers de force parmi les nations qui visent le tournoi du cycle (`federationObjective` : la
finale, les demi-finales, la qualification ; aucun pour une nation de la zone Monde en cycle du Vieux Continent), fixé à
l'arrivée puis à l'ouverture de chaque cycle (`refreshCoachObjective`) ; fin de mission si sa nation ne se qualifie pas, à la
fin de la trêve des derniers éliminatoires (`checkCoachQualification`), ou finit le tournoi sous l'objectif, au passage de
saison qui le suit (`closeCoachSeason`, `objectiveVerdict`, `SeasonTransition.coachTournament`) ; démission entre deux trêves
(`resignNationalTeam`, jamais pendant une trêve ou un tournoi commencé ni un direct) ; **rien pour le club**, ni budget, ni
confiance du président, ni réputation. **Une trêve ou un tournoi du sélectionneur se joue par étapes**
(`playNationalStep`, `src/db/national-team.ts`) : chacune rejoue la session depuis son début (`runBreak`, `runTournament`,
purs) avec les 23 de chaque nation et leur condition à sa première date, gardés à sa première étape (`NationSave.squad`), les
matchs des autres nations rejoués légers aux mêmes graines, ceux de sa nation tels que le moteur complet les a joués
(`InternationalMatch.outcome`, `lightMatchOf`), par dates entières, jusqu'à son prochain match à enjeu (éliminatoires,
tournoi, amical qu'il ne laisse pas à l'adjoint, `Save.nationFriendlies`, vrai par défaut) : en direct (`live`), simulé
(`simulate`, l'adjoint décidant, le même match que le direct sans changement), ou laissé au joueur (`until-stop` : « Prochain
match » s'arrête avant, `untilNationalStop`, `playUntilNextMatch`). Seuls les matchs de sa nation passent par le moteur
complet, ses amicaux de l'adjoint compris ; une partie sans sélectionneur joue ses trêves et ses tournois comme avant
(`playInternationalBreak`, `playSummerTournament`), et les autres nations leurs matchs du jour comme sans lui
(`src/db/national-team.test.ts`). Les lignes des joueurs ne sont écrites qu'à la fin de la session ; la date de la partie suit
les étapes. Quand sa nation est qualifiée, son tournoi se joue en juin par étapes, ses matchs écrits une fois joués : sa saison
finit avec lui (`SeasonNotFinishedError` avant, `seasonFinished` faux), et le passage de saison le résume sans le rejouer
(`writtenTournament`, `src/db/nations.ts`). **Son direct** (N4b) : la machinerie du direct du club sur la ligne du match
(`InternationalMatch.liveState`, `events`, `decisions`, `instructions` ; `Save.liveInternationalId`, que
`assertNoMatchInProgress` et `liveMatchOf` lisent avec `liveFixtureId`) : `advanceNationalLiveMatch` et
`getNationalLive` (`src/db/national-live.ts`), `playNationLiveStepAction` ; à son coup de sifflet final, la session reprend
jusqu'à son prochain match à enjeu ou sa fin. **Sa liste** : celle de l'adjoint par défaut (`callUp`), validée d'un geste ou
changée jusqu'au premier match de la session (`saveCoachCallUp` : 23 joueurs de sa nation, de nos clubs ou de sa réserve,
3 gardiens au moins, aucun blessé à sa première date ; `NationSave.callUp`), complétée par celle de l'adjoint si l'un des siens
manque à sa première date (`completeCallUp`) ; les joueurs de son propre club appelés partent comme les autres, fatigue et
blessures comprises, et ses écrans le disent. **Sa composition** : l'éditeur du club sur ses 23 (`getCoachLineupEditor`,
`NationSave.lineup`, `saveCoachLineup` : ses seuls joueurs), celle de l'adjoint sans elle. **Écrans** : Équipe →
**Sélection** (`/saves/[id]/nation`, `nav-nation`, pour le seul sélectionneur, `SaveHeader.coach`), sa composition
(`/nation/lineup`), son direct (`/live/nation?m=…`, sous Match comme celui du club) ; le héros de l'Accueil
(`hero-national`) et la carte de la colonne (`header-national-next`) quand son match à enjeu vient avant celui du club
(`getNationalNext`, `src/db/national-view.ts`), « Prochain match » y menant ; « À faire » (`coach-offer`, `coach-call-up`
avant une trêve dirigée, `coach-ended`) ; l'Histoire (`history-coach`, tuiles `coach-int.eu` et `coach-int.world`, hors de
`TROPHY_KINDS` : rien pour l'indice de légende) ; la carte de saison (« SÉLECTIONNEUR DU PORTUGAL · … »,
`SEASON_CARD_VERSION` 3) ; la carte de carrière (`CAREER_CARD_VERSION` 2) ; le titre « Sélectionneur »
(`title-national-coach`, un tournoi gagné). Zones de messages `national-team`, `coach-offer`, `national-lineup`,
`national-live`. Tests : `national-coach.test.ts` (moteur), `national-team.test.ts` (une trêve en direct et simulée, la même),
`national-coach.slow.test.ts` (un cycle complet, son tournoi en juin), `e2e/national-coach.spec.ts` (`e2e/coach-save.mts`).
Mesure : `npm run measure:coach` (19/11, cahier § 16 : une trêve dirigée 76 à 89 ms de CPU contre 33 à 37 ms sans
sélectionneur ; un match de sélection en direct, 31 à 62 ms au coup d'envoi puis 12 à 19 ms par quart d'heure ; 3,5 arrêts par
saison, les amicaux à l'adjoint).

**Défi de la semaine.** Un défi par semaine ISO en UTC (`Challenge`, `weekKey` « 2026-W45 », `src/lib/iso-week.ts`),
écrit une fois par `ensureChallenge` (`src/db/challenge.ts`) : par `POST /api/maintenance/challenge` le lundi (même
secret et mêmes réponses 404 que la purge) ou, à défaut, à la première visite d'un de ses écrans ; jamais modifié ni
supprimé, ouvert tant que `startsAt ≤ maintenant < endsAt` (pas de statut stocké). Sa graine est un HMAC de la semaine
sous `AUTH_SECRET` (`challengeSeed`, `src/lib/challenge-seed.ts`), **jamais affichée ni renvoyée** : le formulaire de
création accepte toute graine, la connaître permettrait de répéter le défi dans une partie normale, au tir près. Son
club est tiré par la graine parmi la deuxième division et les 12e à 18e de première (137 clubs), sans celui de la
semaine précédente (`drawChallengeClub`, `src/engine/challenge.ts`). Règles dans `src/config/challenge.ts` : horizon de
10 journées, `MAX_CHALLENGE_SAVES_PER_WEEK` = 20 (une partie de défi pèse 7,7 Mo compactée, 25,9 Mo réels à la
10e journée), parties gardées 24 h après la fin du défi. Une partie de défi
(`Save.challengeId`, `createChallengeSave`, `src/db/saves.ts`) est une partie 2, sans compétition européenne, avec la graine et le club du défi, les
mêmes pour tous, sans nom stocké (`Save.name` vide) : l'écran la nomme depuis sa semaine, dans la langue du joueur
(« Défi — semaine 45 », « Challenge — week 45 », `SaveSummary.challengeWeek`) ; les noms stockés par les parties
d'avant restent en base, plus affichés ; **hors des limites de parties**, mais une par joueur et par semaine
(`ChallengeEntryExistsError`) et 20 par semaine (`ChallengeFullError`). L'entrée du joueur (`ChallengeEntry`, unique
par défi et utilisateur) naît avec la partie, dans sa transaction, et lui survit (`saveId` en SetNull) : supprimer sa
partie ne permet pas de recommencer, et le classement survit à la purge ; elle part avec son utilisateur (Cascade). Le
score (`recordChallengeScore`) s'écrit une seule fois, dans la transaction de `playNextMatchday` ou de
`advanceLiveMatch` qui termine le 10e match de championnat du club dans la première saison : points, différence, buts
marqués (`challengeScore`), `submittedAt` à l'horloge de la base en UTC (`now() AT TIME ZONE 'UTC'`, jamais
`new Date()` dans la simulation) ; plus rien ne le change ensuite. Classement : points, différence, buts, soumission la
plus ancienne, id (`rankChallengeEntries`) ; une entrée soumise après `endsAt` ne compte pas. À la connexion Google, les
entrées de l'anonyme suivent ses parties (`moveChallengeEntries`), sauf pour une semaine où le compte a déjà la sienne :
le compte la garde, celle de l'anonyme est supprimée et sa partie ne compte plus.

**Écrans du défi.** `/challenge` et `/fr/defi` (`ChallengePage`, `app/challenge/_components`, `getChallengePage`,
`src/db/challenge-view.ts`), ouverte à tous, le
même écran que l'onglet Défi d'une partie (`ChallengeScreen`) : le club de la semaine (`displayClubName`, dans `src/db`), **jamais dans le titre
ni l'image de partage** ; la fin du défi en heure de Paris (`formatParisDateTime`) ; « Jouer le défi »
(`playChallengeAction`, qui reçoit la semaine de la page et refuse un défi fermé ; `maxDuration = 60`), « Reprendre ma
partie », ou « Défi complet cette semaine, reviens lundi » au plafond ; les classements de la semaine et de la
précédente : entrées soumises avant `endsAt`, comptes Google seulement, prénom (`rankingName`, null sans prénom :
« Anonyme » à l'écran) ; un anonyme voit sa
propre ligne grisée, sans rang, avec « Connecte-toi pour apparaître au classement ». Le défi de la semaine y est créé au
premier chargement (`ensureCurrentChallenge`), comme sur l'écran Club et l'onglet Défi d'une partie. Tableau de bord d'une partie de défi : une carte (`ChallengeCard`,
`getChallengeBanner`) « Défi · semaine 45 », « journée X / 10 », puis score et rang provisoire et « La partie continue
mais ne compte plus », ou « Cette partie ne compte pas au classement » ; toujours « Partie de défi supprimée le mardi
JJ/MM » et le lien du classement ; sur toute autre partie, la même carte présente le défi et y mène, sans son club.
Accueil des parties : encart « Défi de la semaine » et marque « Défi » sur une partie de défi ; dans une partie, l'onglet
Défi de l'entrée Club (règle « Club »), où mènent les liens de la carte, quelle que soit la partie ouverte.

**Missions du jour, jetons et récompenses (chantier « missions v2 », 17/11).** Cahier `docs/design/missions-v2.md`, validé
le 17/11. **Trois missions par joueur et par jour UTC**, une par palier (`MISSION_TIERS` : facile, moyenne, difficile), les
mêmes dans toutes ses carrières sauf celles du défi, faites dans n'importe laquelle : `MissionTask` (clé `(userId, day,
tier)`, `changedFrom`) et `MissionDay` (le jour du joueur : `done`, `countedAt` à sa première mission, `allDoneAt` à la
troisième, `streak`, `best`, `cycles`, `changedAt`, `shieldedAt`), migration d'ajout `…_missions_v2`. Chaque palier tire de
son pool (`MISSION_POOLS`, `src/lib/missions.ts`, pur ; pools disjoints) par son flux `mission:{joueur}:{jour}:{palier}`,
jamais la mission de la veille (`dailyMissionKind`, `DRAW_LOOKBACK_DAYS` 30) : facile (jouer un match, 3 matchs, marquer,
faire jouer un joueur de 21 ans ou moins ; enregistrer sa composition au poids 0 depuis la simplification), moyenne (match en direct, changement ou consigne du
joueur à une pause, décision du joueur sur une carte d'événement, victoire, cage inviolée), difficile (victoire en direct,
avec un changement du joueur, deux buts en direct, cage inviolée en direct). Quinze missions (`MISSION_KINDS`, gardées par
leur nom : **ne jamais en renommer une**), les huit de la v1 d'abord. **« Changer de mission »** : une fois par jour et par
joueur, sur une mission pas commencée (`changeMission`, `changedMissionKind`, flux `…:change`, jamais l'actuelle ni celle de
la veille). **Aucune simulation de plus** : la progression est marquée au moment du pas, **après** la transaction de
`playNextMatchday` (`MatchdaySummary.managed.facts`, `matchFacts` : victoire, cage inviolée, buts, titulaires) ou
d'`advanceLiveMatch` (changement, consigne ou décision du joueur à cette pause ; le match à sa fin, `coached` d'après
`TeamLive.manual`), par `recordMissionMoves(db, saveId, PlayedMoves)`
(`src/db/missions.ts`) : une requête lit le jour, à l'horloge de la base, et les trois missions ; rien n'est écrit quand le
pas n'en avance aucune ; un échec est journalisé, jamais lancé. **Jetons** (`User.tokens`, CHECK ≥ 0, et le journal
`TokenEntry`, une ligne par gain ou dépense, clé unique `(userId, key)` : `mission:{jour}:{palier}`, `all-three:{jour}`,
`streak:{jour}`, `welcome-v1`, `purchase:{id}`), écrits par `writeTokens` (`src/db/rewards.ts`) dans la transaction qui les
gagne ou les dépense, le joueur verrouillé (`lockRewards`, verrou consultatif) : facile 10, moyenne 20, difficile 40, les
trois +30 ; deux onglets ou un nouvel essai ne créditent qu'une fois. **Série** : un jour compte à sa première mission
(`streakAfter`), sa série vit jusqu'à la fin du lendemain (`streakOn`), cycle de 7 (`STREAK_CYCLE_DAYS`) : +50 au 3e jour,
+150 et le lot exclusif du cycle au 7e (`streakLotOf`, d'après les cycles accomplis au total, jamais perdus) ; un
**protège-série** en réserve (`User.streakShield`, un seul) pardonne un jour manqué tout seul, gardé comme tel
(`shieldedAt`). Jonction avec la v1 : `DailyMission` reste, jamais modifiée, lue pour la série du premier jour v2
(`latestCountedBefore`) et les **jetons de bienvenue**, 10 par mission v1 accomplie, au plus 100, une fois (`welcome-v1`,
écrite même à 0). Proposées quand elles sont montrées (`getDailyMissions`). À la connexion Google, `moveMissions` (v1), puis
`moveMissionDays` (jours fusionnés, séries refaites, lots de série dus) et `moveRewards` (journal re-clé `merge:{anonyme}:…`,
solde additionné, collection unie, protège-série, compteurs). **Boutique** (`src/engine/shop.ts`, pur, et `src/db/shop.ts`),
dans une carrière hors défi et hors pause du direct, un achat par transaction (`lockSave` puis `lockRewards`), son id celui de
la demande (`ShopPurchase`, un double envoi rend le premier résultat) : stage de forme 40 (l'effectif à 100 de condition,
5 par saison, un par date), soin express 60 (jours restants d'un blessé divisés par deux, dès 4 jours, 3 par saison),
rallonge 200 (5 % de la dotation, `SeasonBudget`, au moins 100 000 €, 1 par saison), jeune prometteur 350 (17 ans, sommet
de la plage des jeunes de sa division + 3, potentiel + 25 à 30, la ligne au choix du joueur, `generatePromisingYouth`, flux
`{graine}:shop-youth:{n}`, clé `shop-youth:{n}`, contrat de 3 saisons, une place de l'effectif (refusé à 30), 1 par saison et 3
par carrière) ; **un jeune prometteur ne se vend ni ne se libère pendant son premier contrat** (`academyLocks`, refus
`academy` de `quoteSquad`, `sellPlayer`, `releasePlayer`) ; au joueur, le protège-série 50 et les cosmétiques en vente (titres
250, cadres 400). **Collection** (`src/lib/cosmetics.ts`, identifiants **jamais renommés**) : titres, badges et cadres, gagnés
par la série, achetés ou débloqués par des accomplissements (missions, journée parfaite, matchs et victoires en direct,
palmarès et objectifs d'une saison à `advanceToNextSeason`, `unlockSeasonAchievements`, podium du défi vu au classement de
la semaine passée, `unlockChallengePodium`) ; un de chaque sorte porté (`User.title`, `badge`, `frame`, `wearCosmetic`).
Cadres renommés le 17/11 (libellés seuls, identifiants inchangés) : `frame-laurels` « Couronne », `frame-gold-laurels`
« Couronne d'or », pour laisser « Lauriers » à la Coupe des Lauriers ; `frame-compass-rose` « Rose des vents » pour une
compétition européenne gagnée (accomplissement de saison `europe`).
Le titre porté s'affiche sur la pastille du manager (Club, `club-manager-title`), sur la carte de fin de saison (pied,
« MANAGER : … ») et à côté du prénom dans le classement du défi (`ChallengeRankingRow.title`) ; le cadre habille la carte,
dans son adresse (`seasonCardPath`, `frame=`, `title=`, que la route ne dessine que pour leur propriétaire,
`ownedCardDress`). Écrans : la carte « Missions du jour » sous le héros de l'Accueil (`DailyMissionsCard`, `daily-missions`,
`mission-task` avec `data-tier`, `data-kind`, `data-completed`, `mission-progress`, `mission-change`, `mission-tokens`,
`mission-streak`, `mission-cycle`, `mission-all-three`, `mission-streak-line`), rappelée dans « À demain »
(`DailyMissionsLine`, `session-end-mission`) ; l'onglet **Récompenses** sous Club (`/saves/[id]/rewards`, `nav-rewards` :
jetons et journal, série et lots, boutique de la carrière, protège-série, collection ; la confirmation d'un achat est une
feuille, `purchase-sheet`, dont « Confirmer · 350 » est le seul orange de l'écran) ; raccourcis vers elle : « Soin express »
sur la fiche d'un blessé (`player-express-care`), « Stage de forme » dans la composition quand un joueur est sous 75
(`lineup-camp`). Rien dans une partie de défi : ni missions, ni boutique, ses pas ne comptent pas ; son onglet Récompenses
montre les jetons et la collection, et pourquoi. /admin : sections « Missions du jour » et « Jetons »
(`src/db/admin-missions.ts`). Zones de messages `missions` et `rewards`. `e2e/missions.spec.ts` : les missions et un achat.

**Navigation d'une partie.** Cinq entrées, dans `SECTIONS` (`app/saves/[id]/_lib/sections.ts`, pur et testé) : Accueil ·
Équipe · Match · Marché · Club (en anglais Home · Squad · Match · Market · Club), testids `nav-dashboard`, `nav-team`,
`nav-match`, `nav-transfers`, `nav-club`. Équipe a Effectif, Composition et Sélection (seulement pour un sélectionneur,
`SaveHeader.coach`), Match a Calendrier, Classement, Coupe
(seulement avec une coupe), Europe (seulement avec une saison européenne, `hasEurope`) et Sélections (seulement avec des nations, `hasNations`), Club a Club, Défi, Histoire et Récompenses ; le direct est sous Match et l'écran de début de saison sous Club,
sans onglet l'un et l'autre (`SCREENS_WITHOUT_TAB`) ; l'entrée Match mène au Calendrier sous 1024 px, au
Classement à partir de là, où il a le calendrier et la coupe à côté ; l'entrée Équipe à l'Effectif sous 1024 px, à la
Composition à partir de là, où elle a l'effectif et la fiche à côté (`computerHome`, choisi par `SaveNav` après
l'hydratation) ; l'entrée Club mène à `/club` à toutes les largeurs. Ces sous-onglets sont une bascule
en tête de contenu (`SectionTabs`, `SegmentedLinks`,
`src/components/segmented.tsx`), testids `nav-squad`, `nav-lineup`, `nav-nation`, `nav-fixtures`, `nav-standings`, `nav-cup`,
`nav-europe`, `nav-internationals`, `nav-club-overview` (`tabTestId` : l'onglet Club, l'entrée gardant `nav-club`), `nav-challenge`, `nav-seasons`, `nav-rewards`, présents
sur les seuls écrans de leur entrée (`openScreen`, `e2e/helpers.ts`, passe par elle). Les entrées ne touchent pas aux
adresses : chaque écran garde la sienne (`/squad`, `/standings`…). Une seule navigation dans le DOM (`SaveNav`,
`save-nav`, `<nav>` libellé « Navigation de la partie » ; la bascule et la pagination du marché sont d'autres `<nav>`,
dans le contenu) et un seul `<header>` : à partir de 1024 px, une colonne fixe de 256 px (logo, seule marque du jeu dans
une partie ; carte du club avec initiales, nom, compétition et saison, journée ; les cinq entrées ; la carte « Prochain
match » en bleu) ; sous 1024 px, la ligne du club en haut de page, non collante
(`header-club`, `header-competition`), et la barre de navigation
fixée au pied de l'écran, seule barre fixe. Actions de jeu (`GameActions` : « Simuler jusqu'à… », « Prochain match »,
« Match en cours — reprendre », « Passer à la saison suivante ») : dans le héros de l'Accueil à toutes les largeurs ;
hors de lui (`SaveBarActions`, un seul élément, donc des testids uniques), dans la carte « Prochain match » de la colonne
à partir de 1024 px, en tête des écrans de Match en dessous, sous la ligne du club, et nulle part ailleurs sous 1024 px
(« Simuler jusqu'à… » en icônes sous 640 px, son nom reste lu). Le nom du club tient entier, sur deux lignes au besoin.
Aucun flou sur l'en-tête : il contient la barre fixe, un flou l'y retiendrait. La date et le statut sont en haut du
contenu à partir de 1024 px (`header-date`, `header-status`). Hauteur de la barre : `--save-nav-height` (`globals.css`,
avec la place du témoin d'accueil, `viewportFit: "cover"`), reprise par la marge du contenu et par `--toast-bottom` pour
les toasts. Rien ne colle en haut de l'écran sauf les panneaux : fiche joueur `xl:top-8`, banc de la composition `top-2`
sous 1024 px, colonne de son terrain `lg:top-8`. Sur le direct, aucune action de jeu (`SaveBarActions`, `isLivePath`) : ses boutons sont la suite ; sous 1024 px
il a tout l'écran, sans ligne du club ni barre de navigation (`data-live-page`, repris par le `group/shell` du layout), sa
sortie est `live-exit`, sa barre ses commandes.

**Accueil d'une partie.** L'entrée Accueil (`nav-dashboard`), le titre de la page reste « Tableau de bord » (masqué
visuellement sous 1024 px) : budget et mercato en pastilles (`DashboardPills`), bandeau du compte, puis une
grille d'une colonne sous `lg`, deux à partir de `lg`, trois à partir de `xl`. Le héros bleu (`NextMatchHero`,
`dashboard-next-match`) : la date, le lieu et la compétition du prochain match, les deux clubs (rang et points ; note
moyenne et forme à partir de 1024 px), « Jouer le match » (`GameActions` avec `hero`, seule action orange pleine de
l'écran, même `next-match`, « Jouer la journée » dans une partie 1), « Préparer » vers la composition et « Simuler »,
secondaires, le onze et « Voir l'adversaire ». Match en suspens : « Match en cours — reprendre » seul ; saison finie :
« Passer à la saison suivante » seul, et la carte de la colonne, vide, disparaît (`lg:empty:hidden`). Sa colonne de droite à partir de `xl`, en fin de page sur téléphone : le
mini-classement (`DashboardTable`, `tableAround`, six lignes autour du club, rang, club et points). Puis quatre tuiles
(`DashboardTiles` : classement et mouvement, points et différence, forme, effectif « 26 joueurs sur 30 », en ambre à 30 ;
« — » avant le premier match), la
carte Objectifs (`DashboardObjectives`, `dashboard-objectives`, toute la largeur, dans une partie qui en a : chaque
objectif, son état en pastille, `objective-status`, et son chiffre ; la confiance du président ; tant que le choix est
ouvert, la case de l'objectif au choix mène à l'écran de début de saison, `dashboard-objectives-choose` ; « Voir le
détail » mène à l'onglet Club, `#objectifs`), « À
faire » (`DashboardTodo`, dans l'ordre de `TODO_PRIORITY`, `app/saves/[id]/_lib/todo-priority.ts`, pur et testé : gardiens,
titulaires blessés et suspendus (mode joueur : l'adjoint remplace les siens), offre de fédération, contrats (les titulaires
que l'adjoint compte laisser partir, `important-contracts`, ou tous en mode joueur), ventes proposées (`sale-proposals` :
« Ton adjoint propose 2 ventes · Ils ne jouent pas · 6,1 M€ », vers Vendre), effectif plein pendant un mercato
(`squad-full`), effectif réduit, titulaires fatigués avant l'Europe (mode joueur), trêves et liste du sélectionneur,
joueurs à 4 jaunes (2 en Europe), autres blessés, point faible, fin de mission ; les trois premières lignes
(`TODOS_SHOWN`), les autres repliées derrière « Voir tout · N de plus », un `<details>` natif qui s'ouvre sur place sans
requête, `dashboard-alerts-more` ; toute la ligne est un lien, sauf la fin de mission ; sans ligne, « Rien à faire : ton
adjoint s'occupe du reste. » (`alert-none`) ; les ventes proposées et le point faible seulement après le premier match du
club, `firstMatchPlayed`, le point faible pendant un mercato seulement), le dernier match
(`LastMatchCard`, après le premier match seulement, avec le mot de l'adjoint après une défaite) et la carte du défi. **Avant
le premier match du club** (chantier « première session », 12/11) : dans une partie de défi, ses trois premières actions dans
leur propre panneau juste sous le héros, à toutes les largeurs (`FirstActionsPanel`, `dashboard-first-steps`) ; dans une
carrière, la bulle de bienvenue du tutoriel quand elle le suit (règle « Tutoriel de la première carrière »), rien sinon ;
aucune bulle des premiers pas ni carte du dernier match. Juste après (le héros, ou ce panneau quand il y est), toute la largeur : les missions du jour (règle « Missions
du jour, jetons et récompenses »), sauf dans une partie de défi. Dans le navigateur d'une appli, l'avis des navigateurs intégrés en tête (règle « Navigateurs intégrés et
lien de reprise »). Aucune vente proposée hors mercato ni avant le premier match (`getSaleProposals` non lu), le point faible n'est
jamais une alerte, et hors mercato il n'y a rien à en faire. Les titulaires n'y sont plus : Composition les a. `e2e/dashboard.spec.ts`
couvre l'écran à 390 et 1280 px.

**Premiers pas.** Création d'une partie : « Choisis ton défi » au-dessus de trois cartes de club, le nom du manager et
« Lancer ma carrière » juste après elles, puis la recherche, la liste complète et les options (`CreateSaveForm`, dans cet ordre
dans le DOM). Les clubs arrivent dans le navigateur (`creationChoicesAction`, la page n'en donnant que le nombre et, sans
nom, le niveau, la division et l'objectif de chaque carte, `creationPreview`) : jusque-là, trois cartes de réserve de la même
taille (`SuggestionCardPlaceholder`, leur niveau et leur objectif déjà là), la recherche, la liste et le bouton inactifs, rien
ne bouge à leur arrivée ; une carte choisie avant est celle choisie ensuite. Les trois cartes (`SuggestionCard`,
`suggestClubs`, `src/engine/club-suggestions.ts`, pure, sans hasard : le 1er de D1, le début de la moitié basse de D1, le plus
faible des clubs de D2 à qui la direction demande de monter (le 4e), dans le pays de la langue de la page,
`app/_components/home-page.tsx` ; réputation et budget de `clubFinances`, la note d'un club n'existant pas avant la partie, ses
joueurs naissant de la graine). **Une carte annonce l'objectif de classement que la direction fixera vraiment** à la saison
1 : `ClubOption.objective` (`listClubsByCompetition`, `src/db/clubs.ts`), `leagueRankingObjective` au rang de réputation de la
création (`creationReputationRanks`), les fonctions de `firstSeasonDotation` et `openSeasonObjectives`, et le libellé des
écrans de la partie (`objectiveGoal`) : « Finir 10e ou mieux », « Monter en Division 1 », lu « Objectif de la direction » ;
`creation-objectives.test.ts` le vérifie pour les 198 clubs (une vraie partie par club dans la suite lente). Son niveau lui
répond : « Facile · favori » (top 3), « Équilibré · conseillé » (son rang attendu), cochée à l'ouverture et suivant la langue
tant que le joueur n'a rien choisi, « Difficile · Division 2 » (monter), « Défi » étant le défi de la semaine ; une ligne
d'objectif courte, pour que le bouton reste au-dessus du pli à 360 × 780, bandeau de langue compris. Dessous, la recherche (`ClubSearch`, `searchClubs`, `app/_lib/club-search.ts`, pure : deux lettres, sans accents
ni casse, six résultats, Entrée choisit le premier et n'envoie jamais le formulaire) et la liste complète, par pays puis
division (`club`, qui montre toujours le club choisi). Le nom de manager est pré-rempli (« Coach »,
`createSave.managerDefault`), toujours modifiable. Le nom de la partie vient du club tant que le joueur n'en tape pas un ;
lui et la graine sont repliés sous « Options », ouvertes seules par leur erreur ; un formulaire refusé garde tout (`onReset`, React
le viderait sinon après son action). Tableau de bord : tant que le club
n'a pas joué, aucun rang (« — ») et, dans une partie de défi seulement, « Tes trois premières actions » (`FirstActions`,
`FirstActionsPanel`, `app/saves/[id]/_components/first-steps.tsx`) juste sous le héros : une carrière a le tutoriel, ou un
joueur qui connaît le jeu. Effectif et Composition se
cochent à l'ouverture de leur page (`MarkSeen`) : on ne peut pas enregistrer une composition sans la changer. Le match se
lit dans le jeu (`managedMatchesPlayed`, `src/db/first-steps.ts`) : les matchs du club, jamais `hasPlayedMatch`, déjà vrai
à la mi-temps avec ceux des autres clubs. Bulles (`showsTip`, `app/saves/[id]/_lib/first-steps.ts`, `FirstStepTip`) : note
sur l'effectif, poste secondaire sur la composition ; sur le tableau de bord, aucune avant le premier match, l'argent au
premier, puis la simulation (dès le 2e, ou au 1er une fois l'argent fermée) ; une par écran, dans le flux de la page
(elles ne recouvrent aucun bouton), fermables, et finies d'elles-mêmes
au 5e match du club ; aucune sur le tableau de bord pendant le calme du premier jour du tutoriel, aucune tant que le
tutoriel d'un scénario 2 tourne ou une fois fini, ses étapes les remplaçant (`tipsReplaced`) ; rien n'est bloquant et tout
s'applique aussi à une partie de défi. Ce qui est vu n'est pas en base :
un cookie de confort par élément (`lw_seen_squad`…, 30 jours, `Path=/saves/<id>`, écrit dans le navigateur par
`rememberSeen`), donc propre à chaque partie, sans lecture avant écriture : une page atteinte par navigation interne ne
voit pas dans `document.cookie` un cookie de son propre chemin. Après chaque écriture, `router.refresh()` vide le cache
du routeur, pour le retour du navigateur. Mesure : section « Premiers pas » de `/admin/stats` (`firstStepsByCohort`,
`src/db/stats.ts`), 14 jours complets par jour de création, hors défi, sur les seules tables du jeu ; à comparer avant et
après un changement sur moins de 30 jours, la purge retirant les parties anonymes abandonnées.

**Tutoriel de la première carrière (chantier « tutoriel », 19/11).** Cahier `docs/design/tutoriel.md`, validé le 19/11 avec
ses dix propositions. Deux mises en ligne le 23/11 : le premier jour (scénario 1), puis les jours suivants (scénario 2,
`TUTORIAL_VERSION` 2, `scenarioSteps`) ; un tutoriel né entre les deux garde le premier jour seul (`Tutorial.version` 1), ses
bulles `rating` et `secondary` comprises. L'adjoint montre, le joueur fait le geste
lui-même ; jamais bloquant. **Pour la seule première carrière hors défi d'un nouveau joueur** : la ligne `Tutorial` (migration
d'ajout `…_tutorial`, une par joueur, clé `userId`, `saveId` unique en SetNull ; `TutorialStep`, une par étape montrée ou
close) naît dans la transaction de la création quand `createSaveAction` la demande (`createSave({ …, tutorial: true })`,
`startTutorial`, `src/db/tutorial.ts` : aucune autre carrière hors défi, `firstSaveAt` vide ou joueur créé depuis
`TUTORIAL_SINCE`, le défi ayant pu venir avant), avant `recordFirstSave` ; jamais pour un test, un script, la démo ni une partie
de défi. Une carrière supprimée avant la fin laisse son tutoriel à la suivante ; un joueur qui a déjà joué un direct a ses
étapes du direct closes à la naissance. Règles pures dans `src/lib/tutorial.ts` : `TUTORIAL_STEPS` (**clés jamais renommées** :
`welcome`, `speed`, `choice`, `half-time`, `full-time`, puis `LATER_STEPS` : `missions`, `market`, `objectives`, `lineup`,
`squad`, `simulate`, `break`, `europe`, `cup`, `fitness`, `judged`, et `farewell`), issues `DONE`, `PASSED` (Échap ou « Passer l'étape », ou montrée deux
fois sans geste, `MAX_SHOWS`), `ADAPTED` (le geste fait autrement), `EXPIRED`, fins `FINISHED`, `SKIPPED`, `EXPIRED` (14 jours
après le début ou la reprise, `TUTORIAL_DAYS`), `MERGED` ; `tutorialStatus`, `firstDayCalm`, `tutorialReveal`,
`dashboardStep`, `liveSteps`, `fullTimeDue`, `pendingWrites`, `canResume`, `tutorialSetting`. Lu une fois par requête par la
clé du joueur (`readTutorial`, `getSaveTutorial`, `app/saves/[id]/_lib/tutorial.ts`), jamais une table du jeu, aucune
simulation. **Bulle de l'adjoint** (`TutorialBubble`, `tutorial-bubble`, `data-step`, `tutorial-text`, `tutorial-place`
« Premier jour · 2 sur 5 », `tutorial-pass`, `tutorial-skip`) : fixée au-dessus de la barre de navigation sous 1024 px
(au-dessus des commandes du direct, `--live-controls-height`), la page gardant sa hauteur en bas (`--tutorial-bubble-space`,
que la bulle pose elle-même), dans la page près de sa cible au-dessus ; sa cible cerclée
(`data-tutorial-target`, `globals.css`, sans pulsation en mouvement réduit) et décrite par elle (`aria-describedby`) ; le
focus jamais déplacé ; Échap passe l'étape hors feuille modale ; aucun orange. Dans une feuille modale et dans « À demain »,
une ligne de la carte (`TutorialLine`, `tutorial-line`). **Le jour 1** : `welcome` sur « Jouer le match » de l'Accueil, close
à l'ouverture du direct ; `speed` sur les vitesses (`live-speeds`) du coup d'envoi au premier arrêt ; `choice` dans la
première carte d'événement ; `half-time` dans la carte de mi-temps, puis une ligne dans le panneau Coaching (conseil ouvert ou
non) ; `full-time` dans la carte « À demain » du direct ou du résumé de simulation, à la place des missions, qui écrit
`Tutorial.day1At`. **Calme du premier jour** (`firstDayCalm`, jusqu'à la fin du jour UTC du « À demain ») : ni pastilles
d'argent, ni missions (ni tirées ni comptées : `recordMissionMoves` lit le tutoriel), ni objectifs sur l'Accueil, ni défi
(Accueil, Club, « À demain »), ni série dans les Réglages, ni bulles de l'Accueil, ni onglets Défi, Récompenses, Sélections,
Europe et Coupe (absents de la bascule, adresses ouvertes, `SectionTabs` `hidden`) ; tuiles, mini-classement et « À faire »
après le premier match, sans offre ni point faible. « Passer le tutoriel » montre tout, pour de bon (`skipTutorialAction`,
`skipTutorial`, `skippedAt`, `skippedStep`) ; Club → Réglages (`settings-tutorial`, `data-state` running, skipped ou ended)
le reprend (`resumeTutorialAction`, `settings-tutorial-resume`) quand quelque chose peut encore venir, sans rien recacher.
Écritures par `tutorialStepAction` (`recordTutorialEvents` : une petite transaction, la ligne verrouillée, jamais dans celle d'un
match ; une étape montrée compte une fois de plus, son issue gardée une fois) ; ce que le tutoriel clôt de lui-même part avec
elle, ou après l'envoi de l'Accueil (`after`, `away`). Connexion Google : `moveTutorial` (le compte garde le sien ; sinon celui
de l'anonyme suit, fini `MERGED` si le compte avait sa carrière). **Les jours suivants** (scénario 2, cahier § 1.3) : dès le
jour UTC qui suit le « À demain » (`laterDay`), l'Accueil pousse une étape à la fois, deux nouvelles par jour au plus
(`PUSHED_PER_DAY`, `pushedToday` : une étape déjà montrée revient sans compter), la plus pressée d'abord (`LATER_ORDER`,
`dashboardStep`, d'après ce que l'Accueil lit déjà : `laterContextOf`, `app/saves/[id]/_lib/dashboard-tutorial.ts`) :
`missions` (leur carte), `market` (mercato ouvert, premier match joué : l'entrée Marché cerclée, son geste l'arrivée sur le
Marché, où la seconde bulle cercle « Recruter » de la proposition de « Mes besoins », `marketScreenStep`, `doneOnShow`), `break` (trêve à
venir, `hero-break`), `europe` et `cup` (le prochain match du club), `fitness` (un titulaire sous 75 au coup d'envoi :
« Préparer » cerclé ; en mode joueur seulement, close `ADAPTED` sans bulle quand l'adjoint fait le onze et repose lui-même), `objectives` (leur carte), `simulate` (deux matchs joués), `judged` (la confiance, dès le 5e match),
`lineup` (poussée par « Préparer » au jour 3) ; chaque bulle par `dashboardBubbleOf`, sous le héros ou au-dessus des objectifs
dont elle parle. Étapes d'écran, hors du compte du jour (`SCREEN_STEPS`, `screenStep`) : `squad` à l'ouverture de l'Effectif
(première ligne cerclée, une fiche ouverte son geste), `lineup` à celle de la Composition (le poste du point faible du onze
cerclé, `weakSpotIndexOf`, `src/engine/market-proposals.ts` ; un poste touché son geste, enregistré aussitôt comme tout
geste) ; tant que le tutoriel d'un scénario 2 tourne et une fois fini, ses étapes remplacent les bulles `rating`,
`secondary`, `money` et `simulation` (`tipsReplaced`) ; passé, fusionné ou expiré, elles reviennent avec tout le reste. Ce que le calme cachait revient avec son étape (`tutorialReveal`, l'étape montrée
sur l'écran même comprise) : l'argent avec `market` (ou au jour 3 mercato fermé), missions, Récompenses, série et ligne de
« À demain » avec `missions`, objectifs avec `objectives` ou `judged`, défi dès le jour 2, onglets Sélections, Europe et Coupe
avec leur étape ou leur moment (`tutorialMoments` : la fin de la première trêve, la première journée européenne, les seizièmes
de coupe). Une étape sans objet (pas d'Europe, pas de sélections) ou dont le moment est passé une fois montrée est close
`ADAPTED` (`laterClosure`, par `pendingWrites` avec ce que l'Accueil sait) ; une étape jamais montrée attend sa prochaine
occasion. Toutes closes : l'adieu, une fois, dès le jour 2 (`farewellDue`, `farewell` : « Mes conseils restent dans « À
faire » »), écrit avec la fin `FINISHED`. Mesures : section « Tutoriel » de `/admin` (règle « Administration »), ses seize
étapes. Zone de messages `tutorial`, chaque réplique de 140 caractères au plus hors noms (`src/lib/tutorial.test.ts`).
`e2e/tutorial.spec.ts` fait le jour 1 sur téléphone en anglais, chronométré, puis les jours suivants sur téléphone en français
(`shiftTutorialDays`, `e2e/db.ts` : missions, mercato et sa proposition, Effectif, Composition, objectifs), et vérifie qu'une
deuxième carrière et une partie de défi n'en ont pas ; l'aide `createSave` des E2E passe le tutoriel (`passTutorial`,
`skipTutorialOf`).

**Écrans de Match.** Classement (`/standings`) : compact à toutes les largeurs (J, Diff, Forme, Pts ; `StandingsTable`,
`computeForm`, les cinq derniers résultats de championnat, lus par `getLatestSeasonTables`), il tient à 360 px ;
« Classement complet » (`FullTableToggle`, état du navigateur, sans changer d'adresse ni d'onglet) ajoute G, N, P, BP, BC
et retire les cartes d'à côté. `StandingsTable` est un composant client pour son poids : un onglet fermé ne le rend pas,
et la page envoie les données des dix tableaux plutôt que leurs cellules (288 Ko au lieu de 1,25 Mo). Pastille de rang : bleue pour le champion de D1 et les montées de D2, orange pour les
descentes de D1, neutre sinon et dans toute une partie 1 ; ta ligne sur `bg-secondary`. À partir de `xl`, le tableau en
3/5 et à droite, en 2/5, le calendrier (`MatchCalendarCard`, `fixtureWindow` : trois matchs joués, le prochain, deux à
venir) et la coupe (`CupCard`, `linked`) ; sous le tableau de `lg` à `xl` ; sous `lg`, les onglets les ont. Le serveur ne
connaissant pas la largeur, la page les demande une fois qu'elle la connaît (`SideCards`, `standingsSideCardsAction`) : un
téléphone ne les lit pas.
Calendrier (`/fixtures`) : la liste du mois par défaut, ouverte sur le mois du prochain match (`FixtureRow` : jour,
adversaire, étiquette D1 ou D2 en `text-highlight`, COUPE en orange, résultat ; toute la ligne ouvre la feuille de match
ou l'adversaire ; le prochain match sur `bg-secondary`, pastille « Suivant ») ; `?vue=grille`, la grille du mois, avec le
choix du jour à simuler (`beginPicking`, qui l'ouvre) ; les repères du mois sous les deux. Coupe (`/cup`) : `CupCard`, sur
le bleu vif (état, six tours et le prochain en orange, `cupProgress`, rencontre si le tirage est fait, prime), puis le
parcours et les tours. Aucun bouton orange plein sur ces écrans : l'action de jeu est dans la colonne, ou en tête de Match
sur téléphone. `e2e/match.spec.ts` les couvre à 1280, 390 et 360 px.

**Match en direct.** Le serveur joue le match du club dirigé un segment de 15 minutes à la fois, et `/live` (`LiveMatch`)
n'a jamais que ce qui est joué : son horloge court jusqu'à la pause où le match attend (`getLivePause`), demande la suite
une fois et continue. Une étape, un appel : `playLiveStepAction` (`app/saves/[id]/actions.ts`) reçoit ce que le joueur
apporte à la pause (décision sur son événement, changements, consigne), joue la suite (`advanceLiveMatch`) et renvoie ce
que la page affiche (`getLiveStep`, `src/db/live-match.ts` : nouveaux événements et décisions, la pause atteinte avec son
événement et l'équipe du club là, `HalfTimeTeam`, ou le résultat), que la page ajoute (`withStep`) sans se relire : ni
`router.refresh()` ni `revalidatePath` à chaque étape, seulement à un refus et à la fin du match (l'en-tête de la partie
change). Chaque reprise nomme sa pause, phase et minute : la partie verrouillée (`lockSave`), la pause réclamée par une
mise à jour conditionnelle sur `liveState`, la reprise d'une pause déjà jouée (deux onglets, deux clics) est refusée
(`PauseMismatchError`) et rien n'est écrit deux fois. Le match s'arrête pour le joueur à la mi-temps, à la fin du temps
réglementaire d'une coupe nulle, à un événement à choix et là où il l'a demandé : `live-coaching-request` (« Pause à la
30e », « Pause demandée · 30e » une fois touché ; « Coaching à la 30e » jusqu'au 12/11, mal compris ; l'orange de
l'écran pendant que l'horloge court) l'arrête à la prochaine limite non jouée, 15', 30', 60', 75' ou
105', et la demande survit à un rechargement : gardée pour la session de l'onglet (`stop-request.ts`,
`lw_live_stop:<partie>:<match>`, la clé de la pause seule, déjà jouée, rien de la suite ; la mémoire de la page sans
stockage), lue après l'hydratation (`useSyncExternalStore`), la page ne demandant aucune suite avant ; « Pause à la mi-temps », inactif, avant la 45e, où le match s'arrête de lui-même, et inactif dans le dernier
segment, qui sinon annoncerait un nul. `live-skip` (« Aller à la mi-temps », « Aller au résultat », secondaire, une icône
sous 640 px) mène à la prochaine pause de jeu ou à la fin, l'adjoint décidant en chemin ; le mouvement réduit va d'un
arrêt à l'autre d'un coup, événements compris (`stepUntil` : « segment », « pause », « break »). Le moteur n'a ni
possession ni tirs : l'écran n'en montre pas. Carte du score sur le bleu
vif (`LiveScoreCard` : compétition, journée, date, stade s'il
est connu, `Club.stadium` étant vide pour les 198 clubs ; score, minute en orange, barre de progression, pastille du
résultat à la fin ; au-dessus de la barre, la consigne que joue le club à la minute de l'horloge et qui l'a donnée,
`live-instruction`, « Consigne : Fermer · de départ », de l'adjoint, la tienne, réaction tactique : `shownInstruction`
sur les consignes gardées par segment, que la page reçoit au chargement, `getLiveWaiting`, et à chaque étape ; à une
pause, celle que donne la décision prise sur la carte, aussitôt ; elle laisse la place au résultat). Commandes (`LiveControls`, `live-controls`, un seul élément : dans la carte à partir de 1024 px, fixées
au pied de l'écran en dessous) : vitesse x1, x2, x4 (`live-speed-*`), `live-coaching-request` et `live-skip`, qui dit où
il mène (jamais la pause de la 90e, qui annoncerait un nul avant qu'il soit joué) ; à un arrêt, `live-coaching` (le
panneau) et, à une pause de jeu dont le panneau n'a pas été ouvert, `live-resume` (la reprise sans changement de sa
carte, l'orange quand rien n'est ouvert) ; `live-continue` à la fin. **Le panneau Coaching ne s'ouvre jamais de
lui-même** (retours du 05/11). **Carte « À demain »** (`SessionEndCard`, `session-end`, chantier « première session »,
12/11), au coup de sifflet final du direct (sous la carte du score, lue par la page relue à la fin, `readSessionEnd`,
`app/saves/[id]/_lib/session-end.ts`) et en bas du résumé d'une simulation (`simulationSummaryAction`, ses liens fermant
le dialogue) : le mot de l'adjoint après une défaite, le prochain match du club (`getNextAppointment`,
`src/db/next-appointment.ts`, lecture seule ; le direct en cours écarté) et son enjeu lu au classement (`stakeOf`,
`src/lib/session-end.ts`, pur : coupe, premier match de championnat, concurrent direct à 3 points, places qu'une victoire
peut faire gagner, sinon le rang de l'adversaire), « Préparer ce match », les missions du jour telles que ce match les laisse
(`DailyMissionsLine`, règle « Missions du jour, jetons et récompenses »), les jours qui restent au défi de la semaine (et
où en est une partie de défi), « Installer l'appli » (`InstallAppLink`, hors navigateur intégré et appli installée) ;
seulement des liens, l'orange reste celui de l'écran. Aucune simulation de plus : une lecture par fin de direct ou de
simulation. Carte de pause (`BreakCard`, `break-card`, `data-break`) : à la mi-temps et à la fin du
temps réglementaire d'une coupe nulle, `Sheet` modal compact, depuis le pied de l'écran sous 1024 px, au pied de la
colonne du panneau (440 px, en bas à droite) au-dessus ; le titre de la pause, le score (`PauseScore`, partagé avec le
panneau), buteurs et exclus de chaque côté (`breakMarks`), un mot de l'adjoint (blessés, exclus, changement conseillé ou
pourquoi aucun ; avant la prolongation, ce qui suit), « Coaching » (`break-coaching`) puis « Reprendre »
(`break-resume`, « Jouer la prolongation » avant la prolongation), seule action orange, inactifs 500 ms
(`RESUME_GUARD_MS`, `live-pause.ts`) ; Échap et sa croix la ferment, la barre gardant ses deux voies. Carte
d'événement (`ChoiceCard`, `choice-card`, zone de messages `choices`) : `Sheet` modal
comme le panneau, sans croix ni minuterie, Échap ne la ferme pas, le focus sur elle à l'ouverture ; sa famille et sa
minute, son titre, la situation en une phrase (joueurs, minute, score vu du club), deux ou trois choix et leur conséquence
en mots (seul pourcentage : la réussite du penalty ; le remplaçant nommé quand un choix sort un joueur), celui de
l'adjoint signalé et présélectionné, « Valider », seule action orange, et au-dessus « Coaching » (`choice-coaching`),
inactifs 500 ms à l'ouverture. « Valider » envoie la décision et le match reprend aussitôt, la carte restant jusqu'à la
suite (« Reprise… ») ; « Coaching », ou un arrêt demandé à cette limite, ouvre le panneau sur l'équipe telle que la
décision la laisse (`decidedTeam` : le remplaçant de l'événement à sa place, ce changement montré et non annulable ; un
joueur touché ; la consigne choisie), et la décision part avec sa reprise. Dessous, sur deux colonnes à partir de `xl`, le fil (`LiveFeed`, `feedEntries` : événements et
repères, le plus récent en haut, `EventIcon` en SVG, aussi dans la feuille de match), les statistiques en barres, comptées
sur les seuls événements montrés (`matchStats`), et les autres matchs ; le fil montre aussi les décisions des événements
avec leur effet, à la minute qui suit leur limite (`withDecisions`, `describeDecision`, `app/saves/[id]/_lib/decisions.ts`,
zone `decisions` : « Penalty de Diallo : but », « Tu as protesté : Mendy averti »), et les changements de consigne du
club (`instructionChanges`, `app/saves/[id]/_lib/instruction-changes.ts` : une consigne de départ autre qu'Équilibré à la
1re minute, puis chaque changement à la minute qui suit sa limite, et qui l'a donné, départ, toi ou l'adjoint ; celle
d'un événement est dite par sa décision), gardés avec le match (`Fixture.instructions`, migration d'ajout
`…_fixture_instructions` : les segments du club dirigé, `MatchResult.instructions` ; rien pour un match d'avant), comme
la feuille de match. Panneau
Coaching (`HalfTime`) : `Sheet` modal, ouvert à la demande seulement (carte de pause, carte d'événement, barre, arrêt
demandé), fermé par Échap ou la croix, rouvert par `live-coaching`, ses changements gardés (la barre n'offre plus alors
de reprise : rien ne reprend sans eux) ; plein écran sous 1024 px, 440 px à droite au-dessus ; son titre dit la pause
(« Mi-temps », « 60e minute »). La règle des remplacements et les fenêtres utilisées (`half-time-windows` ; sans fenêtre,
le banc refuse), qui fait les changements (l'adjoint jusqu'au premier du joueur), l'adjoint (`coachAdvice`, pur : blessés,
exclus, score, changement, joueurs avertis, joueurs touchés, rien que de vrai), le comparatif des remplacements
(`SubstitutionCompare`, `half-time-compare`, `app/saves/[id]/live/_lib/substitution-compare.ts`, pur) : deux listes, qui
sort (les joueurs sur le terrain, ni un exclu ni un entré à cette pause) et qui entre (le banc, le meilleur au poste
d'abord), ouvertes sur le changement conseillé (`suggestChange`, pur : un blessé d'abord, sinon le plus grand gain de
niveau, `ratingAt` × `condition` du moteur, à partir d'un point ; « Conseil de l'adjoint »), à défaut sur le meilleur
changement possible (`bestChange`) ; côte à côte, la note au poste et son libellé, la condition à la reprise, la forme, le
match (buts, passes décisives, cartons : `HalfTimePlayer.actions`, avec ses attributs, `attributes`) et les trois
attributs que le moteur pèse le plus dans la ligne du poste (`keyAttributesAt`, `attributeWeight`,
`src/engine/strength.ts` : un gardien n'en a qu'un), le meilleur chiffre en avant ; « Faire ce changement » ; rien sans
remplacement possible. Puis les changements prévus, annulables (`cancelSubstitution`), la consigne (Attaquer,
Équilibré, Fermer, chacune avec ce qu'elle fait en une phrase ; celle en cours cochée), le dispositif, la composition
complète, repliée (terrain et banc, glisser-déposer), puis
« Reprendre sans changement » et « Reprendre le match », inactifs 500 ms à l'ouverture (`RESUME_GUARD_MS`) : sur téléphone ils
arrivent sous le pouce, et un double appui reprendrait le match pour de bon. `e2e/live.spec.ts` couvre l'écran à 1280, 768,
390 et 360 px, `e2e/live-choices.spec.ts` un match avec une décision du joueur, un changement, une consigne et un arrêt
demandé.

**Équipe.** Effectif (`/squad`, `SquadTable`) : sous 1024 px, des cartes, une seule table en DOM : tuile note et poste, âge,
nationalité, jauge de forme, condition (cœur et chiffre, aucune pour un blessé ni un suspendu), états (`PlayerBadges`), les trois tris
rapides à la place de l'en-tête ; au-dessus, le tableau, ses colonnes suivant sa place (`@container` : sans Pot. sous
928 px, sans Valeur, Contrat ni Condition sous 672 px, à côté de la fiche ; la Condition, triable, a un cœur pour
en-tête), aucun salaire ; le résumé dit « 27 joueurs sur 30 », en ambre à 30. États : blessé, suspendu, à 4 jaunes
(règle « Suspensions »). Progression de l'été passé et de l'été qui vient, vue « Jeunes » : règle « Évolution des
joueurs ». Composition (`/lineup`, `LineupEditor`, `LineupSquad`) :
sous 1024 px, terrain, résumé, banc, le panneau du dispositif et la consigne de départ, puis la liste ; à partir de 1024 px,
ce panneau sous le choix du dispositif, puis de 1024 à 1279 px l'effectif compact à gauche du terrain et la fiche en
surimpression, à partir de 1280 px l'effectif, le terrain et la fiche sur une page, `pinned`, jamais vide : le titulaire
du poste sélectionné, sinon le dernier joueur choisi, sinon le mieux noté (`pinnedSheetKey`). Chaque joueur placé a sa
note au poste et l'écart à sa note (« 71 → 65 », `RatingGap`, la flèche en SVG) dès qu'il y en a un, et un libellé
(`FitLabel`, `positions.fit` : À son poste, Poste secondaire, Dépanne en ambre, Hors poste en rouge) : sur le terrain,
l'écart sous le nom, le libellé dans le détail et le nom lu, 88 px n'en laissant pas la place ; le résumé compte les
quatre. **La liste de l'effectif (`LineupSquad`, à côté du terrain, sous le banc sur téléphone) ne montre jamais les
titulaires** (17/11), à toutes les largeurs : les remplaçants, avec leur numéro, et les non-retenus, par ligne du terrain ;
les titulaires sont sur le terrain, où chacun se glisse depuis son poste. Toucher un poste le sélectionne et ouvre ses
candidats (`slotCandidates`, `app/saves/[id]/lineup/_lib/candidates.ts` : tout l'effectif sauf le joueur du poste, triés
par note à ce poste, les blessés et suspendus après ; note au poste, libellé, condition, forme en flèche, `FormArrow`,
états, place actuelle ; `lineup-candidate`), **toujours complets**, titulaires compris : sous 1024 px dans une feuille sur la page (`lineup-candidates-sheet`), au-dessus
à la place de la liste de l'effectif (`PanelCandidates`, que « Tout l'effectif » ou Échap rendent) ; un toucher y place le
joueur ou échange deux titulaires (`placeInSlot`), et le glisser-déposer reste ; `lineup-open-sheet` et
`lineup-send-to-bench` avec le joueur du poste ; sans poste sélectionné, une ligne ouvre la fiche. Choix du dispositif
(`FormationPicker`, `formation-picker`) : un bouton qui dit son libellé (`lineup-formation`, `data-formation`) ouvre une
feuille depuis le pied de l'écran sous 1024 px, à droite au-dessus : les trois conseillés pour l'effectif
(`formation-best`, `BEST_FORMATIONS`, classés par `rankFormations` comme un club IA, points attendus face à l'adversaire
moyen de la division, `LineupEditor.tier`), l'actuel juste dessous quand il n'en est pas (`formation-current`), puis
« Voir tous les dispositifs · 14 » (`formation-show-all`, `aria-expanded`), qui déplie sur place les quatorze autres par
famille, 4, 3 et 5 défenseurs (`formation-choice`), chacun avec son libellé, son profil et ses points attendus, l'actuel
marqué ; choisir garde les joueurs à leur place quand ils y tiennent (`switchFormation`) et ferme la feuille. Panneau du
dispositif (`FormationPanel`, zone de messages `lineup-plan`) : le profil en mots et en barres (`formationProfile`),
l'attaque et la défense du onze à côté de celles de l'adversaire (règle « Composition et consigne de départ ») et, déplié,
le comparatif des dix-sept dispositifs, du meilleur écart au centième au moins bon, les trois premiers puis « Voir les 14
autres » (`formation-compare-more` ; sans adversaire, les dix-sept dans l'ordre des noms), le meilleur signalé, « Choisir »
l'appliquant avec le onze de l'adjoint ; la
consigne de départ (`StartingInstruction`) : une bascule, ce qu'elle fait au match, le principe en une phrase et la règle
de l'adjoint ; dans l'état de l'éditeur, enregistrée avec lui. Statut (`lineup-status`, `data-mode`, `data-save`, règle
« Composition enregistrée seule ») : « Onze de ton adjoint · il le refait avant chaque match » (mode adjoint, son panneau
`lineup-assistant` au-dessus, les reposés nommés, `lineup-rested` ; dispositif et consigne enregistrés aussitôt,
`saveLineupPlanAction`), « Ta composition · enregistrée » dès le premier geste sur un joueur (« Annuler », `lineup-cancel` ;
« Rendre la main à l'adjoint », `lineup-hand-back`) ; en mode joueur sans composition jamais enregistrée, « Onze
automatique · enregistré à ton premier changement » (le match joue alors `selectLineup`). Un texte qui dit « Clique » à la souris dit « Touche » au doigt
(`PointerText`, variantes `pointer-fine:` / `pointer-coarse:`, deux clés de message `click` / `touch`). Fiche (`PlayerSheet`, partagée avec le marché avancé, `?player=`) : tête sur le bleu vif, initiales
(`playerInitials`, le visage reste partout ailleurs), note et poste en grand, saison, barres, contrat sans salaire,
transferts ; « Prolonger maintenant » pendant un mercato (la durée seule, au salaire `renewalWage`) orange, secondaire dans la
Composition (`primary`), dont l'orange est l'action de jeu de la colonne ; une vente impossible se lit dans le pied, `sell-player`
désactivé (`player-sale-refusal`). Le sort d'un contrat qui finit cette saison ne se dit que d'un joueur du club dirigé
(`player-leaving-free`, `PlayerProfile.managed` : un club IA décide des contrats des siens), selon le mode et son choix
(`contractIntention` : « Ton adjoint le prolongera en fin de saison », « … le laissera partir libre … », « Il sera
prolongé … », « Sans prolongation, il partira libre … »), et la fiche offre le choix à toute date (`player-contract-choice` :
« Ton adjoint décide », avec ce qu'il fera, « Le prolonger », « Le laisser partir »). Sur l'Effectif, l'action de jeu de la
colonne est secondaire (`OWN_ORANGE_ACTION`) ; sur la Composition, la sienne et celle du sélectionneur, elle est l'orange de
l'écran (`LINEUP_PATHS`, règle « Composition enregistrée seule »). `e2e/team.spec.ts` couvre ces écrans à 1280, 1100, 768, 390 et 360 px.

**Marché.** Deux écrans sous l'entrée Marché. `/transfers` : budget et « Effectif 27/30 » (`[data-summary="squad"]`, en
ambre à 30), bascule Acheter / Vendre · N offres, ou « Vendre · N proposées » quand l'adjoint en propose (`?tab=sell`). Acheter : quatre entrées (Mes besoins, Pépites, Bonnes affaires, Stars),
`proposeSignings` (`src/engine/market-proposals.ts`, pur, sans hasard) et `getMarketProposals`
(`src/db/market-proposals.ts`). Le point faible (`weakSpotOf` sur `elevenOf`, le onze du dispositif) est d'abord un
poste vide, que plus aucun joueur disponible ne peut tenir (blessés et suspendus compris), noté 0 : quiconque peut y jouer
l'améliore ; puis un poste tenu hors poste (ni à son poste, ni à un poste secondaire, ni dans sa ligne : « Hors poste »),
le moins bien noté d'entre eux ; puis le titulaire à la note la plus basse à son poste ; le premier du dispositif à
égalité. « À faire » et l'introduction de Mes besoins disent lequel (`WeakSpot.reason` : `empty`, `outOfLine`,
`lowest`). Une proposition n'est que d'un joueur qui accepterait (`quoteFor` donne `minimumReputation`, comparée à la
réputation du club dirigé) et que le club peut payer (son prix, ou la prime d'un joueur libre, « Prime à la signature »,
sous le budget) : 10 par entrée, une à la fois, « Passer » sans mémoire, « Contrat de 3 saisons » ; à partir de `xl`, les
trois suivantes (« Repérés pour toi ») et la meilleure offre (`SaleOfferCard`). À 30 joueurs, la carte « Effectif plein »
(`market-squad-full`) au-dessus des propositions, qui restent lisibles, « Recruter » inactif, ses liens vers Vendre (« Voir
les ventes proposées » quand il y en a) et l'effectif. « Recruter » ouvre une confirmation (prix ou prime à la signature,
durée, budget restant, « Effectif · 28 sur 30 ») et passe par `makeTransferOfferAction` ou `signFreeAgentAction` au prix
minimal, au salaire que le joueur demande (jamais montré), `DEFAULT_CONTRACT_LENGTH` saisons, `evaluateOffer` inchangé,
puis « Signé ! ». Vendre : il n'y a pas d'offres reçues ni de bouton Refuser, rien à enregistrer ; en tête, « Ton adjoint
propose » (`market-sale-proposals`, une carte `market-sale-proposal` par vente proposée, règle « Simplification » : le
joueur, ses titularisations et minutes de la période, l'offre et sa valeur, « Vendre · 3,4 M€ », l'orange de l'écran pour
la première, et « Garder ») ; puis `getMarketSales` (`src/db/market-sales.ts`) liste les autres joueurs hors du onze, un
titulaire blessé restant du onze, avec la meilleure offre IA de `quoteSquad`, sa carte de tête en secondaire quand
l'adjoint propose ; le compteur compte ces offres. Écran avancé (`/transfers/advanced`, liens « Marché complet » et
« Détails du contrat · ajuster l'offre ») : filtres, joueurs libres, mouvements (le visage du joueur comme dans les autres
listes, aux couleurs du club qu'il rejoint, neutre pour une libération ou une retraite), fiche et dialogues de toujours ; un
joueur qui refuserait le club pour sa réputation le dit dans la fiche et le dialogue, l'envoi désactivé. Un joueur arrivé
au club dirigé pendant le mercato ouvert (ligne `Transfer` vers le club, `TRANSFER` ou `FREE`) ne se vend pas avant le
suivant (`bought_this_window`, `transferWindowOpenDate`, `src/engine/world.ts`), première règle d'une vente ; puis,
jusqu'à la veille du même jour un an après sa dernière arrivée, la meilleure offre IA est plafonnée (`resaleCap`,
`src/engine/transfer-ai.ts`) : 110 % du prix payé pour un joueur acheté (`RESALE_CAP_FEE_PERCENT`), 50 % de sa valeur
du jour pour un joueur libre (`RESALE_CAP_VALUE_PERCENT`, `balance.ts`), à l'euro inférieur. Le plafond ne tire rien : les clubs qui
enchérissent, leurs salaires et leurs contrats sont ceux d'avant, seules les offres au-dessus y descendent, et le plus
réputé de ceux qui l'offrent fait la meilleure ; ce qu'affichent Vendre et la fiche est ce que `sellPlayer` paie. Une vente
verrouille la partie (`lockSave`, comme une journée ou une étape du direct) et se refuse quand un match attend en direct
(`match_in_progress`, `refusals.matchInProgress`) : son état garde la composition, où le joueur peut être. Vendre
(carte, liste, offre de l'onglet Acheter) et le pied de la fiche le disent en une phrase (`SaleQuote.resaleCap`,
`market-sale-resale-cap`, `player-resale-cap` : « Arrivé il y a moins d'un an : les clubs ne paieront pas beaucoup plus
que ton prix d'achat », « … pas plus de la moitié de sa valeur » pour un joueur libre). Les ventes des clubs IA n'en ont
pas. Sur les écrans du Marché, l'action de jeu de la colonne est secondaire (`GameActions`) : l'orange plein y reste à
« Recruter » ou « Vendre ».

**Lectures du marché.** Le marché lit ce qu'il montre, plus toute la partie (chantier « dettes », 06/11) : par l'id
du club dirigé et des index d'ajout (migration `…_market_indexes` : `ClubSave(saveId, isManaged)`,
`ClubSave(saveId, reputation)`, `PlayerSave(saveId, overall, wage)`, `PlayerSave(saveId, potential, overall, wage)`),
**jamais par un filtre de relation sur `ClubSave` depuis `PlayerSave`** : Prisma en fait une jointure dont Postgres
sous-estime d'un facteur 25 les joueurs d'un club, et il les relit tous pour une page. `getManagedLineup` et
`getMarketOverview` sont lus une fois par requête (`cache` de React, sans effet hors d'un rendu serveur) ; `managedMatchesAhead` lit les matchs du club par son id ; l'en-tête de la partie cherche
son prochain match et les matchs restants à partir de sa date (une date se joue entière). Offres de Vendre (`quoteSquad`,
`bestSaleBids`) : les clubs IA dans l'ordre des enchères, par lots de réputations entières (`readBidders`, `FETCH FIRST …
WITH TIES`), et l'effectif des seuls clubs atteints (un club à 30 n'enchérit pas) ; `walkSaleBids` tire comme `saleBids`
(`sale-quotes.test.ts` compare à l'implémentation d'avant, sur quatre parties). Propositions (`getMarketProposals`,
`chooseRows`) : les joueurs libres en entier ; ceux des clubs IA qui accepteraient le club (filtre exact en base, le prix
vérifié ici), par note pour Stars, Mes besoins et Bonnes affaires, par potentiel
pour Pépites, un lot puis des valeurs entières, jusqu'à ce qu'aucun joueur restant ne puisse entrer dans les dix premiers
d'une entrée (bornes pures du moteur : `entryBound`, `settlingFloor`, règles `entryRules` et `firstOf`, celles de
`proposeSignings`) (`market-proposals-equivalence.test.ts` compare à l'implémentation d'avant). Joueurs des clubs IA (`listClubPlayers`) :
la base filtre (l'âge exactement, `earliestBirthForMaxAge`), compte et pagine par note ; le prix, calculé ici, ne
départage que les joueurs de même note ; un poste secondaire, un prix maximal ou le tri par prix lisent tous les
candidats (`market-lists.test.ts` compare chaque page à l'ancienne liste). Les tableaux de l'écran avancé
(`market-tables.tsx`) sont des composants clients : une page n'envoie que les données de ses cinquante lignes.

**Écritures d'une saison (poids d'une carrière).** Mesuré par `npm run measure:weight` (chantier « fiabilité », 08/11 :
une partie 2 de 7 Mo à la création puis environ 5 Mo par saison ; avant lui, 10 avec l'autovacuum, 25 en simulant
chaque saison d'un trait). Une
ligne de joueur n'est écrite qu'une fois par journée, et seulement si elle change : les joueurs des clubs dont le match
se termine dans la transaction récupèrent en mémoire (`recoveredFitness`), l'écriture du match les garde, la récupération
SQL ne touche que les autres (et ceux d'un match en pause du direct) ; `rowChanges` laisse les lignes qu'un match ne
change pas (un banc à la forme posée). `PlayerSave` et `PlayerSeasonStats` ont un `fillfactor` de 50 (migration
`…_career_weight`, invisible pour Prisma) : leurs mises à jour restent dans la page, sans entrée d'index (HOT). Un
retraité porte `PlayerSave.retired` (`freeAgentWhere`, passage de saison, présaison : plus de lecture de ses
transferts). Les buts d'un match sans le club dirigé sont dans `Fixture.goalTimes` (`goalTimesOf`, `decodeGoalTimes`,
`src/engine/match.ts` : la minute, + 1000 en prolongation, négative à l'extérieur), lus par le direct pour les autres
matchs, aucun `MatchEvent` ; les matchs d'avant gardent leurs lignes, jusqu'à ce que le nettoyage les supprime (règle
« Nettoyage des événements »). Les index que l'unicité de mêmes premières colonnes sert déjà ne sont plus
(`ClubSave(saveId)`, `Season(saveId)`, `PlayerSeasonStats(saveId, seasonId)`).

**Nettoyage des événements (chantier « nettoyage », 09/11).** Une tâche de la maintenance quotidienne, jamais une
migration : `POST /api/maintenance/cleanup` (même secret et mêmes réponses 404 que la purge, `?dryRun=1` compte sans rien
supprimer), `cleanUpEvents` (`src/db/event-cleanup.ts`). Deux sortes de lignes seulement, que plus aucun écran ne lit :
les buts des matchs sans le club dirigé gardés en `MatchEvent` (d'avant `Fixture.goalTimes`) **d'une date antérieure à
celle de la partie** (le direct lit les autres matchs de sa date seule, qu'un match en pause depuis montre encore), et les
événements et décisions des matchs du club dirigé **d'une saison terminée** (`Season.completed` : le calendrier et ses
feuilles lisent la dernière saison, le dernier match de l'Accueil les saisons en cours, le résumé de simulation la période
simulée). Rien d'autre : scores, temps de buts, statistiques, transferts restent ; une carte d'un autre match d'un code
plus ancien aussi. Par lots : 20 000 lignes au plus par appel (`EVENT_CLEANUP_MAX_ROWS`), 2 000 par requête, aucune
requête lancée après 20 s (`EVENT_CLEANUP_MAX_MS`), puis le compte de ce qui reste ; chaque appel, comptage ou
suppression, est une ligne `CleanupPass` (migration d'ajout `…_cleanup_passes`), que la section Santé de `/admin` montre.
Le workflow `maintenance.yml` l'appelle après la purge : en comptage tant qu'on ne lui dit pas de supprimer (entrée
`cleanup` d'un lancement à la main : `count`, `delete`, `skip` ; variable de dépôt `EVENT_CLEANUP` pour le passage
quotidien, `count` sans elle), en suppression jusqu'à ce qu'il ne reste rien, 10 appels au plus par passage. Preuve
qu'aucun écran ne bouge : `src/db/event-cleanup.slow.test.ts` (deux saisons d'une partie 2 avec coupes jouées avant le
changement, une troisième à travers lui, un match en pause en direct ; `keepOtherGoalsAsEvents`, `src/db/test-support.ts`,
remet les buts comme avant `goalTimes`), et `event-cleanup.test.ts` pour les règles, les lots et la route ; un test ne
nettoie jamais que ses propres parties (`saveIds`).

**Archives des saisons terminées (chantier « archives », 10/11).** Les matchs et statistiques d'une saison terminée
(`Season.completed`) sont gardés au format compact dans `SeasonArchive` (migration d'ajout `…_season_archives`, une ligne
par saison, clé `seasonId`) : des tableaux d'entiers, un nombre fixe par match (`FIXTURE_FIELDS`, 14) et par ligne de
statistiques (`STAT_FIELDS`, 8), un club ou un joueur par son rang dans une liste triée d'identifiants, les temps de buts
à la suite, les consignes du club dirigé en JSON (`src/lib/season-archive.ts`, pur : `encodeSeason`, `decodeSeason`,
`sameSeason`). Rien n'y est perdu de ce qu'un écran lit ; une valeur qu'il ne garderait pas exactement (une date à la
seconde, un score négatif) est refusée, jamais arrondie ; les identifiants des lignes et les événements et décisions des
matchs (cibles du nettoyage) ne sont pas gardés. **Dès qu'une saison a son archive, elle est lue à la place de ses
lignes**, supprimées ou non (`src/db/season-archive.ts`) : reconstruction paresseuse du palmarès (`ensureSeasonResults`),
vainqueur de la coupe du bilan (`getCupWinnerName`), forme récente de l'adversaire (`getOpponentPreview`, complétée par la
saison d'avant), premiers pas (`managedMatchesPlayed`, par `SeasonArchive.managedPlayed`), bandeau de connexion
(`hasPlayedMatch`), `/admin/stats` (`firstStepsByCohort`), classement d'une saison passée (`getStandings`) et nombre de
clubs de la dotation de l'écran Club ; tout autre lecteur ne lit que des saisons en cours. Une tâche de la maintenance
quotidienne, jamais une migration : `POST /api/maintenance/archive` (même secret et mêmes réponses 404 que la purge),
`runArchivePass` (`src/db/season-archiving.ts`), trois modes : `?dryRun=1` compte ; sans paramètre, archive sans rien
supprimer ; `?delete=1` archive, puis supprime les lignes des saisons archivées depuis au moins `ARCHIVE_DELETE_AFTER_MS`
(2 minutes, plus que toute requête : aucune qui aurait lu une saison avant son archive ne la lit après), et avec elles
les événements et décisions de leurs matchs (cascade). Chaque saison dans sa transaction, la partie verrouillée
(`lockSave`) : le palmarès reconstruit d'abord, les lignes codées, décodées et comparées avant d'écrire l'archive, puis
relues et comparées à elle avant d'être supprimées ; une saison impossible à garder exactement, ou dont les lignes ne
sont plus celles de son archive, reste en lignes (un écart, `mismatches`), et les saisons suivantes de sa partie
attendent : les saisons archivées sont toujours les plus anciennes. Parties de défi exclues (purgées après leur
semaine). Par lots : aucune saison commencée après 20 s (`ARCHIVE_MAX_MS`), au plus `ARCHIVE_MAX_SEASONS` archivées et
`ARCHIVE_MAX_ROWS` lignes supprimées par appel, chaque appel une ligne `ArchivePass` (même migration), que la section
Santé de `/admin` montre (`admin-archive`). Le workflow `maintenance.yml` l'appelle après le nettoyage, **éteinte par
défaut** : entrée `archive` d'un lancement à la main (`skip`, `count`, `archive`, `delete`), variable de dépôt
`SEASON_ARCHIVE` pour le passage quotidien, `skip` sans elle ; il rappelle la route tant qu'elle a du travail, 30 appels
au plus. Preuve qu'aucun écran ne bouge : `src/db/season-archive.slow.test.ts` (deux saisons d'une partie 2 avec coupes
et deux dates d'une troisième, chaque écran relu avant, après le comptage, après l'archivage et après la suppression,
puis les archives retirées : les écrans changent, la preuve verrait une suppression sans archive) ;
`season-archiving.test.ts` pour les règles, l'écart, les lots et la route ; un test n'archive que ses propres parties
(`saveIds`). Mesure : `npm run measure:weight -- --archive` (10/11, une partie 2 seule dans sa base : 6,2, 10,7, 12,8 et
14,0 Mo réels à la création puis après 1, 2 et 3 saisons, au lieu de 7,0, 12,7, 17,3 et 21,8 avant le chantier ; 8,3 Mo
de données vivantes après 3 saisons, environ 1,2 Mo de plus par saison au lieu de 4,5 ; la place des lignes supprimées
reste dans les fichiers, et sert aux lignes suivantes, de toutes les parties).

**Filet de sécurité (chantier « filet », 09/11).** Deux workflows de tests sur GitHub. `ci.yml`, à chaque push sur
`main` et à chaque pull request (une branche sans pull request n'est pas testée), en un seul job, « Types, lint, Vitest,
quick E2E » : `next typegen` (sans quoi un dépôt neuf n'a ni `PageProps` ni `LayoutProps`), `tsc`, lint,
`npm run test`, puis `npm run test:e2e:quick` ; un second job installerait tout et remplirait une seconde base.
`weekly.yml`, le dimanche à 01:30 UTC et à la demande : toute la suite E2E, après `npm run test` comme la CI (les tests
en base créent la partie de démo que plusieurs E2E lisent, `ensureDemoSave`, qu'une base neuve n'a pas : sans eux, ces
E2E échouent), et `npm run test:slow`, deux jobs. Chaque job tourne sur `ubuntu-24.04` (image fixée dans tous les
workflows, jamais `ubuntu-latest`, qui change sans prévenir) et a son
PostgreSQL 17 jetable (service du job, sur localhost, sans durabilité : `fsync`, `synchronous_commit` et
`full_page_writes` à off), migré depuis zéro puis rempli par le seed (actions composites `.github/actions/prepare`,
`test-database`, `playwright`, Chromium gardé en cache par version de Playwright). Ses valeurs, factices, sont écrites
dans le workflow (`DATABASE_URL`, `DIRECT_URL`, `DATABASE_URL_TEST`, `AUTH_SECRET`), et `.env.test` en est tiré. **Rien
n'y peut joindre Neon** : ces workflows ne lisent aucun secret, l'adresse de Neon n'existe que dans Vercel, et le
garde-fou (`assertLocalDatabase`) refuse tout hôte autre que localhost sans `VERCEL=1` ni `ALLOW_REMOTE_DB=1`, qu'ils ne
posent pas ; `src/db/connection-guard.test.ts` vérifie que chaque fichier qui ouvre une connexion appelle le garde-fou,
et que ces workflows ne lisent ni secret ni base distante. **Le dépôt est privé** : chaque minute compte sur le quota du
compte GitHub (Free : 12 $ inclus, environ 2 000 minutes Linux), que la maintenance partage ; au-delà, sans budget, tous
les workflows s'arrêtent jusqu'au mois suivant, purge et défi compris. Cible : moins de la moitié. D'où la porte de
chaque workflow (`gate`) : `main` avancée en avance rapide sur la tête d'une pull request verte (le même commit) ne la
reteste pas ; une semaine sans nouveau commit sur `main` ne lance rien. Un push plus récent sur une pull request annule
son passage en cours. Durées réelles lues sur GitHub le 25/11, chaque job facturé à la minute supérieure : environ
8 minutes par passage de la CI (8 à 19, une fois 24, du 9 au 24/11), 1 par porte, 48 par semaine testée (E2E 27,
Vitest compris, suite lente 20) ; avec 35 mises en ligne par mois, environ 600 à 750 minutes, 30 à 38 % du quota,
maintenance comprise (65). Sur GitHub (`CI`), Playwright relance une fois un test en échec et garde sa capture
dans un rapport HTML, artefact de 7 jours. Sauvegardes : instantané hebdomadaire programmé dans la console Neon,
procédure de restauration dans `docs/restauration.md`, aucune copie des données hors de Neon.

**Club.** Quatre onglets, Club, Défi, Histoire et Récompenses (règle « Missions du jour, jetons et récompenses ») ; l'action
de jeu de la colonne y est secondaire (`OWN_ORANGE_ACTION`). Club (`/club`) : pastille du manager (`club-manager`, saisons
terminées + 1, le titre porté et le badge mis en avant, `club-manager-title`) ; finances en lecture seule (`getClubFinances`,
`src/db/club.ts` : budget en grand, aucun salaire, puis le détail de la dernière dotation,
`ClubFinances.dotation` lue dans `SeasonBudget`, `club-dotation` : dotation et rang de réputation dans la division,
objectifs de la saison passée (bonus, malus, ou ni l'un ni l'autre, × coefficient), report, budget de la saison ;
« Budget de départ » la première saison, rien pour une partie d'avant la dotation ; puis les primes reçues de la
saison en cours, `club-prizes` (`getSeasonPrizes`, `SeasonPrizes` : primes européennes, participation comprise,
`club-prizes-europe`, et de la coupe, `club-prizes-cup`, chacune nommée par sa compétition, en `data-amount` ; recalculées
des matchs joués par les fonctions qui les créditent, `europePrizesOf` et `cupPrizesOf`, sans colonne ni migration ; rien
sans coupe ni Europe) ; aucune autre recette, le jeu n'en a pas) ; les objectifs du président (`ClubObjectives`, `club-objectives`, `id="objectifs"`, toute la largeur :
chaque objectif, imposé ou choisi, et par qui, son but, ce qui le dépasse, son état et son chiffre ; la confiance du
président, `club-confidence`, jauge de 0 à 99 et ses mots, affichage seulement, la direction ne renvoyant jamais son
entraîneur ; tant que le choix est ouvert, les trois propositions et « Choisir mon objectif » vers l'écran de début de
saison) ; défi sur le bleu vif (où en est le joueur, tête du classement à partir de `lg`, « Voir le défi », seul
orange plein de l'écran) ; les trois dernières saisons, et, à partir de `lg`, l'aperçu de la dernière carte et ses boutons
(`HonoursCardActions` ne les monte pas en dessous : un téléphone ne télécharge pas le PNG) ; Réglages (`ClubSettings` :
ce dont s'occupe l'adjoint (règle « Simplification ») et sa consigne (règle « Consigne de l'adjoint »), langue, compte, parties utilisées sur la limite, changer de partie, série des missions du jour et record hors partie de défi,
confidentialité). Défi (`/saves/[id]/challenge`) : l'écran
de la page publique (`ChallengeScreen`, `app/challenge/_components`), quelle que soit la partie ouverte. Tête sur le bleu vif
(semaine et fin, `formatParisWeekdayTime`), carte « Ta partie » (`ownChallenge`, pur : journées, score une fois soumis et
reprise, « Jouer le défi », ou pourquoi pas ; aucun score provisoire, le jeu ne l'écrit qu'à la 10e journée, jamais de
« Relancer »), classements (`RankingTable`, partagée : ta ligne en bleu, l'anonyme toujours grisé). Histoire (`/seasons`, l'ancien
Palmarès, règle « Histoire de la carrière ») : ses saisons terminées en cartes sous 1024 px, toute la carte menant à la saison, le tableau au-dessus ; une saison européenne y a sa ligne
(« Coupe des Lauriers : quarts de finale », « Vainqueur de la Coupe des Lauriers », `europeLabel`), comme la coupe et les
montées, que les trois dernières saisons de l'écran Club montrent aussi (`club-honours`, `data-mark`). Bilan
(`/seasons/[seasonId]`) : la ligne européenne du club et le vainqueur de chaque compétition européenne de l'année
(`getEuropeWinners`, `src/db/europe-results.ts`, l'archive d'une saison archivée ; `season-europe-eu1`, `-eu2`) ; la carte PNG
(badges `cardBadge` : « EUROPE » pour un titre européen, « DOUBLÉ » pour deux titres parmi championnat, coupe et Europe,
« TRIPLÉ » pour les trois, et la ligne européenne d'un parcours sans titre ; la saison d'un sélectionneur, sa ligne au pied,
« SÉLECTIONNEUR DU PORTUGAL · COUPE DES HÉMISPHÈRES : DEMI-FINALE » (`getCoachSeason`) ; `SEASON_CARD_VERSION` 3 ; pour une saison
qui a des objectifs, la pastille « Objectifs : 2/3 », `objectivesLine`, à côté de la saison),
`SeasonCardActions` : où le navigateur partage des fichiers (`navigator.canShare({ files })`), « Partager » en orange
envoie le PNG carré lui-même, seul (`navigator.share({ files })`, sans titre ni texte, que perdent ou refusent Instagram,
TikTok et Snap), le fichier lu d'avance ; ailleurs (navigateur d'une appli, la plupart des ordinateurs) ou quand le
navigateur refuse le partage annoncé, « Enregistrer l'image » en orange, qui télécharge le PNG ou, sur iPhone et iPad,
l'ouvre en grand pour un appui long vers Photos (`season-card-viewer`), et une phrase sur la publication depuis la
galerie (`season-card-save-hint`) ; « Copier le lien » copie l'adresse du jeu (`SITE_URL`, `src/config/site.ts`), la
carte ne s'ouvrant qu'à son propriétaire ; `e2e/season-card-share.spec.ts` simule les deux navigateurs. Une carte coûte
environ 440 ms de CPU à dessiner : son adresse porte sa langue et la version de son dessin (`seasonCardPath`,
`SEASON_CARD_VERSION`, à augmenter quand la carte change), une adresse donnant toujours la même image, que le navigateur
garde un an en privé et le serveur 30 jours (`unstable_cache`, traducteurs hors requête `translatorFor`). Le bilan des
objectifs (`season-objectives`, `getClosedObjectives` : « Objectifs : 2/3 », chacun avec son issue), montées et descentes, et,
pour la dernière saison terminée (`isLastCompletedSeason`), « Cap sur la saison 2027-28 » vers l'écran de début de saison
(règle « Début de saison ») : `advanceSeasonAction` mène ici une fois la saison suivante commencée. `e2e/club.spec.ts` couvre
ces écrans à 1280, 390 et 360 px.

**Histoire de la carrière (chantier « historique », 18/11).** Cahier `docs/design/historique.md`, validé le 18/11.
L'onglet Palmarès devient **« Histoire »** (« History »), même adresse (`/saves/[id]/seasons`, `nav-seasons`) : la tête sur le
bleu vif (`history-head` : saisons terminées, divisions traversées « D2 → D1 », trophées, montées, objectifs atteints, et la
carte de carrière, son seul orange), la salle des trophées (`trophy-room`, `trophy-tile` avec `data-kind`, `data-count`,
`data-to-conquer` : champion de D1, de D2, coupe, Coupe des Lauriers, Coupe des Fanions, montée, chacun avec ses saisons ; un
trophée encore gagnable reste, éteint, « À conquérir » ; les finales perdues comptées), les records (`career-records`,
`record-*`), les légendes (`career-legends`, `legend`, `on-the-way`), la saison en cours (`history-current`), puis les
saisons terminées (le tableau du Palmarès, avec objectifs, budget de la saison et de fin de saison, meilleur buteur et
triplés). Moteur pur `src/engine/career-history.ts` : records (plus large victoire au score après prolongation ;
invincibilité toutes compétitions, une défaite aux tirs au but comptée comme un nul, la série en cours dite ; meilleur total
de points **par division** ; meilleur buteur et joueur le plus capé pour le club, et un joueur au club à 5 buts ou 10 matchs ;
plus gros achat et plus grosse vente, `Transfer` de type `TRANSFER` ; jeune formé le plus réussi, clé `youth:{année}:{club}:`
ou `shop-youth:` signalé « Boutique », par l'indice de légende) ; **indice de légende** (`LEGEND_POINTS` : 1 par match, 2 par
but, 1 par passe, 15 par élection comme joueur de la saison, 20 par titre de D1 ou Coupe des Lauriers, 10 par Coupe des
Fanions, coupe, titre de D2 ou montée, ces trophées comptés pour un joueur de 10 matchs ou plus cette saison-là), légende dès
150 (`LEGEND_THRESHOLD`), cinq montrées et trois joueurs du club « en route » ; statistiques d'un joueur pour le club
(`attributedLines` : coupe et Europe toujours, championnat quand il a fini la saison au club ou hors de sa division, la ligne
d'un transfert d'hiver dans la même division allant au club où il l'a finie). Lecture `src/db/career-history.ts` en deux
parts : les saisons terminées (`readCompletedCareer` : `SeasonResult` reconstruits au besoin, objectifs clos, `SeasonBudget`,
matchs et statistiques de leurs lignes ou de leur archive, `readArchivedSeasonsOfClub` avec `stats`), gardées par le
serveur 30 jours par la dernière année terminée (`unstable_cache`, `HISTORY_VERSION`,
`app/saves/[id]/seasons/_lib/history-cache.ts`), et ce qui bouge (`readLiveCareer` : saison en cours, joueurs tels qu'ils
sont, transferts, noms des clubs par `displayClubName`). Mesure (`npm run measure:history`, 18/11, carrière archivée comme la
production) : 50 requêtes et 30 à 40 ms de CPU à froid, 26 requêtes et 8 à 10 ms en cache, à 5 comme à 10 saisons (84 et
161 Ko gardés). **Relevé de fin de saison** : `SeasonResult.highlights` (Json, migration d'ajout `…_season_highlights`),
écrit par `recordSeasonResult` (`seasonHighlightsOf`, `src/db/season-highlights.ts` ; pur : `src/engine/season-highlights.ts`)
dans la transaction d'`advanceToNextSeason`, avant que nettoyage ou archivage n'emportent les événements : budget de fin de
saison, les cinq meilleurs buteurs du club et leurs passes, exacts d'après les événements de ses matchs, ses triplés, la note
et la valeur de chaque joueur de l'effectif ; null pour une saison d'avant ou reconstruite (le meilleur buteur vient alors des
statistiques). Carte de carrière (`/saves/[id]/seasons/card`, `careerCardPath`, `n=` les saisons terminées, sinon 404,
`CAREER_CARD_VERSION` 2, `career-card.tsx` : la carrière telle que l'a laissée sa dernière saison terminée, trophées (ceux du
sélectionneur compris, côte à côte au-delà de quatre lignes en paysage, de six en carré), plus large
victoire et invincibilité par leurs chiffres seuls, jamais l'adversaire, la première légende ou le meilleur buteur, objectifs ;
ni nom, ni initiales du club, ni nom du manager ou de la partie ; cadres et titres de la collection) : à partir d'une saison
terminée, jamais dans une partie de défi. Le bilan d'une saison dit les records qu'elle a battus (`recordsSetIn`,
`season-new-records`) ; l'écran Club compte les trophées (`club-honours-trophies`) et mène toujours à l'Histoire
(`club-honours-all`, « Toute l'histoire »). Ce que l'archivage a emporté (le détail des matchs des saisons terminées :
buteurs de chaque match, cartons, remplacements, décisions) n'est lu nulle part. Preuves : `career-history.test.ts`,
`season-highlights.test.ts`, `europe.slow.test.ts` (relevé exact sur une saison jouée), `season-archive.slow.test.ts`
(l'Histoire identique avant et après l'archivage et la suppression des lignes), `e2e/club.spec.ts` (1280, 390 et 360 px).

**Début de saison (gameplay v2, V3).** `/saves/[id]/season-start` (`app/saves/[id]/season-start`, sous l'entrée Club, sans
onglet), `season-start` : la saison ; « La direction t'accorde X » (`season-start-budget`, le budget de la dotation de la
saison, `SeasonBudget` lu par `getClubFinances`) et son détail : dotation et rang de réputation dans la division, objectifs
de la saison passée et leur apport au coefficient (`getLastClosedObjectives`), report, total ; « Budget de départ » la
première saison ; puis, après un passage de saison, ce qu'a fait l'adjoint à l'intersaison (`season-start-assistant`, lu
dans `SeasonBudget.contractMoves`, `getSeasonContractMoves` : prolongés, partis, recrues et leur prime, jeunes, « Effectif :
25 joueurs sur 30 »). Ensuite les objectifs (`getSeasonObjectives`) : les
imposés, avec ce qui les dépasse, et le choix parmi les trois proposés, en cartes radio (`objective-choice`), celui de
l'adjoint présélectionné et signalé (« Sans choix avant ton premier match, ton adjoint choisira… ») ; « Valider mon
objectif » (`objective-validate`, seule action orange de l'écran, `chooseObjectiveAction` : `requireOwnedSave`, Zod, refus
`actions.objective.refusals`), puis l'objectif verrouillé (`objective-chosen`, « Ton choix » ou « Choisi par l'adjoint »).
Montants en `data-amount`, coefficient en `data-coefficient`. On y arrive par « Cap sur la saison » du bilan, et, tant
que le choix est ouvert, par la carte Objectifs de l'Accueil et l'onglet Club. `e2e/objectives.spec.ts` passe une fin de saison
(`e2e/season-end-save.mts` : un jumeau 1 de la démo, sa saison jouée), vérifie la nouvelle dotation et choisit un objectif,
à 1280, 390 et 360 px.

**Pages hors partie.** Accueil (`/`, `/fr`), comment jouer (`/how-to-play`, `/fr/comment-jouer`), défi (`/challenge`,
`/fr/defi`), nouveautés (`/changelog`, `/fr/nouveautes`), à propos (`/about`, `/fr/a-propos`), confidentialité (`/privacy`,
`/fr/confidentialite`), `/admin/stats` et 404 passent par `PublicPage` (`page` : la page publique, pour le sélecteur et le
bandeau de langue ; le 404 mène à l'accueil, sans bandeau)
(`app/_components/public-page.tsx`) : la marque du jeu (`public-home`) et la langue sur une ligne, le contenu, le pied
(`BrandFooter`, ce que la page y ajoute, puis ses liens : comment jouer, nouveautés, à propos et `privacy-link`) ; `tools`, ce qu'une page offre à côté de la marque à partir de 1024 px,
passent sous son contenu en dessous, un seul DOM ; `after` les suit, sous le contenu à toutes les largeurs. Accueil (`HomePage`,
`app/_components/home-page.tsx`, rendu par `/` et `/fr`) : sans utilisateur, un h1 qui dit ce qu'est le jeu (« Jeu de carrière
de football gratuit, dans ton navigateur », « Free football career game in your browser », `landing.title`), puis le choix du
club (règle « Premiers pas ») : **on joue sans descendre**, le bouton entier dans la fenêtre à l'ouverture, à 360 × 780 comme à
1280 × 800 ; sur deux colonnes à partir de `lg` (titre, phrase, manager et bouton à gauche, clubs, recherche et liste à droite ;
`HOME_COLUMNS`), le lien du défi et Google dans `tools`. Sous eux (`after`), rendues par le serveur, les sections de l'accueil
(`LandingSections`, `app/_components/landing-sections.tsx`, zone de messages `landing`, quelques centaines de mots) : ce qu'on
fait dans le jeu, trois captures de téléphone prises en noms fictifs (`public/screenshots`, une par langue, 720 × 1015, chacune
avec son texte alternatif ; sous 640 px une rangée que le pouce fait défiler dans la page), le défi de la semaine, gratuit et
sans téléchargement, puis une FAQ visible. Un joueur revenu : « Tes carrières », ses parties en cartes (`SaveCard`,
`[data-save-name]`, initiales du club, « Reprendre » `open-save`), puis le même formulaire titré « Choisis ton défi » en h2
(`heading="returning"`), ou `SaveLimitNotice` à la limite, dont le bouton Google est alors le seul de l'écran, puis les mêmes
sections. Une seule action orange pleine : `create-save`, sinon « Reprendre » de la partie la plus récente.
Slogan, accroche, langues et date de la première saison sont au pied de l'accueil. `e2e/home.spec.ts` couvre ces pages à 1280,
1024, 390 et 360 px.

**Téléphone.** Aucun écran ne défile de côté à 390 ni à 360 px, en français comme en anglais (`e2e/mobile.spec.ts` :
`scrollWidth ≤ innerWidth` à chaque étape, en 390 × 844). La barre du bas vaut sous 1024 px (`max-lg:`), tablettes
comprises, sauf sur le direct ; les règles `max-sm:` valent sous 640 px. Sous 640 px, toute cible fait au moins 44 px : boutons,
champs, listes, menus et onglets partagés (`src/components/ui`) et la bascule (`src/components/segmented.tsx`) le font
d'eux-mêmes, les liens et contrôles propres à un écran avec `max-sm:min-h-11`. Une grille de page a `grid-cols-1` sous lg
(`minmax(0, 1fr)`), jamais la largeur de son plus large contenu ; une grille avec la fiche latérale de 400 px (effectif,
marché) ne passe en deux colonnes qu'à partir de `xl`, la fiche étant en surimpression en dessous ; la composition a
ses deux colonnes à partir de `lg`, ses trois à partir de `xl`, et le tableau de bord ses trois colonnes (deux à partir de
`lg`). Un tableau garde un seul DOM (testids et E2E de bureau inchangés) : sur téléphone, moins de colonnes, ses lignes
en grilles des mêmes colonnes que l'en-tête (marché), ou des cartes (effectif et palmarès sous 1024 px, parties de
l'accueil, mouvements), disposées par CSS ; le reste est dans la fiche du joueur. Le classement complet, une fois demandé, est le seul
à défiler de côté, dans son cadre, rang et club figés à gauche, points à droite. Aucun texte utile coupé : à la ligne, sous
le nom, ou lu par les lecteurs d'écran et montré dans la fiche (cases de la grille du mois). Glisser-déposer
(`usePointerDrag`) : au doigt, un appui maintenu de 250 ms soulève le joueur et un geste plus rapide fait défiler la page
(aucun `touch-none` sur une source), la page défile seule près des bords pendant un glisser ; souris, clavier et
toucher-toucher inchangés. `e2e/navigation.spec.ts` couvre les cinq entrées à 390 et 1280 px.

**Une partie appartient à un `User` (`Save.ownerId`).** Supprimer un `User` emporte ses parties (cascade). Hors des
tests, trois suppressions d'utilisateur sont autorisées, et aucune autre : **la purge** (ci-dessous) ; **la fusion** à
la connexion Google, où l'utilisateur anonyme du navigateur (cookie `lw_uid`) donne d'abord toutes ses parties au
compte, puis est supprimé, désormais sans partie (`signInWithGoogle`, `src/auth/google.ts`) ; **la suppression
volontaire** d'un compte Google par son joueur, bouton « Supprimer mon compte » de l'accueil (`deleteAccountAction`,
`app/actions.ts`, puis `deleteRegisteredUser`, `src/db/accounts.ts`, jamais un `ANONYMOUS`), qui déconnecte et
efface `lw_uid`. **La purge est la seule suppression automatique d'utilisateurs** :
`purgeAnonymousUsers` (`src/db/purge.ts`), appelée chaque jour à 04:17 UTC par `.github/workflows/maintenance.yml`
via `POST /api/maintenance/purge` (en-tête `Authorization: Bearer <MAINTENANCE_SECRET>`, 404 sans la variable ou
avec un mauvais secret, `?dryRun=1` pour compter sans supprimer). Elle supprime les `ANONYMOUS` non vus depuis
30 jours (`lastSeenAt`, avec leurs parties) et les `ANONYMOUS` sans partie non vus depuis 24 h ; jamais un
`REGISTERED`. **Règle des 14 jours** (décidée le 10/11, `?oneDay=1`) : un `ANONYMOUS` vu le seul jour de sa création
(le jour UTC de `lastSeenAt` est celui de `createdAt` : une carrière jamais reprise) part après 14 jours sans visite
(`ONE_DAY_ANONYMOUS_DAYS`, `src/lib/maintenance.ts`), en SQL, Prisma ne comparant pas deux jours d'une ligne ; sans
`?oneDay=1`, il est seulement compté. Chaque utilisateur est compté sous la première règle qu'il remplit (30 jours,
14 jours, sans partie), et la réponse donne en plus `byRule`, ce que chaque règle supprime à cette heure, celle des
14 jours même éteinte. Le workflow l'applique au passage quotidien quand la variable de dépôt `PURGE_ONE_DAY` vaut
`delete`, sinon la compte seulement ; un lancement à la main choisit `daily`, `count` (un appel en `?dryRun=1&oneDay=1`)
ou `one-day`. Par lots : 25 utilisateurs au plus par appel, les plus anciens d'abord (`maxDuration = 60`), et la
réponse donne `remaining` ; le workflow rappelle la route tant que `remaining > 0`, 20 appels au plus. Aucun autre code ne supprime d'utilisateur de lui-même.
Après les anonymes, chaque appel supprime aussi un lot de 10 parties de défi dont le défi est fini depuis plus de 24 h
(le mardi qui suit sa semaine), **quel que soit leur propriétaire** (`purgeChallengeSaves`) : **première suppression
automatique de parties de comptes Google**, annoncée au joueur à la création ; leurs entrées restent, sans partie.
`remaining` compte les deux.

Les parties d'avant les propriétaires gardent `ownerId` NULL : ce sont les parties **héritées**, visibles de
personne ; la connexion du compte `ADMIN_EMAIL` les lui rattache. Toute nouvelle partie a un propriétaire ; le code
n'en crée jamais sans.

**Toute requête sur une partie est scopée par propriétaire ET `saveId`.** Le propriétaire est vérifié une fois, à
l'entrée : toute page sous `app/saves/[id]` et toute Server Action qui reçoit un `saveId` appellent d'abord
`requireOwnedSave(saveId)` (`src/auth/current-user.ts`, qui passe par `loadOwnedSave`, `src/db/access.ts`, point
unique du contrôle) ; une partie d'un autre joueur répond 404, comme une partie inexistante. Le layout ne protège pas
les Server Actions : chacune fait son contrôle. Ensuite, une requête Prisma sur une table de partie sans `saveId`
dans le `where` est un bug : elle mélangerait deux parties. Dans un filtre de relation (une jointure), le `saveId` de la
table de tête suffit : **ne pas le répéter dans la relation** (`playerSave: { clubSaveId }`, jamais
`playerSave: { saveId, clubSaveId }`) : Postgres, qui croit une partie toute neuve d'une seule ligne tant que ses
statistiques ne la connaissent pas, prendrait n'importe quel index commençant par `saveId` et relirait tous les joueurs de
la partie pour chaque ligne (2,2 s au lieu de 3 ms). Les listes de parties passent par `visibleSavesWhere`
(les parties du joueur, rien sans utilisateur). **Seule exception, limitée aux entrées du défi** : le classement d'un
défi lit les `ChallengeEntry` de toutes ses parties, par `challengeId` (score, utilisateur, jamais le contenu d'une
partie), et la fusion à la connexion Google déplace les entrées d'un utilisateur à l'autre, comme ses parties.

**Identité.** Le joueur est reconnu par sa session Google (Auth.js, `src/auth/auth.ts` : JWT sans adaptateur ni
table, qui porte notre `User.id`), sinon par le cookie anonyme `lw_uid` (id d'utilisateur signé HMAC-SHA256 avec
`AUTH_SECRET`, obligatoire). `getCurrentUser()` lit sans rien créer ; `requireCurrentUser()` crée un utilisateur
anonyme et pose le cookie, seulement depuis la création de partie ; `adoptAnonymousUser` pose celui d'un anonyme
existant, seulement depuis le bouton d'un lien de reprise (règle suivante). La connexion Google efface `lw_uid`.
L'administrateur n'a pas de colonne : `isAdmin(user)` compare son e-mail à `ADMIN_EMAIL`, sans casse.
`lastSeenAt` est réécrit à la première requête de chaque jour UTC, avec une ligne `UserDay(userId, day)`
(`recordUserDay`, `src/db/user-days.ts`, `INSERT … ON CONFLICT DO NOTHING`) : c'est la seule source de la
rétention.

**Navigateurs intégrés et lien de reprise (chantier « première session », 12/11).** Le navigateur d'Instagram, de
Facebook (Messenger compris), de TikTok ou de Snapchat a ses propres cookies, à part de ceux du téléphone : une carrière
commencée là y reste, et Google y refuse la connexion (disallowed_useragent). Détection dans le navigateur seulement, par
le user-agent (`inAppBrowserOf`, `IN_APP_PATTERNS`, `src/lib/in-app-browser.ts`, pur) : `IN_APP_BROWSER_SCRIPT`, script
en ligne en tête du `<head>` du layout racine (jamais `next/script`, qui l'exécuterait après le premier rendu), marque
`<html>` de `data-in-app` (l'appli) et `data-in-app-platform` (`android`, `ios`, `other`) avant que la page s'affiche
(`suppressHydrationWarning` sur `<html>`) ; les écrans montrent ou cachent par CSS, variantes `in-app:`,
`in-app-android:` et `in-app-other:` (`globals.css`) : rien ne bouge, le serveur ne lit jamais le navigateur. Avis
(`InAppNotice`, `app/_components/in-app-notice.tsx`, `in-app-notice`, caché ailleurs) : « Ouvre Late Winner dans ton
navigateur pour garder ta carrière », sur l'accueil (au-dessus du formulaire) et le tableau de bord ; sur Android
« Ouvrir dans Chrome » (`in-app-chrome`, intent `chromeIntentUrl`, la page elle-même, ou avec une carrière son lien de
reprise), ailleurs la marche à suivre (`in-app-steps`) ; avec une carrière, « Copier mon lien de reprise »
(`ResumeLinkCopy`, `resume-link-copy`, puis le lien dans un champ, `resume-link-value`, si le presse-papiers refuse).
`GoogleSignInButton` est caché dans un navigateur intégré (`in-app:hidden`), comme le bandeau du compte et
`OtherDevice` ; les Réglages du Club y donnent le lien de reprise à sa place. **Lien de reprise** (`ResumeLink`,
migration d'ajout `…_resume_links`, `src/db/resume-links.ts`) : 32 octets aléatoires en base64url dans le lien
`/resume?t=…` (`resumeLinkPath`, sans l'origine, que le navigateur ajoute), seule leur empreinte SHA-256 en base, jamais
l'identifiant du joueur ; pour un anonyme qui a une carrière seulement (`createResumeLink`, `createResumeLinkAction`,
20 par heure au plus), valable 7 jours (`RESUME_LINK_DAYS`), une seule fois. La page s'en charge par une Server Action
dès qu'une page intégrée avec carrière s'ouvre, puis l'onglet le garde 30 minutes (`app/_lib/resume-link-store.ts`,
`sessionStorage`) : copie et intent partent dans le toucher. Ouvrir `/resume` ne consomme rien (`readResumeLink`, un
aperçu de lien ne le grille pas) : la page (`app/resume`, sans langue dans l'adresse, `noindex`, `no-referrer`, refusée
aux robots) montre la carrière et, quand ce navigateur peut la prendre (`resumeViewOf`, `src/lib/resume-link.ts`, pur),
« Reprendre ma carrière » (`resume-submit`, `resumeCareerAction`) : consommation atomique (`consumeResumeLink`,
`UPDATE … WHERE usedAt IS NULL AND expiresAt > maintenant`), puis le cookie `lw_uid` du même joueur
(`adoptAnonymousUser`) et sa dernière carrière : même utilisateur, même source, même rétention ; l'appli d'origine la
garde aussi. Refus expliqués (`data-view`) : lien inconnu, déjà servi, expiré, navigateur connecté à Google
(« account ») ou ayant sa propre carrière sans compte (« other-career ») : rien n'est remplacé ni supprimé ; « here »
quand ce navigateur a déjà ces carrières. Les liens partent avec leur utilisateur (cascade). `e2e/in-app.spec.ts` simule
Instagram sur Android et iPhone à 390 px et reprend une carrière dans un autre navigateur, une fois.

**Arrivées des joueurs.** Sans cookie tiers ni outil extérieur (`src/lib/arrival.ts`, pur). À la première visite d'une
page publique (le navigateur qui ouvre la page, `isPageNavigation` : ni préchargement ni requête du routeur ; ni robot
par son user-agent, `isCrawler` ; ni joueur déjà là, `lw_uid` ou session Google), `proxy.ts` garde dans le cookie
première partie `lw_src` (30 jours, httpOnly) la source (`?ref=`, sinon `utm_source`, nettoyés par `campaignSource` ;
sinon le domaine du site référent sans « www. », jamais son adresse ; sinon « direct »), ce domaine et la page d'arrivée
(`arrivalOf`), et passe à la page l'arrivée et un identifiant de visite (`x-lw-arrival`, `x-lw-visit`, retirés s'ils
sont forgés). `CountArrival` (dans `PublicPage`) la compte après l'envoi (`after`), une seule fois même quand la page est
rendue deux fois (`next dev` le fait), dans `VisitDay` : jour UTC, source, page, un total, sans donnée personnelle, 100
sources par jour au plus, les suivantes dans « (other) » (`recordVisit`, `src/db/visits.ts`). La création d'un
utilisateur garde l'arrivée du cookie, sa langue (`playerLocale`) et son appareil, téléphone ou ordinateur (`deviceOf`,
une tablette compte comme un ordinateur, rien du navigateur lui-même n'est gardé) : `requestAcquisition`
(`src/auth/acquisition.ts`), pour un anonyme à la création de sa partie, pour un compte Google à la connexion. Un compte
créé à la connexion qui absorbe un anonyme reprend sa date de création, son arrivée et ses jours de visite
(`moveHistory`, `src/db/accounts.ts`) : le même joueur ; un compte qui existait ne reprend que ses jours. `source` null :
un utilisateur d'avant le suivi, ou sans le cookie.

**Premiers pas des joueurs (activation).** Quatre dates sur `User` (`src/db/activation.ts`), écrites une fois, à
l'horloge de la base (`now()`, jamais celle de la simulation), dans la transaction qui fait le pas : `firstSaveAt` à la
création d'une carrière (`createSave`, défi compris), `firstMatchAt` à la fin d'un match du club dirigé, simulé
(`playNextMatchday`) ou en direct (`advanceLiveMatch`, jamais au coup d'envoi), `firstLiveMatchAt` à la fin du premier
joué en direct jusqu'au bout (`recordFirstMatch` avec `live`, la même instruction ; migration d'ajout
`…_first_live_match`, suivie depuis le 17/11/2026), `firstSeasonEndAt` quand plus aucun match de la partie n'est à jouer,
toutes compétitions (après chaque journée et chaque fin de direct). Gardées sur l'utilisateur plutôt que déduites : une
partie part (supprimée, défi purgé) et aucune table ne date un match en temps réel ni ne dit qu'il a été joué en direct.
À la connexion Google, la plus ancienne de chaque (`moveHistory`). null : pas encore fait, ou d'avant le suivi (aucune
reprise des parties existantes).

**Chiffres du jour (`DailyStat`).** Une ligne par jour UTC de ce qu'aucune autre table ne garde (`src/db/daily-stats.ts`,
à l'horloge de la base) : les matchs d'un club dirigé joués jusqu'au bout, en direct ou simulés (`countManagedMatch`,
**après** la transaction de `playNextMatchday` ou d'`advanceLiveMatch`, jamais dedans : la ligne du jour resterait
verrouillée pendant la journée de chaque joueur ; un échec coûte un compte, jamais le match) ; à chaque appel de la purge
(`recordMaintenance`, route de maintenance, jamais en `dryRun`), ce qu'elle a supprimé (anonymes, leurs parties,
`PurgeResult.saves`, dont ceux de la règle des 14 jours à part, `purgedOneDayUsers` et `purgedOneDaySaves`, migration
d'ajout `…_purge_one_day` ; parties de défi) et la taille de la base (`pg_database_size`), un relevé par jour.

**Erreurs du jeu (`ErrorDay`).** Celles du serveur (`onRequestError`, `instrumentation.ts` : rendu, route, action,
proxy ; jamais l'adresse, les en-têtes ni les cookies de la requête, ni ce que Next lance exprès, redirect et notFound) et
celles des navigateurs (`ErrorReporter` dans le layout racine, `app/global-error.tsx` pour une page que React n'a pu
rendre, sauf une erreur du serveur, qui a son digest : `reportClientError`, cinq rapports par page au plus, chacun une
fois, jamais une extension ni « Script error. », par `sendBeacon` vers `POST /api/client-errors`). Celle-ci est la seule
route API d'usage interne : une balise doit partir d'une page qui se ferme, et d'une page d'un déploiement d'avant, dont
les Server Actions n'existent plus ; 2 Ko au plus, même origine, 10 par minute et par adresse (gardée en mémoire, jamais
écrite), 300 par minute et par instance. Une erreur est nettoyée (`cleanErrorMessage`, `routeOfPath`,
`src/lib/error-report.ts` : adresses e-mail, identifiants, nombres longs et requêtes retirés, « /saves/[id]/live »),
regroupée par jour UTC et par empreinte (`errorFingerprint` : source, sorte, route et message aux nombres effacés) et
comptée, avec sa dernière heure et son échantillon le plus récent (`recordError`, `src/db/errors.ts`, à l'horloge de la
base) ; au-delà de 200 groupes par source dans la journée, dans son groupe « (other) ». La purge quotidienne supprime les
jours de plus de 30 jours (`purgeOldErrors`). Section « Erreurs » de `/admin` (`getErrorsSection`) : 24 h et 7 jours,
serveur et navigateur, la plus récente, les dix groupes les plus fréquents de la semaine avec leur compte des 24 h (les
jours UTC d'hier et d'aujourd'hui d'une erreur vue depuis hier à cette heure).

**Appli installable (sans store).** `app/manifest.ts` (`/manifest.webmanifest`, lié par chaque page) : Late Winner,
`display: standalone` depuis `/`, fond et barres `#0B1340` (`APP_BACKGROUND`, `app/_lib/install-app.ts`, aussi le
`themeColor` du layout), les icônes 192 et 512 de `public/icons` et leurs versions masquables, sans coins arrondis (la
marque tient dans la zone sûre) ; `apple-icon.png` et `appleWebApp` (barre d'état opaque, rien dessous) pour l'iPhone. Pas
de jeu hors ligne : le service worker (`public/sw.js`, enregistré par `AppShell` dans un build de production seulement)
ne garde que `public/offline.html` (« Pas de connexion », FR et EN) et ne la sert qu'à une navigation sans réseau ; Chrome
ne propose son invite qu'à un site dont le service worker a un gestionnaire `fetch`. L'invite est retenue dès la
première page (`HOLD_INSTALL_PROMPT_SCRIPT`, script `beforeInteractive` du layout : `preventDefault`, pas de mini-barre
sur Android) : **aucune fenêtre ne vient d'elle-même**. Le joueur la demande dans Club → Réglages (`InstallApp`,
`settings-install`, `data-state`) : « Installer l'appli », discret, ouvre l'invite du navigateur où elle existe (Chrome,
Edge, Android), sinon dit en une ligne comment faire (iPhone et iPad : Partager, puis « Sur l'écran d'accueil » ;
ailleurs : le menu du navigateur) ; dans l'appli installée, il le dit. Un lancement de l'appli installée (affichage
`standalone`, `isStandalone`) est compté une fois par session (`sessionStorage`), `countAppLaunchAction`, publique,
20 par heure et par adresse gardée en mémoire : `DailyStat.appLaunches`, dans l'Activité de `/admin`.
`e2e/install.spec.ts` simule l'invite, l'iPhone et l'affichage installé.

**Administration (`/admin`).** Le tableau de bord de l'administrateur (`app/admin/page.tsx`, `getAdminDashboard`,
`src/db/admin-dashboard.ts`), 404 pour tout autre comme `/admin/stats`, qui reste, à un lien (« Statistiques
détaillées », et retour ; ses huit plus grosses tables avec leurs données et index, puis leurs lignes vivantes et mortes,
la part des mises à jour HOT, le dernier autovacuum et leur nombre, le dernier autoanalyze, `relationSizes`, compteurs de
PostgreSQL, que Neon garde d'un démarrage de son calcul à l'autre, et le dernier démarrage du serveur, `serverStartedAt`) : sur 7 jours (`/admin`) ou 30 (`?days=30`), UTC, aujourd'hui compris. Acquisition (visites,
nouveaux joueurs par jour et par source, langue, appareil, sans compte ou Google), Parcours (par source : carrière, 1er
match, fin de saison, en part des visites ; médiane de la création de la carrière à la fin du premier match ; « Passés par
le direct », en tuile et par source, colonne masquée sous 640 px : la part des nouveaux joueurs créés depuis le premier
`firstLiveMatchAt` de tous, `liveTrackedSince`, qui ont joué un match en direct jusqu'au bout), Tutoriel
(`TutorialSection`, `admin-tutorial`, `tutorialFigures`, `src/db/admin-tutorial.ts` : les tutoriels commencés sur la période
par jour UTC de début, leur premier match, leur jour 1 fini, passés (dès le jour 1), terminés, abandons ; la médiane et le
3e quartile du début au premier match, à côté de la médiane des 14 jours d'avant la mise en ligne ; chaque étape, du jour 1 puis des jours suivants,
montrée, faite, passée, adaptée, où l'on a passé le tutoriel et où les abandons sont partis ; retour à J+1 et J+7 du jour 1
fini, du tutoriel passé le jour 1, des partis avant la fin du premier match et de la référence), Rétention
(J+1 et J+7 par jour de création et par source, sur les jours dont le retour est passé), Activité (joueurs actifs par jour
depuis `UserDay`, matchs du jour, défi de la semaine, lancements de l'appli installée ; liens de reprise de la période,
créés, pour combien de joueurs, et utilisés, lus dans `ResumeLink`, ceux d'un joueur purgé partis avec lui), Missions du
jour (`MissionsSection`, `MissionFigures`, `src/db/admin-missions.ts` : proposées et faites sur la période, par palier et
mission par mission, la v1 comptée avant la bascule ; journées parfaites, changements de mission ; séries en cours,
celles dont le dernier jour compté est d'aujourd'hui ou d'hier, par longueur ; record, cycles de série, protège-séries
achetés, utilisés et en réserve), Jetons (`TokensSection`, `TokenFigures` : gagnés et dépensés par jour, par source et par
article ; soldes médian, 90e centile et maximum ; contrôle journal = solde de chaque joueur, en alerte au moindre écart), Erreurs (règle « Erreurs du jeu »), Santé
(`storageHealth`, pure : taille, croissance sur les 7 derniers jours de relevés, coût de stockage estimé sur l'offre Launch
de Neon, taille × 0,35 $ le Go par mois, `STORAGE_PRICE_PER_GB_MONTH`, et sa projection à 30 jours à ce rythme, en
alerte au-delà de 5 $ par mois, `STORAGE_COST_ALERT_DOLLARS` ; poids par nouveau joueur, la croissance divisée par les
joueurs créés du jour du premier relevé à la veille du dernier ; purges, et les parties purgées par chacune des deux règles,
30 et 14 jours (`admin-purged-inactive`, `admin-purged-one-day`) ; puis les passages du nettoyage des événements
de la période, 30 au plus, `CleanupPass` : ce que le dernier laisse, sorte par sorte, puis chaque passage, comptage ou
suppression, supprimées, restantes et durée, celle-ci masquée sous 640 px). Chaque chiffre est une requête d'agrégat sur
la période, par un index (`User(createdAt)`, `UserDay(day)`, les jours de `VisitDay` et `DailyStat`), jamais une grande
table de partie ; le plus cher est `pg_database_size` (environ 0,1 s). Lisible sur téléphone : sous 640 px, quatre
colonnes au plus par tableau (le Parcours y laisse ses visites, déjà dans l'Acquisition, et sa médiane), aucun ne défile
de côté à 360 px (`e2e/admin.spec.ts`). FR et EN (zone `admin`, espace `admin`).

**Accès ouvert.** Le jeu est ouvert à tous, sans mot de passe ni page de connexion : le mode « fermé » et `/login` ne
sont plus, et les anciens liens de `/login` mènent à l'accueil pour de bon (308, `next.config.ts`, la requête gardée).
Auth.js y renvoie une connexion Google refusée ou échouée (`pages`, `src/auth/auth.ts` : `?error=`, `signInErrorOf`,
`sign-in-error`). Un visiteur sans cookie ni session voit l'accueil avec le
formulaire de création, Google en second. Limites de parties dans `src/lib/limits.ts` (constantes, pas de variable
d'environnement) : `MAX_SAVES_ANONYMOUS = 1`, `MAX_SAVES_REGISTERED = 3`, appliquées par `createSave`
(`SaveLimitError`) et par l'accueil, qui remplace alors le formulaire par un message ; à la création seulement ; les
parties de défi n'y comptent pas (`countOwnedSaves`, `challengeId` NULL). Un
anonyme dont la partie a un match joué voit sur le tableau de bord un bandeau l'invitant à se connecter, masqué sept
jours par le cookie `lw_banner_closed`. `/admin` et `/admin/stats` (`src/db/stats.ts`) sont réservées à `isAdmin(user)` et
répondent 404 à tout autre, déconnecté compris. Variables propres : `MAINTENANCE_SECRET` (routes de purge, du défi, du
nettoyage et de l'archivage) ; secrets GitHub `MAINTENANCE_URL` et `MAINTENANCE_SECRET` (workflow `maintenance.yml` ; les
adresses du nettoyage et de l'archivage sont celle de la purge, `…/cleanup` et `…/archive` au lieu de `…/purge`) et
variables de dépôt facultatives `EVENT_CLEANUP` (règle
« Nettoyage des événements »), `SEASON_ARCHIVE` (règle « Archives des saisons terminées ») et `PURGE_ONE_DAY` (règle des 14 jours de la purge), `CHALLENGE_URL` et le même `MAINTENANCE_SECRET` (workflow `challenge.yml`, le lundi à
05:00 UTC).

**Langues : français et anglais.** Tout ce que voit un joueur existe dans les deux langues : pages publiques, écrans
d'une partie, carte PNG, `/admin/stats`, page de confidentialité. next-intl 4. `<html lang>` suit la langue de la page.
- **Pages publiques : la langue est dans l'adresse** (`PUBLIC_PAGES`, `src/i18n/public-pages.ts`, pur) : l'anglais à la
  racine, le français sous `/fr` en mots français (`/` et `/fr`, `/challenge` et `/fr/defi`, `/privacy` et
  `/fr/confidentialite`) ; une adresse ne change jamais sans redirection. Chaque page a ses deux routes (`app/fr/…`), qui
  rendent le même composant. `proxy.ts` pose sur la requête l'en-tête `x-lw-page-locale` (`PAGE_LOCALE_HEADER`,
  `pageLocaleOf` : tout ce qui est sous `/fr` est français, un 404 compris), que `src/i18n/request.ts` lit avant tout.
  **Aucune redirection selon le navigateur** : seul un visiteur qui a choisi le français (cookie `lw_lang`) et ouvre `/`
  va à `/fr` (302, jamais une Server Action). Un bandeau discret (`LanguageBanner`, `language-banner`, dans la langue
  du visiteur) propose l'autre adresse quand la langue du visiteur (`preferredLocale` : son cookie, sinon
  `Accept-Language` ; rien pour un robot, qui n'envoie ni l'un ni l'autre) n'est pas celle de la page ; ses deux
  boutons retiennent le choix ; sous 640 px, eux seuls sur une ligne, la phrase lue par les lecteurs d'écran,
  pour que le bouton de l'accueil reste au-dessus du pli à 360 × 780. Métadonnées de chaque page (`publicPageMetadata`, `app/_lib/public-metadata.ts`,
  messages `seo`) : titre et description propres dans sa langue, canonical absolue en `https://www.latewinner.app`
  (`absoluteUrl`), hreflang `en`, `fr` et `x-default` (l'anglais) réciproques, image de partage nommée
  (`SHARE_IMAGE_PATH`, une page qui a son `openGraph` perdrait sinon celle de `app/opengraph-image.tsx`). Tout lien
  vers une page publique passe par `publicPath(page, locale)`, dans la langue de la page d'où il part.
- **Pages d'une partie et `/admin/stats` : sans la langue dans l'adresse**, celle du joueur : celle qu'il a choisie (cookie
  de confort `lw_lang`, `fr` ou `en`, un an, posé seulement par le sélecteur « FR · EN » et le bandeau,
  `setLanguageAction`, `app/actions.ts` : en haut des pages publiques, où il mène à l'adresse de la page dans la langue
  choisie, le formulaire envoyant son nom, jamais une adresse ; dans une partie, les Réglages de `/club`, à toutes les
  largeurs, en bascule « Français / English »), sinon le français si `Accept-Language` le préfère à l'anglais, l'anglais
  sinon (`negotiateLocale`, `src/i18n/locale.ts`, `playerLocale`, `src/i18n/player-locale.ts`, lue à chaque requête par
  `src/i18n/request.ts`). La connexion Google, la déconnexion et la suppression du compte reviennent à l'accueil de la
  langue de la page.
- **Passer de l'une à l'autre** : le layout racine (`<html lang>`, messages des composants clients) reste celui du premier
  chargement. Une page atteinte sans chargement complet depuis une page de l'autre langue se recharge donc en entier dans
  la sienne (`LocaleGuard`, `app/_components/locale-guard.tsx` : dans `PublicPage` contre la langue de la page, dans le
  layout d'une partie contre celle du joueur, jamais deux fois de suite) : une partie créée depuis l'accueil anglais par
  un joueur français, que la requête de la création rend d'abord en anglais, puis un retour en arrière. « Reprendre »
  (accueil, défi) mène à une partie par un chargement complet. Les helpers E2E créent une partie depuis l'accueil de la
  langue du navigateur (`homeOf`, `e2e/helpers.ts`).
- **Messages** : `src/i18n/messages/<langue>/<zone>.json`, un fichier par zone et par langue, chacun ses espaces de
  noms, assemblés par `src/i18n/messages/index.ts` (`ZONES`, puis les deux objets) : `public` (connexion, défi, 404,
  sélecteur), `home` (accueil, création, compte, limites), `world` (compétitions, pays, nationalités), `catalogs` (postes, tours,
  a.p./t.a.b., événements, lettres de résultat), `header` (en-tête, navigation, actions de jeu, simulation), `dashboard`,
  `dashboard-hero` (héros de l'Accueil), `dashboard-todo` (« À faire »), `onboarding` (premières actions, bulles), `missions` (missions du jour, série), `rewards` (jetons, boutique, collection),
  `challenge-banner` (carte du défi), `squad` (effectif), `player-sheet` (fiche joueur, contrats), `lineup`,
  `market` (Acheter, confirmation), `market-sell` (Vendre), `transfers` (marché avancé), `fixtures` (calendrier,
  feuille de match), `standings` (classement), `seasons` (histoire, bilan, cartes de saison et de carrière), `cup` (coupe), `club` (écran Club,
  réglages), `challenge-screen` (onglet Défi), `live` (direct), `session-end` (carte « À demain », mot de l'adjoint),
  `half-time` (panneau Coaching), `actions` (messages des Server Actions, refus), `in-app` (navigateurs intégrés, page
  du lien de reprise), `tutorial` (bulles et lignes de l'adjoint, ligne des Réglages), `admin`. Typés (`src/i18n/next-intl.d.ts` : une clé inconnue échoue au typage) ;
  `src/i18n/messages.test.ts` exige les mêmes clés et les mêmes arguments ICU dans les deux langues, que tout message
  se formate et qu'un espace de noms n'appartienne qu'à un fichier. Seule exception, les documents des pages publiques,
  hors des messages : la confidentialité et « À propos » ont leurs deux versions en JSX
  (`app/privacy/_components/privacy-document.tsx`, une date commune ; `app/_components/documents/about-document.tsx`),
  le guide « Comment jouer » et le journal « Nouveautés » leurs deux langues en données (`app/_content/how-to-play.ts`,
  `**…**` pour un libellé d'écran en gras ; `app/_content/changelog.ts`, ses jours réels hors du test des années).
- **Ajouter une chaîne** : la clé dans le fichier de la zone, en français et en anglais, mêmes arguments (pluriels
  `{count, plural, …}`, ordinaux `{rank, selectordinal, …}`, jamais d'apostrophe droite devant `{`) ; une zone
  nouvelle, c'est un fichier par langue importé dans `index.ts`. Composant client ou serveur non async :
  `useTranslations("espace")` ; composant async, Server Action, route : `await getTranslations("espace")`, après
  `requireOwnedSave` ; un utilitaire qui nomme reçoit un `Translator<"espace">` (`src/i18n/translator.ts`), la carte PNG
  ses traducteurs (satori dessine sans React). Dates, montants, nombres : `src/lib/format.ts` avec la langue
  (`useLocale` / `getLocale` ; fr-FR, en-GB). Tests : `inLanguage` et `testTranslator` (`src/i18n/test-intl.tsx`) ;
  vérifier avec `npx vitest run src/i18n/messages.test.ts` et `npx tsc --noEmit`.
- **Noms** : une compétition est nommée par son code (`competitionName`, `src/i18n/countries.ts` : « England —
  Division 2 », « France — Cup »), le nom en base reste français ; une nationalité, stockée en français, par son code à
  trois lettres et son nom traduit (`nationalityName`, `app/saves/[id]/_lib/nationalities.ts`) ; une partie de défi par
  sa semaine. Clubs et joueurs gardent leur nom.
- **Écriture** : le français tutoie partout ; l'anglais est britannique (« €77.2m », « 3rd », « Table », « Honours »),
  une partie s'y dit « career ».
- **E2E** : Playwright envoie `fr-FR` par défaut, les contrôles se trouvent par `data-testid` ; le parcours anglais,
  `e2e/english.spec.ts` (`locale: "en-GB"`), va des pages publiques au direct et au classement.

**Pas de marques sous licence.** Aucune mention de FIFA, EA, ou des noms de compétitions officiels sous
licence dans le code, l'UI ou le README. Les données viennent d'OpenFootball (CC0).

## Marque et règles produit

**Nom.** Le jeu s'appelle **Late Winner**. Slogan : « The football career game ». Accroche : « Take your club
to the top ». Adresse canonique : https://www.latewinner.app. « Career Manager » reste le nom interne (dépôt,
`package.json`, projet Vercel) : seul ce que voit le joueur change. Slogan et accroche en anglais ; les métadonnées d'une
page publique dans sa langue, et le jeu lui-même en français et en anglais (règle « Langues »). Fichiers de marque dans `public/brand/` (logo clair, logo pour fond sombre,
icône), icônes du site dans `app/` (`favicon.ico`, `icon.svg`, `apple-icon.png`) et `public/icons/`.

**Couleurs.** Marque : bleu vif `#1F3BFF`, bleu nuit `#0B1340`, orange `#FF9F1C`, blanc, fond clair `#EEF1F7`. La palette
de la piste A habille tout le jeu (`:root` de `app/globals.css`, sombre uniquement) : fond `#0B1340`, cartes
`#16205A`, bordures et ligne mise en avant `#2A3678`, navigation `#0E1850`, bleu principal `#1F3BFF` (cartes héros, état
actif, dont la bascule), orange `#FF9F1C` (`--club` : action principale, entrée active de la navigation, survol
`#FFB54D`), accent secondaire `#8FA0FF`. Les couleurs de club ne
teintent pas l'interface : `--club` est l'orange, partout ; le club se montre par ses initiales (`ClubInitials`,
`src/components/club-initials.tsx`, orange pour le club dirigé, blanc pour un autre ; `clubInitials`,
`src/lib/club-initials.ts`), jamais par un écusson, et ses couleurs ne restent que sur les maillots des visages et sur la
carte PNG (`clubAccentsOn`). Une seule action orange pleine
par écran (`variant="club"`), tenue écran par écran au fil des étapes de la refonte : sur l'Accueil, celle du héros, la
colonne n'en ayant aucune, sur le direct, celle de ses commandes ou du panneau, sur Équipe, « Prolonger » ou, sur la
Composition, l'action de jeu de la colonne, sous Club, « Voir le défi », la reprise ou « Jouer le défi », « Partager » ou « Enregistrer l'image », hors partie, « Lancer ma carrière ». Couleurs de résultat, d'alerte et de poste fixes, quel que soit le club (`--win`, `--draw`,
`--loss`, `--warning`, `--info`, `--position-*`). Titres et chiffres en Barlow Condensed 800 italique (le fichier de
`src/assets/fonts`, chargé par `next/font/local`, une seule graisse), en majuscules par la règle `.font-heading` de
`globals.css` (`normal-case` là où des unités et des ordinaux doivent garder leur casse : « 16e », « €11.4m ») ; texte
courant en Barlow 400 à 700 ; rayons 14 px, cartes 22 px (`rounded-card`), pastilles `rounded-full`.

**Communication sortante.** Titres de page, descriptions, images de partage (`app/opengraph-image.tsx`) et
cartes partageables ne contiennent aucun nom de club, ni « FIFA », ni « EA FC », ni le nom d'un jeu concurrent.
« football manager » est permis en minuscules, comme nom du genre (« free football manager game in your browser »),
jamais en majuscules ni en comparaison. **Aucun vrai nom de club dans le HTML qu'une page publique reçoit du serveur** :
le choix du club de l'accueil (`creationChoicesAction`, `app/_lib/creation-choices.ts`) et le club de la semaine sur la page
publique du défi (`challengeClubNameAction`, `ChallengeClubName`) arrivent dans le navigateur, leurs places gardées ;
`e2e/seo.spec.ts` lit le HTML brut des 12 adresses contre les 198 noms réels (table `Club`). Les parties, elles, rendent
leurs noms sur le serveur. Les tests le vérifient sur chaque texte public (`forbiddenNamesIn`,
`src/lib/outward-names.ts`) : marques, compétitions sous licence, jeux concurrents, et les noms réels des 198 clubs
(`realClubNames`, `prisma/seed/real-club-names.ts`) comme leur cœur (« Real Madrid » de « Real Madrid CF »).

**Référencement.** `app/robots.ts` : tout est permis sauf `/saves/`, `/api/`, `/admin` et `/resume`, avec l'adresse du
sitemap ;
les robots des moteurs de recherche et de réponse (OAI-SearchBot, PerplexityBot, Claude-SearchBot, Claude-User) et ceux
qui lisent pour entraîner des modèles (GPTBot, ClaudeBot, Google-Extended) sont nommés et admis, par décision (un robot
qui a son groupe ne lit que lui : il reprend les règles de tous). `app/sitemap.ts` : chaque page publique dans chaque
langue, avec ses hreflang. `public/llms.txt` : ce qu'est le jeu et ses pages, en anglais (`app/_lib/crawlers.test.ts`
vérifie qu'il les cite toutes). Données structurées : l'accueil, dans ses deux langues, donne un graphe JSON-LD
(`homeStructuredData`, `app/_lib/structured-data.ts`, échappé par `jsonLdText`) : `WebSite`, puis le jeu en
`VideoGame` et `WebApplication` (nom, adresse, description de la page, langues en et fr, genre, plateforme navigateur,
gratuit : `offers.price` 0, image de partage, captures) ; **aucune note ni aucun avis**. Toute page publique se lit sans
JavaScript, rendue par le serveur (`e2e/seo.spec.ts`).

**Noms de clubs.** Le nom affiché d'un club passe toujours par `displayClubName` (ou `displayClubShortName`),
point unique de résolution dans `src/engine/club-name.ts`. Il s'appelle dans `src/db`, là où les lignes Prisma
deviennent des vues, jamais dans un composant client : `CLUB_NAMES` est une variable serveur. Aucun composant ne
lit `Club.name` pour l'afficher. `CLUB_NAMES` (lu une fois au démarrage) : `real` par défaut, `fictional` pour
les noms neutres de `prisma/seed/data/club-aliases-fallback.json` (clé = slug ; ville ou région + mot neutre,
jamais le mot distinctif du vrai club). Un club ajouté au seed doit y avoir son entrée : un test le vérifie.
Jamais de logo ni d'écusson de club.

**Hébergement.** Aucun service propre à Vercel (Blob, KV, Cron, Analytics) : le jeu doit rester déplaçable
chez un autre hébergeur.

**Budget CPU Vercel (chantier « cpu », 11/11).** L'offre Hobby compte 4 h de Fluid Active CPU par mois, et chaque
requête qui atteint le serveur en coûte : **aucun préchargement automatique**. Tous les liens passent par
`src/components/link.tsx` (`prefetch={false}`, `router.prefetch` au seul survol d'un pointeur, jamais sur un écran
tactile ; ESLint refuse `next/link` ailleurs) : `next/link` préchargeait chaque lien visible, de nouveau après chaque
Server Action, deux requêtes sur trois d'une session type, et l'accueil depuis chaque écran de partie, à travers le proxy.
Le proxy ne tourne que sur les pages publiques (`config.matcher`). L'essentiel du reste est le jeu lui-même : une
journée d'une partie 2 coûte environ 0,5 s de CPU en local, une création de partie environ 4 s.

**Budget base de données.** La production est sur l'offre Launch de Neon, facturée à l'usage (stockage 0,35 $ le Go
par mois, instantanés 0,09 $) : la section Santé de `/admin` estime le coût du stockage et alerte au-delà de 5 $ par
mois projetés. Le plan gratuit (100 CU-h de calcul, 1 Go de stockage, 5 Go de transfert par mois) avait été épuisé par
les tests le 24 octobre 2026 (production hors ligne jusqu'au 1er novembre), d'où le Postgres local : la production
seule touche Neon. Les tests lourds (`npm run test:slow`, saisons complètes, E2E) ne lui coûtent rien : les lancer quand
le changement le justifie.

## Conventions

- Code, noms de variables et commentaires en **anglais**. Textes d'interface en **français** et en **anglais**, dans
  les messages (`src/i18n/messages`), jamais en dur dans une page traduite.
- Server Components par défaut ; `"use client"` seulement pour un composant réellement interactif.
- Un lien interne est un `Link` de `@/src/components/link`, jamais de `next/link` (règle « Budget CPU Vercel »).
- Mutations via Server Actions, jamais de route API pour un usage interne, sauf `POST /api/client-errors` (règle
  « Erreurs du jeu »).
- Validation des entrées avec Zod à la frontière (Server Action, parsing de fichier importé).
- Une requête à la fois sur une connexion : pas de `Promise.all` sur un client de transaction (`tx`) ni sur un client
  pg à soi. Les requêtes que Prisma lance lui-même ensemble dans une transaction (chargement des relations, `createMany`
  découpé) sont chaînées par `SequentialPrismaPg` (`src/db/pg-adapter.ts`), l'adaptateur de tous les clients Prisma ;
  en test, `src/db/test-pg-guard.ts` fait échouer toute requête envoyée sur une connexion occupée (pg 9 la refusera).
- Pas de `any`. Pas de `!` non-null sans commentaire justifiant.
- `package-lock.json` est commité à chaque changement de dépendance ; ne jamais commiter des modifications du lock qui
  ne viennent pas d'un changement voulu de dépendance ; la CI (`npm ci`) vérifie qu'il est à jour.
- Le lock s'écrit avec la version de npm de la CI, celle du Node 24 le plus récent (npm 11.19.1 le 09/11/2026), plus
  stricte que celle du poste (11.6.2, qui acceptait un lock sans `@emnapi/core` ni `@emnapi/runtime`) : après un
  changement de dépendance, `npx npm@<version de la CI> install --package-lock-only`.
- Un commit = un changement cohérent, message en français à l'impératif.

## Structure

```
app/                  # routes App Router, à la racine ; UI en français et en anglais (src/i18n)
  _components/        # cadre des pages hors partie (public-page), composants de l'accueil (parties, choix du club)
  admin/              # tableau de bord de l'administrateur (/admin) et ses statistiques détaillées (stats/), 404 pour tout autre
  _content/           # textes des documents publics en deux langues : le guide (how-to-play.ts) et le journal des
                      # versions (changelog.ts : chaque entrée datée du jour de sa mise en ligne, en mots de joueur, la
                      # plus récente d'abord ; la page les regroupe par jour ; une entrée de plus à chaque mise en ligne)
  how-to-play/, changelog/, about/  # le guide, le journal des versions et « À propos » (_components/documents)
  fr/                 # les adresses françaises des pages publiques (accueil, comment-jouer/, defi/, nouveautes/,
                      # a-propos/, confidentialite/), qui rendent les
                      # composants des anglaises
  privacy/            # page de confidentialité, publique, en français et en anglais ; à tenir à jour
                      # avec le code (_components/privacy-document.tsx : les deux versions, une date de mise à jour)
  resume/             # page d'un lien de reprise (/resume?t=…) et son bouton, qui consomme le lien
  api/                # Auth.js, les routes de maintenance (purge, défi de la semaine, nettoyage des événements, archivage des saisons) et les erreurs des navigateurs
                      # (client-errors), seules routes API
  saves/[id]/         # une partie : tableau de bord, effectif, composition, calendrier, classement, transferts,
                      # club (club/ : finances, réglages), tutorial/ (actions du tutoriel de la première carrière),
                      # Europe (europe/ : compétitions européennes), sélections (internationals/ : les
                      # 14 nations, leurs 23, la dernière trêve), ma sélection (nation/ : la nation du sélectionneur, sa liste, sa
                      # composition, nation/lineup ; son direct, live/nation), début de saison (season-start/ : dotation, choix de
                      # l'objectif), défi (challenge/), histoire (seasons/ : trophées, records, légendes, saisons ;
                      # seasons/card : carte de carrière ; seasons/[seasonId]/card : carte PNG de fin de saison, sans nom
                      # de club), récompenses
                      # (rewards/ : jetons, série, boutique, collection)
                      # actions.ts (Server Actions) à côté des pages qui les utilisent
e2e/                  # tests Playwright (npm run test:e2e) ; english.spec.ts : le parcours en anglais ;
                      # arrivals.spec.ts : le cookie d'arrivée, le compte des visites et la carrière qui en vient ;
                      # in-app.spec.ts : le navigateur d'Instagram simulé (Android, iPhone) et le lien de reprise ;
                      # admin.spec.ts : /admin, 404 pour tout autre, ses sections à 1280, 390 et 360 px, FR et EN,
                      # une erreur provoquée dans un navigateur, montrée dans sa section ;
                      # dashboard.spec.ts : l'Accueil ; match.spec.ts : classement, calendrier et coupe ;
                      # europe.spec.ts : la page Europe, le calendrier et une finale européenne en direct ;
                      # internationals.spec.ts : la première trêve internationale d'une partie neuve, ses alertes, sa fiche, son calendrier ;
                      # national-coach.spec.ts : l'offre d'une fédération acceptée, la liste de l'adjoint validée puis changée, un match
                      # de sélection en direct jusqu'à son résultat ;
                      # live.spec.ts : le direct et le panneau Coaching ; live-choices.spec.ts : un direct avec une
                      # décision du joueur, un changement et un arrêt demandé ; team.spec.ts : Effectif, Composition et fiche ;
                      # lineup-candidates.spec.ts : le changement en un toucher sur téléphone ; lineup-autosave.spec.ts :
                      # la composition enregistrée seule (deux onglets, réseau coupé, départ juste après un geste,
                      # direct) ; starting-instruction.spec.ts : le panneau du dispositif et la consigne de départ, de la
                      # composition au direct ;
                      # club.spec.ts : Club, son défi, ses réglages, l'histoire de la carrière et le bilan d'une saison ;
                      # assistant-policy.spec.ts : la consigne de l'adjoint, des Réglages à la Composition ;
                      # progression.spec.ts : l'évolution des joueurs dans l'Effectif, la vue « Jeunes » et la fiche ;
                      # mobile.spec.ts : le parcours sur téléphone (390 × 844), jamais plus large que l'écran ;
                      # navigation.spec.ts : les cinq entrées et leurs onglets, à 390 et 1280 px ;
                      # home.spec.ts : l'accueil, le choix du club et les pages hors partie ;
                      # onboarding.spec.ts : le parcours d'un nouveau joueur, sur ordinateur et sur téléphone, le tutoriel
                      # passé ; les premières actions d'une partie de défi ;
                      # tutorial.spec.ts : le jour 1 du tutoriel sur téléphone en anglais, chronométré, Échap, « Passer le
                      # tutoriel » et sa reprise, une deuxième carrière et une partie de défi sans tutoriel ;
                      # missions.spec.ts : les missions du jour faites en direct, les jetons, un achat en boutique, la collection ;
                      # objectives.spec.ts : une fin de saison, la nouvelle dotation et le choix d'un objectif ;
                      # season-card-share.spec.ts : la carte d'une saison partagée en image, ou enregistrée ;
                      # install.spec.ts : le manifeste, le service worker, le bouton d'installation et les lancements ;
                      # seo.spec.ts : les pages publiques à leurs adresses dans les deux langues (titre, description,
                      # canonical, hreflang, image de partage), robots.txt, sitemap, llms.txt, JSON-LD de l'accueil,
                      # bandeau de langue et choix retenu, lecture de chaque page sans JavaScript
.github/workflows/     # ci.yml : tests à chaque push sur main et pull request ; weekly.yml : E2E complets et suite lente, dimanche 01:30 UTC ;
                      # maintenance.yml : purge quotidienne, 04:17 UTC, puis nettoyage des événements et archivage des saisons
                      # terminées (éteint par défaut) ; challenge.yml : défi du lundi, 05:00 UTC
.github/actions/       # étapes communes des tests : prepare (Node, npm ci, Prisma), test-database (base jetable), playwright
docs/                 # design/ : cahiers des chantiers ; restauration.md : restaurer la base de production (Neon)
src/
  components/         # composants partagés : panneau, visage du joueur, initiales du club, bascule, styles de tableau
    ui/               # composants shadcn/ui (Base UI), générés par la CLI
  engine/             # simulation pure : match, progression, transferts, IA des clubs, jeunes, coupes, Europe, défi ;
                      # club-name.ts : nom affiché des clubs (CLUB_NAMES)
    data/names/       # listes de noms, importées statiquement
  db/                 # accès Prisma, toujours scopé par saveId ; *.slow.test.ts via npm run test:slow
  lib/                # utilitaires partagés (rng, dates, couleurs, formatage)
  config/             # constantes de configuration (CONTACT_EMAIL, règles du défi de la semaine)
  i18n/               # langues : négociation (locale.ts), configuration next-intl (request.ts), messages par zone
                      # (messages/<langue>/<zone>.json, index.ts), traducteur des utilitaires (translator.ts), aides
                      # de test (test-intl.tsx), pays et noms des compétitions (countries.ts)
  og/                 # images générées (ImageResponse) : polices, visage en SVG data URI
  assets/fonts/       # Barlow Condensed ExtraBold Italic et sa licence OFL, lues par src/og/fonts.ts et app/layout.tsx
  generated/prisma/   # client Prisma généré, ignoré par git
prisma/
  schema.prisma
  migrations/         # dont les migrations de données de référence (…_second_divisions, …_national_cups), générées, jamais éditées
  seed/               # import OpenFootball, couleurs des clubs, génération du monde ; reference-sql.ts : SQL des migrations de données
    data/             # calendriers OpenFootball (premières et deuxièmes divisions), club-colors.json, club-aliases-fallback.json
scripts/              # measure-save-size.ts (npm run measure:size), measure-balance.ts (npm run measure:balance), measure-d2-balance.ts (npm run measure:divisions),
                      # measure-seasons.ts (npm run measure:seasons), measure-career-weight.ts (npm run measure:weight),
                      # measure-history.ts (npm run measure:history), measure-national-coach.ts (npm run measure:coach),
                      # measure-assistant.ts (npm run measure:assistant) et ses crochets, simplification-hooks.ts,
                      # measure-career-countries.ts (npx tsx : le poids d'une carrière et ses écritures par pays),
                      # generate-reference-migration.ts
```

## Dettes ouvertes

Le détail et les mesures sont dans la section « Dettes » de `docs/design/gameplay-v2.md` (chantiers du 06/11 et du 09/11).

- Le décompte de l'onglet clubs du marché avancé lit les entrées d'index des joueurs des clubs (`PlayerSave(saveId,
  clubSaveId, retired)` : 4 107 en saison 3, 0,9 ms) ; un compte exact les lit toutes. Laissée : le garder ailleurs
  demanderait de le tenir à jour à chaque transfert et à chaque retraite.
- La table `Club` (198 lignes, 6 pages) est lue en entier à chaque chargement de relation qui la touche (0,1 ms, en
  mémoire). Laissée : l'enlever demanderait un cache et la réécriture des 41 lectures de la relation.
- Un club peu réputé lit davantage pour ses propositions (Caen : environ 1 500 lignes de `PlayerSave`, 840 pour Lyon).

## Ordre de construction

1. Seed OpenFootball (clubs, compétitions, calendriers) → voir la skill `donnees-openfootball`
2. Génération des attributs joueurs (déterministe, à partir de la graine)
3. Création de partie
4. Moteur de match → voir la skill `moteur-de-match`
5. Boucle de saison (journées, classement, fin de saison)
6. Transferts et contrats
7. UI

Ne pas commencer une étape tant que la précédente n'a pas de test qui passe.
