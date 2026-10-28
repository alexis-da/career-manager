# Career Manager

Jeu de gestion de carrière football en web. Projet personnel solo, développé avec Claude Code.

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
npm run test:e2e       # tests Playwright
npm run measure:balance # équilibrage des deux divisions : six saisons d'une partie 2 (base locale seulement)
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
lecture de ce dernier) ; le classement et le palmarès d'une saison passée prennent leurs clubs dans ses `Fixture`.
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
n'existe plus pour nous.

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

**Équilibrage des deux divisions.** Mesuré par `npm run measure:balance` (six saisons d'un jumeau 2 de la démo, sur
base locale seulement) avant tout réglage, réglé dans `balance.ts` une chose à la fois, la calibration de
première division vérifiée après chaque changement (2,84 buts, 46 % à domicile, 23 % de nuls, Bayern-Monza ~83 %,
`match.test.ts`) ; celle de deuxième est épinglée dans `match-d2.slow.test.ts`. Jeunes : réputation et note lues dans
la plage de la division du club (`YOUTH_OVERALL_BY_TIER`). Un club IA au-dessus de sa masse salariale vend en
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
réglementaire » (REGULATION_END, un remplacement de plus) ; `resumeLiveMatch` reprend à la bonne phase, et sans
changement le match est celui joué sans pause. Page Coupe (`app/saves/[id]/cup`, `getCupBracket`,
`src/db/cup-view.ts`) et entrée « Coupe » de la navigation pour une partie qui a une coupe ; palmarès (« Vainqueur de la
Coupe », « Coupe : quarts de finale »), carte (« COUPE », « DOUBLÉ », `cardBadge`) et panneau « Saison terminée ».

**Défi de la semaine.** Un défi par semaine ISO en UTC (`Challenge`, `weekKey` « 2026-W45 », `src/lib/iso-week.ts`),
écrit une fois par `ensureChallenge` (`src/db/challenge.ts`) : par `POST /api/maintenance/challenge` le lundi (même
secret et mêmes réponses 404 que la purge) ou, à défaut, à la première visite de `/challenge` ; jamais modifié ni
supprimé, ouvert tant que `startsAt ≤ maintenant < endsAt` (pas de statut stocké). Sa graine est un HMAC de la semaine
sous `AUTH_SECRET` (`challengeSeed`, `src/lib/challenge-seed.ts`), **jamais affichée ni renvoyée** : le formulaire de
création accepte toute graine, la connaître permettrait de répéter le défi dans une partie normale, au tir près. Son
club est tiré par la graine parmi la deuxième division et les 12e à 18e de première (137 clubs), sans celui de la
semaine précédente (`drawChallengeClub`, `src/engine/challenge.ts`). Règles dans `src/config/challenge.ts` : horizon de
10 journées, `MAX_CHALLENGE_SAVES_PER_WEEK` = 20 (une partie de défi pèse 7,7 Mo compactée, 25,9 Mo réels à la
10e journée), parties gardées 24 h après la fin du défi. Une partie de défi
(`Save.challengeId`, `createChallengeSave`, `src/db/saves.ts`) est une partie 2 avec la graine, le club et le nom du
défi (« Défi — semaine 45 »), les mêmes pour tous ; **hors des limites de parties**, mais une par joueur et par semaine
(`ChallengeEntryExistsError`) et 20 par semaine (`ChallengeFullError`). L'entrée du joueur (`ChallengeEntry`, unique
par défi et utilisateur) naît avec la partie, dans sa transaction, et lui survit (`saveId` en SetNull) : supprimer sa
partie ne permet pas de recommencer, et le classement survit à la purge ; elle part avec son utilisateur (Cascade). Le
score (`recordChallengeScore`) s'écrit une seule fois, dans la transaction de `playNextMatchday` ou de
`resumeLiveMatch` qui termine le 10e match de championnat du club dans la première saison : points, différence, buts
marqués (`challengeScore`), `submittedAt` à l'horloge de la base en UTC (`now() AT TIME ZONE 'UTC'`, jamais
`new Date()` dans la simulation) ; plus rien ne le change ensuite. Classement : points, différence, buts, soumission la
plus ancienne, id (`rankChallengeEntries`) ; une entrée soumise après `endsAt` ne compte pas. À la connexion Google, les
entrées de l'anonyme suivent ses parties (`moveChallengeEntries`), sauf pour une semaine où le compte a déjà la sienne :
le compte la garde, celle de l'anonyme est supprimée et sa partie ne compte plus.

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
secrets GitHub `MAINTENANCE_URL` et `MAINTENANCE_SECRET` (workflow `maintenance.yml`).

**Pas de marques sous licence.** Aucune mention de FIFA, EA, ou des noms de compétitions officiels sous
licence dans le code, l'UI ou le README. Les données viennent d'OpenFootball (CC0).

## Marque et règles produit

**Nom.** Le jeu s'appelle **Late Winner**. Slogan : « The football career game ». Accroche : « Take your club
to the top ». Adresse canonique : https://www.latewinner.app. « Career Manager » reste le nom interne (dépôt,
`package.json`, projet Vercel) : seul ce que voit le joueur change. Métadonnées, slogan et accroche en anglais ;
le jeu lui-même est en français. Fichiers de marque dans `public/brand/` (logo clair, logo pour fond sombre,
icône), icônes du site dans `app/` (`favicon.ico`, `icon.svg`, `apple-icon.png`) et `public/icons/`.

**Couleurs.** Bleu vif `#1F3BFF`, bleu nuit `#0B1340`, orange `#FF9F1C`, blanc, fond clair `#EEF1F7`. Elles
habillent les pages hors partie (connexion, accueil) via la classe `.brand` (`app/globals.css`). Dans une partie,
rien ne change : le club garde son accent, seule l'icône Late Winner est en tête de la barre de navigation.

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

- Code, noms de variables et commentaires en **anglais**. Textes d'interface en **français**.
- Server Components par défaut ; `"use client"` seulement pour un composant réellement interactif.
- Mutations via Server Actions, jamais de route API pour un usage interne.
- Validation des entrées avec Zod à la frontière (Server Action, parsing de fichier importé).
- Pas de `any`. Pas de `!` non-null sans commentaire justifiant.
- Un commit = un changement cohérent, message en français à l'impératif.

## Structure

```
app/                  # routes App Router, à la racine ; UI en français
  _components/        # composants de la page d'accueil (liste et création de parties)
  admin/stats/        # statistiques de l'administrateur (404 pour tout autre)
  privacy/            # page de confidentialité, publique (hors mot de passe) ; à tenir à jour avec le code
  api/                # Auth.js et les routes de maintenance (purge, défi de la semaine), seules routes API
  saves/[id]/         # une partie : tableau de bord, effectif, composition, calendrier, classement, transferts,
                      # palmarès (seasons/, et seasons/[seasonId]/card : carte PNG de fin de saison, sans nom de club)
                      # actions.ts (Server Actions) à côté des pages qui les utilisent
e2e/                  # tests Playwright (npm run test:e2e)
.github/workflows/     # maintenance.yml : purge quotidienne, 04:17 UTC
src/
  components/ui/      # composants shadcn/ui (Base UI), générés par la CLI
  engine/             # simulation pure : match, progression, transferts, IA des clubs, jeunes, coupes, défi ;
                      # club-name.ts : nom affiché des clubs (CLUB_NAMES)
    data/names/       # listes de noms, importées statiquement
  db/                 # accès Prisma, toujours scopé par saveId ; *.slow.test.ts via npm run test:slow
  lib/                # utilitaires partagés (rng, dates, couleurs, formatage)
  config/             # constantes de configuration (CONTACT_EMAIL, règles du défi de la semaine)
  og/                 # images générées (ImageResponse) : polices, visage en SVG data URI
  assets/fonts/       # Barlow Condensed ExtraBold Italic et sa licence OFL, lues par src/og/fonts.ts
  generated/prisma/   # client Prisma généré, ignoré par git
prisma/
  schema.prisma
  migrations/         # dont les migrations de données de référence (…_second_divisions, …_national_cups), générées, jamais éditées
  seed/               # import OpenFootball, couleurs des clubs, génération du monde ; reference-sql.ts : SQL des migrations de données
    data/             # calendriers OpenFootball (premières et deuxièmes divisions), club-colors.json, club-aliases-fallback.json
scripts/              # measure-save-size.ts (npm run measure:size), measure-d2-balance.ts (npm run measure:balance),
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
