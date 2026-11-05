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
npm run measure:balance # moteur : victoires par écart de force, effet de chaque facteur, dispositifs, consignes (de départ : -- --starting-only) et fatigue, saisons d'une partie 2 (base locale seulement)
npm run measure:divisions # équilibrage des deux divisions : six saisons d'une partie 2 (base locale seulement)
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
`src/db/database-url.ts`) ; une URL Neon garde son `sslmode`. **Garde-fou : l'hôte doit être localhost pour toute
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
au repos un joueur sous 75 quand un reposé vaut au plus 5 points de moins à son poste (`selectRestedLineup`) ; le club dirigé
garde sa composition. L'état du direct garde la fitness de chaque joueur (100 pour une pause d'avant). Les écrans montrent
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
avertit qu'un titulaire suspendu sera remplacé.

**Événements à choix (gameplay v1, G4).** Pour le seul club dirigé : 1 à 3 par match (35 / 45 / 20 %), aux limites de
15', 30', 60' et 75', et à 105' une prolongation sur deux, tirés au coup d'envoi du flux `…:events` ; à chaque limite, le
type parmi ceux possibles à ce moment (`CHOICE_EVENT_WEIGHTS`) et ses joueurs du flux `…:event:15`, son issue du flux
`…:event:15:outcome` (`src/engine/choices.ts`, pur, `balance.ts` pour les valeurs ; aucun autre flux n'est décalé).
Catalogue v1 du cahier : penalty (le tireur parmi les trois meilleurs, sa chance affichée), coup franc (frapper ou
combiner), joueur averti qui s'énerve, échauffourée, joueur touché, joueur à bout (25 points de fitness perdus sur le
terrain, à partir de 75'), le club mène, le club est mené ou à égalité (une consigne jusqu'à la fin du temps
réglementaire : les trois consignes, Attaquer, Équilibré (l'option `STEADY`) et Fermer, chacune une fois, celle que le
club joue marquée « (actuelle) », `optionInstruction`, `currentInstructionOf` ; l'adjoint prend celle de sa règle). Les buts des événements sont pris sur ceux du club (`OWN_GOALS_WITH_CHOICE_EVENTS`, 0,89 sur ses buts
attendus) : décidés par l'adjoint, ils ne lui rapportent rien d'eux-mêmes. L'adjoint décide avec la même fonction pure
en simulation (`assistantChoices`, `simulateMatch`) et en direct quand le joueur saute la pause (« live-skip ») ; sinon
le joueur décide sur la carte d'événement (G5, règle « Match en direct »), la décision de l'adjoint présélectionnée. Chaque
décision est gardée dans `MatchDecision` (migration d'ajout `…_choice_events`, (fixtureId, sequence) unique), écrite
dans la transaction qui joue la suite, avant elle ; le fil du direct et la feuille de match la montrent avec son effet.

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
**Les clubs IA choisissent leur dispositif** avant chaque match (`chooseFormation`, `src/engine/formation-choice.ts`,
pure) : de tous, avec la composition de l'adjoint dans chacun (`selectRestedLineup` : blessés et suspendus écartés,
fatigués reposés), celui qui rapporte le plus de points attendus (`expectedPoints` : buts attendus du moteur, loi de
Poisson, domicile et extérieur moyennés) face à l'adversaire moyen de leur division (`averageOpponent` : un onze de son
niveau moyen, `CLUB_LEVEL_BY_TIER`, en 4-3-3 sentinelle) ; égalité au premier de `FORMATION_NAMES`. La même fonction pour
le match (`lineupOf`, `src/db/matchday.ts`), l'aperçu de l'adversaire (`getOpponentPreview`, qui montre son dispositif
et son profil, `opponent-formation`), les trois meilleurs de l'écran de composition (`rankFormations`) et les tests
(`src/db/opponent.test.ts` compare l'aperçu au match joué). Le club dirigé garde le sien. Base des buts recalibrée pour
les six cibles : `BASE_GOALS_PER_TEAM` 1,23 → 1,31.

**Composition et consigne de départ (gameplay v1, G6).** La force d'une équipe a une seule source,
`src/engine/strength.ts` (`condition`, `teamStrength`, `formationStrength`, `expectedGoals`, `expectedGoalDifference`,
`compareFormations`), que le moteur et l'écran de la composition importent : l'éditeur recalcule dans le navigateur
l'attaque et la défense du onze qui jouerait (`resolveLineup` de son état, `EditorPlayer` : attributs, forme, moral,
fitness au prochain match), à côté de celles du onze probable du prochain adversaire (`OpponentPreview.strength`), et
compare les dix-sept dispositifs avec la composition de l'adjoint dans chacun, le meilleur étant le plus grand écart de buts
attendu contre lui, les deux Équilibré. « Composition automatique » est celle de l'adjoint (`automaticState`,
`selectRestedLineup` : sans blessé ni suspendu, un fatigué sous 75 reposé quand un reposé vaut au plus 5 points de moins
à son poste) ; sans composition enregistrée, le match joue toujours `selectLineup`. Consigne de départ (Attaquer,
Équilibré, Fermer) : choisie dans la composition, enregistrée avec elle dans `ClubSave.lineup` (`instruction`,
facultative, Équilibré sans elle, aucune migration), jouée par le club dirigé au coup d'envoi, simulé comme en direct
(`Lineup.instruction`, `TeamLive.startingInstruction`, absente pour Équilibré : l'état et le match d'avant) ; la règle de
l'adjoint y revient. Chaque équipe garde la consigne de chacun de ses segments et qui
l'a donnée (`TeamLive.instructions`, `InstructionSpan`, `src/engine/instructions.ts` : départ, adjoint, manager,
événement ; `MatchModifiers.givenBy` ; `instructionSourceAt`), lue par le direct. Effet mesuré par `npm run
measure:balance -- --starting-only` : petit, Fermer rapportant à l'outsider, Attaquer au seul net favori.

**Équilibrage des deux divisions.** Mesuré par `npm run measure:divisions` (six saisons d'un jumeau 2 de la démo, sur
base locale seulement) avant tout réglage, réglé dans `balance.ts` une chose à la fois, la calibration de
première division vérifiée après chaque changement (`match.test.ts`, chaque club dans le dispositif qu'il choisit :
2,5 à 2,8 buts, 42 à 46 % à domicile, 23 à 27 % de nuls, Bayern bat Monza plus de 75 fois sur 100) ; celle de deuxième
est épinglée dans `match-d2.slow.test.ts`, les deux sur une saison avec forme dans `match-season.test.ts`. Jeunes :
réputation et note lues dans la plage de la division du club (`YOUTH_OVERALL_BY_TIER`). Un club IA au-dessus de sa masse salariale vend en
présaison ses joueurs les mieux payés à d'autres clubs IA, jamais sous 80 % de leur valeur (`planWageSales`).

**Montées et descentes (parties 2 seulement).** À chaque `advanceToNextSeason`, dans sa transaction : les classements
finaux (même ordre que le classement affiché), puis `applyPromotionRelegation` (`src/engine/promotion.ts`, pure) avec
`PROMOTION_RELEGATION` (`balance.ts`, par pays : 3 en Angleterre, Espagne, Italie ; 2 en Allemagne, France ; échanges
directs, sans barrages, tailles constantes). Le résultat du club dirigé note `SeasonResult.promoted` / `relegated`
(false pour une ligne reconstruite) ; avant la présaison, chaque club qui bouge change de `ClubSave.competitionId` et de
finances (`financesAfterMove`, `economy.ts` : au moins le bas de la première division pour un promu, au plus le haut de
la deuxième pour un relégué, rien d'autre ; joueurs et contrats intacts) ; `Season.movements` (Json validé par Zod,
`src/db/promotion.ts`) garde sur chaque saison terminée les clubs qui quittent sa compétition. Une partie 1 n'a qu'une
division par pays : aucun mouvement, `movements` reste null (test lent de non-régression).

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
simulation) ; `SeasonResult` reste une ligne de championnat, avec `cupRound` et le trophée `cup`.

**Écrans de la coupe.** Un match de coupe se nomme « Coupe — Tour préliminaire / 16es / 8es / Quarts / Demi-finale /
Finale », jamais « Journée N » (`stageLabel`, `app/saves/[id]/_lib/stage.ts`) ; son score porte « a.p. » et
« 5-3 t.a.b. » (`ScoreNotes`), son résultat pour le club vient de la séance. Le direct du club du joueur s'arrête deux
fois sur un match de coupe nul après 90 minutes : mi-temps (`Fixture.status` HALF_TIME), puis « Fin du temps
réglementaire » (REGULATION_END, un remplacement de plus) ; `advanceLiveMatch` reprend à la bonne pause, et sans
changement le match est celui joué sans pause. Page Coupe (`app/saves/[id]/cup`, `getCupBracket`,
`src/db/cup-view.ts`) et onglet « Coupe » sous Match pour une partie qui a une coupe ; palmarès (« Vainqueur de la
Coupe », « Coupe : quarts de finale »), carte (« COUPE », « DOUBLÉ », `cardBadge`) et panneau « Saison terminée ».

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
(`Save.challengeId`, `createChallengeSave`, `src/db/saves.ts`) est une partie 2 avec la graine et le club du défi, les
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

**Écrans du défi.** `/challenge` (`app/challenge`, `getChallengePage`, `src/db/challenge-view.ts`), ouverte à tous et
derrière le mot de passe en mode fermé, le même écran que l'onglet Défi d'une partie (`ChallengeScreen`) : le club de la semaine (`displayClubName`, dans `src/db`), **jamais dans le titre
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

**Navigation d'une partie.** Cinq entrées, dans `SECTIONS` (`app/saves/[id]/_lib/sections.ts`, pur et testé) : Accueil ·
Équipe · Match · Marché · Club (en anglais Home · Squad · Match · Market · Club), testids `nav-dashboard`, `nav-team`,
`nav-match`, `nav-transfers`, `nav-club`. Équipe a Effectif et Composition, Match a Calendrier, Classement et Coupe
(seulement avec une coupe), Club a Club, Défi et Palmarès ; le direct est sous Match, sans onglet ; l'entrée Match mène au Calendrier sous 1024 px, au
Classement à partir de là, où il a le calendrier et la coupe à côté ; l'entrée Équipe à l'Effectif sous 1024 px, à la
Composition à partir de là, où elle a l'effectif et la fiche à côté (`computerHome`, choisi par `SaveNav` après
l'hydratation) ; l'entrée Club mène à `/club` à toutes les largeurs. Ces sous-onglets sont une bascule
en tête de contenu (`SectionTabs`, `SegmentedLinks`,
`src/components/segmented.tsx`), testids `nav-squad`, `nav-lineup`, `nav-fixtures`, `nav-standings`, `nav-cup`,
`nav-club-overview` (`tabTestId` : l'onglet Club, l'entrée gardant `nav-club`), `nav-challenge`, `nav-seasons`, présents
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
visuellement sous 1024 px) : budget, salaires et mercato en pastilles (`DashboardPills`), bandeau du compte, puis une
grille d'une colonne sous `lg`, deux à partir de `lg`, trois à partir de `xl`. Le héros bleu (`NextMatchHero`,
`dashboard-next-match`) : la date, le lieu et la compétition du prochain match, les deux clubs (rang et points ; note
moyenne et forme à partir de 1024 px), « Jouer le match » (`GameActions` avec `hero`, seule action orange pleine de
l'écran, même `next-match`, « Jouer la journée » dans une partie 1), « Préparer » vers la composition et « Simuler »,
secondaires, le onze et « Voir l'adversaire ». Match en suspens : « Match en cours — reprendre » seul ; saison finie :
« Passer à la saison suivante » seul, et la carte de la colonne, vide, disparaît (`lg:empty:hidden`). Sa colonne de droite à partir de `xl`, en fin de page sur téléphone : le
mini-classement (`DashboardTable`, `tableAround`, six lignes autour du club, rang, club et points). Puis quatre tuiles
(`DashboardTiles` : classement et mouvement, points et différence, forme, effectif ; « — » avant le premier match), « À
faire » (`DashboardTodo`, du plus pressant au reste : titulaires blessés, titulaires suspendus, autres blessés, joueurs à
4 jaunes, meilleure offre reçue, point faible, contrats, gardiens, effectif ; toute la ligne est un lien, sauf « Effectif
complet »), le dernier match
(`LastMatchCard`, ou les premières actions avant lui) et la carte du défi. Aucune offre hors mercato (`getMarketSales` non
lu), le point faible n'est jamais une alerte. Les titulaires n'y sont plus : Composition les a. `e2e/dashboard.spec.ts`
couvre l'écran à 390 et 1280 px.

**Premiers pas.** Création d'une partie : « Choisis ton défi », trois cartes de club (`SuggestionCard`, `suggestClubs`,
`src/engine/club-suggestions.ts`, pure, sans hasard : le 1er de D1, le début de la moitié basse de D1, la fin de la moitié
haute de D2, dans le pays de la langue du joueur, `app/page.tsx` ; réputation et budget de `clubFinances`, la note d'un club
n'existant pas avant la partie, ses joueurs naissant de la graine), celle du milieu, « Équilibré · conseillé », cochée à
l'ouverture et suivant la langue tant que le joueur n'a rien choisi ; la dernière se nomme « Remontée », « Défi » étant le défi
de la semaine. Dessous, la recherche (`ClubSearch`, `searchClubs`, `app/_lib/club-search.ts`, pure : deux lettres, sans accents
ni casse, six résultats, Entrée choisit le premier et n'envoie jamais le formulaire) et la liste complète, par pays puis
division (`club`, qui montre toujours le club choisi). Le nom de la partie vient du club tant que le joueur n'en tape pas un ;
lui et la graine sont repliés sous « Options », ouvertes seules par leur erreur ; un formulaire refusé garde tout (`onReset`, React
le viderait sinon après son action). Tableau de bord : tant que le club
n'a pas joué, aucun rang (« — ») et « Tes trois premières actions » (`FirstActions`,
`app/saves/[id]/_components/first-steps.tsx`) dans la carte du dernier match (`LastMatchCard`). Effectif et Composition se
cochent à l'ouverture de leur page (`MarkSeen`) : on ne peut pas enregistrer une composition sans la changer. Le match se
lit dans le jeu (`managedMatchesPlayed`, `src/db/first-steps.ts`) : les matchs du club, jamais `hasPlayedMatch`, déjà vrai
à la mi-temps avec ceux des autres clubs. Bulles (`showsTip`, `app/saves/[id]/_lib/first-steps.ts`, `FirstStepTip`) : note
sur l'effectif, poste secondaire sur la composition, argent sur le tableau de bord avant le premier match, simulation
après lui ; une par écran, dans le flux de la page (elles ne recouvrent aucun bouton), fermables, et finies d'elles-mêmes
au 5e match du club ; rien n'est bloquant et tout s'applique aussi à une partie de défi. Ce qui est vu n'est pas en base :
un cookie de confort par élément (`lw_seen_squad`…, 30 jours, `Path=/saves/<id>`, écrit dans le navigateur par
`rememberSeen`), donc propre à chaque partie, sans lecture avant écriture : une page atteinte par navigation interne ne
voit pas dans `document.cookie` un cookie de son propre chemin. Après chaque écriture, `router.refresh()` vide le cache
du routeur, pour le retour du navigateur. Mesure : section « Premiers pas » de `/admin/stats` (`firstStepsByCohort`,
`src/db/stats.ts`), 14 jours complets par jour de création, hors défi, sur les seules tables du jeu ; à comparer avant et
après un changement sur moins de 30 jours, la purge retirant les parties anonymes abandonnées.

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
réglementaire d'une coupe nulle, à un événement à choix et là où il l'a demandé : `live-coaching-request` (« Coaching à
la 30e », l'orange de l'écran pendant que l'horloge court) l'arrête à la prochaine limite non jouée, 15', 30', 60', 75' ou
105' ; « Coaching à la mi-temps », inactif, avant la 45e, où le match s'arrête de lui-même, et inactif dans le dernier
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
lui-même** (retours du 05/11). Carte de pause (`BreakCard`, `break-card`, `data-break`) : à la mi-temps et à la fin du
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
zone `decisions` : « Penalty de Diallo : but », « Tu as protesté : Mendy averti »), comme la feuille de match. Panneau
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
rapides à la place de l'en-tête ; au-dessus, le tableau, ses colonnes suivant sa place (`@container` : sans Pot. ni Salaire
sous 928 px, sans Valeur, Contrat ni Condition sous 672 px, à côté de la fiche ; la Condition, triable, a un cœur pour
en-tête). États : blessé, suspendu, à 4 jaunes (règle « Suspensions »). Composition (`/lineup`, `LineupEditor`, `LineupSquad`) :
sous 1024 px, terrain, résumé, banc, le panneau du dispositif et la consigne de départ, puis la liste ; à partir de 1024 px,
ce panneau sous le choix du dispositif, puis de 1024 à 1279 px l'effectif compact à gauche du terrain et la fiche en
surimpression, à partir de 1280 px l'effectif, le terrain et la fiche sur une page, `pinned`, jamais vide : le titulaire
du poste sélectionné, sinon le dernier joueur choisi, sinon le mieux noté (`pinnedSheetKey`). Chaque joueur placé a sa
note au poste et l'écart à sa note (« 71 → 65 », `RatingGap`, la flèche en SVG) dès qu'il y en a un, et un libellé
(`FitLabel`, `positions.fit` : À son poste, Poste secondaire, Dépanne en ambre, Hors poste en rouge) : sur le terrain,
l'écart sous le nom, le libellé dans le détail et le nom lu, 88 px n'en laissant pas la place ; dans la liste à partir de
`lg`, sur la ligne de chaque titulaire ; le résumé compte les quatre. Toucher un poste le sélectionne et ouvre ses
candidats (`slotCandidates`, `app/saves/[id]/lineup/_lib/candidates.ts` : tout l'effectif sauf le joueur du poste, triés
par note à ce poste, les blessés et suspendus après ; note au poste, libellé, condition, forme en flèche, `FormArrow`,
états, place actuelle ; `lineup-candidate`) : sous 1024 px dans une feuille sur la page (`lineup-candidates-sheet`), au-dessus
à la place de la liste de l'effectif (`PanelCandidates`, que « Tout l'effectif » ou Échap rendent) ; un toucher y place le
joueur ou échange deux titulaires (`placeInSlot`), et le glisser-déposer reste ; `lineup-open-sheet` et
`lineup-send-to-bench` avec le joueur du poste ; sans poste sélectionné, une ligne ouvre la fiche. Choix du dispositif
(`FormationPicker`, `formation-picker`) : un bouton qui dit son libellé (`lineup-formation`, `data-formation`) ouvre une
feuille depuis le pied de l'écran sous 1024 px, à droite au-dessus : les trois meilleurs pour l'effectif
(`formation-best`, classés par `rankFormations` comme un club IA, points attendus face à l'adversaire moyen de la
division, `LineupEditor.tier`), puis les dix-sept par famille, 4, 3 et 5 défenseurs (`formation-choice`), chacun avec
son libellé, son profil et ses points attendus, l'actuel marqué ; choisir garde les joueurs à leur place quand ils y
tiennent (`switchFormation`) et ferme la feuille. Panneau du dispositif
(`FormationPanel`, zone de messages `lineup-plan`) : le profil en mots et en barres (`formationProfile`), l'attaque et la
défense du onze à côté de celles de l'adversaire (règle « Composition et consigne de départ ») et, déplié, le comparatif
des dix-sept dispositifs, écart au centième, le meilleur signalé, « Choisir » l'appliquant avec le onze de l'adjoint ; la
consigne de départ (`StartingInstruction`) : une bascule, ce qu'elle fait au match, le principe en une phrase et la règle
de l'adjoint ; dans l'état de l'éditeur, enregistrée avec lui. Fiche (`PlayerSheet`, partagée avec le marché avancé, `?player=`) : tête sur le bleu vif, initiales
(`playerInitials`, le visage reste partout ailleurs), note et poste en grand, saison, barres, contrat, transferts ; Prolonger
orange, secondaire dans la Composition, dont l'orange est « Enregistrer » (`primary`) ; une vente impossible se lit dans le
pied, `sell-player` désactivé (`player-sale-refusal`). Sur toute l'entrée, l'action de jeu de la colonne est secondaire
(`OWN_ORANGE_ACTION`). `e2e/team.spec.ts` couvre ces écrans à 1280, 1100, 768, 390 et 360 px.

**Marché.** Deux écrans sous l'entrée Marché. `/transfers` : budget (et marge salariale à partir de 1024 px), bascule
Acheter / Vendre · N offres (`?tab=sell`). Acheter : quatre entrées (Mes besoins, Pépites, Bonnes affaires, Stars),
`proposeSignings` (`src/engine/market-proposals.ts`, pur, sans hasard) et `getMarketProposals`
(`src/db/market-proposals.ts`). Le point faible est le titulaire à la note la plus basse à son poste. Une proposition
n'est que d'un joueur qui accepterait (`quoteFor` donne `minimumReputation`, comparée à `MarketOverview.reputation`) et
que le club peut payer (prix sous le budget, salaire sous la marge) : 10 par entrée, une à la fois, « Passer » sans
mémoire ; à partir de `xl`, les trois suivantes (« Repérés pour toi ») et la meilleure offre (`SaleOfferCard`).
« Recruter » ouvre une confirmation (prix, salaire, durée, budget restant) et passe par `makeTransferOfferAction` ou
`signFreeAgentAction` au prix et au salaire minimaux, `DEFAULT_CONTRACT_LENGTH` saisons, `evaluateOffer` inchangé, puis
« Signé ! ». Vendre : il n'y a pas d'offres reçues ni de bouton Refuser, rien à enregistrer : `getMarketSales`
(`src/db/market-sales.ts`) liste les joueurs hors du onze, un titulaire blessé restant du onze, avec la meilleure offre
IA de `quoteSquad` ; le compteur compte ces offres. Écran avancé (`/transfers/advanced`, liens « Marché complet » et
« Détails du contrat · ajuster l'offre ») : filtres, joueurs libres, mouvements, fiche et dialogues de toujours ; un
joueur qui refuserait le club pour sa réputation le dit dans la fiche et le dialogue, l'envoi désactivé. Un joueur arrivé
au club dirigé pendant le mercato ouvert (ligne `Transfer` vers le club, `TRANSFER` ou `FREE`) ne se vend pas avant le
suivant (`bought_this_window`, `transferWindowOpenDate`, `src/engine/world.ts`) : seule règle économique ajoutée par la
refonte, elle borne la fréquence d'une revente, pas sa marge. Sur les écrans du Marché, l'action de jeu de la colonne est
secondaire (`GameActions`) : l'orange plein y reste à « Recruter » ou « Vendre ».

**Club.** Trois onglets, Club, Défi et Palmarès ; l'action de jeu de la colonne y est secondaire (`OWN_ORANGE_ACTION`). Club
(`/club`) : pastille du manager (`club-manager`, saisons terminées + 1) ; finances en lecture seule (`getClubFinances`,
`src/db/club.ts` : budget en grand, masse salariale en barre, marge ou dépassement ; ni recettes ni objectifs du président,
le jeu n'en a pas) ; défi sur le bleu vif (où en est le joueur, tête du classement à partir de `lg`, « Voir le défi », seul
orange plein de l'écran) ; les trois dernières saisons, et, à partir de `lg`, l'aperçu de la dernière carte et ses boutons
(`HonoursCardActions` ne les monte pas en dessous : un téléphone ne télécharge pas le PNG) ; Réglages (`ClubSettings` :
langue, compte, parties utilisées sur la limite, changer de partie, confidentialité). Défi (`/saves/[id]/challenge`) : l'écran
de la page publique (`ChallengeScreen`, `app/challenge/_components`), quelle que soit la partie ouverte. Tête sur le bleu vif
(semaine et fin, `formatParisWeekdayTime`), carte « Ta partie » (`ownChallenge`, pur : journées, score une fois soumis et
reprise, « Jouer le défi », ou pourquoi pas ; aucun score provisoire, le jeu ne l'écrit qu'à la 10e journée, jamais de
« Relancer »), classements (`RankingTable`, partagée : ta ligne en bleu, l'anonyme toujours grisé). Palmarès (`/seasons`) : des
cartes sous 1024 px, toute la carte menant à la saison, le tableau au-dessus. Bilan (`/seasons/[seasonId]`) : la carte PNG,
inchangée, `SeasonCardActions` (« Partager » en orange où le navigateur partage des fichiers, sinon « Télécharger »), montées et
descentes, et, pour la dernière saison terminée (`isLastCompletedSeason`), « Cap sur la saison 2027-28 » vers le tableau de
bord : `advanceSeasonAction` mène ici une fois la saison suivante commencée. `e2e/club.spec.ts` couvre ces écrans à 1280,
390 et 360 px.

**Pages hors partie.** Accueil, `/challenge`, `/login`, `/privacy`, `/admin/stats` et 404 passent par `PublicPage`
(`app/_components/public-page.tsx`) : la marque du jeu (`public-home`) et la langue sur une ligne, le contenu, le pied
(`BrandFooter`, ce que la page y ajoute et `privacy-link`) ; `tools`, ce qu'une page offre à côté de la marque à partir de 1024 px,
passent sous son contenu en dessous, un seul DOM. Accueil : sans utilisateur, le choix du club (règle « Premiers pas »), sur deux
colonnes à partir de `lg` (titre, phrase, manager et bouton à gauche, clubs à droite ; `HOME_COLUMNS`), le lien du défi et Google
dans `tools`. Un joueur revenu : « Tes carrières », ses parties en cartes (`SaveCard`, `[data-save-name]`, initiales du club,
« Reprendre » `open-save`), puis le même formulaire avec son titre en h2, ou `SaveLimitNotice` à la limite, dont le bouton Google
est alors le seul de l'écran. Une seule action orange pleine : `create-save`, sinon « Reprendre » de la partie la plus récente.
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
`REGISTERED`. Par lots : 25 utilisateurs au plus par appel, les plus anciens d'abord (`maxDuration = 60`), et la
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
dans le `where` est un bug : elle mélangerait deux parties. Les listes de parties passent par `visibleSavesWhere`
(les parties du joueur, rien sans utilisateur). **Seule exception, limitée aux entrées du défi** : le classement d'un
défi lit les `ChallengeEntry` de toutes ses parties, par `challengeId` (score, utilisateur, jamais le contenu d'une
partie), et la fusion à la connexion Google déplace les entrées d'un utilisateur à l'autre, comme ses parties.

**Identité.** Le joueur est reconnu par sa session Google (Auth.js, `src/auth/auth.ts` : JWT sans adaptateur ni
table, qui porte notre `User.id`), sinon par le cookie anonyme `lw_uid` (id d'utilisateur signé HMAC-SHA256 avec
`AUTH_SECRET`, obligatoire). `getCurrentUser()` lit sans rien créer ; `requireCurrentUser()` crée un utilisateur
anonyme et pose le cookie, seulement depuis la création de partie. La connexion Google efface `lw_uid`.
L'administrateur n'a pas de colonne : `isAdmin(user)` compare son e-mail à `ADMIN_EMAIL`, sans casse.
`lastSeenAt` est réécrit à la première requête de chaque jour UTC, avec une ligne `UserDay(userId, day)`
(`recordUserDay`, `src/db/user-days.ts`, `INSERT … ON CONFLICT DO NOTHING`) : c'est la seule source de la
rétention.

**Accès ouvert.** Le jeu est ouvert à tous : `APP_PASSWORD` est facultative et active un mode « fermé » (tout passe
par `/login`, `proxy.ts`) ; absente, aucune redirection. Un visiteur sans cookie ni session voit l'accueil avec le
formulaire de création, Google en second. Limites de parties dans `src/lib/limits.ts` (constantes, pas de variable
d'environnement) : `MAX_SAVES_ANONYMOUS = 1`, `MAX_SAVES_REGISTERED = 3`, appliquées par `createSave`
(`SaveLimitError`) et par l'accueil, qui remplace alors le formulaire par un message ; à la création seulement ; les
parties de défi n'y comptent pas (`countOwnedSaves`, `challengeId` NULL). Un
anonyme dont la partie a un match joué voit sur le tableau de bord un bandeau l'invitant à se connecter, masqué sept
jours par le cookie `lw_banner_closed`. `/admin/stats` (`src/db/stats.ts`) est réservée à `isAdmin(user)` et
répond 404 à tout autre, déconnecté compris. Variables propres : `MAINTENANCE_SECRET` (routes de purge et du défi) ;
secrets GitHub `MAINTENANCE_URL` et `MAINTENANCE_SECRET` (workflow `maintenance.yml`), `CHALLENGE_URL` et le même
`MAINTENANCE_SECRET` (workflow `challenge.yml`, le lundi à 05:00 UTC).

**Langues : français et anglais.** Tout ce que voit un joueur existe dans les deux langues : pages publiques, écrans
d'une partie, carte PNG, `/admin/stats`, page de confidentialité. next-intl 4, sans la langue dans l'adresse. La langue
du joueur est celle qu'il a choisie (cookie de confort `lw_lang`, `fr` ou `en`, un an, posé seulement par le sélecteur
« FR · EN », `setLanguageAction`, `app/actions.ts` : en haut des pages publiques ; dans une partie, les Réglages de `/club`,
à toutes les largeurs, en bascule « Français / English »), sinon le français si `Accept-Language` le préfère
à l'anglais, l'anglais sinon (`negotiateLocale`, `src/i18n/locale.ts`, lue à chaque requête par `src/i18n/request.ts`) ;
`<html lang>` la suit.
- **Messages** : `src/i18n/messages/<langue>/<zone>.json`, un fichier par zone et par langue, chacun ses espaces de
  noms, assemblés par `src/i18n/messages/index.ts` (`ZONES`, puis les deux objets) : `public` (connexion, défi, 404,
  sélecteur), `home` (accueil, création, compte, limites), `world` (compétitions, pays, nationalités), `catalogs` (postes, tours,
  a.p./t.a.b., événements, lettres de résultat), `header` (en-tête, navigation, actions de jeu, simulation), `dashboard`,
  `dashboard-hero` (héros de l'Accueil), `dashboard-todo` (« À faire »), `onboarding` (premières actions, bulles),
  `challenge-banner` (carte du défi), `squad` (effectif), `player-sheet` (fiche joueur, contrats), `lineup`,
  `market` (Acheter, confirmation), `market-sell` (Vendre), `transfers` (marché avancé), `fixtures` (calendrier,
  feuille de match), `standings` (classement), `seasons` (palmarès, bilan, carte), `cup` (coupe), `club` (écran Club,
  réglages), `challenge-screen` (onglet Défi), `live` (direct), `half-time` (panneau Coaching), `actions` (messages
  des Server Actions, refus), `admin`. Typés (`src/i18n/next-intl.d.ts` : une clé inconnue échoue au typage) ;
  `src/i18n/messages.test.ts` exige les mêmes clés et les mêmes arguments ICU dans les deux langues, que tout message
  se formate et qu'un espace de noms n'appartienne qu'à un fichier. Seule exception : la page de confidentialité, un
  document, a ses deux versions en JSX (`app/privacy/_components/privacy-document.tsx`, une date commune).
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
`package.json`, projet Vercel) : seul ce que voit le joueur change. Métadonnées, slogan et accroche en anglais ;
le jeu lui-même est en français et en anglais (règle « Langues »). Fichiers de marque dans `public/brand/` (logo clair, logo pour fond sombre,
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
colonne n'en ayant aucune, sur le direct, celle de ses commandes ou du panneau, sur Équipe, « Enregistrer » ou
« Prolonger », sous Club, « Voir le défi », la reprise ou « Jouer le défi », « Partager » ou « Télécharger », hors partie, « Lancer ma carrière ». Couleurs de résultat, d'alerte et de poste fixes, quel que soit le club (`--win`, `--draw`,
`--loss`, `--warning`, `--info`, `--position-*`). Titres et chiffres en Barlow Condensed 800 italique (le fichier de
`src/assets/fonts`, chargé par `next/font/local`, une seule graisse), en majuscules par la règle `.font-heading` de
`globals.css` (`normal-case` là où des unités et des ordinaux doivent garder leur casse : « 16e », « €11.4m ») ; texte
courant en Barlow 400 à 700 ; rayons 14 px, cartes 22 px (`rounded-card`), pastilles `rounded-full`.

**Communication sortante.** Titres de page, descriptions, images de partage (`app/opengraph-image.tsx`) et
cartes partageables ne contiennent aucun nom de club, ni « FIFA », ni « EA FC », ni le nom d'un jeu concurrent.

**Noms de clubs.** Le nom affiché d'un club passe toujours par `displayClubName` (ou `displayClubShortName`),
point unique de résolution dans `src/engine/club-name.ts`. Il s'appelle dans `src/db`, là où les lignes Prisma
deviennent des vues, jamais dans un composant client : `CLUB_NAMES` est une variable serveur. Aucun composant ne
lit `Club.name` pour l'afficher. `CLUB_NAMES` (lu une fois au démarrage) : `real` par défaut, `fictional` pour
les noms neutres de `prisma/seed/data/club-aliases-fallback.json` (clé = slug ; ville ou région + mot neutre,
jamais le mot distinctif du vrai club). Un club ajouté au seed doit y avoir son entrée : un test le vérifie.
Jamais de logo ni d'écusson de club.

**Hébergement.** Aucun service propre à Vercel (Blob, KV, Cron, Analytics) : le jeu doit rester déplaçable
chez un autre hébergeur.

**Budget base de données.** Le plan gratuit Neon donne, par mois, 100 CU-h de calcul, 1 Go de stockage et
5 Go de transfert, désormais pour la **production seule** : les tests l'avaient épuisé le 24 octobre 2026 (production
hors ligne jusqu'au 1er novembre), d'où le Postgres local. Les tests lourds (`npm run test:slow`, saisons complètes,
E2E) ne coûtent plus rien à Neon : les lancer quand le changement le justifie.

## Conventions

- Code, noms de variables et commentaires en **anglais**. Textes d'interface en **français** et en **anglais**, dans
  les messages (`src/i18n/messages`), jamais en dur dans une page traduite.
- Server Components par défaut ; `"use client"` seulement pour un composant réellement interactif.
- Mutations via Server Actions, jamais de route API pour un usage interne.
- Validation des entrées avec Zod à la frontière (Server Action, parsing de fichier importé).
- Une requête à la fois sur une connexion : pas de `Promise.all` sur un client de transaction (`tx`) ni sur un client
  pg à soi. Les requêtes que Prisma lance lui-même ensemble dans une transaction (chargement des relations, `createMany`
  découpé) sont chaînées par `SequentialPrismaPg` (`src/db/pg-adapter.ts`), l'adaptateur de tous les clients Prisma ;
  en test, `src/db/test-pg-guard.ts` fait échouer toute requête envoyée sur une connexion occupée (pg 9 la refusera).
- Pas de `any`. Pas de `!` non-null sans commentaire justifiant.
- Un commit = un changement cohérent, message en français à l'impératif.

## Structure

```
app/                  # routes App Router, à la racine ; UI en français et en anglais (src/i18n)
  _components/        # cadre des pages hors partie (public-page), composants de l'accueil (parties, choix du club)
  admin/stats/        # statistiques de l'administrateur (404 pour tout autre)
  privacy/            # page de confidentialité, publique (hors mot de passe), en français et en anglais ; à tenir à jour
                      # avec le code (_components/privacy-document.tsx : les deux versions, une date de mise à jour)
  api/                # Auth.js et les routes de maintenance (purge, défi de la semaine), seules routes API
  saves/[id]/         # une partie : tableau de bord, effectif, composition, calendrier, classement, transferts,
                      # club (club/ : finances, réglages), défi (challenge/), palmarès (seasons/, et
                      # seasons/[seasonId]/card : carte PNG de fin de saison, sans nom de club)
                      # actions.ts (Server Actions) à côté des pages qui les utilisent
e2e/                  # tests Playwright (npm run test:e2e) ; english.spec.ts : le parcours en anglais ;
                      # dashboard.spec.ts : l'Accueil ; match.spec.ts : classement, calendrier et coupe ;
                      # live.spec.ts : le direct et le panneau Coaching ; live-choices.spec.ts : un direct avec une
                      # décision du joueur, un changement et un arrêt demandé ; team.spec.ts : Effectif, Composition et fiche ;
                      # lineup-candidates.spec.ts : le changement en un toucher sur téléphone ; starting-instruction.spec.ts :
                      # le panneau du dispositif et la consigne de départ, de la composition au direct ;
                      # club.spec.ts : Club, son défi, ses réglages, le palmarès et le bilan d'une saison ;
                      # mobile.spec.ts : le parcours sur téléphone (390 × 844), jamais plus large que l'écran ;
                      # navigation.spec.ts : les cinq entrées et leurs onglets, à 390 et 1280 px ;
                      # home.spec.ts : l'accueil, le choix du club et les pages hors partie ;
                      # onboarding.spec.ts : le parcours d'un nouveau joueur, sur ordinateur et sur téléphone
.github/workflows/     # maintenance.yml : purge quotidienne, 04:17 UTC ; challenge.yml : défi du lundi, 05:00 UTC
src/
  components/         # composants partagés : panneau, visage du joueur, initiales du club, bascule, styles de tableau
    ui/               # composants shadcn/ui (Base UI), générés par la CLI
  engine/             # simulation pure : match, progression, transferts, IA des clubs, jeunes, coupes, défi ;
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
                      # generate-reference-migration.ts
```

## Ordre de construction

1. Seed OpenFootball (clubs, compétitions, calendriers) → voir la skill `donnees-openfootball`
2. Génération des attributs joueurs (déterministe, à partir de la graine)
3. Création de partie
4. Moteur de match → voir la skill `moteur-de-match`
5. Boucle de saison (journées, classement, fin de saison)
6. Transferts et contrats
7. UI

Ne pas commencer une étape tant que la précédente n'a pas de test qui passe.
