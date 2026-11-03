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
  - Critère abandonné : « favori (+5) : Fermer ≥ Attaquer ; outsider (−5) : Attaquer ≥ Fermer ». Un match plus ouvert profite toujours au plus fort et un match plus fermé au plus faible : aucun jeu de multiplicateurs ouvert/fermé ne l'atteint avec des équipes égales neutres (recherche sur 2 401 combinaisons, modèle exact des buts). Avec les valeurs retenues, le favori perd 0,035 point avec Fermer plutôt qu'Attaquer, l'outsider en gagne 0,046.
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
- **Retenu (03/11)** : les valeurs de départ, sauf la récupération, **5 par jour** (7 rendait 91 au 2e match de la semaine) : 85 au 2e match d'une semaine à deux matchs, 75 au 3e de trois matchs en 8 jours, frais six jours après un match entier. Base des buts 1,16 (1,14) pour garder les cibles. Les clubs IA sortent le plus fatigué aux minutes de changement de leur flux (55–85, gardé). Saisons du monde 2 : 2,64 buts, 25,0 % de nuls, 44,1 % à domicile, 55 pts d'écart, 23,3 % de victoires du plus faible ; titulaires IA à 96,8 de fitness en moyenne au coup d'envoi (92,3 en novembre), 0,7 % sous 75, 2,6 joueurs mis au repos par club et par saison. Effets : un onze à 85 −0,20 pt/match, à 75 −0,34 ; un remplaçant frais à la 60e +0,007 à +0,009 (+0,017 dans un onze à 75).
- **Clubs IA** : composition qui écarte un joueur sous 75 si le remplaçant n'a pas plus de 5 points de moins ; changements automatiques des plus fatigués entre la 60e et la 75e.
- Affichage partout où l'on choisit des joueurs : barre ou pourcentage de fitness (composition, banc, effectif, panneau Coaching, fiche). Le moral est retiré de l'affichage.

## G3 — Suspensions (migration d'ajout)

- Stockage : de quoi savoir qu'un joueur est suspendu pour le prochain match officiel et compter ses jaunes en cours (colonnes ajoutées sur `PlayerSave`, sans perte de données). Calcul pour les clubs IA aussi.
- Un joueur suspendu est indisponible comme un blessé : composition, composition automatique, IA, avertissement avant match.
- Affichage : pastille « Suspendu » et « 4 jaunes · risque » dans l'effectif, la composition, la fiche, l'Accueil (liste « À faire »).

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
