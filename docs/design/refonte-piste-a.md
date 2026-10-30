# Refonte visuelle — piste A « Match de nuit »

Référence : maquettes validées le 30/10/2026 (artefact « Late Winner — Pistes de design », pages Téléphone et Ordinateur). Ce document est la source de vérité pour la refonte ; les noms de clubs des maquettes sont des exemples, l'interface affiche les vraies données du jeu.

## Règles du chantier

- **Interface seulement** : aucune migration, aucune modification du moteur de match, de la simulation ou des règles économiques. Si un écran a besoin d'une donnée absente, on la calcule à partir de l'existant ou on la signale, sans toucher au schéma.
- **Bilingue** : chaque nouveau texte va dans les fichiers de messages FR et EN (test d'égalité des clés). Tutoiement en français.
- **Téléphone d'abord** (390 px), puis ordinateur à partir de 1024 px.
- Les E2E existants doivent continuer à passer ; les sélecteurs cassés par la refonte sont mis à jour, pas supprimés.
- Pas de dégradé décoratif, pas de bordure gauche colorée comme marqueur, icônes en SVG (pas d'emoji ni de glyphes).

## Jetons

| Rôle | Valeur |
|---|---|
| Fond | `#0B1340` |
| Cartes | `#16205A` |
| Bordures, ligne mise en avant | `#2A3678` |
| Fond de navigation | `#0E1850` (bordure `#1C2766`) |
| Bleu principal (cartes héros, état actif) | `#1F3BFF` |
| Orange (action principale, onglet actif, ton club) | `#FF9F1C` (survol `#FFB54D`) |
| Accent secondaire | `#8FA0FF` |
| Texte secondaire | `#B9C1E6` ; texte sur bleu `#DCE2FF` |
| Texte sur orange | `#0B1340` |

- Titres et chiffres : **Barlow Condensed 800 italique, en majuscules**. Texte courant : **Barlow** 400–700.
- Rayons : 999 px (pastilles), 12–14 px (boutons, lignes), 22–24 px (cartes).
- Cibles tactiles ≥ 44 px. Action principale = bouton orange plein, une seule par écran.
- Les couleurs du club du joueur ne teintent plus l'interface : le club apparaît par son blason/initiales.

## Navigation

- **Téléphone** : barre fixe en bas, 5 onglets avec icône + libellé : **Accueil · Équipe · Match · Marché · Club**. Onglet actif en orange.
- **Ordinateur** (≥ 1024 px) : barre latérale gauche de 240–260 px : logo, carte du club (initiales, nom, saison · journée), les 5 mêmes entrées, et en bas une carte « Prochain match » avec bouton orange.
- Toutes les pages actuelles d'une partie doivent être rangées sous l'une des 5 entrées (sous-onglets ou sections) ; aucune fonctionnalité ne disparaît.

## Écrans

### Accueil (tableau de bord)
- Carte héros bleue : prochain match (compétition, date, domicile/extérieur, adversaire), boutons **Jouer** (orange), Préparer, Simuler.
- Mini-classement autour de ton club, cartes « À faire » (offres reçues, blessés, contrats), « Défi de la semaine », « Dernier match ».
- Ordinateur : héros en haut, les cartes en colonnes dessous.

### Équipe
- Sous-sections téléphone : Effectif, Composition, fiche Joueur.
- Effectif : liste compacte (poste, note, forme, état). Toucher un joueur ouvre sa fiche.
- Composition : terrain avec les 11, choix du schéma, remplaçants en dessous.
- Ordinateur : effectif à gauche, terrain au centre, fiche du joueur sélectionné à droite, sur une seule page.

### Match
- Sous-sections téléphone : Calendrier, Classement, Coupe.
- Classement : bascule Division 1 / Division 2, ta ligne surlignée (`#2A3678`), pastille de position bleue (places du haut) ou orange (relégation), colonnes J, diff, forme, pts.
- Calendrier : résultats passés (V/N/D), prochain match mis en avant, compétition indiquée (D1 en `#8FA0FF`, COUPE en orange).
- Coupe : barre de progression des tours, prochain tour.
- Ordinateur : classement (3/5) + calendrier et coupe (2/5) côte à côte.

### Match en direct
- En-tête : score en très grand, minute en orange, barre de progression, compétition et stade.
- Vitesse x1 / x2 / x4, bouton **Coaching**, « Aller au résultat ».
- Fil du match (buts, cartons, changements), statistiques en barres comparées, scores des autres matchs.
- **Coaching** (et mi-temps) : met le match en pause. Téléphone = écran plein ; ordinateur = panneau latéral droit. Contenu : conseil de l'adjoint, attitude (Attaquer / Équilibré / Fermer), changement conseillé (sortant → entrant) touchable, lien vers la composition complète, bouton **Reprendre le match**.

### Marché (la grosse simplification)
- En-tête : budget disponible ; ordinateur : marge salariale aussi.
- Bascule **Acheter / Vendre · N offres**.
- Entrées : **Mes besoins** (par défaut) · **Pépites** · **Bonnes affaires** · **Stars**. Pas de filtres avancés sur l'écran principal.
- Phrase d'explication : « Ton point faible : *poste* (note X). Voici qui le comblerait. »
- **Une proposition à la fois** : grande carte bleue avec note, poste, étiquette (Meilleur choix, Bonne affaire, Pépite · pot. X…), nom, âge, club, **impact au poste** (+N), 3 stats en barres (6 sur ordinateur), prix suggéré, boutons **Passer** et **Recruter**.
- **Recruter** = offre au prix suggéré, contrat et salaire calculés automatiquement, avec la logique de transfert existante. Confirmation « Signé ! *joueur* rejoint *club* ».
- Lien discret « Détails du contrat · ajuster l'offre » vers l'écran avancé existant (négociation, durée, salaire) : les joueurs exigeants gardent la main.
- Ordinateur : la carte vedette à gauche, liste « Repérés pour toi » (3 joueurs, cliquables) et carte « Offre reçue » à droite.
- **Vendre** : liste des offres reçues (joueur, club acheteur, montant) avec **Accepter** / **Refuser** ; mise en vente d'un joueur depuis sa fiche.

### Club
- Sous-sections téléphone : Club (finances, objectifs), Défi, Palmarès / Saison.
- Finances : budget transferts en grand, masse salariale en barre, principales recettes.
- Objectifs du président avec barre de progression.
- Défi de la semaine : classement (ta ligne surlignée), bouton relancer.
- Palmarès : carte de fin de saison (aperçu carré) + Partager / Télécharger.
- Réglages : langue FR / EN, compte Google, sauvegardes utilisées (x sur 3), changer de partie, confidentialité.

### Choix du club (création de partie)
- Titre « Choisis ton défi », champ nom du manager, 3 clubs proposés par niveau (Facile · favori / Équilibré · conseillé / Défi · Division 2), recherche parmi tous les clubs, bouton **Lancer ma carrière**.

## Décisions après l'audit du 30/10

Ces décisions complètent le cahier et, en cas de conflit, priment sur ce qui précède.

### Général
- Base : `refonte-piste-a` part d'`i18n` avec l'onboarding (fait, 949c661).
- Jetons : valeurs du tableau, écrites dans les variables sémantiques existantes ; `.brand` reste pour les pages publiques jusqu'à l'étape 8. Sombre uniquement. Cartes PNG inchangées.
- Couleurs de résultat et d'alerte (`--win`, `--draw`, `--loss`, `--warning`, `--info`) : gardées.
- Teinte du club : abandonnée, `--club` devient l'orange. Le club est représenté par ses **initiales seules** (pas d'écusson, règle de CLAUDE.md).
- Polices : `next/font/local` avec la Barlow Condensed 800 italique du dépôt, Barlow 400 à 700.
- Libellés EN : **Home · Squad · Match · Market · Club**. « Accueil » garde `nav-dashboard` et la page garde le titre « Tableau de bord ».
- Barres : barre du bas sous 1024 px ; barre latérale de 256 px au-dessus. Sous `xl`, la fiche latérale de 400 px passe en surimpression. Un seul `<nav>`, libellé « Navigation de la partie » conservé.
- En-tête : supprimé sur ordinateur (date et statut en haut de `main`, langue et trophée en pied de barre latérale jusqu'à l'étape 7) ; sur téléphone, une ligne compacte garde `header-club` et `header-competition`.
- Actions de jeu : ordinateur dans la carte « Prochain match » de la barre latérale (avec Simuler) ; téléphone au-dessus de la barre du bas jusqu'à l'étape 3, puis dans le héros de l'Accueil et en tête de Match.
- `/live` sur téléphone : barre du bas gardée jusqu'à l'étape 5 (seule sortie à la mi-temps), boutons collés au-dessus.
- Une seule action orange pleine par écran, y compris sur ordinateur : sur l'Accueil, « Jouer » est orange, « Préparer » et « Simuler » sont secondaires.

### Marché (étape 2)
- Prix suggéré = prix et salaire minimaux déjà préremplis par les dialogues, 3 saisons. `evaluateOffer` ne change pas.
- Refus pour réputation calculé avant le clic (lecture seule, ajouté à `getMarketOverview`) : les propositions (Mes besoins, Pépites, Bonnes affaires, Stars) n'affichent que des joueurs qui accepteraient ; l'écran avancé affiche la raison du refus **avant** l'envoi et désactive le bouton.
- Recruter ouvre une confirmation courte (prix, salaire, durée, budget restant) puis « Signé ! ».
- **Exception autorisée aux règles économiques** : interdire de revendre un joueur acheté pendant le même mercato (lecture de `Transfer`, sans migration), commit à part avec son test, message FR/EN.
- Vendre : il n'y a pas d'offres reçues. L'onglet liste tes joueurs hors du onze avec la meilleure offre IA existante (si acheteur) et **Vendre** ; pas de bouton Refuser (rien à enregistrer). Le compteur compte ces offres. Vente toujours possible depuis la fiche.

### Autres étapes
- Classement (étape 4) : on suit le cahier — ta ligne en `#2A3678`, pastille bleue en haut, orange pour la relégation.
- Direct (étape 5) : pas de changement de moteur. Le panneau Coaching ne propose que ce qui existe déjà (changements, schéma ou consignes si le moteur les gère) ; pas d'attitude Attaquer / Équilibré / Fermer si elle n'existe pas.
- Club (étape 7) : pas d'objectifs du président ni de recettes (aucune donnée). Finances en lecture seule avec ce qui existe (budget, masse et marge salariales). Défi : classement et « Jouer le défi » seulement si la partie de la semaine n'est pas jouée, pas de « Relancer ». En attendant, l'entrée Club mène à `/seasons`.

## Ordre de réalisation

1. Jetons, polices, composants de base (bouton, carte, pastille, bascule) + navigation (barre du bas et barre latérale).
2. Marché (Acheter, Vendre, confirmation).
3. Accueil.
4. Match (classement, calendrier, coupe).
5. Match en direct + coaching / mi-temps.
6. Équipe (effectif, composition, fiche).
7. Club, défi, palmarès, réglages.
8. Choix du club et pages hors partie.
