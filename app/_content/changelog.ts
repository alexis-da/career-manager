// Late Winner's changelog since its opening on 9 October 2026, newest first, in players' words (app/changelog,
// app/fr/nouveautes): what players saw, written from the git history, each entry dated by the day it went live (the page
// gathers the entries of a day under it).
export type ChangelogEntry = {
  date: string; // YYYY-MM-DD, the day it went live
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
    date: "2026-11-09",
    fr: {
      title: "Le jeu sur ton écran d'accueil, et un fil du match plus complet",
      items: [
        "Tu peux installer Late Winner comme une appli, sans passer par un store : Club, Réglages, « Installer l'appli ». Sur Android et dans Chrome, ton navigateur te le propose ; sur iPhone et iPad, le jeu te dit comment l'ajouter à l'écran d'accueil. Il faut toujours une connexion pour jouer.",
        "Le fil du match en direct et la feuille de match montrent les changements de consigne de ton équipe : ta consigne de départ, celles que tu donnes au coaching et celles de ton adjoint.",
        "Le « Coaching à la 30e » que tu demandes pendant un match en direct tient même si tu recharges la page.",
        "Au choix du club, chaque carte annonce l'objectif que la direction te fixera vraiment, en Division 1 comme en Division 2 ; la carte « Difficile » est un club de Division 2 qui doit monter.",
        "Dans le marché complet, l'onglet Mouvements montre le visage des joueurs.",
      ],
    },
    en: {
      title: "The game on your home screen, and a fuller match feed",
      items: [
        "You can install Late Winner as an app, without any store: Club, Settings, “Install the app”. On Android and in Chrome, your browser offers it; on iPhone and iPad, the game tells you how to add it to your home screen. You still need a connection to play.",
        "The live match feed and the match sheet show your team's changes of instruction: your starting instruction, the ones you give from the coaching panel and your assistant's.",
        "The “Coach at 30’” you ask for during a live match now holds even if you reload the page.",
        "When you choose your club, each card announces the objective the board will really set you, in Division 1 as in Division 2; the “Hard” card is a Division 2 club that must go up.",
        "In the full market, the Moves tab shows the players' faces.",
      ],
    },
  },
  {
    date: "2026-11-07",
    fr: {
      title: "Une mesure d'audience sans cookie tiers",
      items: [
        "Pour savoir d'où viennent les joueurs et ce qui les fait rester, le jeu garde à ta première visite d'où tu arrives (le nom de campagne du lien, sinon le site qui t'envoie, jamais l'adresse de sa page) dans un cookie à lui, lw_src, pendant 30 jours.",
        "À la création de ton profil de joueur, il garde cette origine, ta langue et ton type d'appareil, téléphone ou ordinateur, puis les dates de tes premiers pas ; les visites ne sont comptées qu'en totaux, sans donnée personnelle. Toujours ni cookie tiers ni publicité : la page Confidentialité dit tout.",
      ],
    },
    en: {
      title: "Audience measurement without third-party cookies",
      items: [
        "To learn where players come from and what makes them stay, the game keeps, on your first visit, where you arrived from (the link's campaign name, else the site that sent you, never the address of its page) in a cookie of its own, lw_src, for 30 days.",
        "When your player profile is created, it keeps that origin, your language and your device type, phone or computer, then the dates of your first steps; visits are only counted as totals, without personal data. Still no third-party cookie and no advertising: the Privacy page says it all.",
      ],
    },
  },
  {
    date: "2026-11-07",
    fr: {
      title: "Le jeu se présente, en deux langues",
      items: [
        "L'accueil dit ce qu'est le jeu, montre trois écrans et répond aux questions qu'on se pose ; tu choisis ton club et lances ta carrière sans descendre.",
        "Nouvelles pages : Comment jouer, un guide de la création de ta carrière à ses objectifs ; Nouveautés, ce journal ; À propos, qui fait le jeu et pourquoi.",
        "La version française a ses propres adresses, sous /fr ; l'anglaise est à la racine. Un bandeau te propose ta langue, et ton choix est retenu.",
        "L'ancienne page de connexion mène à l'accueil, où t'attend le bouton Google.",
      ],
    },
    en: {
      title: "The game introduces itself, in two languages",
      items: [
        "The home page now says what the game is, shows three screens and answers the usual questions; pick your club and start your career without scrolling.",
        "New pages: How to play, a guide from creating your career to its objectives; What's new, this changelog; About, who makes the game and why.",
        "The French version has its own addresses under /fr, the English one is at the root. A banner offers your language, and your choice is remembered.",
        "The old sign-in page now leads to the home page, where the Google button is.",
      ],
    },
  },
  {
    date: "2026-11-07",
    fr: {
      title: "Un marché plus juste, ta saison en image",
      items: [
        "Les écrans du marché s'ouvrent plus vite, et supprimer une partie ne prend plus qu'un instant.",
        "Pendant un an après son arrivée, un joueur que tu as recruté ne trouve guère d'offre au-dessus de son prix d'achat, ni au-delà de la moitié de sa valeur s'il est venu libre ; Vendre et sa fiche te le disent.",
        "Ton point faible est d'abord un poste que plus personne ne peut tenir, puis un poste tenu hors poste, puis le titulaire le moins bien noté ; « À faire » et « Mes besoins » disent pourquoi.",
        "« Partager » envoie désormais l'image carrée de ta saison toute seule, prête à publier.",
        "Si ton navigateur ne sait pas la partager, « Enregistrer l'image » la télécharge, ou l'ouvre en grand sur iPhone et iPad pour la garder dans tes photos d'un appui long ; « Copier le lien » copie l'adresse du jeu.",
      ],
    },
    en: {
      title: "A fairer market, your season as a picture",
      items: [
        "Market screens open faster, and deleting a career now takes only a moment.",
        "For a year after you sign a player, offers for them barely go above what you paid, or above half their value if they came on a free; the Sell tab and their player sheet tell you so.",
        "Your weak spot is now first a position nobody available can play, then one filled out of position, then your lowest-rated starter; “To do” and “My needs” say why.",
        "“Share” now sends the square picture of your season on its own, ready to post.",
        "If your browser can't share it, “Save image” downloads it, or on iPhone and iPad opens it full size so a long press keeps it in your photos; “Copy link” copies the game's address.",
      ],
    },
  },
  {
    date: "2026-11-06",
    fr: {
      title: "Le match en direct, à toi de jouer",
      items: [
        "Les matchs se jouent en six quarts d'heure : un carton rouge, une blessure ou un changement compte dès le quart d'heure suivant, et les buts viennent plus souvent en fin de match.",
        "Événements à choix : un à trois par match pour ton club (penalty, coup franc, averti qui s'énerve, échauffourée, joueur touché ou à bout, réaction tactique), à trancher sur une carte où le choix de ton adjoint est présélectionné.",
        "Coaching : change ton équipe et ta consigne à chaque arrêt, aux 15e, 30e, 60e et 75e minutes comme à la mi-temps, sous la vraie règle des cinq changements en trois fenêtres ; le panneau ne s'ouvre que si tu le demandes.",
        "Tes décisions et leur effet s'inscrivent dans le fil du direct et sur la feuille de match ; si tu sautes la suite, ton adjoint décide en chemin.",
        "Fatigue : la condition de chaque joueur baisse sur le terrain et remonte jour après jour ; fatigué, il joue moins bien et se blesse plus, et les autres clubs font tourner leur effectif.",
        "Suspensions : un rouge prive du match suivant, cinq jaunes dans une compétition de son prochain match ; les badges et la liste « À faire » te préviennent.",
        "Une composition plus claire : chaque titulaire montre sa note à son poste, toucher un poste liste ses candidats, « Composition automatique » repose les fatigués, et tu choisis ta consigne de départ, Attaquer, Équilibré ou Fermer.",
      ],
    },
    en: {
      title: "The live match, your call",
      items: [
        "Matches are played in six quarter-hours: a red card, an injury or a substitution counts from the next one, and goals come more often late in matches.",
        "Choice events: one to three per match for your club (a penalty, a free kick, a booked player losing their cool, a scuffle, a player hurt or out on their feet, a tactical call), settled on a card with your assistant's pick already selected.",
        "Coaching: change your team and your instruction at every stoppage, in the 15th, 30th, 60th and 75th minutes as well as at half-time, under the real rule of five substitutions in three windows; the panel only opens when you ask.",
        "Your decisions and what came of them appear in the live timeline and the match report; skip ahead and your assistant decides along the way.",
        "Fitness: every player's fitness drops on the pitch and comes back day by day; a tired player is less effective and more injury-prone, and the other clubs rotate their squads.",
        "Suspensions: a red card rules a player out of the next match, five yellows in a competition out of their next match in it; the badges and the “To do” list warn you.",
        "A clearer line-up: every starter shows their rating in their position, tapping a position lists its candidates, “Automatic line-up” rests tired players, and you pick a starting instruction, Attack, Balanced or Sit back.",
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
    date: "2026-11-02",
    fr: {
      title: "Le défi de la semaine",
      items: [
        "Chaque lundi, un nouveau défi : le même club et le même monde pour tous, et dix journées de championnat pour faire le meilleur score.",
        "Le score compte les points, puis la différence de buts, puis les buts marqués ; à égalité, le premier arrivé passe devant.",
        "La page « Défi de la semaine », ouverte à tous, présente le club à relever, la fin du défi et les classements de la semaine et de la précédente.",
        "Une partie de défi par semaine, en plus de tes parties habituelles ; elle est supprimée le mardi qui suit la fin de sa semaine.",
        "Au classement, les comptes Google figurent sous leur prénom ; dans la partie, une bannière suit tes journées, puis ton score et ton rang provisoire.",
      ],
    },
    en: {
      title: "The weekly challenge",
      items: [
        "Every Monday brings a new challenge: the same club and the same world for everyone, and ten league matchdays to post the best score.",
        "The score counts points, then goal difference, then goals scored; when it's level, whoever finished first ranks higher.",
        "The “Weekly challenge” page, open to all, shows the club to take on, when the challenge closes, and the rankings for this week and last.",
        "One challenge career a week, on top of your usual careers; it is deleted on the Tuesday after its week ends.",
        "In the rankings, Google accounts appear under their first name; inside the career, a banner follows your matchdays, then your score and provisional rank.",
      ],
    },
  },
  {
    date: "2026-11-02",
    fr: {
      title: "Le jeu en anglais",
      items: [
        "Late Winner se joue aussi en anglais : pages publiques, tous les écrans d'une partie, direct et carte de fin de saison.",
        "« FR · EN » permet de changer de langue à tout moment.",
        "Compétitions, pays et nationalités se nomment dans ta langue, comme tes parties de défi.",
        "En anglais, montants et rangs s'écrivent à la britannique (« €77.2m », « 3rd ») ; en français, le jeu te tutoie désormais partout.",
      ],
    },
    en: {
      title: "Now in English",
      items: [
        "Late Winner can now be played in English: the public pages, every career screen, the live match and the end-of-season card.",
        "“FR · EN” lets you switch language at any time.",
        "Competitions, countries and nationalities are named in your language, and so are your challenge careers.",
        "In English, amounts and positions read the British way (“€77.2m”, “3rd”); in French, the game now uses the informal “tu” throughout.",
      ],
    },
  },
  {
    date: "2026-11-02",
    fr: {
      title: "Premiers pas guidés",
      items: [
        "À la création, trois clubs de ton pays te sont proposés : un favori, un club de milieu de tableau et un club de Division 2 à faire remonter.",
        "Le nom de la partie se remplit d'après ton club, et les réglages avancés passent sous « Options ».",
        "Sur l'Accueil, « Tes trois premières actions » te guident : voir l'effectif, choisir ta composition, jouer ton premier match.",
        "Quatre bulles d'aide expliquent la note, le poste secondaire, l'argent et la simulation ; tu peux les fermer, et elles s'arrêtent d'elles-mêmes à ton cinquième match.",
      ],
    },
    en: {
      title: "Guided first steps",
      items: [
        "When you create a career, three clubs from your country are suggested: a favourite, a mid-table club and a Division 2 side to bring back up.",
        "The career name fills itself in from your club, and the advanced settings tuck away under “Options”.",
        "On Home, “Your first three moves” show you the way: see your squad, pick your line-up, play your first match.",
        "Four tips explain ratings, secondary positions, money and simulation; you can close them, and they stop by themselves at your fifth match.",
      ],
    },
  },
  {
    date: "2026-11-02",
    fr: {
      title: "Un nouveau design, pensé pour le téléphone",
      items: [
        "Tout le jeu passe aux couleurs de Late Winner, bleu nuit, bleu vif et orange, avec de grands titres en italique ; ton club se reconnaît à ses initiales.",
        "Cinq entrées rangent les écrans, Accueil, Équipe, Match, Marché et Club : en barre au pied de l'écran sur téléphone, en colonne sur ordinateur avec la carte « Prochain match ».",
        "Le jeu tient dans un téléphone : aucun écran ne déborde sur le côté, boutons et liens sont assez grands pour le pouce, et la composition se fait au doigt.",
        "L'Accueil s'organise autour de ton prochain match, avec le classement autour de ton club, tes chiffres clés et une liste « À faire », du plus pressant au reste.",
        "Le Marché se partage entre Acheter, quatre entrées de joueurs prêts à venir et à ta portée, et Vendre, la meilleure offre pour chacun de tes joueurs hors du onze.",
        "Le direct prend tout l'écran, avec sa grande carte du score, ses vitesses et le fil du match ; nouvelle fiche joueur, nouvel écran Club, palmarès en cartes.",
      ],
    },
    en: {
      title: "A new design, made for phones",
      items: [
        "The whole game takes on Late Winner's colours, navy, bright blue and orange, with big italic headings; your club shows by its initials.",
        "Five sections hold every screen, Home, Squad, Match, Market and Club: a bar at the bottom on phones, a side column on computers with the “Next match” card.",
        "The game fits on a phone: no screen spills over the side, buttons and links are big enough for your thumb, and line-ups work by touch.",
        "Home is built around your next match, with the table around your club, your key numbers and a “To do” list, most urgent first.",
        "The Market splits into Buy, four lists of players who would join and that you can afford, and Sell, the best offer for each player outside your eleven.",
        "The live match takes over the whole screen, with a big score card, speeds and a timeline; a new player sheet, a new Club screen, honours as cards.",
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
      ],
    },
  },
  {
    date: "2026-10-22",
    fr: {
      title: "Palmarès et carte de fin de saison",
      items: [
        "Nouvel onglet Palmarès : chaque saison terminée de ton club, de la plus récente à la plus ancienne, avec son classement, ses points, son bilan et son meilleur joueur.",
        "Passer à la saison suivante ouvre le bilan « Saison terminée », avec une carte de ta saison à télécharger ou à partager : rang, points, bilan, buts et meilleur joueur.",
        "La carte est carrée, existe aussi en version paysage, et prend l'une des couleurs de ton club.",
      ],
    },
    en: {
      title: "Honours and the end-of-season card",
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
        "Joue tout de suite, sans inscription, ou connecte-toi avec Google pour garder jusqu'à trois carrières sur tous tes appareils ; une page de confidentialité et « Supprimer mon compte » sont là dès le premier jour.",
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
        "Play straight away with no sign-up, or sign in with Google to keep up to three careers on all your devices; a privacy page and “Delete my account” are there from day one.",
      ],
    },
  },
];
