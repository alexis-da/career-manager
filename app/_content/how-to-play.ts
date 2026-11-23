// The « How to play » guide (app/how-to-play, app/fr/comment-jouer), in French and English: from the creation of a career
// to its first match, then the market, the line-up, the match events, the objectives, the European competitions, the
// weekly challenge and the daily missions. In a
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
  fr: "Late Winner est un jeu de carrière de football gratuit, dans ton navigateur : 198 clubs de cinq pays, deux divisions et une coupe par pays, et deux coupes d'Europe. Voici l'essentiel, du choix de ton club à ta première saison.",
  en: "Late Winner is a free football career game in your browser: 198 clubs from five countries, each with two divisions and a cup, and two European cups. Here are the essentials, from choosing your club to your first season.",
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
        "Sinon, tape deux lettres dans **Chercher parmi les 198 clubs** ou ouvre **Parcourir les 198 clubs**. **Ton nom de manager** est déjà rempli (« Coach ») : change-le si tu veux, puis touche **Lancer ma carrière**.",
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
        "Otherwise, type two letters into **Search the 198 clubs** or open **Browse the 198 clubs**. **Your manager name** is already filled in (“Coach”): change it if you like, then press **Start my career**.",
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
        "Dans ta première carrière, ton adjoint t'accompagne jusqu'à la fin de ce premier match, puis revient les jours suivants, deux étapes par jour au plus : une phrase à chaque étape, le bon bouton mis en avant, et c'est toi qui joues. **Passer le tutoriel** le passe d'un coup ; tu le reprends dans **Club**, **Réglages**.",
        "Choisis la vitesse, **x1**, **x2** ou **x4**. **Pause à la 15e** (puis 30e, 60e, 75e) arrête le match pour changer ton équipe. À la **Mi-temps**, le match s'arrête seul. **Aller à la mi-temps** puis **Aller au résultat** jouent la suite d'un coup, ton adjoint décidant pour toi.",
        "Pas envie de regarder ? **Simuler** joue sans direct jusqu'à la date choisie, puis te donne le bilan.",
        "À la fin, **Continuer** te ramène à l'**Accueil** : **Dernier résultat**, **Voir la feuille de match**, le classement et **À faire**, ce qui t'attend.",
      ],
    },
    en: {
      title: "Your first match",
      blocks: [
        "On your career's **Home** screen, press **Play the match**: after the dates when only other clubs play, your match is played live.",
        "In your first career, your assistant is by your side until the end of this first match, then comes back on the following days, two steps a day at most: one sentence at each step, the right button highlighted, and you do the playing. **Skip the tutorial** skips it at once; pick it up again in **Club**, **Settings**.",
        "Pick a speed, **x1**, **x2** or **x4**. **Pause at 15’** (then 30’, 60’, 75’) stops the match so you can change your team. At **Half-time** the match stops by itself. **Go to half-time** then **Go to the result** play on in one go, with your assistant deciding for you.",
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
          "**Penalty pour toi !** Choisis le tireur : sa chance dépend de sa forme, de sa condition et, sous la pression de la fin de match, de son expérience",
          "**Échauffourée** : **Calmer tes joueurs**, sans risque, ou **Protester**, un pari : ton équipe se transcende ou perd la tête, et ton capitaine risque un carton",
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
          "**Penalty to you!** Pick the taker: their chance depends on their form, their fitness and, under late-match pressure, their experience",
          "**Scuffle**: **Calm your players down**, no risk, or **Protest**, a gamble: your team raises its game or loses its head, and your captain risks a card",
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
        "Ta carrière se raconte dans **Club**, **Histoire** : la salle des trophées et ceux qui restent à conquérir, tes records, les légendes de ton club et une carte de carrière à partager.",
      ],
    },
    en: {
      title: "Objectives and the season",
      blocks: [
        "Each season, the board sets you a league finish and a cup round, and offers three objectives from **Youth**, **Entertainment**, **Solidity** and **Good management**. Pick one on the **Season start** screen before your first match, or your assistant will.",
        "**Chairman's confidence** follows your objectives, but the board never sacks its manager.",
        "At the end of the season, **Move on to next season** leads to the review, then to your funding: the budget for your reputation rank, multiplied by 0.80 to 1.40 depending on your objectives, plus half your unspent budget.",
        "Three clubs go up and three go down in England, Spain and Italy, two in Germany and France. Each country has its **Cup**, a knockout between its two divisions.",
        "Your career's story is under **Club**, **History**: the trophy room and the trophies still to win, your records, your club's legends and a career card to share.",
      ],
    },
  },
  {
    id: "europe",
    fr: {
      title: "Les coupes d'Europe",
      blocks: [
        "Les quatre premiers de chaque première division jouent la **Coupe des Lauriers** la saison suivante ; les 5e et 6e et le vainqueur de la coupe, ou le 7e, la **Coupe des Fanions**. Dès ta première saison, d'après le classement réel de la saison précédente.",
        "D'abord une phase de ligue : six matchs (quatre en Coupe des Fanions) contre des clubs des autres pays, un seul classement. Les quatre premiers vont en quarts, du 5e au 12e en barrages ; puis des matchs secs jusqu'à la finale, sur terrain neutre, avec prolongation et tirs au but.",
        "On joue le mercredi : fais tourner ton effectif. **À faire**, sur l'**Accueil**, signale tes titulaires fatigués avant un match européen. Trois jaunes en Europe valent un match de suspension.",
        "Chaque victoire et chaque tour rapportent une prime, jusqu'à 23,6 M€ pour un parcours parfait en Coupe des Lauriers ; la direction te fixe un objectif européen, et un beau parcours fait grandir la réputation de ton club. Tes primes de la saison sont dans **Club**, carte **Finances** ; classement, tableau et matchs dans **Match**, **Europe**. Pas d'Europe dans une partie de défi.",
      ],
    },
    en: {
      title: "The European cups",
      blocks: [
        "Each first division's top four play the **Laurel Cup** the following season; its 5th and 6th and its cup winners, or its 7th, the **Pennant Cup**. From your first season, based on the real table of the season before.",
        "First a league phase: six matches (four in the Pennant Cup) against clubs from other countries, in a single table. The top four go into the quarter-finals, 5th to 12th into the play-offs; then single-leg ties up to the final, on neutral ground, with extra time and penalties.",
        "European matches are on Wednesdays: rotate your squad. **To do**, on **Home**, flags your tired starters before a European match. Three yellow cards in Europe mean a one-match ban.",
        "Every win and every round brings prize money, up to €23.6m for a perfect run in the Laurel Cup; the board sets you a European objective, and a good run raises your club's reputation. Your season's prize money is under **Club**, on the **Finances** card; table, bracket and matches under **Match**, **Europe**. No Europe in a challenge career.",
      ],
    },
  },
  {
    id: "internationals",
    fr: {
      title: "Les sélections nationales",
      blocks: [
        "Quatre fois par saison, début septembre, mi-octobre, mi-novembre et fin mars, une **trêve internationale** arrête tous les championnats et les coupes : les nations jouent deux matchs, le vendredi et le mardi. Chacune appelle ses 23 meilleurs joueurs, de nos clubs ou d'ailleurs, hors de nos championnats.",
        "Avant la trêve, **À faire**, sur l'**Accueil**, te dit lesquels de tes joueurs sont appelés, et ta fiche d'effectif les marque **En sélection**. **Passer la trêve** la joue seule : à son retour, **À faire** te signale ceux qui reviennent blessés ou fatigués, avant ton prochain match.",
        "La fiche d'un joueur compte ses sélections et ses buts avec sa nation ; le **Calendrier** montre les trêves, et **Match**, **Sélections** classe les 14 nations par force, avec leurs 23 et les résultats de la dernière trêve. Pas de trêve dans une partie de défi.",
        "En Espagne, en Italie, en Allemagne et en France, les championnats s'arrêtent aussi pour les fêtes, du 21 décembre au 3 janvier ; l'Angleterre joue pendant les fêtes. La saison finit le même jour pour tous : quelques journées passent en semaine.",
        "Les trêves mènent à un tournoi d'été, un été sur deux : les nations d'Europe y jouent les **éliminatoires** de la **Coupe du Vieux Continent** (les six premières d'une poule de neuf), puis, au cycle suivant, celles de la **Coupe des Hémisphères** (cinq européennes et trois de la zone Monde). Le tournoi se joue en juin, au passage à la saison suivante, et tes joueurs en reviennent reposés ; **Sélections** montre le classement, les groupes, le tableau final et le vainqueur, et la fiche d'un joueur garde ses titres.",
        "Avec un club réputé et des trophées récents, une fédération peut te proposer son poste de **sélectionneur** au passage d'une saison : l'offre t'attend sur l'écran de début de saison, avec l'objectif de la fédération (la qualification, les demi-finales ou la finale du tournoi), jusqu'au premier match de ton club. Tu gardes ton club : la sélection joue pendant les trêves et en juin.",
        "Sélectionneur, tu retrouves ta nation sous **Équipe**, **Sélection** : ton adjoint y prépare la liste des 23 et la composition de chaque trêve, que tu valides d'un geste ou que tu changes. Tes joueurs appelés partent comme les autres, et reviennent fatigués. **Prochain match** s'arrête avant chacun de tes matchs à enjeu, éliminatoires et tournoi : joue-le en direct, comme un match de ton club, ou simule-le ; ton adjoint joue les matchs amicaux, sauf si tu décoches **L'adjoint joue les amicaux**. Quand ta nation est qualifiée, ta saison se termine avec son tournoi, en juin.",
        "Si ta nation ne se qualifie pas, ou finit le tournoi sous l'objectif, la fédération met fin à ta mission ; ton club n'en sait rien. Tu peux aussi **Quitter la sélection** entre deux trêves, et d'autres offres viendront. L'**Histoire** garde tes missions et tes trophées de sélectionneur.",
      ],
    },
    en: {
      title: "National teams",
      blocks: [
        "Four times a season, early September, mid-October, mid-November and late March, an **international break** stops every league and cup: the nations play two matches, on Friday and Tuesday. Each calls its 23 best players, from our clubs or from elsewhere, outside our leagues.",
        "Before the break, **To do**, on **Home**, tells you which of your players are called up, and your squad marks them **Called up**. **Play the break** plays it on its own: when it is over, **To do** flags those who come back injured or tired, before your next match.",
        "A player's sheet counts his caps and goals for his nation; the **Fixtures** show the breaks, and **Match**, **Internationals** ranks the 14 nations by strength, with their squads and the last break's results. No breaks in a challenge career.",
        "In Spain, Italy, Germany and France, the leagues also stop for the holidays, from 21 December to 3 January; England plays through them. The season ends on the same day for everyone: a few matchdays move to midweek.",
        "The breaks lead to a summer tournament, every other summer: Europe's nations play the **qualifiers** of the **Old Continent Cup** (the top six of a group of nine), then, the cycle after, those of the **Hemispheres Cup** (five European nations and three from the World zone). The tournament is played in June, as the season turns, and your players come back rested; **Internationals** shows the table, the groups, the knockout stage and the winner, and a player's sheet keeps his titles.",
        "With a well-known club and recent trophies, a federation may offer you its **national coach**'s post as a season turns: the offer waits for you on the season's start screen, with the federation's objective (qualifying, the semi-finals or the final of the tournament), until your club's first match. You keep your club: the national team plays during the breaks and in June.",
        "As national coach, you find your nation under **Squad**, **National team**: your assistant prepares there the squad of 23 and the lineup of each break, which you confirm in one go or change. Your players called up go like everyone else's, and come back tired. **Next match** stops before each of your matches at stake, qualifiers and tournament: play it live, like a match of your club, or simulate it; your assistant plays the friendlies, unless you untick **Your assistant plays the friendlies**. When your nation qualifies, your season ends with its tournament, in June.",
        "If your nation fails to qualify, or ends the tournament short of the objective, the federation ends your spell; your club knows nothing of it. You can also **Leave the national team** between two breaks, and other offers will come. **History** keeps your spells and your trophies as national coach.",
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
  {
    id: "missions",
    fr: {
      title: "Les missions du jour et les jetons",
      blocks: [
        "Chaque jour, trois **Missions du jour** t'attendent sur l'**Accueil**, sous ton prochain match : une facile (10 jetons), une moyenne (20) et une difficile (40), et 30 de plus pour les trois. Elles comptent dans toutes tes carrières, sauf celles du défi. Une mission ne te plaît pas ? **Changer de mission**, une fois par jour, sur une mission pas encore commencée.",
        "Chaque jour avec une mission faite allonge ta **série** : 50 jetons au 3e jour de chaque cycle de 7, 150 et un cosmétique exclusif au 7e. Le **protège-série** pardonne tout seul un jour manqué.",
        "Tes jetons se dépensent dans **Club**, **Récompenses** : stage de forme, soin express, rallonge de budget et jeune prometteur pour ta carrière, avec des limites par saison ; titres et cadres pour ta **Collection**. Ils te suivent dans toutes tes carrières et ne se perdent jamais.",
      ],
    },
    en: {
      title: "Daily missions and tokens",
      blocks: [
        "Every day, three **Daily missions** wait for you on **Home**, under your next match: an easy one (10 tokens), a medium one (20) and a hard one (40), and 30 more for all three. They count in all your careers but challenge ones. Don't like a mission? **Change mission**, once a day, on one not started yet.",
        "Each day with a mission done makes your **streak** longer: 50 tokens on day 3 of each 7-day cycle, 150 and an exclusive cosmetic on day 7. The **streak shield** forgives a missed day by itself.",
        "Spend your tokens in **Club**, **Rewards**: fitness camp, express care, budget top-up and promising youngster for your career, with limits each season; titles and frames for your **Collection**. They follow you across all your careers and are never lost.",
      ],
    },
  },
];
