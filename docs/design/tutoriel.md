# Tutoriel de la première carrière : l'adjoint montre, le joueur fait

Cahier rédigé le 19/11/2026, **validé le 19/11** avec les dix propositions du § 8. Il remplace, pour la première carrière d'un joueur,
« Tes trois premières actions » et les bulles des premiers pas (chantier « première session », 12/11 ; règle
« Premiers pas » de `CLAUDE.md`). Les faits viennent du code au 19/11 (`eeacc98`) : écrans, identifiants, textes et
dates de la saison 2026-27 d'une carrière neuve.

## Décisions d'Alexis (19/11)

- **Guidé par l'adjoint, étape par étape** : une bulle de l'adjoint, l'élément concerné mis en avant, et c'est le joueur
  qui fait le geste lui-même. Aucune démonstration automatique.
- **Étalé sur la première semaine de jeu** : le premier jour va jusqu'à la fin du premier match. Les étapes suivantes
  arrivent au fil des sessions, au bon moment : premier mercato, premiers objectifs, première mission, première trêve,
  premier match européen…

## Contraintes (19/11)

- **Périmètre** : la première carrière d'un joueur seulement, pas chaque nouvelle carrière. Jamais dans une partie de défi.
- **Jamais bloquant** : « Passer le tutoriel » à tout moment, reprise depuis Club → Réglages. Si le joueur fait autre
  chose que prévu, le tutoriel s'adapte au lieu de bloquer.
- **Court** : une ou deux phrases par étape, ton de l'adjoint, tutoiement. Pas plus de 3 minutes le premier jour, de la
  création au coup de sifflet final.
- **Cohérence avec l'existant** : il remplace « Tes trois premières actions ». Il s'accorde avec « Trop tôt pour juger »,
  la carte « À demain » et les missions, sans doublon ni avalanche d'alertes.
- **Accessibilité** : lisible à 390 px, en FR et en EN, focus clavier, Échap = passer l'étape, mouvement réduit respecté.
- **Coût et données** : aucun coût de simulation ; progression stockée par joueur (migration d'ajout uniquement).

---

## 0. Principes

### 0.1 Une étape

Chaque étape a une **clé** stable, jamais renommée (`TUTORIAL_STEPS`, comme `MISSION_KINDS`), et ces champs :

- un **déclencheur** : le moment où elle est due ;
- un **écran** : celui où elle se montre ;
- une **cible** : l'élément mis en avant, par son `data-testid` actuel ;
- une **réplique** de l'adjoint, en FR et en EN ;
- un **geste** : celui que fait le joueur, sur le vrai contrôle ;
- une **adaptation** : ce qui arrive s'il fait autre chose.

Une étape se clôt d'une de quatre façons :

| Issue | Quand |
|---|---|
| `DONE` | le geste attendu est fait |
| `PASSED` | Échap ou « Passer l'étape », ou bien montrée deux fois sans geste |
| `ADAPTED` | le joueur a fait le geste autrement, ou l'étape ne s'applique plus |
| `EXPIRED` | le tutoriel finit avant son moment |

Le calcul de l'étape en cours est **pur** : `currentStep(progress, context)` et `revealed(progress, context)` dans
`src/lib/tutorial.ts`. Le contexte est ce que l'écran lit déjà. Aucune requête de jeu de plus, et aucune simulation.

### 0.2 La bulle de l'adjoint

**Forme** : `TutorialBubble`, composant client, une seule à la fois.
- Sous 1024 px, une carte fixée au pied de l'écran, au-dessus de la barre de navigation (`--save-nav-height`). Sur le
  direct, elle est au-dessus des commandes (`live-controls`).
- À partir de 1024 px, elle est posée à côté de sa cible.

**Contenu** :
- l'en-tête « Ton adjoint » / « Your assistant », avec une icône lucide, jamais un emoji ;
- une ou deux phrases, 140 caractères au plus hors noms (testé) ;
- le jour 1, un repère « Premier jour · 2 sur 5 » / « First day · 2 of 5 » ;
- « Passer l'étape » (Échap) et le lien « Passer le tutoriel » ;
- « Compris » / « Got it », seulement pour une étape qui n'a pas de geste naturel.

Aucun bouton de la bulle n'est orange : l'action orange de l'écran reste la sienne (une seule par écran).

**Cible** :
- un anneau `--highlight` (#8FA0FF), sans voile sur le reste : l'écran reste utilisable ;
- elle défile une fois jusqu'au tiers haut de l'écran, pour que la bulle ne la couvre pas ;
- en mouvement réduit, ni pulsation, ni défilement animé, ni glissement de la bulle.

**Dans une feuille modale** (carte d'événement, carte de mi-temps, panneau Coaching), jamais de bulle par-dessus. La
réplique est une ligne de la carte elle-même (`TutorialLine`), dans son piège de focus. La carte garde son propre
comportement d'Échap : celle d'événement l'ignore, comme aujourd'hui.

**Clavier et lecteurs d'écran** :
- la bulle suit sa cible dans l'ordre du DOM : Tab va de l'une à l'autre ;
- la cible porte `aria-describedby` vers la réplique, et la bulle est une région `aria-live="polite"` ;
- le focus n'est jamais déplacé à l'apparition d'une bulle ;
- Échap passe l'étape quand aucune feuille modale n'est ouverte ;
- cibles d'au moins 44 px sous 640 px.

```
390 px, Accueil, étape 1
┌──────────────────────────────────────────┐
│ ┌ PROCHAIN MATCH · JOURNÉE 1 ──────────┐ │
│ │ SAM. 15 AOÛT · DOMICILE · D1         │ │
│ │   [RH]        VS        [YO]         │ │
│ │ ╔══════════════════════════════════╗ │ │  ← anneau sur « Jouer le match »
│ │ ║        ▶ JOUER LE MATCH          ║ │ │
│ │ ╚══════════════════════════════════╝ │ │
│ │ [ Préparer ]        [ Simuler ▾ ]    │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ [icône] TON ADJOINT · Premier jour 1/5│ │
│ │ Bienvenue, Coach, je suis ton        │ │
│ │ adjoint. Ton premier match, c'est    │ │
│ │ samedi contre Yonne FC : lance-le,   │ │
│ │ je reste à côté de toi.              │ │
│ │ Passer l'étape      Passer le tutoriel│ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

### 0.3 Rythme

- **Jour 1** : 5 étapes, de l'Accueil au « À demain ».
- **Ensuite** : dès le jour UTC qui suit celui de la fin du jour 1, deux étapes « poussées » au plus par jour, les plus
  pressées d'abord (§ 1.3).
- **Étapes d'écran** (`squad`, `lineup`) : elles se montrent quand le joueur ouvre leur écran, jour 1 compris, une par
  visite. Elles ne comptent pas dans les deux étapes par jour.
- **Après le « À demain » du jour 1** : aucune étape poussée ce jour-là. Si le joueur continue à jouer, seules les
  étapes d'écran peuvent se montrer, quand il ouvre leur écran.

### 0.4 S'adapter, jamais bloquer

- Une étape ne retient rien : le joueur va où il veut, la bulle ne le suit pas.
- L'étape reste due et revient à son écran, deux fois au plus.
- Un geste déjà fait par le joueur clôt l'étape sans bulle (`ADAPTED`). Exemples : une composition enregistrée avant
  l'étape `lineup`, une recrue avant l'étape `market`.
- Un moment passé attend sa prochaine occurrence, si le tutoriel vit encore (`EXPIRED` sinon). Exemples : un mercato
  fermé attend le 1er janvier, une trêve passée la suivante, un match européen le suivant.
- **Fin du tutoriel** : quand toutes les étapes sont closes, ou 14 jours après son début. La dernière étape close
  affiche alors une fois : « C'est tout pour moi. Mes conseils restent dans « À faire ». » / « That's all from me. My
  advice stays in “To do”. »

---

## 1. Le scénario

### 1.1 Jour 1 : de la création au « À demain »

**Étape 0 : création** (accueil public, `/` ou `/fr`)
- Aucune bulle : le choix du club tient déjà sur un écran, et le joueur n'a pas encore d'identité.
- `createSaveAction` crée la ligne `Tutorial` dans la transaction de la carrière, si c'est sa première (§ 3.1).
- La création redirige vers l'Accueil de la carrière (`/saves/<id>`), au 1er juillet 2026.

**Étape 1 : `welcome`, Accueil**
- **Déclencheur** : premier affichage de la carrière.
- **Mis en avant** : « Jouer le match » (`next-match`), dans le héros (`dashboard-next-match`).
- **Adjoint** :
  - FR : « Bienvenue, {manager}, je suis ton adjoint. Ton premier match, c'est {date} contre {adversaire} : lance-le, je
    reste à côté de toi. »
  - EN : « Welcome, {manager}, I'm your assistant. Your first match is on {date} against {opponent}: kick it off, I'll
    stay right by your side. »
- **Geste** : « Jouer le match ». Aucune date n'est à jouer avant le 15 août : le clic mène au coup d'envoi, puis au
  direct.
- **S'il fait autre chose** :
  - « Préparer » ou l'onglet Composition : l'étape d'écran `lineup` s'y montre ; `welcome` revient à l'Accueil.
  - Effectif : l'étape `squad` s'y montre.
  - « Simuler » : le match est simulé. `speed`, `choice` et `half-time` sont reportées au prochain direct, et la réplique
    de `full-time` va sur la carte « À demain » du résumé de simulation.
  - Échap : le héros reste, rien d'autre.

**Étape 2 : `speed`, Direct, dès les premières secondes**
- **Mis en avant** : les vitesses (`live-speed-1`, `-2`, `-4`, dans `live-controls`).
- **Adjoint** :
  - FR : « Le match se joue sous tes yeux : 45 secondes à x1. Pressé ? Passe en x2 ou x4. »
  - EN : « The match plays out before your eyes: 45 seconds at x1. In a hurry? Switch to x2 or x4. »
- **Geste** : toucher une vitesse.
- **Ce qui ne bouge pas** : le chrono ne s'arrête jamais pour la bulle.
- **S'il fait autre chose** :
  - premier arrêt atteint sans geste : `ADAPTED` ;
  - « Aller à la mi-temps » : `ADAPTED`, et `choice` est reportée au prochain direct (l'adjoint décide en chemin).

**Étape 3 : `choice`, la première carte d'événement**
- **Déclencheur** : la première carte (`choice-card`). Chaque match du club en a 1 à 3, tirées à 35, 45 et 20 %.
- **Réplique** : une ligne dans la carte, au-dessus des choix.
  - FR : « À toi de décider : mon conseil est coché, rien ne t'oblige à le suivre. »
  - EN : « Your call: my advice is ticked, but you don't have to follow it. »
- **Geste** : « Valider » (`choice-validate`).
- **S'il fait autre chose** : « Coaching » (`choice-coaching`) ouvre le panneau, et l'étape se clôt à la reprise.

**Étape 4 : `half-time`, la carte de mi-temps** (`break-card`)
- **Réplique** : une ligne au-dessus des boutons. Le mot de l'adjoint sur le match, déjà dans la carte, reste juste
  au-dessus et dit autre chose.
  - FR : « Dans « Coaching », tu fais entrer un joueur ou changes de consigne ; sinon, « Reprendre ». »
  - EN : « In “Coaching” you can bring a player on or change the instruction; otherwise, “Resume”. »
- **Geste** : « Coaching » (`break-coaching`) ou « Reprendre » (`break-resume`).
- **Si le joueur ouvre Coaching** : une seconde ligne dans le panneau.
  - Avec un changement conseillé (« Conseil de l'adjoint ») :
    - FR : « Mon conseil est déjà ouvert : « Faire ce changement », puis « Reprendre le match ». »
    - EN : « My advice is already open: “Make this substitution”, then “Resume the match”. »
  - Sans changement conseillé :
    - FR : « Choisis qui sort et qui entre, puis « Reprendre le match ». »
    - EN : « Pick who comes off and who goes on, then “Resume the match”. »

**Étape 5 : `full-time`, le coup de sifflet final**
- **Mis en avant** : la carte « À demain » (`session-end`), sous la carte du score.
- **Adjoint** :
  - FR : « Premier match joué. Reviens demain : je t'aurai préparé tes premières missions. »
  - EN : « First match done. Come back tomorrow: I'll have your first missions ready. »
- **Geste** : « Continuer » (`live-continue`), ou un lien de la carte.
- **Ce que l'étape écrit** : `Tutorial.day1At`. Le jour 1 est fini.
- **« À demain » ce jour-là** : la ligne des missions est remplacée par cette réplique (aucune mission tirée le jour 1,
  § 2), et la ligne du défi est cachée. Le prochain match, son enjeu, « Préparer ce match » et « Installer l'appli »
  restent.

**Chrono du jour 1**, mesuré sur ce que fait le jeu aujourd'hui :

| Moment | Durée |
|---|---|
| Choisir sa carte, « Lancer ma carrière », création (environ 4 s de serveur) | 15 à 30 s |
| Accueil, `welcome`, « Jouer le match », coup d'envoi | 5 à 10 s |
| Le direct, 90 minutes (`REPLAY_SECONDS` = 45) | 45 s à x1, 23 s à x2, 12 s à x4 |
| 1 à 3 cartes d'événement | 5 à 10 s chacune |
| Mi-temps : « Reprendre », ou un changement | 5 à 25 s |
| **Total jusqu'au coup de sifflet final** | **1 min 30 à 2 min 30 à x1** |

Reste une marge d'environ 30 s pour un détour par la Composition. Un nul de coupe ne peut pas arriver : le premier match
est toujours la 1re journée de championnat, le 15 août.

```
390 px, Direct, carte d'événement avec la ligne de l'adjoint
┌──────────────────────────────────────────┐
│ PÉPIN PHYSIQUE · 15e                     │
│ JOUEUR TOUCHÉ                            │
│ 15e minute, 1-1 : Magalhães a pris un    │
│ coup et boite.                           │
│ ┌──────────────────────────────────────┐ │
│ │ [icône] À toi de décider : mon       │ │  ← TutorialLine, dans la carte
│ │ conseil est coché, rien ne t'oblige  │ │
│ │ à le suivre.                         │ │
│ └──────────────────────────────────────┘ │
│ (•) Le sortir   CONSEIL DE L'ADJOINT     │
│ ( ) Le laisser jouer                     │
│ [ Coaching ]                             │
│ [ ✓ VALIDER ]                            │
└──────────────────────────────────────────┘
```

### 1.2 Ce que le joueur voit du jour 1, en résumé

1. Accueil : une bulle, un bouton.
2. Direct : la vitesse.
3. Une décision à prendre (carte d'événement).
4. La mi-temps, et le Coaching s'il le veut.
5. Le coup de sifflet final, et « Reviens demain ».

Rien d'autre ne lui est montré ce jour-là : ni missions, ni objectifs, ni argent, ni À faire avant le match (§ 2).

### 1.3 Les jours suivants

Ordre de priorité quand plusieurs étapes sont dues le même jour :
1. le jour 2 commence toujours par `missions`, promise la veille par le « À demain » ;
2. puis ce qui a une échéance : le mercato qui ferme, la trêve, le match européen, la coupe, un titulaire fatigué ;
3. puis le reste : `objectives`, `simulate`, `judged`.

Repères de dates (saison 2026-27, monde 2) :

| Moment | Dates |
|---|---|
| Championnat | 15, 22 et 29 août, puis 12 septembre (deuxièmes divisions à 46 journées : mardis 18 et 25 août, 1er septembre) |
| Mercato | ouvert du 1er juillet au 31 août, puis du 1er au 31 janvier |
| Trêves | 4-8 septembre, 9-13 octobre, 13-17 novembre, 26-30 mars |
| Europe | phase de ligue les 16 et 30 septembre, 21 octobre, 4 et 25 novembre, 16 décembre |
| Coupe | tour préliminaire le 23 septembre (les plus bas de chaque pays), 16es le 2 décembre |
| Jugement des objectifs | à partir du 5e match de championnat du club (`OBJECTIVES_JUDGED_FROM_MATCH`) |

**`missions`, Accueil** (jour 2, première visite)
- **Déclencheur** : première visite du jour 2.
- **Mis en avant** : la carte « Missions du jour » (`daily-missions`), montrée à partir de cette étape.
- **Adjoint** :
  - FR : « Chaque jour, trois missions : une facile, une moyenne, une difficile. Elles rapportent des jetons, à dépenser
    dans Club, Récompenses. »
  - EN : « Three missions a day: an easy one, a medium one and a hard one. They earn you tokens, to spend in Club,
    Rewards. »
- **Geste** : « Compris », « Changer de mission », ou « Jouer le match » (la facile se fait souvent ainsi).
- **Ce qui apparaît** : la carte, l'onglet Récompenses, la ligne des missions de « À demain », la série dans les Réglages.

**`market`, Accueil puis Marché**
- **Déclencheur** : mercato ouvert, premier match joué, jour 2 ou après.
- **Mis en avant** : l'entrée Marché (`nav-transfers`) et la pastille du mercato (`dashboard-window`).
- **Adjoint** :
  - FR : « Le mercato ferme le {date}. Pour ton point faible, {poste}, j'ai repéré des joueurs : va voir le Marché. »
  - EN : « The transfer window shuts on {date}. I've spotted players for your weak spot, {position}: have a look at the
    Market. »
- **Geste** : ouvrir le Marché.
- **Seconde bulle, sur la proposition de « Mes besoins »** :
  - FR : « Voici le meilleur joueur que tu peux t'offrir à ce poste. « Recruter » s'il te plaît, « Passer » pour le
    suivant. »
  - EN : « Here's the best player you can afford in that position. “Sign” if you like him, “Pass” for the next one. »
- **S'il fait autre chose** :
  - fenêtre fermée avant l'étape : elle attend le 1er janvier ;
  - une recrue déjà faite : `ADAPTED`.
- **Ce qui apparaît** : les pastilles d'argent, l'offre et le point faible dans « À faire ».

**`objectives`, Accueil**
- **Déclencheur** : jour 2 ou après, après `missions`.
- **Mis en avant** : la carte Objectifs (`dashboard-objectives`), montrée à partir de cette étape.
- **Adjoint** :
  - FR : « Voilà ce que la direction attend de toi cette saison ; j'ai pris le dernier objectif à ta place. Avant ton 5e
    match, elle ne juge rien. »
  - EN : « Here's what the board expects of you this season; I picked the last objective for you. Before your 5th match,
    it judges nothing. »
  - Si le joueur l'a choisi lui-même (depuis Club avant son premier match), la fin de la première phrase devient « le
    dernier, c'est toi qui l'as choisi » / « the last one is your own pick ».
- **Geste** : « Voir le détail » (`dashboard-objectives-detail`) ou « Compris ».
- **Accord avec l'existant** : la pastille « Trop tôt pour juger » et la ligne « Choisi par l'adjoint » restent ; la
  bulle dit pourquoi, sans les répéter.

**`lineup`, Composition** (étape d'écran)
- **Déclencheur** : à la première ouverture de la Composition, dès le jour 1. Si elle n'a pas été ouverte au jour 3,
  l'étape est poussée par « Préparer » (`dashboard-lineup`) avant un match.
- **Mis en avant** : le poste du titulaire le moins bien noté à son poste, sur le terrain.
- **Adjoint** :
  - FR : « Touche un poste : je te montre qui peut y jouer, le meilleur d'abord. » (« Clique » à la souris,
    `PointerText`)
  - EN : « Tap a position: I'll show you who can play there, best first. » (« Click »)
- **Geste** : toucher un poste ; les candidats s'ouvrent.
- **Puis** :
  - FR : « Choisis-en un ou garde le mien, puis « Enregistrer ». »
  - EN : « Pick one or keep mine, then “Save”. »
- **Close** à « Enregistrer », ou en quittant l'écran après avoir ouvert les candidats (`ADAPTED`).
- **Remplace** la bulle `secondary` d'aujourd'hui.

**`squad`, Effectif** (étape d'écran)
- **Déclencheur** : à la première ouverture de l'Effectif, dès le jour 1.
- **Mis en avant** : la première ligne ou carte de l'effectif.
- **Adjoint** :
  - FR : « La note, de 1 à 99, résume le niveau d'un joueur ; le cœur, sa condition. Touche un joueur pour voir sa
    fiche. »
  - EN : « The rating, from 1 to 99, sums up a player's level; the heart, his fitness. Tap a player to see his
    profile. »
- **Geste** : ouvrir une fiche.
- **Remplace** la bulle `rating` d'aujourd'hui.

**`simulate`, Accueil**
- **Déclencheur** : jour 2 ou après, deux matchs du club joués.
- **Mis en avant** : « Simuler » (`simulate-menu`).
- **Adjoint** :
  - FR : « Pas le temps de tout regarder ? « Simuler » joue jusqu'à la date que tu choisis, sans direct, et te fait le
    bilan. »
  - EN : « No time to watch it all? “Simulate” plays on to the date you choose, without the live match, and sums it up. »
- **Geste** : ouvrir le menu, ou « Compris ».
- **Remplace** la bulle `simulation` d'aujourd'hui.

**`break`, Accueil**
- **Déclencheur** : trêve « à venir » (`getManagedBreak`, après le dernier match du club avant elle), jour 2 ou après.
  Si la trêve du 4 septembre est passée le jour 1, c'est la suivante.
- **Mis en avant** : la ligne de la trêve (`hero-break`) et « Passer la trêve » quand c'est l'action suivante.
- **Adjoint** :
  - FR : « La trêve internationale arrive : {n} de tes joueurs partent en sélection. Ils reviendront le mardi, fatigués
    s'ils ont joué. »
  - EN : « The international break is coming: {n} of your players are off on international duty. They'll be back on
    Tuesday, tired if they played. »
  - Sans appelé :
    - FR : « La trêve internationale arrive : une semaine sans match de club, et aucun de tes joueurs n'est appelé. »
    - EN : « The international break is coming: a week without club matches, and none of your players is called up. »
- **Geste** : « Passer la trêve » ou « Jouer le match ».
- **Ce qui apparaît** : l'onglet Sélections.

**`europe`, Accueil** (club qualifié)
- **Déclencheur** : son prochain match est européen. Le premier est le 16 septembre.
- **Mis en avant** : le héros.
- **Adjoint** :
  - FR : « Coupe des Lauriers : six matchs de phase de ligue. Les quatre premiers vont en quarts, du 5e au 12e en
    barrages. » Pour la Coupe des Fanions, « quatre matchs ».
  - EN : « Laurel Cup: six league-phase matches. The top four go straight to the quarter-finals, 5th to 12th into the
    play-offs. » Pour la Pennant Cup, « four ».
- **Geste** : « Jouer le match ».
- **Ce qui apparaît** : l'onglet Europe.

**`cup`, Accueil**
- **Déclencheur** : son prochain match est de coupe : le 23 septembre pour un club du tour préliminaire, le 2 décembre
  sinon.
- **Mis en avant** : le héros.
- **Adjoint** :
  - FR : « Coupe : un seul match, prolongation et tirs au but s'il le faut. Une défaite, et c'est fini. »
  - EN : « Cup: a single match, with extra time and penalties if needed. Lose and you're out. »
- **Geste** : « Jouer le match ».
- **Ce qui apparaît** : l'onglet Coupe.
- **Si le tutoriel finit avant le 2 décembre** : `EXPIRED`, et l'onglet apparaît au premier tour du club.

**`fitness`, Composition ou Accueil**
- **Déclencheur** : un titulaire du onze enregistré sous 75 de condition au prochain coup d'envoi (`fitnessAtKickOff`).
- **Mis en avant** : ce joueur sur le terrain, ou la ligne de « À faire ».
- **Adjoint** :
  - FR : « {joueur} est fatigué ({condition}) : il jouera moins bien et peut se blesser. Repose-le, ou touche
    « Composition automatique ». »
  - EN : « {player} is tired ({fitness}): he'll play below par and could get injured. Rest him, or tap “Automatic
    line-up”. »
- **Geste** : un changement dans la Composition, ou « Composition automatique ».

**`judged`, Accueil**
- **Déclencheur** : après le 5e match de championnat du club.
- **Mis en avant** : la confiance du président (`dashboard-confidence`).
- **Adjoint** :
  - FR : « Cinq matchs : la direction commence à juger. Sa confiance bouge maintenant après chaque match. »
  - EN : « Five matches in: the board starts judging. Its confidence now moves after every match. »
- **Geste** : « Compris » ou « Voir le détail ».
- **Accord avec l'existant** : c'est la fin de « Trop tôt pour juger », dite une fois.

**Une semaine type**, pour un joueur qui joue deux ou trois matchs par jour :

| Jour | Ce qui vient |
|---|---|
| 1 | les 5 étapes du jour 1 ; `squad` et `lineup` si le joueur ouvre leurs écrans |
| 2 | `missions`, puis `market` (le mercato ferme le 31 août) |
| 3 | `objectives`, puis `break` (trêve du 4 septembre), ou `simulate` |
| 4 | `europe` (16 septembre) pour un club qualifié, `judged` (5e journée, 19 septembre) |
| 5 à 7 | `cup` (23 septembre pour les plus bas), `fitness`, ce qui reste |

Seize étapes en tout. Un club qui ne joue pas l'Europe en a quinze. Pour un club qui entre en coupe en 16es, `cup` ne
vient dans le tutoriel que si son 2 décembre arrive avant le 14e jour.

---

## 2. Ce qui est caché ou simplifié au début

**Règles** :
- ce qui a été montré le reste ;
- « Passer le tutoriel » montre tout d'un coup ;
- un onglet caché n'est qu'absent de sa bascule : son adresse reste ouverte, et les cinq entrées ne changent jamais ;
- rien n'est caché dans une autre carrière que la première, ni dans une partie de défi.

| Élément | Jour 1, avant le premier match | Apparaît |
|---|---|---|
| « Tes trois premières actions » (`dashboard-first-steps`) | supprimé dans les carrières normales | — |
| Bulles `tip-rating`, `-secondary`, `-money`, `-simulation` | coupées pour le joueur du tutoriel | remplacées par `squad`, `lineup`, `market`, `simulate` |
| Pastilles budget, salaires, mercato | cachées | étape `market`, ou au jour 3 si la fenêtre est fermée |
| Carte « Missions du jour », ligne des missions de « À demain », série des Réglages | cachées, et aucune mission tirée ce jour-là | étape `missions` (jour 2) |
| Carte Objectifs de l'Accueil | cachée ; l'adjoint choisit l'objectif au premier match (`ensureObjectiveChosen`), comme pour un joueur qui ne choisit pas | étape `objectives` ; l'écran Club les montre toujours |
| Tuiles et mini-classement | cachés : ils ne diraient que « — » | après le premier match |
| « À faire » | caché : « Effectif complet » seul | après le premier match ; l'offre et le point faible à l'étape `market` |
| Carte du défi, onglet Défi | cachés | jour 2 |
| Onglet Récompenses | caché | étape `missions` |
| Onglets Sélections, Europe, Coupe | cachés | étapes `break`, `europe`, `cup`, ou leur moment passé |
| Onglets Calendrier, Classement, Histoire, Effectif, Composition | visibles | — |
| Bandeau du compte Google, avis des navigateurs intégrés | inchangés : après un match, et dans une appli | — |
| « À demain » du jour 1 | missions remplacées par la réplique `full-time`, défi caché | complet dès le jour 2 |

Le jour 1, l'Accueil d'une carrière neuve n'a donc que le héros et la bulle, plus l'avis des navigateurs intégrés quand il
y a lieu. Après le premier match viennent le dernier résultat, les tuiles, le mini-classement et « À faire ».

---

## 3. Déclenchement et reprise

### 3.1 Qui a le tutoriel

La ligne `Tutorial` naît dans `createSaveAction`, dans la transaction de la création (option de `createSave`). Les
parties créées par `createSave` ailleurs n'en ont jamais : tests, scripts, démo et jumeaux des E2E. Conditions :

- une carrière hors défi ;
- le joueur n'a pas encore de ligne `Tutorial`, ni d'autre carrière hors défi ;
- il est nouveau : `firstSaveAt` vide, ou un joueur créé après la mise en ligne (`TUTORIAL_SINCE`), qui a pu commencer
  par le défi. Un joueur d'avant, qui a eu une carrière depuis supprimée, n'en a pas : rien ne compte les carrières
  supprimées.

Cas particuliers :
- **Partie de défi** : aucune ligne n'est créée, et aucune bulle dans une partie de défi, même pour un joueur dont le
  tutoriel est en cours.
- **A déjà joué un direct** (`firstLiveMatchAt` posé, par exemple dans le défi) : `speed`, `choice` et `half-time`
  naissent closes (`ADAPTED`).
- **Carrière supprimée en cours de tutoriel** : `Tutorial.saveId` passe à null. La prochaine carrière hors défi le reprend
  là où il en était.
- **Carrières suivantes** (un compte en a trois) : jamais de bulle, seule la carrière du tutoriel en a.

### 3.2 Passer et reprendre

**« Passer le tutoriel »**, dans chaque bulle :
- un toucher, sans confirmation ;
- une notification : « Tutoriel passé. Tu peux le reprendre dans Club, Réglages. » / « Tutorial skipped. You can pick it
  up again in Club, Settings. » ;
- tout ce qui était caché apparaît.

**« Passer l'étape »** (Échap) clôt l'étape (`PASSED`) ; la suite continue.

**Club → Réglages**, une ligne « Tutoriel de l'adjoint » (`settings-tutorial`), entre la série et l'appli :

| État | Ce que dit la ligne |
|---|---|
| En cours | « En cours · jour 3 » |
| Passé | « Passé le 19/11 » et « Reprendre le tutoriel » (`settings-tutorial-resume`) |
| Fini ou expiré | « Terminé » |

Reprendre :
- remet à faire les étapes passées dont le moment peut encore venir ;
- celles du jour 1 dont le match est joué restent closes ;
- ne cache rien de nouveau.

### 3.3 Fermeture, autre appareil, Google, navigateur intégré

- **Navigateur ou onglet fermé** : l'état est en base, par joueur. La page suivante montre l'étape due, à son écran. Un
  direct en suspens (« Match en cours — reprendre ») reprend ses étapes à leur moment.
- **Deux onglets** : chaque écriture est idempotente par (joueur, étape). Le premier résultat reste.
- **Autre appareil** :
  - avec Google, c'est le même joueur, donc le même tutoriel ;
  - sans compte, un autre navigateur est un autre joueur pour le jeu : s'il y crée une carrière, c'est sa première, et
    le tutoriel recommence, passable d'un toucher ;
  - le lien de reprise (`/resume`) adopte le même joueur, donc le même tutoriel.
- **Connexion Google** (`signInWithGoogle`, après `moveHistory`), nouvelle fonction `moveTutorial` :
  - le compte n'a pas de tutoriel : celui de l'anonyme le suit, ses étapes avec lui ;
  - le compte a déjà le sien : il le garde, et celui de l'anonyme part avec lui ;
  - le compte avait une carrière hors défi avant la connexion (un joueur qui a commencé une carrière sans compte sur un
    nouveau navigateur) : celui de l'anonyme le suit mais finit (`MERGED`).
- **Navigateur intégré d'Instagram, Facebook, TikTok, Snapchat** :
  - ses cookies sont à part : c'est un joueur anonyme comme un autre, et le tutoriel y marche à l'identique ;
  - l'avis des navigateurs intégrés garde sa place en tête de l'Accueil, et la bulle reste au pied de l'écran ;
  - aucune réplique ne parle de Google, caché dans ces navigateurs ;
  - « Copier mon lien de reprise » emmène la carrière et son tutoriel dans le vrai navigateur.

---

## 4. Mesures dans /admin

**Une section « Tutoriel »** (`admin-tutorial`), entre Parcours et Rétention, sur la période de la page (7 ou 30 jours),
par jour UTC de début. FR et EN, quatre colonnes au plus sous 640 px.

**Tuiles** :

| Tuile | Définition |
|---|---|
| Commencés | lignes `Tutorial` de la période |
| Premier match joué | `User.firstMatchAt` posé, et sa part |
| Jour 1 fini | `day1At` posé : le « À demain » vu |
| Passés | `endedBy = SKIPPED`, avec la part passée dès le jour 1 |
| Terminés | `endedBy = FINISHED`, toutes les étapes closes |
| Abandons | ni fini ni passé, joueur pas vu depuis 7 jours (`lastSeenAt`) |
| Création → fin du premier match | médiane et 3e quartile de `firstMatchAt − startedAt`, à côté de la même médiane des 14 jours d'avant la mise en ligne (`firstMatchAt − firstSaveAt`, Parcours) |

**Tableau des étapes**, dans l'ordre du scénario : montrées, faites, passées (Échap, ou deux fois sans geste), adaptées.
Plus deux comptes : l'étape où l'on a touché « Passer le tutoriel », et la dernière étape montrée aux abandons. Sous
640 px : étape, montrées, faites, passées.

**Retour à J+1 et J+7**, par `UserDay` comme la Rétention (jours dont le retour est passé seulement). Lignes :
- jour 1 fini ;
- tutoriel passé le jour 1 ;
- parti avant la fin du premier match ;
- référence : nouveaux joueurs des 14 jours d'avant la mise en ligne.

**Lecture honnête** : « fini contre passé » n'est pas un effet du tutoriel. Ceux qui passent sont souvent des joueurs
expérimentés ou pressés. La comparaison avec la référence d'avant dit plus. Un groupe témoin dirait vrai (§ 8).

**Requêtes** : une par chiffre, par `Tutorial(startedAt)` et la clé primaire de `TutorialStep`, plus `UserDay(day)` et
`User` par leur clé. Jamais une table de jeu. `/admin/stats` « Premiers pas » ne change pas.

---

## 5. Données et migration

**Migration d'ajout `…_tutorial`** : deux tables, rien d'existant n'est modifié.

```prisma
/// The first-career tutorial of a player (docs/design/tutoriel.md): one row, made with his first career.
model Tutorial {
  userId    String    @id
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  saveId    String?   // the career it follows; his next one takes it up if this one is deleted
  save      Save?     @relation(fields: [saveId], references: [id], onDelete: SetNull)
  version   Int       // the scenario (1): a later scenario never replays an earlier one
  startedAt DateTime  @default(now())
  day1At    DateTime? // the « À demain » of his first match, seen
  skippedAt DateTime? // « Passer le tutoriel », the last time
  resumedAt DateTime? // taken up again from Club → Réglages, the last time
  endedAt   DateTime?
  endedBy   String?   // FINISHED | SKIPPED | EXPIRED | MERGED
  steps     TutorialStep[]

  @@index([startedAt])
  @@index([saveId])
}

/// A step of a player's tutorial: when it was first shown, how many times, and how it ended.
model TutorialStep {
  userId   String
  tutorial Tutorial  @relation(fields: [userId], references: [userId], onDelete: Cascade)
  step     String    // its key (TUTORIAL_STEPS), never renamed
  shownAt  DateTime  @default(now())
  shows    Int       @default(1)
  endedAt  DateTime?
  outcome  String?   // DONE | PASSED | ADAPTED | EXPIRED

  @@id([userId, step])
  @@index([step, shownAt])
}
```

**Types et index** :
- Clés d'étape et issues : du texte validé par Zod, comme les missions, plutôt que des enums qu'une étape nouvelle
  obligerait à migrer.
- Les clés étrangères ont leur index en tête (`foreign-key-indexes.test.ts`).

**Écritures** (aucune dans une transaction de match ; dates à l'horloge de la base, `now()`, comme l'activation) :
- La création, dans la transaction de la carrière.
- `tutorialStepAction(saveId, step, event)` :
  - `requireOwnedSave` puis Zod ; le joueur vient du serveur, jamais du client (modèle de `wearAction`) ;
  - une écriture `INSERT … ON CONFLICT` quand une bulle se montre (`shows` + 1), une quand elle se clôt (issue gardée
    une fois) ;
  - les issues `ADAPTED` calculées depuis la dernière écriture partent avec elle.
- `skipTutorialAction` et `resumeTutorialAction` : `revalidatePath` de la partie, puisque l'écran change.
- `day1At` : écrit par l'étape `full-time`.

**Lecture** : une par requête, avec l'utilisateur (relation sur la clé primaire), les étapes seulement tant que le
tutoriel vit. Environ 1 ms, aucune requête de jeu, aucune simulation.

**Purge et fusion** :
- les deux tables partent avec le joueur (cascade) ;
- la fusion Google est décrite au § 3.3.

**Confidentialité** : la page (`privacy-document.tsx`) liste chaque donnée par joueur. Le tutoriel y entre, dans les deux
langues : étapes vues, quand, et ce qu'en a fait le joueur. `UPDATED_ON` est avancé.

**Messages** : une zone `tutorial` (FR et EN), les mêmes arguments dans les deux langues, chaque réplique de 140
caractères au plus hors noms (test).

---

## 6. Risques

| Risque | Parade | Ce que /admin montre |
|---|---|---|
| Tutoriel trop long | 5 bulles le jour 1, 1 ou 2 phrases chacune, un match de 45 s à x1, x2 et x4 proposés dès la 1re minute ; jamais d'arrêt du direct pour une bulle ; au plus 2 étapes poussées par jour ensuite ; une étape montrée deux fois sans geste ne revient plus ; fin au 14e jour | médiane création → fin du premier match, étape où l'on passe le tutoriel, abandons par étape |
| Joueurs expérimentés agacés | première carrière seulement ; « Passer le tutoriel » dans chaque bulle, Échap passe l'étape ; un geste déjà fait clôt l'étape sans bulle ; un joueur qui a déjà joué un direct saute celles du direct ; un compte qui avait une carrière n'hérite pas du tutoriel | part des « Passer » à la 1re bulle |
| Conflits avec les écrans existants | une bulle à la fois, jamais par-dessus une feuille modale (ligne dans la carte) ; aucun orange dans la bulle, l'action orange de l'écran reste la seule ; la bulle ne couvre ni la barre de navigation ni les commandes du direct ; « Trop tôt pour juger », « À demain » et les missions disent chacun une chose, la bulle ne la répète pas (§ 2) | erreurs des navigateurs sur ces écrans (section Erreurs) |
| Trop caché : le joueur cherche la Coupe | les cinq entrées ne bougent pas ; les adresses restent ouvertes ; tout apparaît à « Passer le tutoriel » ; seuls des onglets secondaires attendent leur moment | — |
| Avalanche le jour 2 (missions, mercato, objectifs, trêve…) | deux étapes poussées par jour, les plus pressées d'abord ; les autres attendent le lendemain ou leur prochaine occurrence | étapes montrées par jour et par joueur |
| E2E existants cassés : une carrière créée depuis l'accueil a le tutoriel | l'aide `createSave` des E2E passe le tutoriel ; les jumeaux de la démo n'en ont pas (§ 3.1) ; un E2E à lui | — |
| Mesure biaisée | référence d'avant la mise en ligne ; groupe témoin à trancher (§ 8) | — |
| Textes trop longs en français à 390 px | 140 caractères au plus hors noms, testé ; captures à 390 et 360 px, FR et EN | — |
| Coût | une lecture par clé primaire, aucune écriture dans un match, aucune simulation | CPU de Vercel (Usage) |

---

## 7. Ordre de construction et tests

1. **Données et moteur pur** : `TUTORIAL_STEPS`, `currentStep`, `revealed`. Tests purs de chaque règle : déclencheurs,
   adaptation, deux bulles par jour, deux affichages au plus, fin au 14e jour, joueur qui a déjà joué un direct. Puis la
   migration et ses tests en base : création à la première carrière seulement, jamais dans un défi, reprise par une
   carrière suivante.
2. **Bulle, actions, jour 1** : Accueil, direct, « À demain », masquages du jour 1. E2E du jour 1 à 390 et 1280 px, FR et
   EN : chaque bulle, son geste, Échap, « Passer le tutoriel », le mouvement réduit, et le chrono jusqu'au coup de
   sifflet final.
3. **Jours suivants** : sur des jumeaux de la démo datés au bon moment (mercato ouvert, trêve à venir, match européen,
   5e journée), et un jour UTC simulé dans les tests de règles.
4. **Réglages, fusion Google, purge**, avec leurs tests en base ; puis l'aide des E2E et la vérification que les 44
   fichiers passent.
5. **/admin, confidentialité, Nouveautés, guide** (« Ton premier match » renvoie au tutoriel), `CLAUDE.md`.

---

## 8. Points tranchés (19/11)

Alexis a retenu les dix propositions :

1. **Missions** : à partir du jour 2, annoncées par le « À demain » du jour 1.
2. **Objectif au choix** : pris par l'adjoint au premier match, expliqué le jour 2.
3. **Composition** : étape d'écran, poussée au jour 3 si le joueur ne l'a pas ouverte.
4. **Ce qui est caché** : le tableau du § 2, pastilles d'argent et onglets Coupe, Europe et Sélections compris.
5. **Partie de défi** : elle garde « Tes trois premières actions » et les bulles d'aujourd'hui ; un nouveau venu par le
   défi n'a pas de tutoriel.
6. **Carrières suivantes** : plus de panneau de premières actions.
7. **Joueur venu par le défi** : les étapes du direct sont sautées s'il a déjà joué un direct.
8. **Mesure** : la comparaison avant/après, sans groupe témoin, tant que les nouveaux joueurs sont peu nombreux.
9. **Mise en ligne** : en deux fois, le jour 1 avec les Réglages et /admin d'abord, puis les jours suivants.
10. **Revoir le tutoriel une fois fini** : non.

---

## 9. Mise en œuvre : première mise en ligne, le jour 1 (23/11)

**Scénario 1.** Les tutoriels créés par cette mise en ligne (le 23/11 : `TUTORIAL_SINCE`, d'où part aussi la référence des
mesures, les 14 jours d'avant) ont le jour 1 seul (`TUTORIAL_VERSION` 1). Les étapes des jours
suivants viendront avec un scénario 2. Un tutoriel garde le scénario de sa naissance (§ 0.1, `Tutorial.version`) : celui d'un
joueur arrivé entre les deux mises en ligne finit avec son jour 1, et tout ce qui était caché apparaît le lendemain, sans
étape poussée.

**Écarts au § 5**, pour les mesures du § 4 et les étapes closes sans avoir été montrées :
- `Tutorial.skippedStep` : l'étape montrée quand le joueur a touché « Passer le tutoriel » ;
- `Tutorial.saveId` unique : une carrière n'est suivie que par un tutoriel ;
- `TutorialStep.shownAt` facultatif et `shows` à 0 par défaut : les étapes du direct d'un joueur venu du défi naissent
  closes, la bienvenue d'un premier match simulé se clôt sans être revue ;
- pas d'index `(step, shownAt)` : les mesures passent par `Tutorial(startedAt)` et la clé de `TutorialStep`.

**Précisions du scénario** :
- `speed` se montre du coup d'envoi d'un direct ouvert à son début jusqu'à son premier arrêt (une carte d'événement, la
  mi-temps). Elle est adaptée à cet arrêt, à « Aller à la mi-temps », à une pause demandée, et d'emblée en mouvement réduit.
- `choice` : « Coaching » sur la carte l'adapte ; « Valider » la fait.
- `half-time` : « Coaching » ou « Reprendre » de la carte la font ; la reprise par la barre ou par le panneau l'adapte.
- `full-time` : montrée, elle écrit `day1At` ; faite par « Continuer » ou un lien de la carte, adaptée quand le joueur part
  autrement (close depuis l'Accueil).
- Les bulles `rating` et `secondary` (Effectif, Composition) restent dans ce scénario ; `money` et `simulation` se taisent
  pendant le calme du premier jour. Leurs remplaçantes (`squad`, `lineup`, `market`, `simulate`) viendront avec le scénario 2.
- La carte du défi de l'écran Club se cache aussi le premier jour, comme celle de l'Accueil.

**Mesures du 19/11** (serveur de développement local, base de test) :
- **Le jour 1 tient en une minute.** `e2e/tutorial.spec.ts`, 390 × 844, en anglais, à x1, la carte « Fulham FC » : 59,0 s du
  toucher sur la carte du club au « À demain », dont 6,7 s de création et 52,2 s de direct. Deux cartes d'événement et la
  mi-temps par le Coaching. Un vrai joueur lit les bulles : compter une à deux minutes, sous les 3 minutes du cahier.
- Aucune requête de jeu de plus : une lecture du tutoriel par la clé du joueur par page, une petite transaction par
  bulle montrée ou close, aucune dans un match.
