# Chantier « effectif et adjoint » : composition enregistrée seule, consignes, évolution des joueurs

Cahier rédigé le 25/11/2026, **validé le 25/11** avec les recommandations du § 6 et trois précisions (« Décisions
d'Alexis »). Les faits viennent du code au 25/11 (`acecbfb`, la
simplification en ligne) ; les chiffres, de règles d'essai jouées par un script de mesure hors du dépôt, sur des bases
locales (§ 5). Les noms des maquettes sont inventés.

## Demande d'Alexis (25/11)

Un petit chantier : d'abord une question, puis ce cahier, sans rien coder, avec une recommandation sur chaque point à
décider.

- **La question**, réponse tirée du code avec les chiffres : comment progresse la note d'un joueur (âge, potentiel,
  fréquence, plafond) ? Le temps de jeu compte-t-il ? Un jeune titulaire progresse-t-il plus vite qu'un jeune sur le
  banc ? Même question pour les joueurs des clubs IA. Réponse au § 0.
1. **Composition enregistrée automatiquement.** Chaque changement (placement, échange, dispositif) est enregistré tout
   de suite, sans bouton. Le premier fait passer en mode « ta composition », avec un message discret ; « Rendre la main
   à l'adjoint » reste. Connexion lente, deux onglets, erreur d'enregistrement, verrou de la partie pendant une
   simulation (§ 1).
2. **Consignes pour l'adjoint**, dans Club → Réglages, sous « Ton adjoint s'occupe de » : un seul choix simple. Ce que
   chacune change dans la composition et dans les contrats, son coût ou son gain mesurés en points par match et en
   progression des jeunes sur 3 saisons. Si le temps de jeu ne compte pas aujourd'hui dans la progression, le faire
   compter, avec l'effet sur les six cibles et sur les clubs IA (§ 2).
3. **Évolution des joueurs dans l'Effectif** : la progression sur chaque ligne (« 68 ↑+3 »), la courbe de la note sur la
   fiche, les jeunes qui progressent. Migration d'ajout ou calcul depuis l'existant, et l'effet sur le poids d'une
   carrière (§ 3).

## Décisions d'Alexis (25/11)

Le cahier est validé avec les recommandations du § 6, et ces précisions :

1. **1.A** : le dispositif et la consigne de départ ne retirent pas la main à l'adjoint.
2. **Consignes** : deux seulement, « Meilleur onze » (par défaut) et « Lancer les jeunes » réglée comme mesuré (10
   points d'écart, trois jeunes par match). Pas de « Faire tourner l'effectif ».
3. **Évolution** : en plus de la progression de l'été (« 71 ↑+4 ») et de la courbe de la fiche, chaque ligne de
   l'Effectif d'un joueur qui a encore une marge montre la progression attendue cet été d'après ses minutes de
   championnat (« ↗ +3 prévu »), mise à jour après chaque match. Même calcul que la vue « Jeunes », sans changer le
   moteur. Une phrase d'aide dit que jouer en championnat fait progresser (§ 3.2, § 3.4).
4. **Construction** sur la branche `effectif-adjoint`, avec la méthode habituelle (migrations d'ajout et leur SQL, tsc,
   lint, Vitest, suite lente, E2E complets, build, une suite à la fois), une entrée des Nouveautés, le guide et le
   tutoriel mis à jour.
5. **Mise en ligne** : rien de poussé avant le rapport des 24 h de la simplification. Ensuite, n'importe quel jour,
   après un rapport et l'accord d'Alexis.

## Contraintes

- **Migrations d'ajout uniquement**, sans `UPDATE` des lignes existantes ; rien de perdu dans les carrières en cours.
- **Déterminisme, moteur pur** : une consigne est une fonction pure de l'état de la partie, sans nouveau tirage.
- **Défi de la semaine** : la consigne par défaut est le jeu d'aujourd'hui ; aucune partie ne change tant qu'on ne
  choisit rien (§ 4).
- **Écrans** lisibles à 390 et 360 px, en français et en anglais, une seule action orange pleine par écran.
- **Budget CPU de Vercel** : un geste dans la composition ne relit pas toute la page.

---

## 0. Réponse : comment progresse la note d'un joueur

### 0.1 Une fois par saison, une formule

- **Quand.** Une seule fois par saison, au passage de saison (`advanceToNextSeason`, `src/db/season.ts:216`), pour tous
  les joueurs du monde : clubs IA, club dirigé, joueurs libres. Jamais pendant la saison : aucune autre écriture ne
  change `PlayerSave.overall`, la note d'un joueur est la même du 1er juillet au 30 juin.
- **La formule** (`progressPlayer`, `src/engine/progression.ts:37`) :
  - marge = potentiel − note (jamais négative) ;
  - croissance = marge × part de son âge × facteur de ses minutes ;
  - variation = croissance − déclin de son âge + un tirage en cloche, ±2 au plus (écart-type 0,7 ; la graine de la
    partie, le flux du joueur et de la saison) ;
  - chaque attribut reçoit la variation, plus ±1 au plus. En déclin, la vitesse perd 1,5 fois plus, le physique 1,3
    fois, la passe 0,8 fois (`DECLINE_ATTRIBUTE_FACTORS`). La note est recalculée des attributs pour son poste,
    arrondie.
- **L'âge** compté est celui du 1er juillet qui suit : un joueur de 18 ans pendant la saison progresse « à 19 ans ».

| Âge au 1er juillet suivant | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 et plus |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Part de la marge gagnée (`GROWTH_SHARE_BY_AGE`) | 0,35 | 0,34 | 0,33 | 0,31 | 0,30 | 0,27 | 0,23 | 0,20 | 0,17 | 0,13 | 0,10 | 0,05 | 0 |

| Minutes de championnat dans la saison | 0 | 450 | 900 | 1 350 | 1 800 | 2 250 et plus |
|---|---|---|---|---|---|---|
| Facteur (`GROWTH_BY_MINUTES`) | 0,25 | 0,43 | 0,60 | 0,73 | 0,87 | 1 |

| Âge au 1er juillet suivant | 30 et moins | 31 | 32 | 33 | 34 | 35 | 36 | 38 et plus |
|---|---|---|---|---|---|---|---|---|
| Déclin (`DECLINE_BY_AGE`), en points | 0 | 1 | 1,75 | 2,5 | 3,25 | 4 | 4,67 | 6 |

- **Le plafond est le potentiel.** Avant 29 ans, il ne baisse jamais, et monte quand un bon tirage fait passer la note
  au-dessus (`max(potentiel, note)`). À 29 ans, il devient la note : la marge qui reste est perdue. Aucune note ne passe
  99.
- **D'où vient la marge.** À la création de la partie, elle dépend de l'âge : 24 points au plus à 17 ans, 16 à 21 ans, 8
  à 24 ans, 3 à 27 ans, rien à 29 ans (`AGE_GROWTH_CURVE`), dont 40 % au moins sont acquis (`GROWTH_MIN_SHARE`). Un
  jeune de l'intersaison (16 à 18 ans, deux par club) en a 15 à 30 (`YOUTH_POTENTIAL_GAP_*`). Le jeune prometteur de la
  boutique a juste une plus grande marge.
- **Ce qui ne compte pas** : la forme, le moral, la condition, les buts, les notes de match, les objectifs.

### 0.2 Le temps de jeu compte, en championnat seulement

- **Oui, il compte** : le facteur des minutes va de 0,25 (« l'entraînement seul », aucune minute) à 1 (2 250 minutes,
  25 matchs entiers). 900 minutes, 10 matchs entiers, en donnent déjà 0,60. Au-delà de 2 250, rien de plus.
- **Les minutes de championnat seulement** (`season.ts:198`) : ni la coupe, ni l'Europe, ni les sélections. Le code le
  dit : la coupe et l'Europe n'écrivent de statistiques que pour les joueurs du club dirigé, et les compter
  l'avantagerait sur les clubs IA.
- Un réserviste de sélection est réputé jouer 2 500 minutes (`NATION_RESERVE_SEASON_MINUTES`) ; un joueur libre, aucune.

### 0.3 Exemples, en valeurs attendues (sans le tirage)

| Joueur, âge pendant la saison | 0 min | 900 min | 2 250 min |
|---|---|---|---|
| 18 ans, marge 20 | +1,6 | +3,9 | +6,5 |
| 20 ans, marge 14 | +1,1 | +2,5 | +4,2 |
| 23 ans, marge 8 | +0,4 | +1,0 | +1,6 |
| 26 ans, marge 3 | +0,1 | +0,2 | +0,3 |
| 30 ans | −1 | −1 | −1 |
| 32 ans | −2,5 | −2,5 | −2,5 |
| 34 ans | −4 | −4 | −4 |

**Un jeune titulaire contre un jeune sur le banc**, jusqu'à 29 ans : un joueur de 17 ans noté 55, potentiel 77.

| Temps de jeu chaque saison | à 20 ans | à 23 ans | à 29 ans | marge perdue à 29 ans |
|---|---|---|---|---|
| titulaire, 2 250 min et plus | 70,2 | 74,3 | 75,7 | 1,3 |
| 900 min | 65,5 | 70,2 | 72,5 | 4,5 |
| banc, 0 min | 59,9 | 63,1 | 65,2 | 11,8 |
| banc jusqu'à 20 ans, puis titulaire | 59,9 | 70,3 | 73,7 | 3,3 |

Oui : sur ses trois premières saisons, le titulaire prend 15 points, le jeune du banc 5. Le banc lui coûte pour de bon
plus de la moitié de sa marge. Le rattrapage reste possible jusqu'à 24-25 ans, mais la part de l'âge baisse chaque
année.

### 0.4 Les clubs IA

- **Même règle, mêmes entrées** : leurs minutes de championnat.
- **Leur onze** est le meilleur à chaque poste, reposé quand un titulaire est fatigué (`selectRestedLineup`), sans
  préférence pour les jeunes. Un jeune n'y joue que s'il est le meilleur à son poste, ou quand un titulaire fatigué lui
  laisse sa place.
- **Mesuré** sur 3 saisons d'une partie 2 (la graine de la démo ; § 5), joueurs des clubs IA sous contrat :

| Minutes de championnat dans la saison | Part des jeunes de 16 à 21 ans | Âge moyen | Marge moyenne | Gain moyen | Gain / marge |
|---|---|---|---|---|---|
| 0 | 46 % | 18,0 | 19,9 | +1,65 | 0,08 |
| 1 à 899 | 43 % | 18,9 | 16,7 | +1,78 | 0,11 |
| 900 à 2 249 | 6 % | 20,1 | 12,8 | +2,90 | 0,22 |
| 2 250 et plus | 5 % | 20,3 | 11,1 | +3,24 | 0,29 |

  4 047 saisons-joueurs, 331 minutes de championnat en moyenne. À 22 et 23 ans (1 631 saisons-joueurs) : 44 % sous
  900 minutes, 35 % à 2 250 et plus, 1 454 minutes en moyenne ; +0,57 sans minute, +1,68 à 2 250 et plus.

- **Lecture.** 89 % des jeunes de 21 ans et moins des clubs IA jouent moins de 900 minutes de championnat dans la
  saison, 5 % plus de 2 250. Sans minute, ils prennent 8 % de leur marge par saison ; titulaires, 29 %. Le gain moyen
  d'un remplaçant reste de +1,6 à +1,8, parce qu'il est plus jeune et a plus de marge. Un joueur libre de 21 ans ou
  moins prend +1,0.
- **Conséquence pour le joueur** : faire jouer ses jeunes en championnat est le seul levier sur leur progression. C'est
  ce que font la consigne « Lancer les jeunes » (§ 2) et la vue « Jeunes » de l'Effectif (§ 3).

---

## 1. La composition enregistrée toute seule

### 1.1 Aujourd'hui

- **Un brouillon côté client** (`LineupEditor`, `state` contre `base`,
  `app/saves/[id]/lineup/_components/lineup-editor.tsx:210`). « Enregistrer » (`lineup-save`) envoie toute la
  composition (`saveLineupAction`, `app/saves/[id]/lineup/actions.ts`). « Annuler » (`lineup-cancel`) revient au
  brouillon de départ, sans requête.
- **En mode adjoint**, le dispositif et la consigne de départ s'enregistrent déjà au toucher, sans prendre la main
  (`saveLineupPlanAction` ; côté client, `savePlan` : optimiste, et défait sur un refus).
- **Côté serveur** (`saveManagedLineup`, `src/db/lineup.ts:368`) :
  - il vérifie les joueurs hors de la transaction ;
  - il verrouille la ligne de la partie (`SELECT … FOR UPDATE`), écrit `ClubSave.formation` et `ClubSave.lineup`, puis
    passe `Save.lineupByAssistant` à faux ;
  - sa transaction garde les délais par défaut de Prisma : 2 s pour obtenir une connexion, 5 s en tout, l'attente du
    verrou comprise. Celle de la composition du sélectionneur (`saveCoachLineup`) a 15 et 60 s ;
  - aucune version : le dernier enregistrement gagne ;
  - il accepte un enregistrement pendant un direct en pause (il ne vaut que pour le match suivant, et prend la main),
    alors que « Rendre la main à l'adjoint » y est refusé.
- **Après chaque enregistrement** :
  - la mission « Enregistre ta composition » est comptée (`recordMissionMoves`, une requête ; mission au poids 0 depuis
    le 24/11, donc plus tirée) ;
  - `revalidatePath` relit toute la partie : la page refait ses six lectures, et l'éditeur repart de zéro (sa clé
    contient la composition enregistrée, `LineupScreen`) ;
  - un toast.
- **Le verrou de la partie** est la ligne `Save` verrouillée : un second appel attend son tour. Une date jouée le tient
  le temps de sa transaction (60 s au plus). « Simuler jusqu'à… » et « Prochain match » le reprennent date par date, le
  direct à chaque étape.
- **Le match** lit la composition au début de la transaction de sa date. Un direct garde son équipe dans
  `Fixture.liveState` et ne relit plus `ClubSave`.

### 1.2 La règle proposée

- **Chaque geste complet est enregistré** : placer un joueur, échanger deux titulaires, envoyer un titulaire au banc
  puis remplir le poste, ordonner le banc, choisir le dispositif ou la consigne de départ.
- **Un onze incomplet n'est jamais envoyé.** Un poste vide reste à l'écran (« Poste vide : choisis un joueur pour
  l'enregistrer », en ambre) ; le dernier onze complet reste celui du prochain match.
- **Le premier geste sur un joueur prend la main.** La ligne d'état dit « Ta composition · enregistrée ». Une fois, sous
  elle, un encart discret : « C'est ta composition : ton adjoint ne la changera plus, sauf pour un blessé ou un
  suspendu », avec « Rendre la main à l'adjoint ». Ni toast ni feuille.
- **Le dispositif et la consigne de départ, en mode adjoint, ne prennent pas la main** : l'adjoint refait son onze dans
  le nouveau dispositif, comme aujourd'hui (simplification § 3.2). La demande cite le dispositif parmi les changements
  qui prennent la main : point 1.A.
- **« Annuler » revient au geste d'avant**, un par un, sur tous les gestes de la visite. Revenir sur le geste qui a pris
  la main la rend à l'adjoint.
- **« Rendre la main à l'adjoint »** reste, toujours visible en mode joueur.
- **La ligne d'état** (`lineup-status`) porte `data-mode` (`assistant`, `player`) et `data-save` (`saved`, `saving`,
  `incomplete`, `failed`, `conflict`) ; elle est lue par les lecteurs d'écran (`aria-live="polite"`), un échec en
  `role="alert"`.

### 1.3 Quand part l'enregistrement

- **Tout de suite après le geste, sans délai d'attente.** Next exécute les Server Actions d'un même client l'une après
  l'autre. Un « Jouer le match » touché après un geste part donc après son enregistrement, et le match joue le onze
  affiché. Un délai d'attente (« debounce ») casserait cette garantie.
- **Une requête à la fois par éditeur.** Les gestes faits pendant qu'une requête est en route attendent. À son retour,
  l'éditeur envoie le dernier état, s'il diffère de ce qui est enregistré. Trois gestes rapides font deux requêtes au
  plus.
- **L'état de l'éditeur fait foi pendant la visite.** La réponse ne le remplace pas, sauf refus (§ 1.6) : l'éditeur ne
  remonte plus après chaque enregistrement, la sélection et la feuille ouverte restent.
- **Ni toast ni `revalidatePath`** : la ligne d'état suffit. Les autres écrans lisent la composition à leur prochaine
  visite (pages dynamiques, sans préchargement).
- **En quittant l'écran**, l'éditeur envoie l'état qui attend encore son tour. Qu'une navigation n'annule pas cette
  requête est à vérifier à la construction.
- **La mission « Enregistre ta composition »** n'est plus comptée : poids 0, plus jamais tirée. Une requête de moins par
  geste.

### 1.4 Connexion lente

- **L'éditeur ne bloque jamais** : chaque geste s'affiche aussitôt.
- **« Enregistrement… »** apparaît après 400 ms sans réponse, pas avant : rien ne clignote sur une bonne connexion.
- **Un échec réseau**, ou 20 s sans réponse, est réessayé à 2, 5 puis 15 s. Ensuite : « Pas enregistrée : pas de réseau
  · Réessayer ». Renvoyer le même état ne fait rien de plus : c'est déjà ce qui est enregistré (§ 1.5).
- **Quitter la page** pendant qu'un geste n'est pas enregistré fait demander au navigateur une confirmation
  (`beforeunload`), dans ce seul cas.

### 1.5 Deux onglets

- **Chaque enregistrement porte ce que l'onglet croit enregistré** : dispositif, composition, mode. Dans la transaction
  verrouillée, le serveur le compare à ce qui l'est vraiment :
  - c'est égal : il écrit ;
  - c'est déjà l'état envoyé (un renvoi) : il ne fait rien et répond « enregistré » ;
  - c'est autre chose : il refuse et rend l'état enregistré.
- **L'onglet refusé** dit « Changée dans un autre onglet » et propose « Voir la dernière » : l'éditeur repart de l'état
  enregistré. Son geste n'est pas écrit, rien n'est écrasé sans le dire.
- **Sans migration** : la comparaison porte sur les valeurs (le JSON de la composition, le dispositif,
  `Save.lineupByAssistant`). Une colonne de version (`ClubSave.lineupVersion`) ferait la même chose, plus simple à
  lire ; elle n'est pas nécessaire (point 1.E).
- « Rendre la main » dans un onglet : le geste suivant de l'autre est refusé de même.

### 1.6 Erreurs d'enregistrement

| Cause | Ce que voit le joueur | Ce que fait l'éditeur |
|---|---|---|
| Réseau, délai du verrou dépassé, erreur du serveur | « Enregistrement… », puis « Pas enregistrée : pas de réseau · Réessayer » | trois essais, puis attend le toucher |
| Un autre onglet a changé la composition | « Changée dans un autre onglet · Voir la dernière » | n'écrit rien ; repart de l'état enregistré au toucher |
| Un joueur a quitté le club ailleurs (vente, libération) | « Un joueur n'est plus à ton club : ta composition a été rechargée » | repart de l'état enregistré |
| Un match en direct attend sa reprise | l'écran passe en lecture seule (§ 1.7) | n'envoie plus rien |
| Une nouvelle version du jeu | le message de toujours (« nouvelle version ») | recharge au toucher |

Jamais de perte silencieuse : l'état de l'éditeur reste à l'écran tant que l'erreur n'est pas réglée.

### 1.7 Le verrou de la partie : simulation, match, direct

- **L'enregistrement garde le verrou de la partie**, avec les délais de la composition du sélectionneur : 15 s pour
  une connexion, 60 s en tout. Derrière une date en train de se jouer (0,5 s de CPU, quelques secondes en production),
  il attend au lieu d'échouer au bout de 5 s ; « Enregistrement… » s'affiche pendant ce temps.
- **« Simuler jusqu'à… » dans le même onglet** : son dialogue couvre l'écran, aucun geste n'est possible.
- **Dans un autre onglet**, ou pendant « Prochain match », qui reprend le verrou date par date : un geste s'enregistre
  entre deux dates et vaut pour le premier match joué après lui. C'est ce que fait déjà la composition d'aujourd'hui.
- **Un match en direct en attente** (`Save.liveFixtureId`) : la Composition passe en lecture seule, avec « Reprendre le
  match ». Le serveur refuse aussi, comme une vente (`match_in_progress`). Aujourd'hui, elle enregistre pour le match
  suivant et prend la main, alors que « Rendre la main » est refusé jusqu'au coup de sifflet final : on croit changer le
  match en cours (point 1.D).
- **L'éditeur du sélectionneur** (même composant, `nation/lineup`) suit la même règle. Son enregistrement est déjà
  refusé pendant un direct de sa sélection (`saveCoachLineup`) (point 1.F).

### 1.8 Ce qui part, ce qui change

- **Part** :
  - « Enregistrer » (`lineup-save`) et le brouillon (« Ton onze · modifications non enregistrées »,
    `data-mode="draft"`) ;
  - le toast de chaque enregistrement ;
  - `saveFailed` en toast, remplacé par la ligne d'état.
- **Change** :
  - « Annuler » (`lineup-cancel`), geste par geste ;
  - le tutoriel : l'étape `lineup` se clôt au geste sur le poste cerclé, sa suite qui cercle « Enregistrer »
    (`followUp`) disparaît ;
  - le texte d'aide de la mission et le guide (« touche Enregistrer ») ;
  - les E2E qui touchent `lineup-save` ou `lineup-cancel` : `lineup`, `team`, `lineup-candidates`,
    `starting-instruction`, `tutorial`.
- **Reste** :
  - « Rendre la main à l'adjoint » ;
  - la feuille du dispositif, les candidats d'un poste, le glisser-déposer ;
  - « Stage de forme ».

### 1.9 L'orange de l'écran

« Enregistrer » était l'orange de la Composition (`OWN_ORANGE_ACTION` rend secondaire l'action de jeu de la colonne sur
l'entrée Équipe). Sans lui, je propose que la Composition rende l'orange à « Jouer le match » de la carte « Prochain
match » (à partir de 1024 px) : composer, puis jouer. Sous 1024 px, l'écran n'a pas d'action de jeu, donc pas d'orange,
comme l'Effectif quand aucune fiche n'est ouverte (point 1.C).

### 1.10 Coût

- **Un geste** : une action d'environ 20 à 30 ms de CPU (estimation : vérification des joueurs, verrou, deux écritures),
  sans relecture de la page.
- **Aujourd'hui, un enregistrement** coûte la même action, plus la relecture complète de la page (six lectures) et le
  remontage de l'éditeur.
- **Une visite de cinq gestes** coûte donc à peu près ce que coûte aujourd'hui un enregistrement. À mesurer à la
  construction.

### 1.11 Écrans

```
390 px, Équipe → Composition, l'adjoint aux commandes (rien de changé)
┌──────────────────────────────────────────┐
│ [ Effectif ]  [■ Composition ■]          │
│ ┌ TON ADJOINT ALIGNE LE ONZE ──────────┐ │
│ │ Avant chaque match, il prend les     │ │
│ │ meilleurs selon la condition, les    │ │
│ │ blessures et les suspensions, dans   │ │
│ │ ton dispositif.                      │ │
│ │ Consigne : Meilleur onze · Changer › │ │  ← vers Club → Réglages (§ 2)
│ └──────────────────────────────────────┘ │
│ Dispositif  [ 4-3-3 sentinelle     ▾ ]   │  ← enregistré aussitôt, l'adjoint garde la main
│ Consigne (Attaquer |•Équilibré| Fermer)  │  ← idem
│                                          │
│    (terrain : le onze du prochain        │
│     match, chaque joueur et sa note)     │
│ Au repos : Garnier (71 de condition)     │
│ Banc : Haddad, Roux, Kebe, ...           │
│                                          │
│ ✓ Onze de ton adjoint · il le refait     │  ← lineup-status, data-mode="assistant"
│   avant chaque match                     │
│ Touche un joueur pour faire ton onze :   │
│ ton adjoint ne le changera plus.         │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

```
390 px, juste après le premier geste (Bekri à la place de Perrin)
┌──────────────────────────────────────────┐
│ ✓ Ta composition · enregistrée           │  ← data-mode="player", data-save="saved"
│   [ Annuler ]                            │  ← revient au geste d'avant ; au premier, rend la main
│ ┌──────────────────────────────────────┐ │
│ │ C'est ta composition : ton adjoint   │ │  ← une fois, au geste qui prend la main
│ │ ne la changera plus, sauf pour un    │ │
│ │ blessé ou un suspendu.               │ │
│ │ [ Rendre la main à l'adjoint ]       │ │
│ └──────────────────────────────────────┘ │
│                                          │
│    (terrain : Bekri au poste de          │
│     Perrin, Perrin sur le banc)          │
│ Dispositif  [ 4-3-3 sentinelle     ▾ ]   │
│ Consigne (Attaquer |•Équilibré| Fermer)  │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

```
390 px, la ligne d'état, ses cinq autres états (une seule à la fois)
┌──────────────────────────────────────────┐
│ ◌ Ta composition · enregistrement…       │  ← après 400 ms sans réponse ; les gestes restent possibles
├──────────────────────────────────────────┤
│ ! Poste vide : choisis un joueur         │  ← ambre ; rien n'est envoyé tant que le onze n'est pas complet
│   pour l'enregistrer                     │
├──────────────────────────────────────────┤
│ ! Pas enregistrée : pas de réseau        │  ← ambre, après trois essais (2, 5 et 15 s)
│   [ Réessayer ]                          │
├──────────────────────────────────────────┤
│ ! Changée dans un autre onglet           │  ← ambre ; rien n'est écrasé
│   [ Voir la dernière ]                   │
├──────────────────────────────────────────┤
│ ! Un joueur n'est plus à ton club :      │  ← après une vente ou une libération ailleurs
│   ta composition a été rechargée.        │
└──────────────────────────────────────────┘
```

```
390 px, Composition pendant un match en direct
┌──────────────────────────────────────────┐
│ ┌ MATCH EN DIRECT ─────────────────────┐ │
│ │ Ta composition est figée jusqu'au    │ │  ← lecture seule : aucun geste, aucun enregistrement
│ │ coup de sifflet final. Pour ce       │ │
│ │ match, fais tes changements dans le  │ │
│ │ Coaching du direct.                  │ │
│ │ [■ REPRENDRE LE MATCH ■]             │ │  ← orange : la seule action utile
│ └──────────────────────────────────────┘ │
│    (terrain et banc, grisés)             │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

```
1280 px, Équipe → Composition, ta composition (colonne de navigation à gauche, non dessinée)
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [ Effectif ] [■ Composition ■]       ✓ Ta composition · enregistrée  [ Annuler ] [ Rendre la main ]    │
│ Dispositif [ 4-3-3 sentinelle ▾ ]   Consigne de départ (Attaquer |•Équilibré| Fermer)                  │
│                                                                                                        │
│ EFFECTIF (hors du onze)     TERRAIN                                FICHE                               │
│ Remplaçants                    Bekri 69   Faure 74   Garnier 71     Malo Garnier · MC 71 ↑+4           │
│  1 Perrin  MD 70                  Roux 66   Kebe 63   Leclerc 61    19 ans · potentiel 82              │
│  2 Haddad  DD 68                  ...                               Cet été ≈ +3 (§ 3)                 │
│ Non retenus                       Vidal 76                                                             │
│  Marchand  DC 60                                                                                       │
│                                                                                                        │
│ Carte « Prochain match » de la colonne : [■ JOUER LE MATCH ■]                                          │  ← l'orange de l'écran : « Enregistrer » n'existe plus (§ 1.9)
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.12 Points à trancher

- **1.A Le dispositif et la consigne de départ prennent-ils la main ?** Je recommande non, comme aujourd'hui : changer
  de dispositif n'est pas « faire son onze », et l'adjoint sait le remplir. Sinon, le moindre essai de dispositif ôte la
  main à l'adjoint.
- **1.B « Annuler »** : je recommande geste par geste, pendant la visite. Sans lui, un geste raté se défait à la main.
- **1.C L'orange de la Composition** : je recommande « Jouer le match » de la colonne.
- **1.D Pendant un direct en attente** : je recommande la lecture seule.
- **1.E Deux onglets** : je recommande la comparaison des valeurs, sans migration.
- **1.F L'éditeur du sélectionneur** : je recommande le même comportement.

---

## 2. Les consignes de l'adjoint

### 2.1 Où, et comment

- **Où.** Dans Club → Réglages, sous les deux interrupteurs de « Ton adjoint s'occupe de », une section « Sa
  consigne » : un seul choix, enregistré au toucher comme les interrupteurs (`useOptimistic`), refusé pendant un direct
  comme eux.
- **Rappel.** La carte « Ton adjoint aligne le onze » de la Composition rappelle la consigne et mène aux Réglages.
- **Quand elle sert.** La consigne ne vaut que pour ce dont l'adjoint s'occupe : la composition si elle est à lui, les
  contrats s'ils sont à lui. Les deux repris par le joueur, la section est grisée et le dit.
- **Données** : `Save.assistantPolicy` (`BEST` par défaut, puis `YOUTH`, et `ROTATION` si on la garde), une migration
  d'ajout. Une carrière d'avant a `BEST`, le jeu d'aujourd'hui.

### 2.2 Ce que fait chaque consigne

| Consigne | Composition (quand l'adjoint la fait) | Contrats (quand il les fait) |
|---|---|---|
| **Meilleur onze** (par défaut) | aujourd'hui : le onze reposé dans ton dispositif (`selectAssistantLineup`), et avec l'objectif Jeunesse choisi, son jeune jusqu'à 15 titularisations | aujourd'hui : il prolonge qui vaut au moins le niveau de l'effectif − 5 (le niveau lui-même au-delà de 32 ans), et les espoirs de 23 ans au plus dont le potentiel atteint ce niveau |
| **Lancer les jeunes** | en championnat, jusqu'à trois de ses 21 ans et moins (marge d'au moins 5, moins de 25 titularisations en championnat, à 75 de condition ou plus), le mieux noté d'abord, chacun à l'un de ses postes où il vaut au plus 10 points de moins que le titulaire, le plus petit écart d'abord ; la coupe et l'Europe gardent le meilleur onze | il prolonge aussi les espoirs dont le potentiel atteint le niveau − 3, et laisse partir les 30 ans et plus sous le niveau − 2 |
| **Faire tourner l'effectif** (mesurée, non retenue : § 2.5) | il repose un fatigué dès 85 de condition (au lieu de 75), avec la même règle d'écart (5 points, plus 2 par point sous le seuil) | il prolonge jusqu'à 8 points sous le niveau (au lieu de 5), jusqu'à 32 ans |

Le niveau de l'effectif est la moyenne de ses 16 meilleurs (`squadStandard`). Les 25 titularisations, 2 250 minutes,
sont le plein effet du temps de jeu (§ 0.2) : au-delà, la consigne laisse jouer le meilleur. « Lancer les jeunes » a
aussi été mesurée plus prudente, deux jeunes par match à 6 points au plus (§ 2.3).

### 2.3 Mesures

Quinze clubs, trois saisons chacun, quatre règles (§ 5) :
- le jeu en ligne (« Meilleur onze ») ;
- « Lancer les jeunes » en deux réglages : écart de 6 points et deux jeunes par match, ou écart de 10 et trois jeunes ;
- « Faire tourner l'effectif ».

Ci-dessous, les moyennes des quinze clubs. L'écart à « Meilleur onze » est mesuré club par club, entre jumeaux, avec son
erreur type. « Jeunes » : les joueurs du club de 21 ans ou moins au 1er juillet de la saison, environ six par club et
par saison.

| Consigne | Points par match | Écart (erreur type) | Blessures en 3 saisons | Minutes de championnat d'un jeune, par saison | Jeunes à 900 min ou plus | Progression d'un jeune, par saison | Progression des jeunes du club, 3 saisons | Écart (erreur type) | Effectif à la fin |
|---|---|---|---|---|---|---|---|---|---|
| Meilleur onze (le jeu en ligne) | 1,462 | — | 16,2 | 364 | 14 % | +1,84 | +36,5 | — | 25,4 |
| Lancer les jeunes, écart 6, deux par match | 1,453 | −0,010 (0,010) | 16,4 | 695 | 29 % | +2,28 | +45,5 | +8,9 (1,3) | 24,7 |
| **Lancer les jeunes, écart 10, trois par match** | 1,449 | −0,014 (0,019) | 16,0 | 1 083 | 50 % | +2,90 | +57,7 | +21,1 (2,2) | 24,5 |
| Faire tourner l'effectif | 1,468 | +0,005 (0,014) | 16,6 | 424 | 16 % | +1,95 | +38,7 | +2,2 (0,5) | 26,3 |

- **« Lancer les jeunes », écart 10.**
  - Ses jeunes jouent trois fois plus (1 083 minutes de championnat par saison contre 364), la moitié d'entre eux à
    900 minutes ou plus.
  - Ils progressent 58 % plus vite : +21 points pour les jeunes d'un club en trois saisons. Ceux de la première saison
    restés au club gagnent 7,6 points en trois saisons, contre 5,0.
  - Le coût en points ne se distingue pas du bruit : −0,014 par match en moyenne, entre −0,05 et +0,02 à deux erreurs
    types. Au pire, moins de 2 points sur une saison de 38 matchs.
  - Club par club, de −0,18 à +0,12 : la même dispersion que « Faire tourner », qui ne change presque rien (de −0,06 à
    +0,18). Un club seul, sur trois saisons, ne dit pas le coût.
  - La consigne a donné à ses jeunes environ 67 titularisations de championnat de plus par saison.
- **Écart 6** : deux fois plus de minutes, +25 % de progression, aucun coût mesurable. Plus doux, et peu visible : 29 %
  des jeunes à 900 minutes.
- **« Faire tourner l'effectif » : rien de mesurable.**
  - Points (+0,005), blessures (16,6 contre 16,2) et progression (+2 points) ne bougent pas.
  - Le risque de blessure ne croît que sous 70 de condition, et la règle d'aujourd'hui (75) y laisse déjà peu de
    titulaires ; le jeu n'a pas de moral à ménager.
  - Ses contrats gardent un joueur de plus par saison (effectif de 26,3 contre 25,4).
- **Les contrats de « Lancer les jeunes »** : par club, sur les deux passages de saison, la consigne a décidé 4,5
  prolongations d'espoirs et 3,6 départs de trentenaires du bas de l'effectif, dont une partie que l'adjoint
  d'aujourd'hui aurait décidée aussi ; effectif de 24,5 en fin de mesure. Aucun club, quelle que soit la règle, n'a
  atteint 30 joueurs.

Le détail des quinze clubs est en annexe.

### 2.4 Faire compter le temps de jeu ?

- **Il compte déjà** (§ 0.2). Rien à proposer de ce côté.
- **Six cibles et clubs IA inchangés** : les consignes ne touchent que le club dirigé. La règle de progression ne change
  pas, ni le onze des clubs IA.
- **Deux limites de la règle d'aujourd'hui**, que je recommande de garder :
  - **La coupe et l'Europe ne comptent pas.** Les clubs IA n'y ont pas de statistiques. Les compter pour tous
    demanderait d'écrire leurs lignes à chaque match de coupe ; les compter pour le seul club dirigé l'avantagerait. La
    consigne fait donc jouer ses jeunes en championnat.
  - **Au-delà de 2 250 minutes, rien de plus.** La consigne s'arrête à 25 titularisations.

### 2.5 Recommandation

- **Deux consignes, pas trois** : « Meilleur onze » (par défaut) et « Lancer les jeunes ».
- **« Lancer les jeunes » réglée large** : écart de 10 points, trois jeunes par match, jusqu'à 25 titularisations
  chacun. Son effet se voit (trois fois plus de minutes, +58 % de progression), son coût ne se mesure pas. Réglée à
  6 points, elle ne coûte rien non plus, mais le joueur ne verrait presque pas la différence.
- **Pas « Faire tourner l'effectif »** : sans moral dans le jeu, et avec la rotation d'aujourd'hui, elle ne change rien
  de mesurable. Un choix qui ne fait rien n'aide pas le joueur. Une troisième consigne pourra venir d'un vrai besoin
  (le moral, s'il arrive un jour).
- **« Meilleur onze » reste la consigne par défaut**, même si l'autre ne coûte rien de mesurable : c'est le jeu
  d'aujourd'hui, les carrières en cours ne changent pas, et le choix revient au joueur.
- **Le texte de la consigne dit ce qu'elle fait, sans promettre de chiffre** : « Tes 21 ans et moins jouent en
  championnat si l'écart est faible ; il prolonge tes espoirs. »

### 2.6 Écrans

```
390 px, Club → Réglages, l'adjoint et sa consigne
┌──────────────────────────────────────────┐
│ RÉGLAGES                                 │
│ TON ADJOINT S'OCCUPE DE                  │
│ Composition                       [●  ]  │  ← settings-assistant-lineup, inchangé
│ Il aligne le meilleur onze avant chaque  │
│ match, dans ton dispositif.              │
│ Contrats                          [●  ]  │  ← settings-assistant-contracts, inchangé
│ Il prolonge les joueurs utiles et        │
│ laisse partir les autres.                │
│                                          │
│ SA CONSIGNE                              │  ← settings-assistant-policy, enregistrée au toucher
│ (•) Meilleur onze                        │
│     Les plus forts, reposés. Il prolonge │
│     les joueurs utiles.                  │
│ ( ) Lancer les jeunes                    │  ← mesuré : trois fois plus de minutes, +58 % de progression (§ 2.3)
│     Tes 21 ans et moins jouent en        │
│     championnat si l'écart est faible ;  │
│     il prolonge tes espoirs.             │
│                                          │
│ Langue  [■ Français ■] [ English ]       │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

```
390 px, la consigne quand l'adjoint ne fait ni le onze ni les contrats
┌──────────────────────────────────────────┐
│ SA CONSIGNE                              │
│ (•) Meilleur onze                        │  ← grisée, inactive
│ ( ) Lancer les jeunes                    │
│ Ton adjoint ne fait ni ton onze ni tes   │
│ contrats : sa consigne attendra que tu   │
│ lui en rendes un.                        │
└──────────────────────────────────────────┘
```

```
1280 px, Club → Réglages (colonne de droite de l'écran Club)
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ┌ RÉGLAGES ──────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ TON ADJOINT S'OCCUPE DE                           SA CONSIGNE                                      │ │
│ │ Composition                         [●  ]         (•) Meilleur onze                                │ │
│ │ Il aligne le meilleur onze avant chaque match.        Les plus forts, reposés.                     │ │
│ │ Contrats                            [●  ]         ( ) Lancer les jeunes                            │ │
│ │ Il prolonge les joueurs utiles, laisse partir         Tes 21 ans et moins jouent en championnat    │ │
│ │ les autres.                                           si l'écart est faible ; il prolonge          │ │
│ │                                                       tes espoirs.                                 │ │
│ └────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.7 Points à trancher

- **2.A Les consignes offertes** : je recommande deux, « Meilleur onze » et « Lancer les jeunes ».
- **2.B Le réglage de « Lancer les jeunes »** : je recommande 10 points d'écart et trois jeunes par match. Les 6 points
  et deux jeunes sont plus prudents, mais se voient peu.
- **2.C Les contrats suivent-ils la consigne ?** Je recommande oui : espoirs prolongés, trentenaires du bas de
  l'effectif laissés partir.
- **2.D La consigne par défaut** : je recommande « Meilleur onze », le jeu d'aujourd'hui.
- **2.E Dans une partie de défi** : je recommande de l'offrir comme ailleurs. Tous les joueurs du défi ont le même
  choix.

---

## 3. L'évolution des joueurs dans l'Effectif

### 3.1 Ce que gardent les données

- **La note ne bouge qu'au passage de saison** (§ 0.1). « La progression depuis le début de la saison » vaut donc 0
  toute la saison. Ce qui a du sens :
  - la progression de l'été (la note d'aujourd'hui contre celle de la saison passée) ;
  - pour un jeune, celle qui vient (son temps de jeu de la saison).
- **Le relevé de fin de saison** (`SeasonResult.highlights.squad`, `src/db/season-highlights.ts:18`) garde, depuis le
  18/11 :
  - la note et la valeur de chaque joueur du club dirigé à la fin de la saison, avant sa progression ;
  - ni potentiel, ni joueur vendu en cours de saison, ni joueur arrivé l'été, ni joueur d'un club IA ;
  - null pour une saison close avant le 18/11.

  Aucun écran ne lit encore cette partie du relevé.
- **Rien d'autre ne garde une note passée** : ni `PlayerSeasonStats`, ni l'archive, ni les transferts, ni l'histoire de
  la carrière. Les joueurs des clubs IA n'ont aucun historique.
- **Tout le reste est déjà là** : âge, note, potentiel, minutes de la saison. `getPlayerProfiles` somme les minutes de
  toutes les compétitions (`src/db/players.ts:190`) ; il faut un filtre de plus pour le seul championnat.

### 3.2 Ce que montre l'écran

- **Sur chaque ligne de l'Effectif**, dans la case de la note : « 71 ↑+4 », la progression de l'été. Vert vers le haut,
  rouge vers le bas, rien à 0. Un joueur acheté l'été montre la progression qu'il a faite à son ancien club. Un jeune de
  l'intersaison n'en a pas : il garde le badge « Jeune » d'aujourd'hui. Sur téléphone, « ↑+4 » est à droite du nom ;
  la tuile de 44 px (poste et note) n'a pas la place.
- **Sur chaque ligne aussi, la progression prévue** (décision 3) : « ↗ +3 prévu », pour un joueur qui a encore une
  marge (potentiel au-dessus de la note, moins de 29 ans au 1er juillet suivant).
  - Le calcul est celui de la vue « Jeunes » : la formule du § 0.1 sans le tirage, avec ses minutes de championnat
    prolongées à son rythme jusqu'à la fin de la saison (au prorata des matchs de championnat que le club a joués).
  - Elle change après chaque match du club, sans toucher au moteur : l'écran relit les minutes.
  - Rien quand elle arrondit à 0, ni pour un joueur sans marge (le déclin d'un trentenaire n'est pas « prévu » ici).
  - Sur téléphone, une troisième ligne de la carte ; au-dessus de 672 px, une colonne « Cet été », triable, avec la note
    et la forme dans le tableau à côté de la fiche.
- **Une phrase d'aide**, sous le résumé de l'Effectif : « Tes joueurs progressent l'été, d'autant plus qu'ils jouent en
  championnat. »
- **Une vue « Jeunes · 6 »**, qui filtre : un quatrième tri sur téléphone, une bascule au-dessus du tableau. On y voit :
  - les 21 ans et moins, seuls ;
  - pour chacun, la jauge de ses minutes de championnat, pleine à 2 250 ;
  - « ≈ +3 cet été » : la progression attendue s'il garde son rythme (la formule du § 0.1 sans le tirage, ses minutes
    projetées au prorata des matchs de championnat que le club a joués) ;
  - en tête, une phrase : ils progressent au passage de saison, d'autant plus qu'ils jouent en championnat.

  C'est le « repérage simple » demandé : qui progresse, et ce qui le fait progresser.
- **Sur la fiche**, une section « Progression » :
  - la courbe de la note, un point par saison terminée à ton club, puis la saison en cours ;
  - le potentiel et la marge ;
  - pour un joueur de 28 ans et moins, « Cet été, environ +3 », la jauge et les deux bornes, sans jouer et titulaire ;
    au-delà de 30 ans, le déclin attendu (« Cet été, environ −2 »).

  Pour un joueur d'un club IA (marché complet), « ↑+3 » seulement : une piste pour recruter.
- **Pas de prévision exacte.** Le tirage du passage de saison est déjà fixé par la graine (`progressionRngSeed`) : le
  montrer révélerait le résultat, et la retraite, tirée sur le même flux. L'écran dit « environ ».

### 3.3 Calcul ou migration, et poids d'une carrière

| Ce qu'on montre | Sans migration | Avec une migration d'ajout | Poids |
|---|---|---|---|
| « ↑+4 » sur chaque ligne | le relevé de la saison passée : joueurs du club dirigé à sa fin seulement ; rien avant le premier passage de saison après le 18/11 | `PlayerSave.previousOverall` (Int, null), écrit par l'`UPDATE` du passage de saison (`season.ts:231`), qui touche déjà chaque joueur : tous les joueurs, clubs IA compris | sans : 0 ; avec : ≈ 20 Ko par carrière, une fois (5 000 lignes × 4 octets), aucune écriture de plus, aucun index |
| Vue « Jeunes » et « ↗ +3 prévu » sur chaque ligne | âge, marge, minutes de championnat de la saison et matchs de championnat joués par le club : un filtre de compétition de plus dans la lecture existante, une requête de plus | — | 0 |
| Courbe de la fiche | les relevés de chaque saison terminée : la note, joueurs du club dirigé | une histoire de tous les joueurs | sans : 0 ; avec : 1,2 à 1,5 Mo par saison en lignes, ≈ 170 Ko en tableaux compacts (une carrière archivée prend ≈ 0,76 Mo par saison) |
| Potentiel sur la courbe | — | `potential` ajouté au relevé (champ facultatif, sans changer sa version) | ≈ 0,4 Ko par saison |

Je recommande :
- **« ↑ » par `previousOverall`**, avec le relevé pour le club dirigé tant que la colonne est vide (la première saison
  après la mise en ligne) ;
- **la courbe par les seuls relevés**, avec le potentiel ajouté au relevé ;
- **pas d'histoire** de tous les joueurs : elle doublerait la croissance d'une carrière pour une courbe que l'on regarde
  surtout chez ses jeunes, qui sont à son club.

Effet sur le poids d'une carrière : ≈ 20 Ko une fois, et 0,4 Ko par saison.

### 3.4 Écrans

```
390 px, Équipe → Effectif, cartes : l'été passé et l'été qui vient
┌──────────────────────────────────────────┐
│ EFFECTIF · 26 joueurs sur 30             │
│ Tes joueurs progressent l'été, d'autant  │  ← la phrase d'aide
│ plus qu'ils jouent en championnat.       │
│ [■ Poste ■] [ Note ] [ Contrats ]        │  ← les trois tris d'aujourd'hui (libellés abrégés ici)
│ [ Jeunes · 6 ]                           │  ← les 21 ans et moins seuls (maquette suivante)
│ ┌──────────────────────────────────────┐ │
│ │ [MC 71] Malo Garnier          ↑+4    │ │  ← l'été passé, en vert
│ │         19 ans · FRA · ▲ · ♥ 92      │ │
│ │         ↗ +3 prévu                   │ │  ← l'été qui vient, d'après ses minutes de championnat ; change après chaque match
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ [AG 69] Yanis Bekri           ↑+6    │ │
│ │         20 ans · MAR · ▲ · ♥ 88      │ │
│ │         ↗ +2 prévu                   │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ [MD 70] Enzo Perrin           ↓−1    │ │  ← 31 ans : le déclin, en rouge ; plus de marge, rien de prévu
│ │         31 ans · FRA · ► · ♥ 90      │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ [DC 63] Noé Lemaire     [Jeune]      │ │  ← jeune de l'intersaison : pas de note l'été passé ; le badge d'aujourd'hui
│ │         18 ans · FRA · ► · ♥ 100     │ │
│ │         ↗ +2 prévu                   │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ [G 76]  Sacha Vidal                  │ │  ← 28 ans : ni progression l'été passé, ni marge
│ │         28 ans · ESP · ▼ · ♥ 100     │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

```
390 px, Effectif, « Jeunes · 6 » : leur temps de jeu et l'été qui vient
┌──────────────────────────────────────────┐
│ [■ Jeunes · 6 ■]                         │  ← retouché : la liste complète revient
│ Les 21 ans et moins. Ils progressent     │
│ au passage de saison, d'autant plus      │
│ qu'ils jouent en championnat : plein     │
│ effet à 2 250 minutes.                   │
│ ┌──────────────────────────────────────┐ │
│ │ [MC 71] Malo Garnier          ↑+4    │ │
│ │         19 ans · potentiel 82        │ │
│ │         ▓▓▓▓▓▓░░░░ 1 240 min · ≈ +3  │ │  ← projection : son rythme jusqu'à la fin de la saison
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ [AG 69] Yanis Bekri           ↑+6    │ │
│ │         20 ans · potentiel 80        │ │
│ │         ▓▓▓░░░░░░░   610 min · ≈ +2  │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ [DC 63] Noé Lemaire       Nouveau    │ │
│ │         18 ans · potentiel 84        │ │
│ │         ░░░░░░░░░░     0 min · ≈ +2  │ │  ← titulaire, il en prendrait ≈ +7
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ Accueil  Équipe  Match  Marché  Club     │
└──────────────────────────────────────────┘
```

```
1280 px, Équipe → Effectif, le tableau (fiche fermée)
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ EFFECTIF · 26 joueurs sur 30                                                                           │
│ Tes joueurs progressent l'été, d'autant plus qu'ils jouent en championnat.                             │  ← la phrase d'aide, sous le résumé
│                                                                                                        │
│ Poste  Joueur          Âge  Note      Cet été     Pot.  Forme  Condition  Valeur    Contrat            │  ← « Cet été » : triable
│ MC     Malo Garnier     19  71 ↑+4    ↗ +3 prévu  82    ▲      ♥ 92       9,8 M€    2029               │
│ AG     Yanis Bekri      20  69 ↑+6    ↗ +2 prévu  80    ▲      ♥ 88       7,1 M€    2028               │
│ MD     Enzo Perrin      31  70 ↓−1                70    ►      ♥ 90       2,3 M€    2027               │
│ DC     Noé Lemaire      18  63        ↗ +2 prévu  84    ►      ♥ 100      4,2 M€    2029  [Jeune]      │
│ G      Sacha Vidal      28  76                    76    ▼      ♥ 100     12,5 M€    2030               │
│                                                                                                        │
│ [ Jeunes · 6 ] : les 21 ans et moins ; la jauge des minutes de championnat à la place de « Valeur ».   │
│ À côté de la fiche (536 px) : Poste, Joueur, Âge, Note (avec ↑), Cet été, Forme.                       │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

```
390 px, la fiche, section « Progression »
┌──────────────────────────────────────────┐
│ ┌ PROGRESSION ─────────────────────────┐ │
│ │ Note · à ton club                    │ │
│ │                                      │ │
│ │  72 ┤                       ● 71     │ │
│ │  68 ┤            ● 67                │ │
│ │  64 ┤  ● 63                          │ │
│ │     └──────────────────────────      │ │
│ │      2026-27  2027-28  2028-29       │ │  ← une note par saison terminée, puis la saison en cours
│ │ Potentiel 82 · marge 11              │ │
│ │                                      │ │
│ │ CET ÉTÉ, ENVIRON +3                  │ │  ← s'il garde ce rythme jusqu'en mai
│ │ Championnat ▓▓▓▓▓▓░░░░ 1 240 min     │ │
│ │ Sans jouer : +1 · titulaire : +3     │ │
│ │ Au-delà de 2 250 minutes de          │ │
│ │ championnat, il ne va pas plus vite. │ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### 3.5 Points à trancher

- **3.A La progression montrée sur la ligne** : je recommande celle de l'été, et non « depuis le début de la saison »,
  qui vaudrait 0 toute la saison.
- **3.B La migration `previousOverall`** : je la recommande (20 Ko par carrière). Sans elle, le seul relevé donne la
  progression des joueurs restés au club.
- **3.C La vue « Jeunes »**, avec la jauge et « ≈ +3 cet été » : je la recommande.
- **3.D La courbe** par les relevés, avec le potentiel ajouté au relevé : je la recommande, sans histoire de tous les
  joueurs.
- **3.F « ↗ +3 prévu » sur chaque ligne** (décision 3 du 25/11) : la vue « Jeunes » étendue à tout joueur qui a une
  marge, une phrase d'aide sous le résumé.
- **3.E Faire progresser en cours de saison** (au 1er janvier par exemple), pour que « depuis le début de la saison »
  ait un sens : je ne le recommande pas.
  - Il change le moteur pour tous les clubs : six cibles, clubs IA et défi à mesurer de nouveau.
  - Il ajoute une écriture des 5 000 joueurs par saison.
  - La vue « Jeunes » donne déjà, pendant la saison, ce que leur rapportera l'été.

---

## 4. Données, migrations, défi

- **Migrations d'ajout** :
  - `Save.assistantPolicy` (texte, `BEST` par défaut) ;
  - `PlayerSave.previousOverall` (Int, null).

  Aucun `UPDATE` des lignes existantes. Le relevé gagne un champ facultatif `potential` (`squad[]`), sans changer sa
  version.
- **La composition enregistrée seule** ne change ni le moteur ni les données (la comparaison du § 1.5 porte sur les
  valeurs).
- **Le défi de la semaine.**
  - « Meilleur onze » est la règle d'aujourd'hui : sans choix du joueur, aucune partie de défi ne joue autrement.
  - « Lancer les jeunes » y est offerte à tous, comme les autres réglages.
  - Le passage de saison n'a lieu qu'après les 10 journées du défi.

  Une mise en ligne en semaine ne changerait donc que les matchs des parties dont le joueur choisit la consigne. Je
  recommande un lundi quand même pour les consignes, avec un test de jumeaux : `BEST` rejoue à l'identique les matchs
  d'avant le changement. Le reste peut partir n'importe quel jour.

---

## 5. Mesures : méthode

- **Script de travail** (`scripts/_measure-consignes.ts`, jamais commité), sur le modèle de `measure:assistant`. Des
  jumeaux d'une partie 2, la graine de la démo et un propriétaire jetable chacun, jouent 3 saisons comme « Simuler » les
  joue (`playNextMatchday`), chacune suivie de `advanceToNextSeason`.
- **Les règles d'essai** :
  - `best` : le jeu tel qu'il est en ligne (l'adjoint, ses contrats) ;
  - `youth` : « Lancer les jeunes », écart de 6 points, deux jeunes par match ;
  - `youthplus` : la même règle, écart de 10 points, trois jeunes par match ;
  - `rotation` : « Faire tourner l'effectif ».

  Avant chaque match du club, la règle d'essai calcule le onze et l'enregistre comme le joueur le ferait
  (`saveManagedLineup`). Avant chaque passage de saison, elle pose le choix de contrat de chaque joueur concerné
  (`PlayerSave.contractChoice`), comme le joueur sur sa fiche. Elle décide donc sur la note d'avant la progression ;
  l'adjoint du jeu, lui, décide après.
- **Quinze clubs** de profils différents, chacun avec les quatre règles, sur douze bases locales en parallèle :
  - quatre du haut de première division : Manchester City, Lazio, Villarreal, Lyon ;
  - quatre du milieu : Werder Brême, Brentford, Valence, Rennes ;
  - deux du bas : Hoffenheim, Parme ;
  - cinq de deuxième division : Metz, Paderborn, Coventry, Huesca, Südtirol.

  Une saison se joue en 26 à 80 s, selon la charge.
- **Mesuré** : points par match de championnat, rangs, buts, blessures (nombre, jours), minutes de championnat de chaque
  joueur, sa note avant et après chaque passage de saison, les choix de contrat. Pour les jeunes des clubs IA (§ 0.4) :
  tous les joueurs de 23 ans et moins du monde, à chaque début de saison, dans le jumeau `best` de Lyon.
- **Limites.**
  - Une seule graine : celle de la démo.
  - Le club dirigé change de division (Parme descend dès la saison 1) : les points par match mêlent les deux.
  - Les jumeaux d'un club partagent les tirages de chaque match : les écarts entre règles sont bien moins bruités que
    les points eux-mêmes. L'erreur type est donnée avec chaque écart moyen.

---

## 6. Points à trancher, récapitulatif

Tout est validé le 25/11 tel quel, avec les précisions des décisions d'Alexis (3.F en plus).

| Point | Ma recommandation |
|---|---|
| 1.A Dispositif et consigne de départ prennent la main | non, comme aujourd'hui |
| 1.B « Annuler » | geste par geste, pendant la visite |
| 1.C L'orange de la Composition | « Jouer le match » de la colonne |
| 1.D Composition pendant un direct en attente | lecture seule, « Reprendre le match » |
| 1.E Deux onglets | comparaison des valeurs, sans migration |
| 1.F Éditeur du sélectionneur | même comportement |
| 2.A Consignes offertes | deux : « Meilleur onze » et « Lancer les jeunes » ; pas « Faire tourner l'effectif » |
| 2.B Réglage de « Lancer les jeunes » | 10 points d'écart, trois jeunes par match, 25 titularisations chacun |
| 2.C Les contrats suivent la consigne | oui |
| 2.D Consigne par défaut | « Meilleur onze », le jeu d'aujourd'hui |
| 2.E Partie de défi | la consigne y est offerte comme ailleurs |
| 3.A Progression montrée | celle de l'été (« ↑+4 »), pas « depuis le début de la saison » |
| 3.B `PlayerSave.previousOverall` | oui (≈ 20 Ko par carrière) |
| 3.C Vue « Jeunes » | oui : jauge des minutes et « ≈ +3 cet été » |
| 3.D Courbe | par les relevés de fin de saison, potentiel ajouté au relevé |
| 3.E Progression en cours de saison | non |
| 3.F « ↗ +3 prévu » sur chaque ligne | oui (décision 3 du 25/11), avec la phrase d'aide |

## 7. Ordre de construction et tests

1. **L'évolution des joueurs** (§ 3), sans toucher au moteur :
   - la migration `previousOverall` et son écriture au passage de saison ;
   - `expectedProgression` (pur, à côté de `progressPlayer`, qu'il réutilise sans le tirage) ;
   - la case de la note, la vue « Jeunes », la section de la fiche.

   Tests : la fonction (bornes, âges, minutes), la lecture des minutes de championnat, `team.spec.ts` à 1280, 390 et
   360 px.
2. **Les consignes** (§ 2) :
   - les règles pures : `selectAssistantLineup` avec la consigne, `contractOutcomes` avec elle ;
   - la migration, la section des Réglages, le rappel sur la Composition ;
   - la mesure passée dans `measure:assistant` (`--policy=`).

   Tests : `lineup.test.ts`, `assistant-contracts.test.ts`, des jumeaux en base (`BEST` identique au jeu d'avant), l'E2E
   des Réglages.
3. **La composition enregistrée seule** (§ 1) :
   - la file d'enregistrement du client (un réducteur pur, testé) ;
   - l'enregistrement conditionnel côté serveur, le refus pendant un direct ;
   - la ligne d'état ; le tutoriel, la mission et le guide ; les E2E.

   Tests en base : le conflit de deux onglets, le refus pendant un direct, le renvoi sans effet. E2E : deux onglets,
   le réseau coupé (mode hors ligne de Playwright), la lecture seule d'un direct, la Composition à 1280, 390 et 360 px.

---

## 8. Mise en œuvre (25 et 26/11)

Branche locale `effectif-adjoint` : le § 1 d'abord, puis les § 3 et § 2, construits en parallèle et repris par
`cherry-pick` (l'historique de `main` reste linéaire).

- **Migrations d'ajout** :
  - `20261125170000_previous_overall` : `ALTER TABLE "PlayerSave" ADD COLUMN "previousOverall" INTEGER;` ;
  - `20261125170100_assistant_policy` : `CREATE TYPE "AssistantPolicy" AS ENUM ('BEST', 'YOUTH');` puis
    `ALTER TABLE "Save" ADD COLUMN "assistantPolicy" "AssistantPolicy" NOT NULL DEFAULT 'BEST';`.

  Aucune ligne existante n'est réécrite ; le défaut constant est ajouté sans réécrire la table.
- **§ 1, comme prévu**, avec :
  - la file d'enregistrement pure (`save-queue.ts`), et `data-busy` sur la ligne d'état, que les E2E attendent ;
  - un état de plus, « Onze automatique · enregistré à ton premier changement », pour le sélectionneur ou un joueur qui
    n'a jamais enregistré sa composition ;
  - pendant un direct, « Reprendre le match » en orange sous 1024 px ; au-dessus, la colonne a l'orange ;
  - la suite « Enregistrer » du tutoriel retirée, et la bulle avec elle de sa « suite » (`followUp`), plus utilisée ;
  - la coupure du réseau simulée en refusant les seules Server Actions (`page.route`, comme hors ligne), plutôt qu'en
    mode hors ligne : le test ne coupe que les enregistrements.
- **§ 2, choix où le cahier était ouvert** :
  - la consigne en enum Prisma, comme les autres valeurs gardées, plutôt qu'en texte ;
  - le jeune de l'objectif Jeunesse passe d'abord et compte parmi les trois ;
  - les ventes proposées gardent leur règle.
- **§ 3, choix** :
  - « Jeunes » à l'âge affiché (21 ans et moins), « Under-21s » en anglais ;
  - la progression arrondie loin de zéro, « prévu » dès +1 ;
  - `progressPlayer` appelle `expectedProgression`, dans le même ordre d'opérations : une saison rejouée ne change pas.
- **Vérification de « Lancer les jeunes » sur le jeu** (26/11, `npm run measure:assistant -- --seasons=3
  --lineup=game --contracts=game --policy=…`, jumeau B, l'adjoint du jeu, moyennes de trois saisons) :

  | Club | Consigne | Pts / match | Minutes des 21 ans et moins, le club, par saison | Progression par jeune et par saison |
  |---|---|---|---|---|
  | Lyon | Meilleur onze | 1,80 | 3 853 | +2,00 |
  | Lyon | Lancer les jeunes | 1,78 | 7 215 | +2,95 |
  | Metz | Meilleur onze | 1,63 | 1 252 | +1,52 |
  | Metz | Lancer les jeunes | 1,68 | 7 524 | +2,71 |

  Environ 1 100 minutes par jeune et par saison, toutes compétitions, et une progression de 60 % plus rapide : ce que
  mesurait le prototype (§ 2.3 : 1 083 minutes, + 58 %). Les points restent dans le bruit d'un club seul.

---

## Annexe : les quinze clubs

Trois saisons de chaque jumeau, la graine de la démo. « Rangs » : en championnat, saison par saison (↑ montée,
↓ descente). « Min. d'un jeune » : minutes de championnat d'un joueur de 21 ans ou moins, par saison. « Progression des
jeunes » : la somme de leurs progressions aux trois passages de saison.

| Club (division, rang à la création) | Consigne | Pts/match | Écart | Rangs | Min. d'un jeune | Progression des jeunes |
|---|---|---|---|---|---|---|
| Manchester City (Angleterre D1, 3e) | Meilleur onze | 1,76 | — | 4, 7, 2 | 534 | +36 |
|  | Jeunes, écart 6 | 1,75 | −0,02 | 4, 7, 2 | 824 | +41 |
|  | Jeunes, écart 10 | 1,75 | −0,02 | 4, 7, 2 | 935 | +45 |
|  | Faire tourner | 1,77 | +0,01 | 3, 6, 2 | 671 | +42 |
| Lazio (Italie D1, 6e) | Meilleur onze | 1,76 | — | 1, 5, 11 | 364 | +36 |
|  | Jeunes, écart 6 | 1,74 | −0,03 | 1, 5, 11 | 513 | +42 |
|  | Jeunes, écart 10 | 1,71 | −0,05 | 2, 5, 11 | 845 | +50 |
|  | Faire tourner | 1,75 | −0,02 | 1, 6, 11 | 403 | +38 |
| Villarreal (Espagne D1, 5e) | Meilleur onze | 1,82 | — | 2, 7, 4 | 163 | +35 |
|  | Jeunes, écart 6 | 1,77 | −0,04 | 3, 8, 4 | 643 | +45 |
|  | Jeunes, écart 10 | 1,86 | +0,04 | 3, 7, 2 | 1049 | +55 |
|  | Faire tourner | 1,82 | 0,00 | 3, 9, 3 | 307 | +38 |
| Lyon (France D1) | Meilleur onze | 1,80 | — | 3, 3, 7 | 492 | +38 |
|  | Jeunes, écart 6 | 1,81 | +0,01 | 3, 3, 7 | 596 | +42 |
|  | Jeunes, écart 10 | 1,78 | −0,02 | 3, 3, 8 | 1017 | +56 |
|  | Faire tourner | 1,78 | −0,02 | 3, 3, 8 | 577 | +42 |
| Werder Brême (Allemagne D1, 8e) | Meilleur onze | 1,34 | — | 9, 9, 12 | 207 | +37 |
|  | Jeunes, écart 6 | 1,37 | +0,03 | 9, 9, 10 | 454 | +42 |
|  | Jeunes, écart 10 | 1,35 | +0,01 | 9, 9, 12 | 696 | +49 |
|  | Faire tourner | 1,35 | +0,01 | 9, 9, 12 | 226 | +39 |
| Brentford (Angleterre D1, 10e) | Meilleur onze | 1,19 | — | 16, 14, 12 | 308 | +38 |
|  | Jeunes, écart 6 | 1,19 | 0,00 | 16, 14, 12 | 383 | +39 |
|  | Jeunes, écart 10 | 1,18 | −0,02 | 16, 12, 14 | 691 | +46 |
|  | Faire tourner | 1,18 | −0,02 | 16, 14, 13 | 258 | +36 |
| Valence (Espagne D1, 12e) | Meilleur onze | 1,31 | — | 9, 11, 14 | 108 | +21 |
|  | Jeunes, écart 6 | 1,32 | +0,02 | 9, 9, 14 | 282 | +25 |
|  | Jeunes, écart 10 | 1,33 | +0,03 | 9, 9, 14 | 630 | +34 |
|  | Faire tourner | 1,31 | 0,00 | 9, 11, 14 | 237 | +25 |
| Rennes (France D1, 12e) | Meilleur onze | 1,20 | — | 10, 12, 15 | 327 | +40 |
|  | Jeunes, écart 6 | 1,15 | −0,05 | 11, 12, 15 | 630 | +50 |
|  | Jeunes, écart 10 | 1,13 | −0,07 | 10, 12, 15 | 960 | +67 |
|  | Faire tourner | 1,22 | +0,02 | 8, 12, 14 | 295 | +40 |
| Hoffenheim (Allemagne D1, 15e) | Meilleur onze | 0,96 | — | 11, 14, 17↓ | 322 | +37 |
|  | Jeunes, écart 6 | 0,97 | +0,01 | 11, 13, 16 | 501 | +43 |
|  | Jeunes, écart 10 | 1,00 | +0,04 | 11, 13, 16 | 1047 | +59 |
|  | Faire tourner | 0,95 | −0,01 | 11, 14, 16 | 350 | +37 |
| Parme (Italie D1, 16e) | Meilleur onze | 1,46 | — | 18↓, 4, 4 | 542 | +35 |
|  | Jeunes, écart 6 | 1,46 | +0,01 | 18↓, 4, 4 | 773 | +44 |
|  | Jeunes, écart 10 | 1,32 | −0,14 | 19↓, 5, 6 | 1190 | +61 |
|  | Faire tourner | 1,40 | −0,05 | 18↓, 5, 4 | 537 | +36 |
| Metz (France D2, 3e) | Meilleur onze | 1,63 | — | 5, 3, 7 | 179 | +32 |
|  | Jeunes, écart 6 | 1,51 | −0,12 | 5, 1↑, 14 | 702 | +47 |
|  | Jeunes, écart 10 | 1,68 | +0,05 | 5, 3, 5 | 1072 | +57 |
|  | Faire tourner | 1,68 | +0,05 | 5, 3, 5 | 243 | +34 |
| Paderborn (Allemagne D2, 4e) | Meilleur onze | 1,47 | — | 9, 8, 7 | 607 | +39 |
|  | Jeunes, écart 6 | 1,51 | +0,04 | 9, 5, 7 | 1114 | +53 |
|  | Jeunes, écart 10 | 1,49 | +0,02 | 9, 7, 7 | 1758 | +72 |
|  | Faire tourner | 1,47 | 0,00 | 10, 7, 7 | 642 | +43 |
| Coventry (Angleterre D2, 5e) | Meilleur onze | 1,38 | — | 3↑, 18↓, 14 | 216 | +33 |
|  | Jeunes, écart 6 | 1,41 | +0,02 | 3↑, 18↓, 12 | 815 | +46 |
|  | Jeunes, écart 10 | 1,50 | +0,12 | 8, 3↑, 15 | 1506 | +65 |
|  | Faire tourner | 1,57 | +0,18 | 4, 2↑, 18↓ | 304 | +33 |
| Huesca (Espagne D2, 8e) | Meilleur onze | 1,59 | — | 13, 5, 2↑ | 584 | +45 |
|  | Jeunes, écart 6 | 1,59 | 0,00 | 14, 5, 2↑ | 1199 | +63 |
|  | Jeunes, écart 10 | 1,40 | −0,18 | 14, 5, 16 | 1593 | +78 |
|  | Faire tourner | 1,53 | −0,06 | 15, 5, 3↑ | 655 | +48 |
| Südtirol (Italie D2, 10e) | Meilleur onze | 1,26 | — | 16, 9, 16 | 510 | +46 |
|  | Jeunes, écart 6 | 1,24 | −0,03 | 16, 8, 16 | 993 | +60 |
|  | Jeunes, écart 10 | 1,25 | −0,01 | 16, 8, 16 | 1253 | +71 |
|  | Faire tourner | 1,25 | −0,02 | 15, 10, 17 | 654 | +50 |
