// The « How to play » guide (app/how-to-play, app/fr/comment-jouer), in French and English: from the creation of a career
// to its first match, then the market, the line-up, the match events, the objectives and the weekly challenge. In a
// string, **…** marks a label of the game's screens, as they read, shown in bold (GuideText, app/_components/documents).
export type GuideBlock = string | string[]; // a paragraph, or the items of a list
export type GuideText = { title: string; blocks: GuideBlock[] };
export type GuideSection = { id: string; fr: GuideText; en: GuideText };

/** The page's own words: its title, its table of contents, its last button. */
export const GUIDE_LABELS = {
  fr: { title: "Comment jouer", contents: "Sommaire", start: "Lancer ma carrière" },
  en: { title: "How to play", contents: "Contents", start: "Start my career" },
} as const;

export const GUIDE_INTRO: { fr: string; en: string } = {
  fr: "Late Winner est un jeu de carrière de football gratuit, dans ton navigateur : 198 clubs de cinq pays, deux divisions et une coupe par pays. Voici l'essentiel, du choix de ton club à ta première saison.",
  en: "Late Winner is a free football career game in your browser: 198 clubs from five countries, each with two divisions and a cup. Here are the essentials, from choosing your club to your first season.",
};

export const GUIDE: GuideSection[] = [
  {
    id: "create",
    fr: {
      title: "Créer ta carrière",
      blocks: [
        "Sur la page d'accueil, trois clubs français te sont proposés, chacun avec l'objectif de classement que la direction te fixera :",
        [
          "**Facile · favori** : le favori de la Division 1, attendu dans le top 3",
          "**Équilibré · conseillé** : un club du milieu de tableau, présélectionné",
          "**Difficile · Division 2** : un club à qui la direction demande de monter",
        ],
        "Sinon, tape deux lettres dans **Chercher parmi les 198 clubs** ou ouvre **Parcourir les 198 clubs**. Écris **Ton nom de manager**, puis touche **Lancer ma carrière**.",
        "Pas besoin de compte : sans lui, tu mènes une seule carrière, liée à ce navigateur. **Continuer avec Google** t'en donne trois, sur tous tes appareils.",
      ],
    },
    en: {
      title: "Create your career",
      blocks: [
        "On the home page, three English clubs are suggested, each with the league objective the board will set you:",
        [
          "**Easy · favourite**: the Division 1 favourite, expected in the top three",
          "**Balanced · recommended**: a mid-table club, selected by default",
          "**Hard · Division 2**: a club whose board wants promotion",
        ],
        "Otherwise, type two letters into **Search the 198 clubs** or open **Browse the 198 clubs**. Then enter **Your manager name** and press **Start my career**.",
        "No account needed: without one, you get a single career, tied to this browser. **Continue with Google** gives you three, on all your devices.",
      ],
    },
  },
  {
    id: "first-match",
    fr: {
      title: "Ton premier match",
      blocks: [
        "Sur l'**Accueil** de ta carrière, touche **Jouer le match** : après les dates où seuls les autres clubs jouent, ton match se joue en direct.",
        "Choisis la vitesse, **x1**, **x2** ou **x4**. **Coaching à la 15e** (puis 30e, 60e, 75e) arrête le match pour changer ton équipe. À la **Mi-temps**, le match s'arrête seul. **Aller à la mi-temps** puis **Aller au résultat** jouent la suite d'un coup, ton adjoint décidant pour toi.",
        "Pas envie de regarder ? **Simuler** joue sans direct jusqu'à la date choisie, puis te donne le bilan.",
        "À la fin, **Continuer** te ramène à l'**Accueil** : **Dernier résultat**, **Voir la feuille de match**, le classement et **À faire**, ce qui t'attend.",
      ],
    },
    en: {
      title: "Your first match",
      blocks: [
        "On your career's **Home** screen, press **Play the match**: after the dates when only other clubs play, your match is played live.",
        "Pick a speed, **x1**, **x2** or **x4**. **Coach at 15’** (then 30’, 60’, 75’) stops the match so you can change your team. At **Half-time** the match stops by itself. **Go to half-time** then **Go to the result** play on in one go, with your assistant deciding for you.",
        "Rather not watch? **Simulate** plays on without the live match up to the date you choose, then gives you a summary.",
        "At full time, **Continue** takes you back to **Home**: **Last result**, **See the match report**, the table and **To do**, whatever needs your attention.",
      ],
    },
  },
  {
    id: "market",
    fr: {
      title: "Le marché",
      blocks: [
        "Sous **Marché**, l'onglet **Acheter** te propose un joueur à la fois, dans quatre entrées :",
        [
          "**Mes besoins** : pour ton point faible",
          "**Pépites** : des jeunes à fort potentiel",
          "**Bonnes affaires** : moins chers que leur valeur",
          "**Stars** : les meilleurs, prêts à venir",
        ],
        "**Passer** montre le suivant, **Recruter** puis **Confirmer** le signe. Tous acceptent ton club et tiennent dans ton budget transferts et ta marge salariale, ce qui reste sous ton plafond.",
        "**Vendre** montre ce que les autres clubs offrent pour tes remplaçants. Tout se traite au mercato, du 1er juillet au 31 août, puis en janvier. **Marché complet : filtres, joueurs libres, mouvements** ouvre le reste.",
      ],
    },
    en: {
      title: "The market",
      blocks: [
        "Under **Market**, the **Buy** tab offers you one player at a time, in four entries:",
        [
          "**My needs**: for your weak spot",
          "**Gems**: young players with high potential",
          "**Bargains**: cheaper than they're worth",
          "**Stars**: the best, ready to join you",
        ],
        "**Pass** shows the next one, **Sign** then **Confirm** seals the deal. They would all join your club and fit your transfer budget and your wage room, what is left under your wage cap.",
        "The **Sell** tab shows what other clubs offer for your substitutes. It all happens in the transfer window, from 1 July to 31 August, then in January. **Full market: filters, free agents, moves** opens the rest.",
      ],
    },
  },
  {
    id: "lineup",
    fr: {
      title: "La composition",
      blocks: [
        "Sous **Équipe**, **Composition** fixe ton onze. Ouvre ton dispositif, **4-3-3 sentinelle** au départ, pour voir les 17, les trois meilleurs pour ton effectif en tête.",
        "Choisis un poste pour voir ses candidats, classés par note à ce poste et étiquetés **À son poste**, **Poste secondaire**, **Dépanne** ou **Hors poste**.",
        "**Composition automatique** aligne le onze de ton adjoint, sans blessé ni suspendu. Choisis ta **Consigne de départ**, **Attaquer**, **Équilibré** ou **Fermer**, puis touche **Enregistrer**.",
        "La **Condition** baisse sur le terrain et remonte de 5 points par jour ; sous 70, gare aux blessures. Un rouge suspend pour le match suivant, un 5e jaune pour le prochain de la compétition.",
      ],
    },
    en: {
      title: "Your line-up",
      blocks: [
        "Under **Squad**, **Line-up** sets your eleven. Open your formation, **4-3-3 holding** to begin with, to see all 17, with the three best for your squad at the top.",
        "Select a position to see its candidates, ranked by their rating there and labelled **Natural position**, **Secondary position**, **Filling in** or **Out of position**.",
        "**Automatic line-up** fields your assistant's eleven, with no injured or suspended players. Pick your **Starting instruction**, **Attack**, **Balanced** or **Sit back**, then press **Save**.",
        "**Fitness** drops on the pitch and comes back by 5 points a day; below 70, injuries become likelier. A red card means a ban for the next match, a 5th yellow a ban for the competition's next match.",
      ],
    },
  },
  {
    id: "events",
    fr: {
      title: "Les événements du match",
      blocks: [
        "Une à trois fois par match, à la 15e, 30e, 60e ou 75e minute, le direct s'arrête sur un choix :",
        [
          "**Penalty pour toi !** Choisis le tireur, sa chance affichée",
          "**Coup franc dangereux** : **Frapper** ou **Jouer en combinaison**",
          "**Joueur touché** : **Le sortir** ou **Le laisser jouer**",
        ],
        "Le choix de ton adjoint, **Conseil de l'adjoint**, est présélectionné : garde-le ou change-le, puis **Valider**.",
        "À chaque arrêt, **Coaching** ouvre ton équipe : 5 remplacements en 3 fenêtres pendant le jeu ; la mi-temps n'en prend pas. **Faire ce changement** suit le conseil de ton adjoint.",
        "Ta consigne règle le match : **Attaquer** l'ouvre, **Équilibré** le laisse suivre son cours, **Fermer** le resserre. Donnée à une pause, elle tient jusqu'à la 90e ; sans elle, ton adjoint l'adapte au score.",
      ],
    },
    en: {
      title: "Match events",
      blocks: [
        "One to three times a match, at the 15th, 30th, 60th or 75th minute, the live match stops for a decision:",
        [
          "**Penalty to you!** Pick the taker, with their chance shown",
          "**Dangerous free kick**: **Shoot** or **Play it short**",
          "**Player hurt**: **Take him off** or **Let him play on**",
        ],
        "Your assistant's choice, **Assistant's pick**, is preselected: keep it or change it, then **Confirm**.",
        "At every stop, **Coaching** opens your team: 5 substitutions in 3 windows during play; half-time takes none. **Make this substitution** follows your assistant's advice.",
        "Your instruction shapes the match: **Attack** opens it up, **Balanced** lets it run its course, **Sit back** tightens it. Given at a pause, it holds until the 90th minute; without one, your assistant adapts it to the score.",
      ],
    },
  },
  {
    id: "objectives",
    fr: {
      title: "Les objectifs et la saison",
      blocks: [
        "Chaque saison, la direction t'impose un classement et un tour de coupe, et te propose trois objectifs parmi **Jeunesse**, **Spectacle**, **Solidité** et **Bonne gestion**. Choisis-en un sur l'écran **Début de saison** avant ton premier match, sinon ton adjoint choisira.",
        "La **Confiance du président** suit tes objectifs, mais la direction ne renvoie jamais son entraîneur.",
        "En fin de saison, **Passer à la saison suivante** mène au bilan, puis à ta dotation : le budget de ton rang de réputation, multiplié par 0,80 à 1,40 selon tes objectifs, plus la moitié du budget restant.",
        "Trois clubs montent et trois descendent en Angleterre, en Espagne et en Italie, deux en Allemagne et en France. Chaque pays a sa **Coupe**, à élimination directe entre ses deux divisions.",
      ],
    },
    en: {
      title: "Objectives and the season",
      blocks: [
        "Each season, the board sets you a league finish and a cup round, and offers three objectives from **Youth**, **Entertainment**, **Solidity** and **Good management**. Pick one on the **Season start** screen before your first match, or your assistant will.",
        "**Chairman's confidence** follows your objectives, but the board never sacks its manager.",
        "At the end of the season, **Move on to next season** leads to the review, then to your funding: the budget for your reputation rank, multiplied by 0.80 to 1.40 depending on your objectives, plus half your unspent budget.",
        "Three clubs go up and three go down in England, Spain and Italy, two in Germany and France. Each country has its **Cup**, a knockout between its two divisions.",
      ],
    },
  },
  {
    id: "challenge",
    fr: {
      title: "Le défi de la semaine",
      blocks: [
        "Chaque semaine, le **Défi de la semaine** donne à tous le même club pour dix journées de championnat. Ouvre-le depuis la page d'accueil ou l'onglet **Défi** de **Club**, puis touche **Jouer le défi**.",
        "Classement aux points, puis à la différence de buts, comptes Google seulement. Ta partie de défi s'ajoute à tes carrières et disparaît le mardi suivant.",
      ],
    },
    en: {
      title: "The weekly challenge",
      blocks: [
        "Every week, the **Weekly challenge** gives everyone the same club for ten league matchdays. Open it from the home page or the **Challenge** tab under **Club**, then press **Play the challenge**.",
        "The ranking is decided on points, then goal difference, and only Google accounts appear in it. A challenge career comes on top of your others and is deleted the following Tuesday.",
      ],
    },
  },
];
