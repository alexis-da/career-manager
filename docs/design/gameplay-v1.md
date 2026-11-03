# Gameplay v1 : moteur par segments, fatigue, suspensions, événements à choix, composition

Cahier rédigé le 03/11/2026 à partir de l'audit gameplay (branche `gameplay`, script `npm run measure:balance`). Source de vérité pour les chantiers G1 à G6. Les chiffres marqués « départ » sont des points de départ à calibrer avec le script, les « cibles » sont à atteindre.

## Objectifs

1. Le moteur réagit **pendant** le match : un rouge, une blessure, un changement ou une consigne comptent dès qu'ils arrivent.
2. Les décisions du manager pèsent : dispositif, fatigue, rotation, consignes, choix pendant le match.
3. Le jeu reste réaliste et la saison moins déséquilibrée.
4. Simuler et regarder donnent le même résultat quand le joueur fait les choix de l'adjoint.

## Cibles d'équilibrage (saison complète du monde 2, `measure:balance`)

| Mesure | Aujourd'hui | Cible |
|---|---|---|
| Buts par match | 3,00 | 2,6 à 2,8 |
| Nuls | 21,4 % | 24 à 27 % |
| Victoires à domicile | 47,1 % | 43 à 46 % |
| Écart 1er − dernier | 67 pts | 50 à 60 pts |
| Forme des onze en fin de saison | 5 à 94 | environ 30 à 75 |
| Le plus faible gagne (≥ 1 pt d'écart) | 20,2 % | 20 à 25 % |

Chaque chantier se termine par un tableau « avant / après » de ces mesures.

## Décisions de jeu (validées le 03/11)

- **Forme calmée** : variations plus petites et retour vers 50 à chaque match (départ : après le calcul habituel, `forme = 50 + (forme − 50) × 0,9`, gains et pertes divisés par 2). Bornes effectives visées 30–75.
- **Fatigue active dès maintenant** (colonne `fitness` existante, 0–100).
- **Moral** : reste inactif et **masqué** dans l'interface jusqu'à un chantier dédié.
- **Suspensions** : rouge = 1 match ; 5 jaunes en championnat = 1 match (compteur remis à zéro à chaque suspension et chaque saison). Coupe et championnat comptés séparément pour les jaunes ; un rouge suspend pour le prochain match officiel du club.
- **Dispositif avec un profil léger** (attaque / défense), visible dans la composition.
- **Consignes** (attitude) : Attaquer · Équilibré · Fermer, disponibles aux pauses et via les événements.
- **Événements à choix** : 1 à 3 par match pour le club dirigé, 4 familles, l'adjoint choisit en simulation.
- **Buts des événements pris sur ceux du club** (G4, validé le 03/11) : dans un match qui a des événements, les buts attendus du club dirigé sont multipliés par 0,89 (`OWN_GOALS_WITH_CHOICE_EVENTS`), pour que les événements décidés par l'adjoint ne lui rapportent rien de plus qu'au même club joué par l'IA.
- **« Rester tel quel » est la consigne Équilibré** (G4, validé le 03/11) : une consigne jusqu'à la fin du temps réglementaire, comme les autres options des réactions tactiques, et non « la règle de l'adjoint continue », qui rejouait le même match que Fermer ou Attaquer.

## G1 — Moteur par segments, profils de dispositif, consignes, forme calmée

- Un match = **6 segments de 15 minutes** (prolongation : 2 segments de 15). Chaque segment recalcule la force des deux équipes à son début (joueurs présents, postes, familiarité, forme, fatigue à partir de G2, consigne, dispositif), tire ses buts (Poisson de λ × 15/90), ses cartons et ses blessures, avec **son propre flux** (`…:s1` à `…:s6`, `…:e1`, `…:e2`).
- Conséquence voulue : un rouge, une blessure ou un remplacement compte à partir du segment suivant.
- **Profils de dispositif** (départ, multiplicateurs de l'attaque et de la défense de l'équipe) :

| Dispositif | Attaque | Défense |
|---|---|---|
| 3-4-3 | +5 % | −5 % |
| 4-3-3 | +3 % | −3 % |
| 4-2-3-1 | +2 % | −1 % |
| 4-4-2 | 0 | 0 |
| 3-5-2 | +1 % | −1 % |
| 4-1-4-1 | −2 % | +2 % |
| 5-3-2 | −5 % | +5 % |

- **Consignes** (multiplicateurs de λ sur les segments concernés) : Attaquer = match plus ouvert (plus de buts des deux côtés), Fermer = match plus fermé (moins de buts des deux côtés), Équilibré = 1. Départ : Attaquer λ propre × 1,15 et λ adverse × 1,15 ; Fermer λ propre × 0,80 et λ adverse × 0,80 (rééquilibrage du 03/11, la première version, Attaquer × 1,15 / × 1,10, rendait Attaquer rentable tout le match).
  - Critères (`measure:balance`, 20 000 matchs, l'adversaire suit la règle) : entre équipes égales, tout le match, Attaquer et Fermer à ±0,015 pt/match d'Équilibré ; mené à partir de la 60e, Attaquer > Équilibré ; mène d'un but à partir de la 75e, Fermer > Équilibré ; la règle de l'adjoint à 0,01 près de la meilleure variante.
  - **Retenu** : Attaquer λ propre × 1,13, λ adverse × 1,15 ; Fermer × 0,89 des deux côtés. Équipes égales : Attaquer −0,009, Fermer −0,004 face à Équilibré ; mené, Attaquer +0,007 à +0,008 ; mène d'un but, Fermer +0,006 à +0,007 ; aucune variante à plus de +0,005 de la règle.
  - **Principe retenu : le favori a intérêt à ouvrir, l'outsider à fermer.** Un match plus ouvert profite au plus fort, un match plus fermé au plus faible : une consigne est un choix de risque, pas un bonus. Le critère « favori (+5) : Fermer ≥ Attaquer ; outsider (−5) : Attaquer ≥ Fermer », qui disait l'inverse, était faux et il est retiré : aucun jeu de multiplicateurs ouvert/fermé ne l'atteint (recherche sur 2 401 combinaisons, modèle exact des buts).
  - Mesure sur le moteur final (03/11, fatigue en deux effets et suspensions comprises ; `measure:balance`, 20 000 matchs, l'adversaire suit la règle), écart à la règle de l'adjoint en pt/match : équipes égales, Équilibré tout le match −0,013, Attaquer −0,025, Fermer −0,025 ; règle sans Attaquer quand mené −0,008, sans Fermer quand il mène d'un but −0,005 ; meilleure variante essayée +0,005 (Fermer dès la 60e, quelle que soit l'avance). Favori (+5) : Attaquer tout le match +0,003, Fermer −0,037. Outsider (−5) : Fermer −0,001, Attaquer −0,045.
- **Règle de l'adjoint et des clubs IA** (la même fonction pure, de l'état du match) : mené à partir de la 60e → Attaquer ; mène d'un but à partir de la 75e → Fermer ; sinon Équilibré. Les clubs IA l'appliquent dans tous leurs matchs. Le club dirigé l'applique en simulation ; en direct, le joueur décide.
- Les clubs IA gardent leur 4-3-3.
- **Calibration** : ajuster la base 1,42, l'exposant 2,5 et le facteur domicile 1,15 pour atteindre les cibles. Forme calmée dans ce même chantier. **Retenu** : base 1,14, exposant 2,4, domicile 1,12 ; forme : variations divisées par 2 et rétention 0,94 (0,9 laissait les onze entre 40 et 67). Saisons du monde 2 : 2,65 buts, 24,6 % de nuls, 44,2 % à domicile, 55 pts d'écart, 23,2 % de victoires du plus faible, onzes de 35 à 76.
- Les parties existantes passent au nouveau moteur sans marquage : leurs matchs futurs changent, ce qui est acceptable. Un match en cours de direct au moment du déploiement (`liveState` v1) doit pouvoir se terminer : reprise de la 2e période avec le nouveau moteur (segments 4 à 6).
- `match-fingerprint.test.ts` et la calibration de `match.test.ts` sont mis à jour, et la calibration doit tourner aussi sur une saison avec forme (pas seulement à forme 50).

## G2 — Fatigue

- **Avant le match** : multiplicateur de la part du joueur `1 − 0,003 × (100 − fitness)` (départ ; 70 → 0,91).
- **Pendant le match** : chaque segment joué retire 5 points aux joueurs de champ et 1,5 au gardien (départ). Un titulaire finit donc autour de fitness − 30 ; un remplaçant entré à la 60e est frais. C'est ce qui donne de la valeur aux changements à 60–75'.
- **Après le match** : le joueur garde sa fitness de fin de match. **Récupération** : +7 par jour jusqu'à 100 (départ). Cibles : un titulaire de toutes les rencontres démarre le 2e match d'une semaine à deux matchs autour de 85, trois matchs en 8 jours autour de 75 ; récupération complète en 5 à 6 jours.
- **Risque de blessure** multiplié quand fitness < 70 (départ : × (1 + (70 − fitness) / 30)).
- **Retenu (03/11)** : l'usure par quart d'heure de départ (5 et 1,5), le risque de blessure de départ et la récupération à **5 par jour** (7 rendait 91 au 2e match de la semaine) : 85 au 2e match d'une semaine à deux matchs, 75 au 3e de trois matchs en 8 jours, frais six jours après un match entier. Les clubs IA sortent le plus fatigué aux minutes de changement de leur flux (55–85, gardé).
- **Deux effets séparés (second réglage du 03/11).** Un seul coefficient sur la fitness du moment (0,003, base 1,16) pesait trop avant le match (un onze à 85 : −0,20 pt/match) et trop peu pendant (un remplaçant frais à la 60e : +0,007 à +0,009). Retenu :
  - **fraîcheur**, la fitness au coup d'envoi : `1 − 0,0015 × (100 − fitness)` (`STRENGTH_PER_FITNESS_POINT`, la moitié du départ ; 70 → 0,955) ; un onze à 85 −0,097 pt/match (cible environ −0,10), à 75 −0,164 ;
  - **usure**, l'écart entre la fitness au coup d'envoi et la fitness actuelle : `1 − 0,011 × écart` (`STRENGTH_PER_WEAR_POINT`), lu au début de chaque segment ; un joueur de champ a perdu 20 points à la 60e, part × 0,78 ; un milieu frais du même niveau entré à la 60e +0,034 pt/match, un attaquant +0,034 (cible +0,02 à +0,04) ; dans un onze à 75, l'attaquant frais +0,038 ;
  - **base des buts 1,23** (1,16) : le gardien s'usant trois fois moins vite que ses partenaires, la défense résiste mieux que l'attaque en fin de match. Limite connue : les buts baissent au fil du match (à équipes égales, −19 % au dernier quart d'heure face au premier), quand le vrai football en marque plus en fin de match ; piste pour plus tard, une usure qui pèse aussi sur la défense, ou des événements de fin de match (G4).
  - Saisons du monde 2 : 2,64 buts, 24,7 % de nuls, 44,0 % à domicile, 54,8 pts d'écart, 23,3 % de victoires du plus faible, onzes de 36,7 à 71,5 en fin de saison ; titulaires IA à 96,9 de fitness en moyenne au coup d'envoi (92,6 en novembre), 0,7 % sous 75, 2,5 joueurs mis au repos par club et par saison.
- **Clubs IA** : composition qui écarte un joueur sous 75 si le remplaçant n'a pas plus de 5 points de moins ; changements automatiques des plus fatigués entre la 60e et la 75e.
- Affichage partout où l'on choisit des joueurs : barre ou pourcentage de fitness (composition, banc, effectif, panneau Coaching, fiche). Le moral est retiré de l'affichage.

### Buts en fin de match (03/11)

- Constat : avec la fatigue, les buts baissaient au fil du match (à équipes égales, 18,1 / 17,7 / 17,0 / 16,0 / 16,5 / 14,7 % des buts du premier au dernier quart d'heure), le gardien s'usant trois fois moins vite que ses partenaires. Cible : environ 13 à 15 % sur 0-15', 20 à 22 % sur 75-90', sans creux marqué entre les deux ; même logique en prolongation.
- **Retenu** : un facteur de temps sur λ, le plus lisible, sans toucher à l'usure ni au gardien : un poids par quart d'heure, `REGULATION_GOAL_WEIGHTS` = 0,76 · 0,86 · 0,96 · 1,02 · 1,02 · 1,38 (le dernier avec les arrêts de jeu), et par période de prolongation, `EXTRA_TIME_GOAL_WEIGHTS` = 0,9 · 1,1 ; chaque liste a pour moyenne 1. Il donne la montée du vrai football (jambes fatiguées, équipes qui poussent, arrêts de jeu) et compense l'usure plus lente du gardien.
- Résultat (équipes égales, 20 000 matchs) : 13,8 / 15,3 / 16,4 / 16,6 / 17,2 / 20,6 % ; prolongation 50 / 50 → 44,9 / 55,1 %. Épinglé dans `match.test.ts` (12-16 % puis 19-23 %, sans creux) et `match-cup.slow.test.ts`.
- Usure 0,011 → **0,010** : le remplaçant frais joue désormais les quarts d'heure les plus riches en buts et valait +0,041 ; il vaut +0,039 (milieu) et +0,037 (attaquant). Onze à 85 au coup d'envoi −0,094, à 75 −0,159. Base des buts inchangée (1,23). Six cibles : 2,65 buts, 24,4 % de nuls, 44,1 % à domicile, 56,0 points d'écart, onzes de 35,2 à 72,0, 23,2 % de victoires du plus faible. Le test des 600 matchs est inchangé.

## G3 — Suspensions (migration d'ajout)

- Stockage : de quoi savoir qu'un joueur est suspendu pour le prochain match officiel et compter ses jaunes en cours (colonnes ajoutées sur `PlayerSave`, sans perte de données). Calcul pour les clubs IA aussi.
- Un joueur suspendu est indisponible comme un blessé : composition, composition automatique, IA, avertissement avant match.
- Affichage : pastille « Suspendu » et « 4 jaunes · risque » dans l'effectif, la composition, la fiche, l'Accueil (liste « À faire »).
- **Retenu (03/11)** :
  - Migration `20261103132712_suspensions` : cinq colonnes `INTEGER NOT NULL DEFAULT 0` sur `PlayerSave` (`leagueYellows`, `cupYellows`, `suspendedMatches`, `suspendedLeagueMatches`, `suspendedCupMatches`), rien d'autre : ni perte ni réécriture, les parties existantes partent sans jaune ni suspension.
  - Règles (`src/engine/discipline.ts`, pur ; `YELLOWS_PER_SUSPENSION` 5, `SUSPENSION_MATCHES` 1), après chaque match, pour tous les joueurs des deux clubs, clubs IA compris : un rouge suspend pour le prochain match officiel du club, quelle que soit la compétition ; le 5e jaune d'une compétition suspend pour le prochain match **de cette compétition** et remet son compteur à 0 ; un exclu ne compte pas les jaunes de son match (deux jaunes valent un rouge, donc une suspension) ; un suspendu purge le match de son club sans jouer, blessé ou non ; à chaque saison, les jaunes repartent de 0 et une suspension non purgée se reporte.
  - Indisponible comme un blessé (`isAvailable`) : composition résolue (le titulaire enregistré est remplacé pour ce match), composition automatique, banc, rotation des clubs IA ; la composition avertit, la liste « À faire » nomme les titulaires suspendus et les joueurs à 4 jaunes.
  - Affichage : « Suspendu » en rouge, « Suspendu en coupe / en championnat » quand la suspension vise l'autre compétition, « 4 jaunes » et « 4 jaunes en coupe » en ambre (sans « · risque », le libellé suffit), dans l'effectif, la composition (liste, et un carton sur le terrain et le banc) et la fiche ; en anglais « Suspended », « Cup ban », « League ban », « 4 yellows », « 4 cup yellows ».
  - Mesure (`measure:balance`, saisons du monde 2) : 10,8 matchs de suspension purgés par club IA et par saison, 3,4 après un rouge, 7,4 après cinq jaunes. Six cibles, avant (G2, un seul coefficient de fatigue) → après :

| Mesure | Avant | Après | Cible |
|---|---|---|---|
| Buts par match | 2,64 | 2,64 | 2,6 à 2,8 |
| Nuls | 25,0 % | 24,7 % | 24 à 27 % |
| Victoires à domicile | 44,1 % | 44,0 % | 43 à 46 % |
| Écart 1er − dernier | 54,8 pts | 54,8 pts | 50 à 60 pts |
| Forme des onze en fin de saison | 35,1 à 75,3 | 36,7 à 71,5 | environ 30 à 75 |
| Le plus faible gagne (≥ 1 pt d'écart) | 23,3 % | 23,3 % | 20 à 25 % |

## G4 — Événements à choix : moteur (migration d'ajout)

- **Quand** : uniquement pour le club dirigé, aux limites de segments (15', 30', 60', 75', et 105' en prolongation). La mi-temps reste une pause normale.
- **Combien** : 1, 2 ou 3 par match (35 / 45 / 20 %), tirés avec un flux dédié `…:events`. Le type est tiré parmi les événements **possibles dans l'état du match** au moment voulu.
- **Effets** : uniquement ce que le moteur sait lire — un multiplicateur de λ sur le ou les segments suivants, un incident direct (but, carton, blessure) tiré dans le flux de l'événement (`…:event:N`), un changement de joueur ou de consigne. Aucun flux existant n'est décalé.
- **Adjoint** : une fonction pure de l'état, la même en direct (bouton « Choix de l'adjoint » mis en avant) et en simulation.

### Catalogue v1

| Famille | Événement | Condition | Choix | Effet (départ) | Adjoint |
|---|---|---|---|---|---|
| Coups de pied arrêtés | Penalty pour toi | tiré au hasard | choisir le tireur parmi 3, avec % de réussite affiché | but selon la formule `shootoutChance` | meilleur % |
| Coups de pied arrêtés | Coup franc dangereux | — | Frapper / Jouer en combinaison | Frapper : but à 8–18 % selon tir du tireur et gardien adverse ; Combinaison : λ × 1,10 sur le segment suivant | Frapper si le meilleur tireur ≥ 75 |
| Discipline et arbitre | Joueur averti qui s'énerve | un de tes joueurs a un jaune, à partir de 30' | Le sortir / Le garder | Garder : 25 % de rouge dans le segment suivant | sortir s'il reste un changement |
| Discipline et arbitre | Échauffourée | — | Calmer tes joueurs / Protester | Protester : 50 % λ × 1,08 au segment suivant, 30 % de jaune au capitaine | calmer |
| Blessures et coups durs | Joueur touché | — | Le sortir / Le laisser jouer | Laisser : part × 0,75 jusqu'à la fin, 35 % de blessure aggravée (7–21 jours) | sortir s'il reste un changement |
| Blessures et coups durs | Joueur à bout | un de tes joueurs < 55 de fitness en match (après G2) | Le remplacer / Le garder | Garder : il continue fatigué, risque de blessure accru | remplacer |
| Réactions tactiques | Tu mènes, fin de match | mène d'1 ou 2 buts, 60' ou 75' | Fermer le jeu / Chercher le break / Rester tel quel | consigne sur les segments restants | règle de l'adjoint |
| Réactions tactiques | Tu es mené ou à égalité | 60' ou 75' | Tout pour l'attaque / Rester en place | consigne sur les segments restants | règle de l'adjoint |

- Les effets chiffrés sont calibrés pour qu'aucun choix ne soit toujours le meilleur et que le choix de l'adjoint soit raisonnable sans être optimal partout. Mesure à fournir : effet moyen de chaque choix en points par match.
- **Anti-rechargement et cohérence** (exigences tirées de l'audit) :
  - le choix est écrit dans une transaction avant le calcul du segment suivant ;
  - la reprise dit **quelle pause** elle valide (phase et minute) et refuse sinon ;
  - mise à jour conditionnelle sur l'état de la pause, pour bloquer deux reprises simultanées (deux onglets) ; plus de doublons possibles dans `MatchEvent` ;
  - le navigateur ne reçoit jamais les segments au-delà de la prochaine pause.
- **Stockage** : la pause et l'événement en attente dans `Fixture.liveState` (schéma Zod étendu, `version` 2) ; l'historique des choix gardé après le match (nouveau type de `MatchEvent` ou table dédiée, migration d'ajout) pour le fil du match et la feuille de match.

### Retenu (03/11, validé avec ses choix)

- **Moteur** (`src/engine/choices.ts`, pur ; valeurs dans `balance.ts`) : le plan au coup d'envoi (flux `…:events` : 1, 2 ou 3 limites parmi 15', 30', 60', 75', 35 / 45 / 20 %, et 105' une prolongation sur deux) ; à chaque limite prévue, le type parmi ceux possibles et ses joueurs (flux `…:event:15`), puis l'issue (flux `…:event:15:outcome`, trois tirages, les mêmes quelle que soit l'option : un meilleur tireur ne fait que changer un raté en but). Aucun autre flux n'est décalé. Les incidents immédiats sont datés de la minute suivante, comme un remplacement de mi-temps ; les autres passent par `MatchState.modifiers` (buts du segment suivant, consigne jusqu'à la fin du temps réglementaire, rouge ou blessure d'un joueur nommé à une minute tirée).
- **« Joueur à bout »** : celui qui a perdu le plus de fitness sur le terrain, au moins 25 points, à partir de 75'.
- **Valeurs retenues** (départ → retenu) et choix de l'adjoint :

| Événement | Poids | Options et effets retenus | Adjoint |
|---|---|---|---|
| Penalty pour toi | 3 | le tireur parmi les trois meilleurs, chance `shootoutChance` affichée | la meilleure chance |
| Coup franc dangereux | 12 | Frapper : 8 à 18 % selon le tir et le gardien ; Combiner : buts du segment suivant × 1,10 → **× 1,5** | frapper à partir de 75 de tir |
| Joueur averti qui s'énerve (à partir de 30') | 14 | Le sortir (remplacement) ; Le garder : rouge dans le segment suivant 25 % → **12 %** | le sortir |
| Échauffourée | 10 | Calmer : rien ; Protester : 50 % buts × 1,08 au segment suivant, 30 % jaune au capitaine (le meilleur de champ ; rouge s'il était averti) | calmer |
| Joueur touché | 12 | Le sortir ; Le laisser jouer : part × 0,75 → **× 0,85** jusqu'à sa sortie, blessure 7-21 jours dans la suite 35 % → **25 %** | le sortir |
| Joueur à bout (à partir de 75') | 20 | Le remplacer ; Le garder : blessure dans la suite 15 % → **10 %** | le remplacer |
| Tu mènes, fin de match (+1 ou +2, 60' ou 75') | 24 | Fermer (Fermer), Chercher le break (Attaquer), Rester tel quel (**Équilibré**), jusqu'à la fin du temps réglementaire quel que soit le score | Fermer si un but d'avance à 75', sinon rester |
| Tu es mené ou à égalité (60' ou 75') | 24 | Tout pour l'attaque (Attaquer), Rester en place (**Équilibré**) | attaquer si mené |

- « Rester » était d'abord « la règle de l'adjoint continue » : à 75', un but d'avance, il jouait exactement le même match que Fermer, et mené à 75' le même qu'Attaquer. C'est maintenant une consigne, Équilibré, et les options jouent toujours des matchs différents.
- **Les buts des événements sont pris sur ceux du club** (`OWN_GOALS_WITH_CHOICE_EVENTS` = 0,89 sur ses buts attendus, à chaque segment d'un match qui a des événements) : sans cela, un penalty ou un coup franc ajoutaient des buts, et les événements décidés par l'adjoint rapportaient +0,11 point par match au club dirigé (environ 4 points par saison face au même club joué par l'IA). Effet net mesuré : −0,002 à équipes égales, −0,008 en favori, −0,002 en outsider.
- **Nombre et types** (`measure:balance`, 20 000 matchs, équipes égales) : 1,85 événement par match (1 : 34,9 %, 2 : 45,5 %, 3 : 19,6 %) ; penalty 5,8 %, coup franc 23,1 %, averti 8,4 %, échauffourée 19,4 %, joueur touché 22,8 %, joueur à bout 5,3 %, tu mènes 4,6 %, tu es mené ou à égalité 10,6 % ; 50,6 % des prolongations ont un événement à 105'.
- **Chaque option contre celle de l'adjoint** (pts/match où l'événement est venu, chaque option jouée de l'état même jusqu'au coup de sifflet ; égal 70-70, favori 75-70, outsider 65-70, banc faible : remplaçants 12 points sous les titulaires) :

| Événement | Option | Égal | Favori | Outsider | Banc faible |
|---|---|---|---|---|---|
| Penalty | 2e tireur | −0,012 | −0,006 | −0,007 | −0,013 |
| Coup franc | Frapper (contre Combiner) | +0,002 | adjoint | −0,002 | +0,002 |
| Coup franc | Combiner (contre Frapper) | adjoint | −0,015 | adjoint | adjoint |
| Averti | Le garder | −0,019 | −0,026 | −0,017 | −0,005 |
| Échauffourée | Protester | +0,003 | +0,003 | +0,001 | +0,002 |
| Joueur touché | Le laisser jouer | −0,018 | −0,022 | −0,016 | +0,008 |
| Joueur à bout | Le garder | −0,015 | −0,016 | −0,010 | −0,005 |
| Tu mènes | Fermer | +0,015 | +0,014 | +0,025 | +0,012 |
| Tu mènes | Chercher le break | −0,049 | −0,038 | −0,047 | −0,068 |
| Tu mènes | Rester tel quel | −0,008 | −0,002 | −0,008 | −0,004 |
| Mené ou égalité | Tout pour l'attaque | −0,004 | +0,013 | −0,005 | −0,010 |
| Mené ou égalité | Rester en place | −0,009 | −0,007 | −0,009 | −0,006 |

- Lecture : le coup franc se joue selon le tireur et la force (frapper paie au favori, combiner à l'outsider) ; garder un joueur touché vaut mieux avec un banc faible, garder un averti ou un joueur à bout s'en approche ; attaquer quand on court après le score paie au favori, pas à l'outsider (le principe de G1). L'adjoint n'est jamais à plus de 0,025 point de la meilleure option en moyenne, mais il n'est pas optimal partout : fermer dès qu'on mène (jusqu'à +0,025 pour l'outsider), attaquer en favori quand on court après le score (+0,013) valent un peu mieux que sa règle.
- **Découpage des envois** : le serveur joue un segment à la fois (`advanceLiveMatch`) ; la page demande le suivant quand son horloge arrive à la limite, une fois par pause, et n'a jamais que ce qui est joué. Sauter (« Aller au résultat ») ou le mouvement réduit demandent tout ce qui précède la prochaine pause de jeu (mi-temps, fin du temps réglementaire d'une coupe nulle) ou la fin, l'adjoint décidant en chemin : ce que le joueur ne regarde pas, il ne peut plus le changer. Avec la pause à la demande de G5, rien ne change côté serveur : un segment n'est jamais joué avant que la limite d'avant soit passée sans demande de pause. Le libellé du saut n'annonce plus la pause de la 90e (il annonçait un nul avant qu'il soit joué).
- **Anti-triche et cohérence** : la reprise nomme sa pause (phase et minute) et la refuse sinon (`PauseMismatchError`) ; la partie est verrouillée (`lockSave`) et la pause réclamée par une mise à jour conditionnelle sur `liveState` : de deux reprises simultanées, la seconde n'écrit rien ; la décision est écrite (`MatchDecision`, (fixtureId, sequence) unique) avant que la suite soit jouée, dans la même transaction. Testé en base : deux reprises à la fois, une pause déjà jouée, une décision non proposée, des changements hors d'une pause de jeu.
- **Stockage** : `liveState` version 2 (minutes jouées, événements, effets à venir) ; un direct de version 1, à la mi-temps ou à la fin du temps réglementaire, se termine encore, sans événements. Migration d'ajout `20261103190318_choice_events` : les énumérations `ChoiceKind` et `ChoiceOption`, la valeur `IN_PLAY` de `FixtureStatus`, la table `MatchDecision` (séquence, minute, type, option, choix de l'adjoint ou non, joueur concerné), ses index et ses clés en cascade.
- **Simulation** : l'adjoint décide avec la même fonction pure (`assistantChoices`), et regarder le match en prenant ses décisions donne exactement le même match (test des 600 matchs, à travers l'état stocké à chaque pause).
- **Six cibles** (saisons du monde 2) : 2,65 buts, 24,4 % de nuls, 44,2 % à domicile, 56,0 points d'écart, onzes de 35,2 à 73,8, 23,2 % de victoires du plus faible : inchangées, les événements ne touchant que les matchs du club dirigé.
- **Limites** : le meilleur tireur de penalty est toujours le meilleur choix (le pourcentage est affiché : le choix est d'information) ; quand on mène, fermer le jeu vaut toujours un peu mieux que les autres options (une consigne qui ferme le match protège une avance, par construction des consignes de G1) ; l'échauffourée ne pèse presque rien (±0,003). Les mesures sont faites sur des équipes synthétiques ; avec de vrais effectifs, plus inégaux, garder un joueur fort compte davantage.

## G5 — Événements à choix : interface du direct

- Pause d'événement : le direct s'arrête, carte d'événement (titre, situation en une phrase, 2 ou 3 choix avec leur conséquence en mots simples, le choix de l'adjoint signalé), puis reprise.
- Panneau Coaching : il devient disponible **à chaque pause** (mi-temps et événements) et aussi à la demande : le bouton « Coaching » demande une pause à la **prochaine limite de segment**. Remplacements : 5 maximum, en 3 fenêtres plus la mi-temps (règle réelle). Consignes Attaquer / Équilibré / Fermer.
- Le fil du match affiche les décisions prises et leur effet (« Tu as protesté : Mendy averti »).
- Une seule action orange par écran, textes FR et EN.

## G6 — Composition plus claire

- **État des joueurs** partout dans la composition (terrain, banc, liste) : fitness, forme (flèche), blessé, suspendu, jaunes à risque.
- **Poste** : sur chaque joueur placé, la note au poste et l'écart à sa note (« 71 → 65 »), avec un libellé simple : À son poste · Poste secondaire · Dépanne · Hors poste.
- **Faire un changement** : toucher un poste ouvre une liste des candidats triée par note **à ce poste**, avec leur état ; un toucher suffit pour placer ou échanger. Le glisser-déposer reste sur ordinateur.
- **Dispositif** : sous le choix du dispositif, son profil (attaque / défense) et la **force d'attaque et de défense du onze actuel**, recalculées à chaque modification avec la formule du moteur (fatigue et postes compris), à côté de celles du prochain adversaire.
- « Composition automatique » tient compte de la fatigue et des suspensions.

## Ordre et méthode

G1 → G2 → G3 → G4 → G5 → G6, chacun sur la branche `gameplay`, avec la méthode habituelle : un commit par changement cohérent, tsc + lint + Vitest verts à chaque commit, E2E complets en fin de chantier, `measure:balance` avant/après pour G1, G2, G3 et G4, migrations d'ajout uniquement, base locale, rien contre Neon, rien de poussé sans demande explicite, textes FR et EN.
