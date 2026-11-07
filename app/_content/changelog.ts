// Late Winner's changelog since its opening on 9 October 2026, newest first, in players' words (app/changelog,
// app/fr/nouveautes): batches of what players saw, written from the git history, each dated by the day it was finished.
export type ChangelogEntry = {
  date: string; // YYYY-MM-DD, the day the batch was finished
  fr: { title: string; items: string[] };
  en: { title: string; items: string[] };
};

/** The page's own words: its title, and its lead from the day the game opened (the last entry's date, formatted). */
export const CHANGELOG_LABELS = {
  fr: {
    title: "Nouveautés",
    lead: (opening: string) => `Les mises à jour de Late Winner depuis son ouverture, le ${opening}, de la plus récente à la plus ancienne.`,
  },
  en: {
    title: "What's new",
    lead: (opening: string) => `Late Winner's updates since it opened on ${opening}, newest first.`,
  },
} as const;

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-11-07",
    fr: {
      title: "Ta saison en image",
      items: [
        "« Partager » envoie désormais l'image carrée de ta saison toute seule, prête à publier.",
        "Si ton navigateur ne sait pas la partager, « Enregistrer l'image » la télécharge, ou l'ouvre en grand sur iPhone et iPad pour la garder dans tes photos d'un appui long, puis la publier depuis ta galerie.",
        "« Copier le lien » copie l'adresse du jeu, et l'affiche quand la copie n'est pas possible.",
      ],
    },
    en: {
      title: "Your season as a picture",
      items: [
        "“Share” now sends the square picture of your season on its own, ready to post.",
        "If your browser can't share it, “Save image” downloads it instead, or on iPhone and iPad opens it full size so a long press keeps it in your photos, ready to post from your gallery.",
        "“Copy link” copies the game's address, or shows it when copying isn't possible.",
      ],
    },
  },
  {
    date: "2026-11-06",
    fr: {
      title: "Un marché plus juste, un jeu plus rapide",
      items: [
        "Les écrans du marché s'ouvrent plus vite, et supprimer une partie ne prend plus qu'un instant.",
        "Pendant un an après son arrivée, un joueur que tu as recruté ne trouve guère d'offre au-dessus de son prix d'achat, ni au-delà de la moitié de sa valeur s'il est venu libre ; Vendre et sa fiche te le disent.",
        "Ton point faible est d'abord un poste que plus personne ne peut tenir, puis un poste tenu hors poste, puis le titulaire le moins bien noté ; « À faire » et « Mes besoins » disent pourquoi.",
      ],
    },
    en: {
      title: "A fairer market, a faster game",
      items: [
        "Market screens open faster, and deleting a career now takes only a moment.",
        "For a year after you sign a player, offers for them barely go above what you paid, or above half their value if they came on a free; the Sell tab and their player sheet tell you so.",
        "Your weak spot is now first a position nobody available can play, then one filled out of position, then your lowest-rated starter; “To do” and “My needs” say why.",
      ],
    },
  },
  {
    date: "2026-11-06",
    fr: {
      title: "Dix-sept dispositifs, budgets et objectifs",
      items: [
        "Dix nouveaux dispositifs, dix-sept en tout, rangés par trois, quatre ou cinq défenseurs : le choix te suggère les trois meilleurs pour ton effectif, et les autres clubs choisissent le leur avant chaque match.",
        "La réputation des clubs suit leurs résultats d'une saison à l'autre, et un promu ou un relégué prend d'un coup celle de sa nouvelle division.",
        "Chaque saison, la direction t'accorde un budget selon ta réputation et tes objectifs, plus la moitié de ce que tu n'as pas dépensé.",
        "Ton plafond salarial suit ta masse salariale et devient une vraie limite ; quand ta marge ne paie plus personne, le marché te montre qui reste dans tes moyens et comment en retrouver.",
        "Objectifs de saison : la direction fixe le classement et la coupe, et tu en choisis un parmi les trois qu'elle te propose (Jeunesse, Spectacle, Solidité ou Bonne gestion) sur le nouvel écran « Début de saison ».",
        "La confiance du président suit tes objectifs sur l'Accueil et l'écran Club, sans jamais te renvoyer, et le bilan de la saison les compte (« Objectifs : 2/3 »).",
      ],
    },
    en: {
      title: "Seventeen formations, budgets and objectives",
      items: [
        "Ten new formations, seventeen in all, grouped by back three, four or five: the picker suggests the three best for your squad, and the other clubs choose theirs before every match.",
        "Club reputations follow results from one season to the next, and a promoted or relegated club takes on that of its new division at once.",
        "Each season the board hands you a budget based on your reputation and objectives, plus half of what you left unspent.",
        "Your wage cap follows your wage bill and becomes a real limit; when your wage room pays nobody, the market shows who is still within your means and how to make room.",
        "Season objectives: the board sets your league and cup targets, and you pick one more from the three it offers (Youth, Entertainment, Solidity or Good management) on the new “Season start” screen.",
        "The chairman's confidence follows your objectives on Home and the Club screen, without ever sacking you, and the season review adds them up (“Objectives: 2/3”).",
      ],
    },
  },
  {
    date: "2026-11-05",
    fr: {
      title: "Le direct entre tes mains",
      items: [
        "Événements à choix : un à trois par match pour ton club (penalty, coup franc, averti qui s'énerve, échauffourée, joueur touché ou à bout, réaction tactique), à trancher sur une carte où le choix de ton adjoint est présélectionné.",
        "Change ton équipe et ta consigne à chaque arrêt, aux 15e, 30e, 60e et 75e minutes comme à la mi-temps : le bouton « Coaching » arrête le match au prochain d'entre eux, sous la vraie règle des cinq changements en trois fenêtres.",
        "Tes décisions et leur effet s'inscrivent dans le fil du direct et sur la feuille de match ; si tu sautes la suite, ton adjoint décide en chemin.",
        "À la mi-temps, une carte résume le score, les buteurs et le mot de ton adjoint ; le panneau Coaching ne s'ouvre que si tu le demandes, et met côte à côte le joueur qui sort et celui qui entre.",
        "Choisis ta consigne de départ avec ta composition ; pendant le match, la carte du score dit quelle consigne joue ton équipe et qui l'a donnée.",
        "Dans la composition, chaque titulaire montre sa note à son poste, toucher un poste liste ses candidats, « Composition automatique » repose les fatigués, et un panneau compare ton attaque et ta défense à celles de l'adversaire.",
      ],
    },
    en: {
      title: "The live match in your hands",
      items: [
        "Choice events: one to three per match for your club (a penalty, a free kick, a booked player losing their cool, a scuffle, a player hurt or out on their feet, a tactical call), settled on a card with your assistant's pick already selected.",
        "Change your team and your instruction at every stoppage, in the 15th, 30th, 60th and 75th minutes as well as at half-time: the “Coaching” button stops the match at the next one, under the real rule of five substitutions in three windows.",
        "Your decisions and what came of them appear in the live timeline and the match report; skip ahead and your assistant decides along the way.",
        "At half-time, a card sums up the score, the scorers and a word from your assistant; the Coaching panel only opens when you ask, and puts the player going off and the one coming on side by side.",
        "Pick a starting instruction with your line-up; during the match, the score card shows which instruction your team is playing and who gave it.",
        "In the line-up, every starter shows their rating in their position, tapping a position lists its candidates, “Automatic line-up” rests tired players, and a panel sets your attack and defence against your opponent's.",
      ],
    },
  },
  {
    date: "2026-11-03",
    fr: {
      title: "Quarts d'heure, fatigue et suspensions",
      items: [
        "Les matchs se jouent désormais en six quarts d'heure : un carton rouge, une blessure ou un changement compte dès le quart d'heure suivant, et un blessé est remplacé aussitôt.",
        "Chaque dispositif pèse sur ton attaque et ta défense, et les équipes suivent une consigne, Attaquer, Équilibré ou Fermer : menées à partir de la 60e, elles attaquent ; avec un but d'avance à partir de la 75e, elles ferment.",
        "Fatigue : la condition de chaque joueur baisse sur le terrain et remonte jour après jour ; fatigué, il joue moins bien et se blesse plus, et les autres clubs font tourner leur effectif.",
        "La condition se lit dans l'effectif, la composition, la fiche joueur et le panneau Coaching, en vert, ambre ou rouge ; le moral n'est plus affiché.",
        "Suspensions : un rouge prive du match suivant, cinq jaunes dans une compétition de son prochain match ; les badges « Suspendu » et « 4 jaunes » et la liste « À faire » te préviennent.",
        "Les buts viennent plus souvent en fin de match, et la forme des joueurs varie moins brutalement.",
      ],
    },
    en: {
      title: "Quarter-hours, fitness and suspensions",
      items: [
        "Matches are now played in six quarter-hours: a red card, an injury or a substitution counts from the next one, and an injured player is replaced straight away.",
        "Each formation shifts your attack and defence, and teams follow an instruction, Attack, Balanced or Sit back: behind from the 60th minute they attack, a goal up from the 75th they sit back.",
        "Fitness: every player's fitness drops on the pitch and comes back day by day; a tired player is less effective and more injury-prone, and the other clubs rotate their squads.",
        "Fitness shows in the squad, the line-up, the player sheet and the Coaching panel, in green, amber or red; morale is no longer displayed.",
        "Suspensions: a red card rules a player out of the next match, five yellows in a competition out of their next match in it; the “Suspended” and “4 yellows” badges and the “To do” list warn you.",
        "Goals come more often late in matches, and players' form swings less wildly.",
      ],
    },
  },
  {
    date: "2026-11-02",
    fr: {
      title: "Direct, Équipe et Club refaits",
      items: [
        "Le direct prend tout l'écran : grande carte du score, vitesses x1, x2 et x4 gardées après la pause, fil du match en icônes et statistiques de la rencontre.",
        "La mi-temps devient le panneau Coaching : ton adjoint signale blessés, exclus et joueurs avertis, et te propose un changement que tu fais d'une touche et annules jusqu'à la reprise.",
        "Nouvelle fiche joueur, effectif en cartes sur téléphone et, sur grand écran, une composition qui réunit l'effectif, le terrain et la fiche sur une seule page.",
        "Nouvel écran Club : tes finances, le défi de la semaine, tes dernières saisons et tes réglages (langue, compte, parties) ; le défi s'ouvre aussi depuis ta partie.",
        "Le palmarès passe en cartes sur téléphone, et le bilan d'une saison montre sa carte à côté des montées et des descentes, à partager ou à télécharger.",
        "L'accueil se refait : « Choisis ton défi » avec trois clubs par niveau, le conseillé déjà coché, une recherche parmi les 198 clubs, et tes carrières en cartes.",
      ],
    },
    en: {
      title: "Live match, squad and club rebuilt",
      items: [
        "The live match takes over the whole screen: a big score card, x1, x2 and x4 speeds that stay set after the break, a timeline with icons and the match's statistics.",
        "Half-time becomes the Coaching panel: your assistant flags injuries, red cards and booked players, and suggests a substitution you can make in one tap and undo until the restart.",
        "A new player sheet, the squad as cards on phones, and on big screens a line-up page that puts your squad, the pitch and the player sheet side by side.",
        "A new Club screen: your finances, the weekly challenge, your last seasons and your settings (language, account, careers); the challenge also opens from inside your career.",
        "Honours become cards on phones, and a season review shows its card alongside who went up and down, ready to share or download.",
        "The home page is rebuilt: “Choose your challenge” with three clubs by level, the recommended one already ticked, a search across all 198 clubs, and your careers as cards.",
      ],
    },
  },
  {
    date: "2026-11-01",
    fr: {
      title: "Nouvelle allure, nouvelle navigation",
      items: [
        "Tout le jeu passe aux couleurs de Late Winner, bleu nuit, bleu vif et orange, avec de grands titres en italique ; ton club ne teinte plus l'interface et se reconnaît à ses initiales.",
        "Cinq entrées rangent désormais les écrans, Accueil, Équipe, Match, Marché et Club : en barre au pied de l'écran sur téléphone et tablette, en colonne sur ordinateur avec la carte « Prochain match ».",
        "L'Accueil s'organise autour de ton prochain match (« Jouer le match », « Préparer », « Simuler »), avec le classement autour de ton club, tes chiffres clés et une liste « À faire », du plus pressant au reste.",
        "Le Marché se partage entre Acheter et Vendre : quatre entrées (Mes besoins, Pépites, Bonnes affaires, Stars) proposent des joueurs prêts à venir et à ta portée, recrutés en deux touches, et le marché complet reste à un clic.",
        "Vendre montre la meilleure offre pour chacun de tes joueurs hors du onze, et un joueur recruté pendant un mercato ne se revend plus avant le suivant.",
        "Le calendrier s'ouvre sur la liste du mois, le classement montre la forme de chaque club, et la coupe a sa carte avec ses six tours.",
      ],
    },
    en: {
      title: "New look, new navigation",
      items: [
        "The whole game takes on Late Winner's colours, navy, bright blue and orange, with big italic headings; your club no longer tints the interface and shows by its initials.",
        "Five sections now hold every screen, Home, Squad, Match, Market and Club: a bar at the bottom on phones and tablets, a side column on computers with the “Next match” card.",
        "Home is built around your next match (“Play the match”, “Prepare”, “Simulate”), with the table around your club, your key numbers and a “To do” list, most urgent first.",
        "The Market splits into Buy and Sell: four lists (My needs, Gems, Bargains, Stars) suggest players who would join and that you can afford, signed in two taps, and the full market is one click away.",
        "Sell shows the best offer for each player outside your eleven, and a player signed during a transfer window can't be sold again before the next one.",
        "Fixtures open on the month's list, the table shows every club's form, and the cup gets its own card with its six rounds.",
      ],
    },
  },
  {
    date: "2026-10-30",
    fr: {
      title: "Premiers pas guidés",
      items: [
        "À la création, trois clubs français te sont proposés (anglais si tu joues en anglais) : un favori, un club de milieu de tableau et un club de Division 2 à faire remonter.",
        "Le nom de la partie se remplit d'après ton club, et les réglages avancés passent sous « Options ».",
        "Sur le tableau de bord, « Tes trois premières actions » te guident : voir l'effectif, choisir ta composition, jouer ton premier match.",
        "Quatre bulles d'aide expliquent la note, le poste secondaire, l'argent et la simulation ; tu peux les fermer, et elles s'arrêtent d'elles-mêmes à ton cinquième match.",
        "Avant ton premier match, le classement n'affiche plus de rang trompeur.",
      ],
    },
    en: {
      title: "Guided first steps",
      items: [
        "When you create a career, three English clubs are suggested (French ones if you play in French): a favourite, a mid-table club and a Division 2 side to bring back up.",
        "The career name fills itself in from your club, and the advanced settings tuck away under “Options”.",
        "On the dashboard, “Your first three moves” show you the way: see your squad, pick your line-up, play your first match.",
        "Four tips explain ratings, secondary positions, money and simulation; you can close them, and they stop by themselves at your fifth match.",
        "Before your first match, the table no longer shows a misleading position.",
      ],
    },
  },
  {
    date: "2026-10-30",
    fr: {
      title: "Sur téléphone",
      items: [
        "Le jeu tient désormais dans un téléphone : plus aucun écran ne déborde sur le côté, même sur un petit modèle.",
        "Boutons, liens et onglets sont assez grands pour le pouce.",
        "Les actions de jeu passent dans une barre au pied de l'écran, et le nom de ton club s'affiche en entier.",
        "Effectif, marché, calendrier, classement et palmarès se lisent en listes resserrées ou en cartes, le détail à une touche.",
        "La composition se fait au doigt : un appui maintenu soulève le joueur, et la page défile toute seule pendant que tu le glisses.",
        "Au direct, le tableau d'affichage et le fil du match restent lisibles, et les boutons de reprise de la mi-temps restent au bas de l'écran, sans défiler.",
      ],
    },
    en: {
      title: "On your phone",
      items: [
        "The game now fits on a phone: no screen spills over the side any more, even on a small one.",
        "Buttons, links and tabs are big enough for your thumb.",
        "Game actions move to a bar at the bottom of the screen, and your club's name shows in full.",
        "Squad, market, fixtures, table and honours turn into compact lists or cards, with the details one tap away.",
        "Line-ups work by touch: press and hold to pick a player up, and the page scrolls by itself while you drag.",
        "In the live match, the scoreboard and the timeline stay readable, and the half-time restart buttons stay at the bottom of the screen, with no scrolling.",
      ],
    },
  },
  {
    date: "2026-10-29",
    fr: {
      title: "Le jeu en anglais",
      items: [
        "Late Winner se joue aussi en anglais : pages publiques, tous les écrans d'une partie, direct et carte de fin de saison.",
        "Le jeu s'ouvre en français ou en anglais selon ton navigateur, et « FR · EN » permet d'en changer à tout moment.",
        "Compétitions, pays et nationalités se nomment dans ta langue, comme tes parties de défi.",
        "La page de confidentialité existe en entier en français et en anglais.",
        "En anglais, montants et rangs s'écrivent à la britannique (« €77.2m », « 3rd ») ; en français, le jeu te tutoie désormais partout.",
      ],
    },
    en: {
      title: "Now in English",
      items: [
        "Late Winner can now be played in English: the public pages, every career screen, the live match and the end-of-season card.",
        "The game opens in French or English depending on your browser, and “FR · EN” lets you switch at any time.",
        "Competitions, countries and nationalities are named in your language, and so are your challenge careers.",
        "The privacy page is available in full in English as well as French.",
        "In English, amounts and positions read the British way (“€77.2m”, “3rd”); in French, the game now uses the informal “tu” throughout.",
      ],
    },
  },
  {
    date: "2026-10-28",
    fr: {
      title: "Le défi de la semaine",
      items: [
        "Chaque lundi, un nouveau défi : le même club et le même monde pour tous, et dix journées de championnat pour faire le meilleur score.",
        "Le score compte les points, puis la différence de buts, puis les buts marqués ; à égalité, le premier arrivé passe devant.",
        "La page « Défi de la semaine », ouverte à tous, présente le club à relever, la fin du défi et les classements de la semaine et de la précédente.",
        "Une partie de défi par semaine, en plus de tes parties habituelles ; elle est supprimée le mardi qui suit la fin de sa semaine.",
        "Au classement, les comptes Google figurent sous leur prénom ; sans compte, tu vois ta ligne grisée, sans rang.",
        "Dans la partie, une bannière suit tes journées, puis ton score et ton rang provisoire.",
      ],
    },
    en: {
      title: "The weekly challenge",
      items: [
        "Every Monday brings a new challenge: the same club and the same world for everyone, and ten league matchdays to post the best score.",
        "The score counts points, then goal difference, then goals scored; when it's level, whoever finished first ranks higher.",
        "The “Weekly challenge” page, open to all, shows the club to take on, when the challenge closes, and the rankings for this week and last.",
        "One challenge career a week, on top of your usual careers; it is deleted on the Tuesday after its week ends.",
        "In the rankings, Google accounts appear under their first name; without an account, you see your own line greyed out, with no rank.",
        "Inside the career, a banner follows your matchdays, then your score and provisional rank.",
      ],
    },
  },
  {
    date: "2026-10-24",
    fr: {
      title: "Coupes nationales",
      items: [
        "Chaque pays a sa coupe, entre les clubs de ses deux divisions : un tour préliminaire, puis des seizièmes de finale à la finale, jouée le samedi qui suit la dernière journée.",
        "Un match de coupe nul après 90 minutes passe en prolongation puis aux tirs au but, en direct, avec un arrêt de plus et un sixième changement.",
        "La page Coupe montre chaque tour et le parcours de ton club, et chaque tour gagné rapporte une prime à ton budget.",
        "Les matchs de coupe portent le nom de leur tour, avec « a.p. » et « t.a.b. » au score, et la feuille de match raconte la séance tir par tir.",
        "Le palmarès et la carte de saison fêtent la coupe : « COUPE », ou « DOUBLÉ » avec le championnat.",
        "Une partie à deux divisions déjà commencée reçoit sa coupe à la saison suivante.",
      ],
    },
    en: {
      title: "National cups",
      items: [
        "Every country has its cup, open to the clubs of both its divisions: a preliminary round, then the round of 32 through to the final, played on the Saturday after the last matchday.",
        "A cup tie level after 90 minutes goes to extra time and then penalties, played live, with one more break and a sixth substitution.",
        "The Cup page shows every round and your club's run, and each round won adds prize money to your budget.",
        "Cup ties are named after their round, scores show “a.e.t.” and “pens”, and the match report goes through the shoot-out kick by kick.",
        "Honours and the season card celebrate the cup: “CUP”, or “DOUBLE” with the league title.",
        "A two-division career already under way gets its cup from the next season.",
      ],
    },
  },
  {
    date: "2026-10-23",
    fr: {
      title: "Deuxièmes divisions, montées et descentes",
      items: [
        "Cinq deuxièmes divisions rejoignent le jeu : toute nouvelle partie compte 198 clubs, deux divisions par pays, et tu peux prendre un club de Division 2 ; une partie déjà commencée garde ses seules premières divisions.",
        "En fin de saison, trois clubs montent et trois descendent en Angleterre, en Espagne et en Italie, deux en Allemagne et en France, et le palmarès, la carte (« PROMU ») et le bilan le montrent.",
        "Le classement se lit par pays puis par division, avec les places de montée et de descente.",
        "« Prochain match » remplace « Jouer la journée » : il joue les dates des autres compétitions jusqu'au match de ton club, puis passe au direct.",
        "Le calendrier alterne mieux domicile et extérieur : plus aucun club n'enchaîne trois matchs de suite au même endroit.",
        "Créer une partie échoue moins souvent : le jeu réessaie de lui-même et te prévient quand une nouvelle version vient d'arriver.",
      ],
    },
    en: {
      title: "Second divisions, promotion and relegation",
      items: [
        "Five second divisions join the game: every new career has 198 clubs, two divisions per country, and you can pick a Division 2 club; careers already under way keep their first divisions only.",
        "At the end of each season, three clubs go up and three go down in England, Spain and Italy, two in Germany and France, and your honours, the card (“PROMOTED”) and the season review show it.",
        "The table reads by country then by division, with the promotion and relegation places marked.",
        "“Next match” replaces “Play matchday”: it plays the other competitions' dates up to your club's match, then goes live.",
        "Fixtures alternate home and away better: no club plays more than two in a row at home or away any more.",
        "Creating a career fails less often: the game tries again by itself and tells you when a new version has just gone live.",
      ],
    },
  },
  {
    date: "2026-10-22",
    fr: {
      title: "Palmarès et carte de saison",
      items: [
        "Nouvel onglet Palmarès : chaque saison terminée de ton club, de la plus récente à la plus ancienne, avec son classement, ses points, son bilan et son meilleur joueur.",
        "Passer à la saison suivante ouvre le bilan « Saison terminée », avec une carte de ta saison à télécharger ou à partager : rang, points, bilan, buts et meilleur joueur.",
        "La carte est carrée, existe aussi en version paysage, et prend l'une des couleurs de ton club.",
      ],
    },
    en: {
      title: "Honours and season card",
      items: [
        "A new Honours tab lists every season your club has finished, most recent first, with its position, points, record and best player.",
        "Moving on to the next season opens the “Season complete” review, with a card of your season to download or share: position, points, record, goals and best player.",
        "The card is square, also comes in landscape, and takes one of your club's colours.",
      ],
    },
  },
  {
    date: "2026-10-09",
    fr: {
      title: "Ouverture",
      items: [
        "Prends en main l'un des 96 clubs des premières divisions d'Angleterre, d'Espagne, d'Allemagne, d'Italie et de France, dès la saison 2026-27.",
        "Gère ton effectif, des joueurs aux visages dessinés avec leur note, leur potentiel et leurs postes, et compose ton onze dans l'un des sept dispositifs, au glisser-déposer, face au onze probable de ton adversaire.",
        "Suis le match de ton club en direct, avec une pause à la mi-temps pour tes changements, ou joue plusieurs journées d'un coup avec « Simuler jusqu'à… ».",
        "Recrute pendant les mercatos d'été et d'hiver, parmi les joueurs libres ou ceux des autres clubs, et prolonge, libère ou vends tes joueurs.",
        "Les saisons s'enchaînent : les joueurs progressent, déclinent et prennent leur retraite, des jeunes arrivent à chaque présaison et les autres clubs gèrent leur effectif.",
        "Joue tout de suite sans compte, ou connecte-toi avec Google pour garder jusqu'à trois carrières sur tous tes appareils ; une page de confidentialité et « Supprimer mon compte » sont là dès le premier jour.",
      ],
    },
    en: {
      title: "Launch",
      items: [
        "Take charge of one of 96 clubs from the first divisions of England, Spain, Germany, Italy and France, starting in the 2026-27 season.",
        "Manage your squad, players with drawn faces, ratings, potential and positions, and set your eleven in one of seven formations by drag and drop, facing your opponent's likely line-up.",
        "Watch your club's match live, with a half-time break for your substitutions, or play several matchdays at once with “Simulate until…”.",
        "Sign players in the summer and January transfer windows, free agents or from other clubs, and extend, release or sell your own.",
        "Seasons roll on: players develop, decline and retire, youngsters arrive every pre-season and the other clubs manage their squads.",
        "Play straight away without an account, or sign in with Google to keep up to three careers on all your devices; a privacy page and “Delete my account” are there from day one.",
      ],
    },
  },
];
