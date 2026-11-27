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
    date: "2026-11-27",
    fr: {
      title: "Tes jeunes entrent en jeu",
      items: [
        "Sous la consigne « Lancer les jeunes », ton adjoint fait entrer à la 60e, en championnat, deux de tes jeunes qui ne démarrent pas : ceux au plus gros potentiel. Même dans un grand club, tes espoirs jouent, et progressent plus vite.",
        "Choisis-les toi-même : « Le lancer » sur la fiche d'un joueur de champ de 21 ans ou moins, ou dans la vue « Jeunes » de l'Effectif, trois au plus. Club, Réglages, te dit qui il lancera.",
        "En direct, le Coaching annonce l'entrée prévue à la mi-temps et à la 60e ; si tu fais tes changements toi-même, il te la conseille.",
      ],
    },
    en: {
      title: "Your youngsters get on the pitch",
      items: [
        "Under the “Give youth a chance” brief, your assistant brings on two of your youngsters who don't start, on the hour in the league: those with the most potential. Even at a big club, your prospects play, and improve faster.",
        "Choose them yourself: “Bring him on” on the sheet of an outfield player aged 21 or under, or in the Squad's Under-21s view, three at most. Club, Settings, tells you whom he will bring on.",
        "Live, Coaching announces the planned change at half-time and on the hour; if you make your changes yourself, it advises you to make it.",
      ],
    },
  },
  {
    date: "2026-11-26",
    fr: {
      title: "Ta composition s'enregistre seule, tes jeunes ont leur chance",
      items: [
        "Plus de bouton « Enregistrer » : chaque changement de ta composition est enregistré aussitôt, et « Annuler » revient au geste d'avant. Ton premier changement d'un joueur fait du onze le tien ; « Rendre la main à l'adjoint » le lui rend. Pendant un match en direct, ta composition est figée jusqu'au coup de sifflet final : tes changements se font dans le Coaching.",
        "Dans Club, Réglages, choisis la consigne de ton adjoint : « Meilleur onze », comme avant, ou « Lancer les jeunes » : en championnat, tes 21 ans et moins jouent quand ils valent presque le titulaire, jusqu'à trois par match, et il prolonge tes espoirs.",
        "L'Effectif montre ce que l'été dernier a donné à chaque joueur et, sous « Cet été », ce que le prochain lui donnera s'il garde son rythme en championnat : jouer fait progresser. La vue « Jeunes » réunit tes 21 ans et moins avec leurs minutes, et la fiche d'un joueur montre sa note saison après saison.",
      ],
    },
    en: {
      title: "Your line-up saves itself, your youngsters get their chance",
      items: [
        "No more “Save” button: every change to your line-up is saved at once, and “Cancel” undoes your last move. Your first change to a player makes the eleven yours; “Hand back to your assistant” gives it back. During a live match, your line-up is locked until the final whistle: make your changes in Coaching.",
        "In Club, Settings, choose your assistant's brief: “Best eleven”, as before, or “Give youth a chance”: in the league, your players aged 21 or under start when they're nearly as good as the starter, up to three a match, and he renews your prospects.",
        "The Squad shows what last summer gave each player and, under “This summer”, what the next one will give him if he keeps up his league rhythm: playing makes players improve. The Under-21s view gathers your youngest with their minutes, and a player's sheet shows his rating season after season.",
      ],
    },
  },
  {
    date: "2026-11-25",
    fr: {
      title: "Ton adjoint s'occupe du quotidien",
      items: [
        "Plus de plafond salarial : ton budget transferts est ta seule limite. Un joueur libre ne coûte pas d'indemnité, mais une prime à la signature, le quart de sa valeur ; ton effectif compte 30 joueurs au plus. Les salaires disparaissent des écrans.",
        "Ton adjoint aligne le onze avant chaque match, dans ton dispositif, en reposant les fatigués. Change un joueur et le onze devient le tien ; « Rendre la main à l'adjoint » le lui rend. Une composition déjà enregistrée reste la tienne.",
        "Il s'occupe aussi des contrats : en fin de saison, il prolonge tes joueurs utiles et laisse partir les autres, et te prévient dans « À faire » avant de laisser partir un titulaire. Sur la fiche d'un joueur en fin de contrat, tu peux décider toi-même.",
        "Au mercato, il te propose de vendre ceux qui ne jouent pas, en tête de l'onglet Vendre : « Vendre » les cède aussitôt à l'offre affichée, « Garder » les écarte jusqu'à la fin du mercato.",
        "Tout se règle dans Club, Réglages, sous « Ton adjoint s'occupe de ». La mission « Enregistre ta composition » disparaît, et « Titularise un joueur de 21 ans ou moins » devient « Fais jouer un joueur de 21 ans ou moins » : une entrée en jeu suffit.",
      ],
    },
    en: {
      title: "Your assistant takes care of the day-to-day",
      items: [
        "No more wage cap: your transfer budget is your only limit. A free agent costs no fee but a signing bonus, a quarter of his value; your squad holds 30 players at most. Wages are gone from the screens.",
        "Your assistant fields the eleven before every match, in your formation, resting tired players. Change a player and the eleven becomes yours; “Hand back to your assistant” gives it back. A line-up you had already saved stays yours.",
        "He also takes care of contracts: at the end of the season, he renews your useful players and lets the others go, and warns you in “To do” before letting a starter go. On the sheet of a player whose contract is ending, you can decide yourself.",
        "In the transfer window, he suggests selling those who never play, at the top of the Sell tab: “Sell” lets them go at once at the offer shown, “Keep” sets them aside until the window closes.",
        "It's all in Club, Settings, under “Your assistant takes care of”. The “Save your line-up” mission is gone, and “Start a player aged 21 or under” becomes “Play a player aged 21 or under”: coming on is enough.",
      ],
    },
  },
  {
    date: "2026-11-24",
    fr: {
      title: "Moins d'alertes, dispositifs plus simples",
      items: [
        "« À faire », sur l'Accueil, ne montre plus que les trois choses les plus importantes, un gardien qui manque ou un titulaire absent d'abord ; « Voir tout » déplie le reste.",
        "Ton point faible n'y apparaît plus que pendant le mercato, quand tu peux le combler.",
        "Le choix du dispositif commence par les trois conseillés pour ton effectif ; les quatorze autres attendent derrière « Voir tous les dispositifs ». Le comparatif de la Composition range aussi les dispositifs du meilleur au moins bon contre ton prochain adversaire, les trois premiers d'abord.",
        "Corrigé : pendant qu'un match attend sa reprise en direct, tu ne peux plus vendre un joueur, qui pouvait être sur le terrain ; et la fiche d'un joueur d'un autre club ne dit plus à tort qu'il partira libre en fin de saison.",
      ],
    },
    en: {
      title: "Fewer alerts, simpler formations",
      items: [
        "“To do”, on Home, now shows only the three most important things, a missing goalkeeper or an absent starter first; “See all” opens the rest.",
        "Your weak spot only shows there during the transfer window, when you can do something about it.",
        "Choosing a formation starts with the three recommended for your squad; the other fourteen wait behind “See all formations”. The Line-up comparison also ranks formations from best to worst against your next opponent, the top three first.",
        "Fixed: while a match is waiting to resume live, you can no longer sell a player who might be on the pitch; and another club's player's card no longer wrongly says he will leave on a free at the end of the season.",
      ],
    },
  },
  {
    date: "2026-11-23",
    fr: {
      title: "Équilibrage : penalty, échauffourée, trêve hivernale",
      items: [
        "Penalty : la chance de chaque tireur dépend maintenant de sa forme, de sa condition à ce moment du match et de la pression, qui monte avec la minute et le score. Sous la pression, l'expérience compte : ton meilleur tireur n'est plus toujours le bon choix, et la carte te dit pourquoi.",
        "Échauffourée : « Protester » devient un pari sur la demi-heure qui suit : ton équipe se transcende ou perd la tête, et ton capitaine risque un jaune, ou le rouge s'il est déjà averti. « Calmer tes joueurs » reste sans risque.",
        "Trêve hivernale : en Espagne, en Italie, en Allemagne et en France, plus de championnat du 21 décembre au 3 janvier ; l'Angleterre joue pendant les fêtes. Même fin de saison, aucune journée en moins : quelques-unes passent en semaine. Dans une carrière en cours, à partir de la saison prochaine.",
        "Un peu plus de buts : environ 2,7 par match en moyenne, au lieu de 2,6.",
      ],
    },
    en: {
      title: "Balance: penalties, scuffles, winter break",
      items: [
        "Penalties: each taker's chance now depends on their form, their fitness at that moment of the match and the pressure, which rises with the minute and the score. Under pressure, experience counts: your best taker is no longer always the right choice, and the card tells you why.",
        "Scuffles: “Protest” becomes a gamble on the next half hour: your team raises its game or loses its head, and your captain risks a yellow card, or a red if already booked. “Calm your players down” stays risk-free.",
        "Winter break: in Spain, Italy, Germany and France, no league matches from 21 December to 3 January; England plays through the holidays. The season ends on the same day, with every matchday played: a few move to midweek. In a career already under way, from next season.",
        "A few more goals: about 2.7 a match on average, instead of 2.6.",
      ],
    },
  },
  {
    date: "2026-11-23",
    fr: {
      title: "Tutoriel : les jours suivants",
      items: [
        "Dès le lendemain de ton premier jour, ton adjoint revient avec les étapes suivantes, deux par jour au plus, les plus pressées d'abord : les missions du jour, le mercato et un joueur pour ton point faible, les objectifs de la direction, la simulation.",
        "Il te prévient aussi au bon moment : la trêve internationale et tes joueurs appelés, ton premier match européen, ton premier match de coupe, un titulaire fatigué avant le coup d'envoi, puis le jour où la direction commence à juger.",
        "L'Effectif et la Composition ont leur étape à leur première ouverture : la note et la condition d'un joueur, puis le poste le plus faible de ton onze et qui peut y jouer.",
        "Ce que le premier jour cachait revient avec son étape : l'argent avec le mercato, les missions et les Récompenses avec les leurs, les objectifs, puis les onglets Sélections, Europe et Coupe à leur moment. Quand tout est vu, ton adjoint te le dit une fois et laisse ses conseils dans « À faire ».",
      ],
    },
    en: {
      title: "Tutorial: the following days",
      items: [
        "From the day after your first day, your assistant comes back with the next steps, two a day at most, the most pressing first: the day's missions, the transfer window and a player for your weak spot, the board's objectives, simulating.",
        "Your assistant also tells you at the right time: the international break and your called-up players, your first European match, your first cup tie, a tired starter before kick-off, then the day the board starts judging.",
        "Squad and Line-up get their own step the first time you open them: a player's rating and fitness, then your eleven's weakest position and who can play there.",
        "What the first day kept hidden comes back with its step: money with the transfer window, missions and Rewards with theirs, the objectives, then the Internationals, Europe and Cup tabs at their moment. Once everything is seen, your assistant says so once and leaves the advice in « To do ».",
      ],
    },
  },
  {
    date: "2026-11-23",
    fr: {
      title: "Tutoriel de la première carrière",
      items: [
        "Ta première carrière commence avec ton adjoint : à chaque étape de ton premier jour, il met en avant le bon bouton et te dit en une phrase à quoi il sert. C'est toi qui fais le geste, et rien ne t'arrête.",
        "Du choix du club au coup de sifflet final de ton premier match : lancer le match, choisir la vitesse du direct, prendre ta première décision, la mi-temps et le Coaching, puis « À demain ».",
        "Le premier jour, l'Accueil reste simple : l'argent, les missions, les objectifs et le défi arrivent dès le lendemain, et quelques onglets attendent leur moment.",
        "« Passer le tutoriel » montre tout d'un coup, à tout moment, et tu le reprends depuis Club, Réglages. Une deuxième carrière n'a pas de tutoriel, une partie du défi non plus : le défi garde ses trois premières actions.",
      ],
    },
    en: {
      title: "First career tutorial",
      items: [
        "Your first career starts with your assistant: at each step of your first day, the right button is highlighted and your assistant tells you in one sentence what it does. You make the move yourself, and nothing holds you up.",
        "From choosing your club to the final whistle of your first match: kicking it off, picking the speed of the live match, your first decision, half-time and Coaching, then « See you tomorrow ».",
        "On the first day, the Home screen stays simple: money, missions, objectives and the challenge arrive the next day, and a few tabs wait for their moment.",
        "« Skip the tutorial » shows everything at once, at any time, and you can pick it up again in Club, Settings. A second career has no tutorial, nor does a challenge save: the challenge keeps its first three actions.",
      ],
    },
  },
  {
    date: "2026-11-19",
    fr: {
      title: "Sélectionneur",
      items: [
        "Une fédération peut te proposer son poste de sélectionneur au passage d'une saison, dès la fin de la première : il faut un club réputé et des trophées récents, et une grande nation demande plus qu'une petite. Tu acceptes ou tu déclines, d'autres offres viendront ; tu gardes toujours ton club.",
        "À chaque trêve, ton adjoint prépare la liste des 23 et la composition : valide-les d'un geste, ou change-les. Appeler les joueurs de ton propre club, c'est les voir revenir fatigués pour le samedi suivant, comme ceux des autres clubs.",
        "Tes matchs à enjeu, éliminatoires et tournoi d'été, s'arrêtent pour toi : joue-les en direct, avec les événements à choix, les remplacements et les consignes du club, ou simule-les. Ton adjoint joue les matchs amicaux, sauf si tu préfères les jouer toi-même.",
        "La fédération te fixe un objectif pour chaque tournoi, selon la force de ta nation : la qualification, les demi-finales ou la finale. Si ta nation ne se qualifie pas, ou finit sous l'objectif, elle met fin à ta mission, sans rien changer pour ton club. Tu peux aussi quitter la sélection entre deux trêves.",
        "Équipe → Sélection rassemble ta nation : son objectif, sa prochaine trêve, ta liste, ta composition, son classement des éliminatoires et ses résultats. L'Histoire garde tes missions, les tournois gagnés comme sélectionneur y ont leur trophée, la carte de la saison le dit, et un tournoi gagné débloque le titre « Sélectionneur ».",
      ],
    },
    en: {
      title: "National coach",
      items: [
        "A federation may offer you its national coach's post as a season turns, from the end of the first: it takes a well-known club and recent trophies, and a big nation asks for more than a small one. Accept or decline, other offers will come; you always keep your club.",
        "At each break, your assistant prepares the squad of 23 and the lineup: confirm them in one go, or change them. Calling up your own club's players means seeing them come back tired for the Saturday after, like everyone else's.",
        "Your matches at stake, qualifiers and the summer tournament, stop for you: play them live, with the club's choice events, substitutions and instructions, or simulate them. Your assistant plays the friendlies, unless you would rather play them yourself.",
        "The federation sets you an objective for each tournament, by your nation's strength: qualifying, the semi-finals or the final. If your nation fails to qualify, or falls short of the objective, it ends your spell, without changing anything for your club. You can also leave the post between two breaks.",
        "Squad → National team gathers your nation: its objective, its next break, your squad, your lineup, its qualifying table and its results. History keeps your spells, the tournaments you win as national coach get their trophy, the season card says so, and a tournament won unlocks the « National coach » title.",
      ],
    },
  },
  {
    date: "2026-11-18",
    fr: {
      title: "Éliminatoires et tournois d'été",
      items: [
        "Les trêves comptent désormais : les nations d'Europe y jouent les éliminatoires de la Coupe du Vieux Continent, une poule de neuf dont les six premières se qualifient ; au cycle suivant, celles de la Coupe des Hémisphères, avec la zone Monde en matchs aller et retour. Les nations libres ce jour-là jouent des matchs amicaux.",
        "Un été sur deux, le tournoi se joue au passage à la saison suivante : deux groupes, puis les demi-finales et la finale, avec prolongation et tirs au but. Tes internationaux y partent, puis reprennent la saison suivante pleinement reposés, comme tout le monde.",
        "Sous Match, l'onglet Sélections suit le tournoi : le classement des éliminatoires et ses places qualificatives, les groupes une fois tirés, puis le tableau final, le vainqueur et tes joueurs. Chaque match de la dernière trêve dit aussi son étape.",
        "La fiche d'un joueur garde les tournois qu'il a gagnés avec sa sélection ; dans l'Histoire, une section Sélections montre tes internationaux et les titres de tes joueurs gagnés pendant qu'ils étaient au club.",
        "Le premier tournoi arrive deux saisons après le début des éliminatoires : en juin 2028 pour une carrière commencée maintenant, un an plus tard pour une carrière déjà en cours, qui commence ses éliminatoires à sa saison suivante. Jamais dans une partie du défi.",
      ],
    },
    en: {
      title: "Qualifiers and summer tournaments",
      items: [
        "The breaks now count: Europe's nations play the Old Continent Cup's qualifiers there, a group of nine whose top six qualify; the cycle after, the Hemispheres Cup's, the World zone playing home and away. The nations free on the day play friendlies.",
        "Every other summer, the tournament is played as the season turns: two groups, then the semi-finals and the final, with extra time and penalties. Your internationals go, then start the next season fully rested, like everyone else.",
        "Under Match, the Internationals tab follows the tournament: the qualifiers' table and its qualifying places, the groups once drawn, then the knockout stage, the winner and your players. Each match of the last break also says its stage.",
        "A player's sheet keeps the tournaments he won with his nation; in History, an Internationals section shows your internationals and the titles your players won while at the club.",
        "The first tournament comes two seasons after the qualifiers start: in June 2028 for a career started now, a year later for a career already under way, which starts its qualifiers at its next season. Never in a challenge career.",
      ],
    },
  },
  {
    date: "2026-11-18",
    fr: {
      title: "Les sélections nationales et leurs trêves",
      items: [
        "Tes joueurs partent en sélection : quatre trêves internationales par saison, début septembre, mi-octobre, mi-novembre et fin mars, deux matchs chacune. Aucun match de club pendant une trêve ; tes internationaux reviennent fatigués s'ils ont joué, parfois blessés, et comptent leurs sélections et leurs buts.",
        "« À faire » te dit qui part avant la trêve, et qui revient blessé ou fatigué après ; « Prochain match » s'arrête après la trêve, pour que tu prépares ton match. La fiche d'un joueur montre ses sélections, le calendrier les trêves.",
        "Sous Match, l'onglet Sélections classe les 14 nations de tes joueurs par force, avec leurs 23 et les résultats de la dernière trêve. Le Brésil, l'Argentine ou le Portugal appellent aussi leurs joueurs qui évoluent hors de nos championnats.",
        "Les trêves arrivent dans une carrière déjà commencée à sa saison suivante, jamais dans une partie du défi. Pour leur faire de la place, les championnats à 20 clubs jouent deux mardis, fin décembre et mi-mars, et un tour de coupe et deux journées européennes changent de date.",
        "Dans l'Histoire, « Voir toutes les légendes » montre toutes celles de ton club, et « En route vers la légende » ne garde que les joueurs à plus de 75 points.",
      ],
    },
    en: {
      title: "National teams and their breaks",
      items: [
        "Your players go on international duty: four international breaks a season, early September, mid-October, mid-November and late March, two matches each. No club match during a break; your internationals come back tired if they played, sometimes injured, and count their caps and goals.",
        "To do tells you who goes before the break, and who comes back injured or tired after it; Next match stops after the break so that you can prepare your match. A player's sheet shows his caps, the calendar the breaks.",
        "Under Match, the Internationals tab ranks the 14 nations of your players by strength, with their squads and the last break's results. Brazil, Argentina or Portugal also call their players who play outside our leagues.",
        "The breaks reach a career already under way at its next season, never a challenge career. To make room for them, the 20-club leagues play two Tuesdays, in late December and mid-March, and a cup round and two European matchdays move.",
        "In History, See all legends shows every legend of your club, and On the road to legend keeps only the players above 75 points.",
      ],
    },
  },
  {
    date: "2026-11-18",
    fr: {
      title: "L'histoire de ta carrière",
      items: [
        "Sous Club, l'onglet Palmarès devient Histoire. Ta salle des trophées y range tes championnats, tes coupes, tes Coupes des Lauriers et des Fanions et tes montées, avec leurs saisons, et garde la place de ceux qui restent à conquérir.",
        "Tes records : plus large victoire, plus longue invincibilité, meilleur total de points en Division 1 et en Division 2, meilleur buteur et joueur le plus capé du club, plus gros achat, plus grosse vente et jeune formé le plus réussi. Le bilan de chaque saison dit ceux qu'elle a battus.",
        "Les légendes de ton club, classées par un indice qui compte les matchs, les buts, les passes, les élections de joueur de la saison et les trophées gagnés avec lui, et les joueurs en route vers la légende.",
        "Une carte de carrière à partager, dans les cadres de ta collection. Saison par saison, tes objectifs atteints, ton budget et ton meilleur buteur ; chaque fin de saison garde désormais tes buteurs exacts, tes triplés et la note de tes joueurs.",
      ],
    },
    en: {
      title: "Your career's story",
      items: [
        "Under Club, the Honours tab becomes History. Your trophy room holds your league titles, cups, Laurel and Pennant Cups and promotions, with their seasons, and keeps a place for those still to win.",
        "Your records: biggest win, longest unbeaten run, most points in Division 1 and in Division 2, the club's top scorer and most capped player, record signing, record sale and best academy graduate. Each season's review names the ones it broke.",
        "Your club's legends, ranked by an index counting matches, goals, assists, player of the season awards and trophies won with them, and the players on the road to legend.",
        "A career card to share, in the frames of your collection. Season by season, your objectives met, your budget and your top scorer; each season's end now keeps your exact scorers, your hat-tricks and your players' ratings.",
      ],
    },
  },
  {
    date: "2026-11-17",
    fr: {
      title: "Tes primes sur l'écran Club, et des adversaires qui font tourner",
      items: [
        "Sur l'écran Club, la carte Finances montre les primes reçues cette saison : celles de ta coupe d'Europe, participation comprise, et celles de la coupe.",
        "L'objectif européen des clubs les plus réputés de leur coupe d'Europe est désormais d'atteindre les quarts de finale, comme pour les clubs du milieu : les demi-finales n'étaient atteintes qu'une saison sur trois ou quatre. Il vaut pour les saisons qui s'ouvrent ; la saison en cours garde son objectif.",
        "Les clubs adverses engagés en Europe font davantage tourner : plus un titulaire est fatigué, plus ils acceptent de le remplacer par un joueur moins fort, et ils restent frais d'une saison à l'autre. La composition automatique de ton adjoint suit la même règle.",
      ],
    },
    en: {
      title: "Your prize money on the Club screen, and rivals who rotate",
      items: [
        "On the Club screen, the Finances card shows the prize money received this season: from your European cup, participation included, and from the cup.",
        "The European objective of the most renowned clubs in their European cup is now to reach the quarter-finals, as for the clubs in the middle: they reached the semi-finals only one season in three or four. It applies to the seasons that open; the current season keeps its objective.",
        "Rival clubs playing in Europe rotate more: the more tired a starter, the weaker the player they will bring in for him, and they stay fresh from one season to the next. Your assistant's automatic line-up follows the same rule.",
      ],
    },
  },
  {
    date: "2026-11-17",
    fr: {
      title: "Les coupes d'Europe : Coupe des Lauriers et Coupe des Fanions",
      items: [
        "Les quatre premiers de chaque première division jouent la Coupe des Lauriers ; les 5e et 6e et le vainqueur de la coupe, ou le 7e, la Coupe des Fanions. Dès la première saison d'une nouvelle carrière ; dans une carrière en cours, à la saison suivante, la saison en cours restant ce qu'elle est.",
        "Une phase de ligue contre des clubs des autres pays, un seul classement, puis barrages, quarts, demies et finale sur terrain neutre, en matchs secs avec prolongation et tirs au but. Le mercredi : pense à faire tourner, À faire te signale tes titulaires fatigués avant un match européen.",
        "Primes à chaque victoire et à chaque tour, un objectif européen de la direction, un bonus de réputation pour les beaux parcours, trois jaunes européens pour une suspension, et la nouvelle page Europe sous Match. Palmarès et carte de fin de saison montrent ton parcours et tes titres.",
        "Les cadres Lauriers et Lauriers d'or de la collection s'appellent désormais Couronne et Couronne d'or ; ceux qui les possèdent les gardent.",
      ],
    },
    en: {
      title: "European cups: the Laurel Cup and the Pennant Cup",
      items: [
        "Each first division's top four play the Laurel Cup; its 5th and 6th and its cup winners, or its 7th, the Pennant Cup. From the first season of a new career; in a career already under way, from next season, the current season staying as it is.",
        "A league phase against clubs from other countries, a single table, then play-offs, quarter-finals, semi-finals and a final on neutral ground, single-leg with extra time and penalties. On Wednesdays: rotate your squad, To do flags your tired starters before a European match.",
        "Prize money for every win and every round, a European objective from the board, a reputation boost for a good run, a ban after three European yellow cards, and the new Europe page under Match. Honours and the season card show your run and your titles.",
        "The Laurels and Golden laurels frames in the collection are now called Wreath and Golden wreath; whoever owns them keeps them.",
      ],
    },
  },
  {
    date: "2026-11-17",
    fr: {
      title: "Une composition plus lisible",
      items: [
        "Dans la Composition, la liste à côté du terrain, et sous le banc sur téléphone, ne montre plus que tes remplaçants et les joueurs non retenus : tes titulaires sont sur le terrain. Toucher un poste propose toujours tout l'effectif, titulaires compris, pour un échange.",
      ],
    },
    en: {
      title: "A clearer line-up",
      items: [
        "In the Line-up, the list beside the pitch, and under the bench on a phone, now shows only your substitutes and the players left out: your starters are on the pitch. Tapping a position still offers the whole squad, starters included, for a swap.",
      ],
    },
  },
  {
    date: "2026-11-17",
    fr: {
      title: "Trois missions par jour, des jetons et une boutique",
      items: [
        "Chaque jour, trois missions t'attendent sur l'Accueil : une facile, une moyenne et une difficile. Elles rapportent des jetons (10, 20 et 40), et 30 de plus quand tu fais les trois. Une mission ne te plaît pas ? « Changer de mission », une fois par jour, sur une mission pas encore commencée.",
        "Ta série de jours d'affilée paie aussi : 50 jetons au 3e jour de chaque cycle de 7, 150 et un cosmétique exclusif au 7e. Le protège-série pardonne tout seul un jour manqué.",
        "Nouvel onglet Club, Récompenses : stage de forme, soin express, rallonge de budget et jeune prometteur pour ta carrière, avec des limites par saison ; titres et cadres pour ta collection. Raccourcis depuis la fiche d'un blessé et la composition.",
        "Ta collection : un titre sur l'écran Club, sur ta carte de fin de saison et dans le classement du défi, des badges d'accomplissement, et des cadres pour la carte que tu partages.",
        "Tes jetons te suivent dans toutes tes carrières et à la connexion Google, et ne se perdent jamais ; tes missions d'avant te valent des jetons de bienvenue. Toujours ni missions ni boutique dans les parties du défi de la semaine.",
      ],
    },
    en: {
      title: "Three missions a day, tokens and a shop",
      items: [
        "Every day, three missions wait for you on Home: an easy one, a medium one and a hard one. They earn tokens (10, 20 and 40), and 30 more when you do all three. Don't like a mission? “Change mission”, once a day, on one not started yet.",
        "Your streak of days in a row pays too: 50 tokens on day 3 of each 7-day cycle, 150 and an exclusive cosmetic on day 7. The streak shield forgives a missed day by itself.",
        "New Club tab, Rewards: fitness camp, express care, budget top-up and promising youngster for your career, with limits each season; titles and frames for your collection. Shortcuts from an injured player's sheet and the line-up.",
        "Your collection: a title on the Club screen, on your end-of-season card and in the challenge table, achievement badges, and frames for the card you share.",
        "Your tokens follow you across all your careers and when you sign in with Google, and are never lost; your earlier missions earn you welcome tokens. Still no missions and no shop in the weekly challenge's careers.",
      ],
    },
  },
  {
    date: "2026-11-17",
    fr: {
      title: "Une mission chaque jour, et ta série",
      items: [
        "Chaque jour, une mission t'attend sur l'Accueil, sous ton prochain match : joue un match en direct, fais un changement ou change de consigne pendant le direct, gagne un match, garde ta cage inviolée, joue trois matchs, titularise un jeune. Elle se fait en une courte session, dans n'importe laquelle de tes carrières, et sa progression s'affiche au fil de tes matchs.",
        "Une mission accomplie allonge ta série de jours d'affilée ; ton record est gardé dans Club, Réglages. Un jour sans mission ? Ta série repart de zéro, et la suivante en lance une nouvelle. La carte « À demain » te rappelle ta mission après chaque match.",
        "Les missions ne changent rien à ton jeu : ni budget, ni joueur, ni bonus de match. Pas de mission dans les parties du défi de la semaine.",
      ],
    },
    en: {
      title: "A mission every day, and your streak",
      items: [
        "Every day, a mission waits for you on Home, under your next match: play a match live, make a substitution or change your instruction during a live match, win a match, keep a clean sheet, play three matches, start a youngster. It takes a short session, in any of your careers, and its progress shows as you play your matches.",
        "A completed mission makes your streak of days in a row one longer; your record is kept in Club, Settings. A day without a mission? Your streak starts again from zero, and the next one starts a new one. The “See you tomorrow” card reminds you of your mission after every match.",
        "Missions change nothing in your game: no budget, no player, no match bonus. No mission in the weekly challenge's careers.",
      ],
    },
  },
  {
    date: "2026-11-12",
    fr: {
      title: "Un début plus doux, et ta carrière dans ton navigateur",
      items: [
        "Ouvert depuis Instagram, Facebook, TikTok ou Snapchat, le jeu te propose de passer dans ton navigateur pour garder ta carrière : « Ouvrir dans Chrome » sur Android, la marche à suivre sur iPhone. Une carrière déjà commencée dans l'appli t'y suit grâce à « Copier mon lien de reprise » : le lien ne sert qu'une fois et dure sept jours.",
        "Pendant tes quatre premiers matchs de championnat, la direction ne juge pas encore tes objectifs (« Trop tôt pour juger ») et la confiance du président ne bouge pas. Si ton adjoint choisit ton objectif de la saison à ta place, il te le dit, et après une défaite il a un mot pour toi.",
        "Après un match en direct ou une simulation, la carte « À demain » te montre ton prochain match et ce qu'il vaut, les jours qui restent au défi de la semaine, et comment installer l'appli.",
        "Le premier tableau de bord va à l'essentiel : tes trois premières actions juste sous le prochain match ; les offres, ton point faible et la bulle sur l'argent arrivent après ton premier match. Ton nom de manager est déjà rempli, le direct propose « Pause à la 15e », et la composition ne se dit plus enregistrée tant que tu ne l'as pas fait.",
      ],
    },
    en: {
      title: "A gentler start, and your career in your own browser",
      items: [
        "Opened from Instagram, Facebook, TikTok or Snapchat, the game offers to move to your browser to keep your career: “Open in Chrome” on Android, the steps to follow on iPhone. A career already started in the app follows you there with “Copy my resume link”: the link works once and lasts seven days.",
        "During your first four league matches, the board doesn't judge your objectives yet (“Too early to tell”) and the chairman's confidence stays put. If your assistant picks your objective of the season for you, he tells you, and after a defeat he has a word for you.",
        "After a live match or a simulation, the “See you tomorrow” card shows your next match and what it's worth, the days left in the weekly challenge, and how to install the app.",
        "The first dashboard keeps to the essentials: your first three actions right under the next match; offers, your weak spot and the money tip come after your first match. Your manager name is already filled in, the live match offers “Pause at 15’”, and the line-up no longer says it's saved until you've saved it.",
      ],
    },
  },
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
