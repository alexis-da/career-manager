import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Dashboard } from "@/src/db/dashboard";
import type { ClubLineupPlayer, ManagedLineup } from "@/src/db/lineup";
import type { SaleProposal, SaleProposals } from "@/src/db/sale-proposals";
import type { CoachTodo } from "@/src/db/national-view";
import type { ManagedBreak } from "@/src/db/nations-view";
import { formationPositions } from "@/src/engine/formations";
import type { Position } from "@/src/engine/positions";
import type { TournamentCode } from "@/src/engine/tournaments";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { DashboardTodo } from "./dashboard-todo";

const SAVE = "/saves/save-1";

type Club = { players?: number; goalkeepers?: number };

/**
 * What the list reads of a dashboard, a full squad, a transfer window open and the contracts kept by the player by default:
 * the rest is the other cards'.
 */
const dashboardWith = (
  { players = 22, goalkeepers = 3 }: Club,
  rest: Partial<
    Pick<Dashboard, "injured" | "bookingRisks" | "expiringContracts" | "importantContracts" | "contractsByAssistant" | "windowOpen">
  > = {},
) =>
  ({
    club: { players, goalkeepers },
    injured: [],
    bookingRisks: [],
    contractsByAssistant: false,
    expiringContracts: [],
    importantContracts: [],
    windowOpen: true,
    ...rest,
  }) as Dashboard;

const starter = (lastName: string, position: Position, overall: number): ClubLineupPlayer => ({
  id: lastName,
  position,
  overall,
  injured: false,
  suspended: false,
  firstName: "Jean",
  lastName,
  age: 25,
  injuredUntil: null,
  fitness: 100,
  form: 50,
  discipline: { suspended: false, suspendedLater: null, bookingRisks: [], bookingRiskNextMatch: false },
});

/** A starter out of the next match: injured, or suspended for it. */
const injuredStarter = (lastName: string): ClubLineupPlayer => ({ ...starter(lastName, "CB", 70), injured: true });
const suspendedStarter = (lastName: string): ClubLineupPlayer => {
  const player = starter(lastName, "CM", 68);
  return { ...player, suspended: true, discipline: { ...player.discipline, suspended: true } };
};

/**
 * An eleven in a 4-3-3: the starters given at their positions, the other slots held by starters rated 80 at theirs (none
 * at all without any starter given), and the saved starters out of the next match: the player's line-up, whose weak spot
 * the market reads on it.
 */
const lineupOf = (starters: ClubLineupPlayer[], missingStarters: ClubLineupPlayer[] = []): ManagedLineup => {
  const left = [...starters];
  const placed = formationPositions("4-3-3").map((slot, index) => {
    const given = left.findIndex(({ position }) => position === slot);
    const player = given === -1 ? starter(`Titulaire${index}`, slot, 80) : left.splice(given, 1)[0];
    return { player, slot, index };
  });
  const lineup = { starters: starters.length === 0 ? [] : placed, bench: [] };
  return { formation: "4-3-3", byAssistant: false, lineup, missingStarters, weakSpotLineup: lineup, keptOffSales: [] };
};

/** An eleven of a 4-3-3 with some of its slots left empty: no available player was left to fill them. */
const lineupWithout = (empty: readonly Position[]): ManagedLineup => {
  const { lineup, ...rest } = lineupOf([starter("Blanc", "GK", 72)]);
  const holed = { ...lineup, starters: lineup.starters.filter(({ slot }) => !empty.includes(slot)) };
  return { ...rest, lineup: holed, weakSpotLineup: holed };
};

const NO_ELEVEN = lineupOf([]);

/** A sale the assistant proposes: a player who never plays, and the best offer for him. */
const proposal = (lastName: string, fee: number): SaleProposal => ({
  id: lastName,
  playerKey: lastName,
  firstName: "Yann",
  lastName,
  position: "CM",
  overall: 62,
  age: 29,
  marketValue: 1_000_000,
  clubColors: { primary: "#000000", secondary: "#ffffff" },
  starts: 0,
  minutes: 0,
  offer: { fee, buyerId: "buyer-1", buyerName: "Rhône FC" },
});

const proposalsOf = (...proposals: SaleProposal[]): SaleProposals => ({ period: "season", proposals });

type Props = {
  dashboard: Dashboard;
  lineup: ManagedLineup;
  byAssistant?: boolean;
  saleProposals?: SaleProposals | null;
  firstMatchPlayed?: boolean;
  internationalBreak?: ManagedBreak | null;
  coachTodos?: CoachTodo[];
  coachTournament?: TournamentCode | null;
};

/** The list of a club that has played, its player making its line-up, unless told otherwise. */
const render = (
  {
    dashboard,
    lineup,
    byAssistant = false,
    saleProposals = null,
    firstMatchPlayed = true,
    internationalBreak = null,
    coachTodos = [],
    coachTournament = null,
  }: Props,
  locale: Locale = "fr",
): string =>
  renderToStaticMarkup(
    inLanguage(
      <DashboardTodo
        saveId="save-1"
        dashboard={dashboard}
        lineup={lineup}
        byAssistant={byAssistant}
        saleProposals={saleProposals}
        firstMatchPlayed={firstMatchPlayed}
        internationalBreak={internationalBreak}
        coachTodos={coachTodos}
        coachTournament={coachTournament}
      />,
      locale,
    ),
  );

/** The lines of the list, in order: id, link and text, title and detail one after the other. */
const lines = (markup: string) =>
  [...markup.matchAll(/<li data-testid="alert-([^"]+)">(.*?)<\/li>/g)].map(([, id, body]) => ({
    id,
    href: /href="([^"]+)"/.exec(body)?.[1] ?? null,
    text: body
      .replace(/<svg.*?<\/svg>/g, "")
      .replace(/<\/span><span/g, "</span> <span")
      .replace(/<[^>]+>/g, "")
      .replaceAll("&#x27;", "'")
      .trim(),
  }));

const idsOf = (markup: string) => lines(markup).map(({ id }) => id);

/** The tiles' colours, line by line: each tile holds its line's icon. */
const tilesOf = (markup: string): string[] =>
  [...markup.matchAll(/<span aria-hidden="true" class="grid size-9 [^"]*rounded-md ([^"]+)"><svg/g)].map(([, classes]) => classes);

/** The tiles' colours by their lines' ids. */
const tilesById = (markup: string): Record<string, string> => {
  const tiles = tilesOf(markup);
  return Object.fromEntries(idsOf(markup).map((id, index): [string, string] => [id, tiles[index]]));
};

/** The list's markup in two: the lines shown at once, then its disclosure, « Voir tout » and the lines it folds. */
const partsOf = (markup: string): { shown: string; folded: string } => {
  const at = markup.indexOf("<details");
  return at === -1 ? { shown: markup, folded: "" } : { shown: markup.slice(0, at), folded: markup.slice(at) };
};

/** « Voir tout »: its opening tag, and what it says folded, then open; null without one. */
const moreOf = (markup: string): { tag: string; folded: string; open: string } | null => {
  const summary = /(<summary data-testid="dashboard-alerts-more"[^>]*>)(.*?)<\/summary>/.exec(markup);
  if (summary === null) {
    return null;
  }
  const [folded, open] = [...summary[2].matchAll(/<span class="[^"]*">([^<]*)<\/span>/g)].map(([, text]) => text);
  return { tag: summary[1], folded, open };
};

describe("the dashboard's to-do list", () => {
  it("lists everything to do, the most important first, each line a link to where it gets done", () => {
    const markup = render({
      dashboard: dashboardWith(
        { players: 17, goalkeepers: 1 },
        {
          injured: [
            { name: "J. Morel", until: new Date(Date.UTC(2026, 10, 20)) },
            { name: "K. Roux", until: new Date(Date.UTC(2026, 10, 12)) },
            { name: "L. Petit", until: new Date(Date.UTC(2026, 11, 1)) },
          ],
          bookingRisks: [
            { name: "M. Dupont", competitions: ["LEAGUE"] },
            { name: "N. Lebrun", competitions: ["CUP"] },
          ],
          expiringContracts: ["A. Faure", "B. Girard", "C. Henry", "D. Ibert", "E. Jolly"],
        },
      ),
      lineup: lineupOf(
        [starter("Blanc", "GK", 72), starter("Noir", "LB", 58), starter("Vert", "ST", 75)],
        [injuredStarter("Morel"), suspendedStarter("Garnier")],
      ),
      saleProposals: proposalsOf(proposal("Lemoine", 1_300_000), proposal("Colin", 800_000)),
    });

    expect(markup).toContain('data-testid="dashboard-alerts"');
    expect(markup).toContain("À faire");
    expect(lines(markup)).toEqual([
      { id: "goalkeepers", href: `${SAVE}/squad`, text: "Un seul gardien sous contrat 2 gardiens sont nécessaires pour faire tourner l'équipe." },
      {
        id: "injured-starters",
        href: `${SAVE}/lineup`,
        text: "Un titulaire est blessé J. Morel : remplacement automatique au prochain match.",
      },
      {
        id: "suspended-starters",
        href: `${SAVE}/lineup`,
        text: "Un titulaire est suspendu J. Garnier : remplacement automatique au prochain match.",
      },
      { id: "expiring-contracts", href: `${SAVE}/squad`, text: "5 contrats expirent le 30 juin A. Faure, B. Girard, C. Henry et 2 autres" },
      { id: "sale-proposals", href: `${SAVE}/transfers?tab=sell`, text: "Ton adjoint propose 2 ventes Ils ne jouent pas · 2,1 M€" },
      { id: "small-squad", href: `${SAVE}/squad`, text: "Effectif réduit 17 joueurs sous contrat, 18 au minimum." },
      {
        id: "booking-risks",
        href: `${SAVE}/lineup`,
        text: "2 joueurs à 4 jaunes M. Dupont, N. Lebrun (coupe) : un jaune de plus vaut une suspension.",
      },
      { id: "injured", href: `${SAVE}/squad`, text: "2 blessés K. Roux, retour 12 nov. ; L. Petit, retour 1er déc." },
      { id: "weak-spot", href: `${SAVE}/transfers`, text: "Ton point faible : arrière gauche Note 58 · voir le marché" },
    ]);
    expect(markup.match(/data-testid="alert-action"/g)).toHaveLength(9);
    // Three of them at once, the six others behind « Voir tout »: links all the same, in the page.
    const { shown, folded } = partsOf(markup);
    expect(idsOf(shown)).toEqual(["goalkeepers", "injured-starters", "suspended-starters"]);
    expect(shown.match(/data-testid="alert-action"/g)).toHaveLength(3);
    expect(idsOf(folded)).toEqual(["expiring-contracts", "sale-proposals", "small-squad", "booking-risks", "injured", "weak-spot"]);
    expect(moreOf(markup)).toMatchObject({ folded: "Voir tout · 6 de plus", open: "Voir moins" });
  });

  it("ranks the lines by importance, never by where they come from: a missing goalkeeper before the weak spot", () => {
    const lineup = lineupOf([starter("Noir", "LB", 58)]);

    expect(idsOf(render({ dashboard: dashboardWith({ goalkeepers: 1 }), lineup }))).toEqual(["goalkeepers", "weak-spot"]);
    expect(idsOf(render({ dashboard: dashboardWith({ goalkeepers: 0 }), lineup }, "en"))).toEqual(["goalkeepers", "weak-spot"]);
    // A thin squad before the injured, the injured before the weak spot.
    const injured = [{ name: "K. Roux", until: new Date(Date.UTC(2026, 10, 12)) }];
    expect(idsOf(render({ dashboard: dashboardWith({ players: 17, goalkeepers: 2 }, { injured }), lineup }))).toEqual([
      "small-squad",
      "injured",
      "weak-spot",
    ]);
  });

  it("shows three lines, the others folded in the page behind « Voir tout · N de plus », and nothing to unfold for three", () => {
    const fourLines = {
      dashboard: dashboardWith(
        {},
        { bookingRisks: [{ name: "M. Dupont", competitions: ["LEAGUE"] }], injured: [{ name: "K. Roux", until: new Date(Date.UTC(2026, 10, 12)) }] },
      ),
      lineup: lineupOf([], [injuredStarter("Morel"), suspendedStarter("Garnier")]),
    };
    const four = render(fourLines);
    const { shown, folded } = partsOf(four);

    expect(idsOf(shown)).toEqual(["injured-starters", "suspended-starters", "booking-risks"]);
    expect(idsOf(folded)).toEqual(["injured"]);
    expect(moreOf(four)).toMatchObject({ folded: "Voir tout · 1 de plus", open: "Voir moins" });
    // Folded, never left out: a native disclosure, closed, that opens in place without a request.
    expect(folded).toMatch(/^<details class="group\/todo"><summary data-testid="dashboard-alerts-more"/);
    expect(four.match(/<details/g)).toHaveLength(1);
    // Secondary, a thumb high on a phone: never the screen's full orange.
    const tag = moreOf(four)?.tag ?? "";
    expect(tag).toContain("max-sm:min-h-11");
    expect(tag).toContain("text-(--club)");
    expect(tag).not.toMatch(/\bbg-/);
    expect(moreOf(render(fourLines, "en"))).toMatchObject({ folded: "See all · 1 more", open: "See less" });

    // Three lines, or fewer: all of them at once, no « Voir tout ».
    const three = render({
      dashboard: dashboardWith({ goalkeepers: 0 }, { expiringContracts: ["A. Faure"] }),
      lineup: lineupOf([starter("Noir", "LB", 58)]),
    });
    expect(idsOf(three)).toEqual(["goalkeepers", "expiring-contracts", "weak-spot"]);
    expect(three).not.toContain("<details");
    expect(moreOf(three)).toBeNull();
    expect(moreOf(render({ dashboard: dashboardWith({}), lineup: NO_ELEVEN }))).toBeNull();
  });

  it("leaves the weak spot to a transfer window: out of one, nothing can be done about it", () => {
    const lineup = lineupOf([starter("Noir", "LB", 58)]);
    const closed = dashboardWith({}, { windowOpen: false });

    expect(idsOf(render({ dashboard: dashboardWith({}), lineup }))).toEqual(["weak-spot"]);
    expect(idsOf(render({ dashboard: closed, lineup }))).toEqual([]);
    expect(idsOf(render({ dashboard: closed, lineup }, "en"))).toEqual([]);
    // Not even an empty slot, the most pressing of weak spots; the rest of the list as it is.
    expect(idsOf(render({ dashboard: closed, lineup: lineupWithout(["ST", "LW"]) }))).toEqual([]);
    const shortOfGoalkeepers = dashboardWith({ goalkeepers: 1 }, { windowOpen: false });
    const hurt = lineupOf([starter("Noir", "LB", 58)], [injuredStarter("Morel")]);
    expect(idsOf(render({ dashboard: shortOfGoalkeepers, lineup: hurt }))).toEqual(["goalkeepers", "injured-starters"]);
  });

  it("colours each tile by its line's severity, and never cuts a text", () => {
    const markup = render({
      dashboard: dashboardWith({ goalkeepers: 0 }, { expiringContracts: ["A. Faure"] }),
      lineup: lineupOf([starter("Noir", "LB", 58)]),
    });

    expect(idsOf(markup)).toEqual(["goalkeepers", "expiring-contracts", "weak-spot"]);
    expect(tilesOf(markup)).toEqual(["bg-loss/15 text-loss", "bg-warning/15 text-warning", "bg-secondary"]);
    expect(markup).not.toContain("truncate");
  });

  it("draws the referee's cards: red for the suspended starters, as pressing as the injured, yellow for the bookings", () => {
    const markup = render({
      dashboard: dashboardWith({}, { bookingRisks: [{ name: "M. Dupont", competitions: ["LEAGUE"] }] }),
      lineup: lineupOf([], [injuredStarter("Morel"), suspendedStarter("Garnier")]),
    });
    const card = /<svg viewBox="0 0 24 24" aria-hidden="true" class="size-4.5"><rect [^>]*fill="currentColor"/g;

    expect(idsOf(markup)).toEqual(["injured-starters", "suspended-starters", "booking-risks"]);
    expect(tilesOf(markup)).toEqual(["bg-loss/15 text-loss", "bg-loss/15 text-loss", "bg-warning/15 text-warning"]);
    expect(markup.match(card)).toHaveLength(2);
  });

  it("says there is nothing to do, the assistant taking care of the rest, on a line that leads nowhere", () => {
    const markup = render({ dashboard: dashboardWith({}), lineup: NO_ELEVEN });
    const none = (html: string) => /data-testid="alert-none"[^>]*>(.*?)<\/div>/.exec(html)?.[1].replace(/<[^>]+>/g, "").replaceAll("&#x27;", "'");

    expect(lines(markup)).toEqual([]);
    expect(none(markup)).toBe("Rien à faire : ton adjoint s'occupe du reste.");
    expect(markup).not.toContain("alert-action");
    expect(markup).not.toContain("lucide-chevron-right");
    expect(none(render({ dashboard: dashboardWith({}), lineup: NO_ELEVEN }, "en"))).toBe("Nothing to do: your assistant takes care of the rest.");
    // Anything to do, and it says nothing of the kind.
    expect(render({ dashboard: dashboardWith({ goalkeepers: 1 }), lineup: NO_ELEVEN })).not.toContain("alert-none");
  });

  it("tells no goalkeeper from one, and a thin squad with enough goalkeepers from a full one", () => {
    const { text } = lines(render({ dashboard: dashboardWith({ goalkeepers: 0 }), lineup: NO_ELEVEN }))[0];
    expect(text).toContain("Aucun gardien sous contrat");

    expect(idsOf(render({ dashboard: dashboardWith({ players: 17, goalkeepers: 2 }), lineup: NO_ELEVEN }))).toEqual(["small-squad"]);
    expect(idsOf(render({ dashboard: dashboardWith({ players: 18, goalkeepers: 2 }), lineup: NO_ELEVEN }))).toEqual([]);
  });

  it("leaves the injured starters to their own line, one name off for each: a substitute may share it", () => {
    const until = new Date(Date.UTC(2026, 10, 20));
    const hurt = injuredStarter("Martin");
    const dashboard = dashboardWith(
      {},
      {
        injured: [
          { name: "J. Martin", until },
          { name: "J. Martin", until },
        ],
      },
    );

    const both = lines(render({ dashboard, lineup: lineupOf([], [hurt]) }));
    expect(both.map(({ id }) => id)).toEqual(["injured-starters", "injured"]);
    expect(both[1].text).toBe("1 blessé J. Martin, retour 20 nov.");

    // Injured today, back for the next match: no longer among the saved starters who miss it, still injured.
    expect(idsOf(render({ dashboard, lineup: NO_ELEVEN }))).toEqual(["injured"]);

    const alone = dashboardWith({}, { injured: [{ name: "J. Martin", until }] });
    expect(idsOf(render({ dashboard: alone, lineup: lineupOf([], [hurt]) }))).toEqual(["injured-starters"]);

    // A suspended starter takes no injured player's name off: the one of that name is someone else.
    const suspended = lines(render({ dashboard: alone, lineup: lineupOf([], [suspendedStarter("Martin")]) }));
    expect(suspended.map(({ id }) => id)).toEqual(["suspended-starters", "injured"]);
    expect(suspended[0].text).toBe("Un titulaire est suspendu J. Martin : remplacement automatique au prochain match.");
  });

  it("names a starter both injured and suspended once, on the injured line: he serves his suspension while out", () => {
    const both: ClubLineupPlayer = { ...suspendedStarter("Morel"), injured: true };

    expect(idsOf(render({ dashboard: dashboardWith({}), lineup: lineupOf([], [both, suspendedStarter("Garnier")]) }))).toEqual([
      "injured-starters",
      "suspended-starters",
    ]);
    expect(lines(render({ dashboard: dashboardWith({}), lineup: lineupOf([], [both]) }))[0].text).toBe(
      "Un titulaire est blessé J. Morel : remplacement automatique au prochain match.",
    );
    expect(lines(render({ dashboard: dashboardWith({}), lineup: lineupOf([], [suspendedStarter("Garnier"), suspendedStarter("Henry")]) }))[0].text).toBe(
      "2 titulaires sont suspendus J. Garnier, J. Henry : remplacement automatique au prochain match.",
    );
  });

  it("names the players one booking from a suspension, the cup's apart, three of them at most", () => {
    const risky = (bookingRisks: Dashboard["bookingRisks"]) =>
      lines(render({ dashboard: dashboardWith({}, { bookingRisks }), lineup: NO_ELEVEN }))[0];

    expect(risky([{ name: "M. Dupont", competitions: ["LEAGUE"] }])).toEqual({
      id: "booking-risks",
      href: `${SAVE}/lineup`,
      text: "Un joueur à 4 jaunes M. Dupont : un jaune de plus vaut une suspension.",
    });
    expect(
      risky([
        { name: "A. Aubert", competitions: ["LEAGUE"] },
        { name: "B. Bonnet", competitions: ["CUP"] },
        { name: "C. Caron", competitions: ["LEAGUE", "CUP"] },
        { name: "D. Denis", competitions: ["LEAGUE"] },
        { name: "E. Even", competitions: ["LEAGUE"] },
      ]).text,
    ).toBe("5 joueurs à 4 jaunes A. Aubert, B. Bonnet (coupe), C. Caron (championnat et coupe) et 2 autres : un jaune de plus vaut une suspension.");
  });

  it("leaves the market alone before the club's first match: no offer, no weak spot, the rest as it is", () => {
    const props = {
      dashboard: dashboardWith({ players: 17, goalkeepers: 2 }, { expiringContracts: ["A. Faure"] }),
      lineup: lineupOf([starter("Noir", "LB", 58)], [injuredStarter("Morel")]),
      saleProposals: proposalsOf(proposal("Lemoine", 1_300_000)),
    };

    expect(idsOf(render({ ...props, firstMatchPlayed: false }))).toEqual(["injured-starters", "expiring-contracts", "small-squad"]);
    expect(idsOf(render({ ...props, firstMatchPlayed: false }, "en"))).toEqual(["injured-starters", "expiring-contracts", "small-squad"]);
    // Once it is played, both come back, in their places.
    expect(idsOf(render(props))).toEqual(["injured-starters", "expiring-contracts", "sale-proposals", "small-squad", "weak-spot"]);
  });

  it("says how many sales the assistant proposes and what they would bring, nothing without one or out of a window", () => {
    const dashboard = dashboardWith({});

    expect(lines(render({ dashboard, lineup: NO_ELEVEN, saleProposals: proposalsOf(proposal("Lemoine", 850_000)) }))).toEqual([
      { id: "sale-proposals", href: `${SAVE}/transfers?tab=sell`, text: "Ton adjoint propose 1 vente Il ne joue pas · 850 k€" },
    ]);
    expect(idsOf(render({ dashboard, lineup: NO_ELEVEN, saleProposals: proposalsOf() }))).toEqual([]);
    // Out of a window, the page reads none.
    expect(idsOf(render({ dashboard: dashboardWith({}, { windowOpen: false }), lineup: NO_ELEVEN, saleProposals: null }))).toEqual([]);
  });

  it("says a full squad signs nobody while a window is open, and leads to the sales", () => {
    const full = render({ dashboard: dashboardWith({ players: 30 }), lineup: NO_ELEVEN });

    expect(lines(full)).toEqual([
      {
        id: "squad-full",
        href: `${SAVE}/transfers?tab=sell`,
        text: "Effectif plein · 30 joueurs sur 30 Vends ou libère un joueur avant d'en recruter un autre.",
      },
    ]);
    expect(tilesById(full)["squad-full"]).toBe("bg-warning/15 text-warning");
    expect(lines(render({ dashboard: dashboardWith({ players: 30 }), lineup: NO_ELEVEN }, "en"))[0].text).toBe(
      "Squad full · 30 players of 30 Sell or release a player before signing another.",
    );
    expect(idsOf(render({ dashboard: dashboardWith({ players: 29 }), lineup: NO_ELEVEN }))).toEqual([]);
    expect(idsOf(render({ dashboard: dashboardWith({ players: 30 }, { windowOpen: false }), lineup: NO_ELEVEN }))).toEqual([]);
  });

  it("speaks British English", () => {
    const until = new Date(Date.UTC(2026, 10, 12));
    const markup = render(
      {
        dashboard: dashboardWith(
          { players: 17, goalkeepers: 0 },
          {
            injured: [{ name: "J. Morel", until }, { name: "K. Roux", until }],
            bookingRisks: [
              { name: "M. Dupont", competitions: ["LEAGUE"] },
              { name: "N. Lebrun", competitions: ["CUP"] },
              { name: "O. Marchal", competitions: ["LEAGUE", "CUP"] },
            ],
            expiringContracts: ["A. Faure"],
          },
        ),
        lineup: lineupOf([starter("Noir", "LB", 58)], [injuredStarter("Morel"), suspendedStarter("Garnier"), suspendedStarter("Henry")]),
        saleProposals: proposalsOf(proposal("Lemoine", 77_200_000), proposal("Colin", 800_000)),
      },
      "en",
    );

    expect(markup).toContain("To do");
    expect(lines(markup).map(({ text }) => text)).toEqual([
      "No goalkeeper under contract 2 goalkeepers are needed to keep the team going.",
      "A starter is injured J. Morel: replaced automatically in the next match.",
      "2 starters are suspended J. Garnier, J. Henry: replaced automatically in the next match.",
      "1 contract expires on 30 June A. Faure",
      "Your assistant suggests 2 sales They never play · €78m",
      "Thin squad 17 players under contract, 18 minimum.",
      "3 players on 4 yellow cards M. Dupont, N. Lebrun (cup), O. Marchal (league and cup): one more booking means a suspension.",
      "1 injured K. Roux, back 12 Nov",
      "Your weak spot: left back Rated 58 · see the market",
    ]);
    expect(moreOf(markup)).toMatchObject({ folded: "See all · 6 more", open: "See less" });
    expect(render({ dashboard: dashboardWith({}), lineup: NO_ELEVEN }, "en")).toContain("Nothing to do: your assistant takes care of the rest.");
  });

  it("flags the starters below the rotation threshold before a European match only, and the European bookings apart", () => {
    const tired = { ...starter("Las", "ST", 75), fitness: 70 };
    const fresh = starter("Vif", "GK", 70);
    const europeanMatch = { nextMatch: { fixture: { competitionCode: "eu.2" } } } as unknown as Partial<Dashboard>;
    const leagueMatch = { nextMatch: { fixture: { competitionCode: "fr.1" } } } as unknown as Partial<Dashboard>;
    const withMatch = (match: Partial<Dashboard>, rest: Partial<Pick<Dashboard, "bookingRisks">> = {}) =>
      ({ ...dashboardWith({}, rest), ...match }) as Dashboard;

    const before = lines(render({ dashboard: withMatch(europeanMatch), lineup: lineupOf([tired, fresh]) }));
    expect(before[0]).toEqual({
      id: "tired-starters",
      href: `${SAVE}/lineup`,
      text: "Un titulaire sous 75 de condition avant le match européen J. Las : fais tourner, ou un stage de forme dans la boutique.",
    });
    expect(idsOf(render({ dashboard: withMatch(leagueMatch), lineup: lineupOf([tired, fresh]) }))).not.toContain("tired-starters");
    expect(lines(render({ dashboard: withMatch(europeanMatch), lineup: lineupOf([tired, fresh]) }, "en"))[0].text).toBe(
      "A starter below 75 fitness before the European match J. Las: rotate your squad, or book a fitness camp in the shop.",
    );

    // Two European yellows: a line of their own, never counted with the league's four.
    const risks = lines(
      render({
        dashboard: withMatch(europeanMatch, {
          bookingRisks: [
            { name: "M. Dupont", competitions: ["LEAGUE"] },
            { name: "N. Lebrun", competitions: ["EUROPE"] },
          ],
        }),
        lineup: NO_ELEVEN,
      }),
    );
    expect(risks.filter(({ id }) => id.endsWith("booking-risks"))).toEqual([
      { id: "booking-risks", href: `${SAVE}/lineup`, text: "Un joueur à 4 jaunes M. Dupont : un jaune de plus vaut une suspension." },
      { id: "europe-booking-risks", href: `${SAVE}/lineup`, text: "Un joueur à 2 jaunes en Europe N. Lebrun : un jaune de plus vaut une suspension." },
    ]);
  });

  it("says nothing of starters out or tired while the assistant makes the eleven: he replaces and rests them himself", () => {
    const until = new Date(Date.UTC(2026, 10, 20));
    const europeanMatch = { nextMatch: { fixture: { competitionCode: "eu.1" } } } as unknown as Partial<Dashboard>;
    const dashboard = { ...dashboardWith({}, { injured: [{ name: "J. Morel", until }] }), ...europeanMatch } as Dashboard;
    const lineup = lineupOf([{ ...starter("Las", "ST", 75), fitness: 70 }, starter("Vif", "GK", 70)], [injuredStarter("Morel"), suspendedStarter("Garnier")]);

    expect(idsOf(render({ dashboard, lineup }))).toEqual(["injured-starters", "suspended-starters", "tired-starters", "weak-spot"]);
    // His way, the injured starter is one of the injured, named with his return; nothing to do about the others.
    const assisted = lines(render({ dashboard, lineup, byAssistant: true }));
    expect(assisted.map(({ id }) => id)).toEqual(["injured", "weak-spot"]);
    expect(assisted[0].text).toBe("1 blessé J. Morel, retour 20 nov.");
    expect(idsOf(render({ dashboard, lineup, byAssistant: true }, "en"))).toEqual(["injured", "weak-spot"]);
  });

  it("reads the weak spot on the market's eleven, not on the one the assistant fields", () => {
    // His eleven starts a young left back (58) for the Jeunesse objective; the market's has the 80 there, and its weakest
    // starter is the goalkeeper (70).
    const fielded = lineupOf([starter("Vif", "GK", 70), starter("Jeune", "LB", 58)]);
    const market = lineupOf([starter("Vif", "GK", 70)]);
    const lineup: ManagedLineup = { ...fielded, byAssistant: true, weakSpotLineup: market.lineup };
    const weakSpot = lines(render({ dashboard: dashboardWith({}), lineup, byAssistant: true })).find(({ id }) => id === "weak-spot");

    expect(weakSpot?.text).toBe("Ton point faible : gardien Note 70 · voir le marché");
  });

  it("puts the market's weak spot first where nobody can play, then where a starter plays out of his line", () => {
    const weakSpotOf = (lineup: ManagedLineup, locale: Locale = "fr") =>
      lines(render({ dashboard: dashboardWith({}), lineup }, locale)).find(({ id }) => id === "weak-spot");
    // A centre-back up front, at 54, and a left back at 58 in his own slot.
    const { lineup, ...rest } = lineupOf([starter("Noir", "LB", 58)]);
    const held = {
      ...lineup,
      starters: lineup.starters.map((placed) => (placed.slot === "ST" ? { ...placed, player: starter("Roc", "CB", 90) } : placed)),
    };
    const heldUpFront: ManagedLineup = { ...rest, lineup: held, weakSpotLineup: held };

    expect(weakSpotOf(lineupWithout(["ST", "LW"]))).toEqual({
      id: "weak-spot",
      href: `${SAVE}/transfers`,
      text: "Ton point faible : buteur Poste vide, personne de disponible pour le tenir · voir le marché",
    });
    expect(weakSpotOf(heldUpFront)?.text).toBe("Ton point faible : buteur Tenu hors poste, note 54 · voir le marché");
    expect(weakSpotOf(lineupWithout(["LW"]), "en")?.text).toBe(
      "Your weak spot: left winger Empty, nobody available to play there · see the market",
    );
    expect(weakSpotOf(heldUpFront, "en")?.text).toBe("Your weak spot: striker Played out of position, rated 54 · see the market");
  });

  it("names the players called up before an international break, and who comes back injured or tired after it", () => {
    const from = new Date(Date.UTC(2026, 8, 4));
    const to = new Date(Date.UTC(2026, 8, 8));
    const player = (name: string, nation: "SEN" | "FRA" | "BRA", extra: Partial<ManagedBreak["players"][number]> = {}) => ({
      playerSaveId: name,
      playerKey: name,
      name,
      nation,
      matches: 0,
      goals: 0,
      injuredUntil: null,
      fitness: 100,
      ...extra,
    });
    const before: ManagedBreak = { state: "upcoming", from, to, players: [player("K. Diallo", "SEN"), player("M. Roy", "FRA")] };
    const callUps = lines(render({ dashboard: dashboardWith({}), lineup: lineupOf([]), internationalBreak: before })).find(
      ({ id }) => id === "international-callups",
    );
    expect(callUps).toEqual({
      id: "international-callups",
      href: `${SAVE}/squad`,
      text: "Trêve du 4 sept. au 8 sept. : 2 joueurs appelés en sélection K. Diallo (SEN), M. Roy (FRA) : ils reviendront le mardi, fatigués s'ils ont joué.",
    });

    const after: ManagedBreak = {
      state: "back",
      from,
      to,
      players: [
        player("K. Diallo", "SEN", { matches: 2, injuredUntil: new Date(Date.UTC(2026, 8, 25)) }),
        player("M. Roy", "FRA", { matches: 2, fitness: 72 }),
        player("L. Silva", "BRA", { matches: 1, fitness: 90 }),
      ],
    };
    const returns = (internationalBreak: ManagedBreak, locale: Locale = "fr") =>
      lines(render({ dashboard: dashboardWith({}), lineup: lineupOf([]), internationalBreak }, locale)).find(({ id }) => id === "international-returns");
    expect(returns(after)).toEqual({
      id: "international-returns",
      href: `${SAVE}/lineup`,
      text: "Retour de sélection : 1 blessé, 1 joueur sous 75 K. Diallo blessé, retour 25 sept. ; M. Roy sous 75 au coup d'envoi",
    });
    expect(returns(after, "en")?.text).toBe("Back from international duty: 1 injured, 1 player under 75 K. Diallo injured, back 25 Sept; M. Roy under 75 at kick-off");
    // All well: a line that says so, in green.
    const well = returns({ ...after, players: [player("L. Silva", "BRA", { matches: 1, fitness: 90 })] });
    expect(well?.text).toBe("Retour de sélection : ton joueur va bien Aucun blessé, tous en forme pour le prochain match.");
    // Neither line without a break.
    expect(idsOf(render({ dashboard: dashboardWith({}), lineup: lineupOf([]) }))).not.toContain("international-callups");
  });

  it("ranks the national coach's lines: an offer to answer right after the starters out, his list with the breaks', his mission's end late", () => {
    const first = new Date(Date.UTC(2026, 9, 9));
    const last = new Date(Date.UTC(2026, 9, 13));
    const markup = render({
      dashboard: dashboardWith({}, { bookingRisks: [{ name: "M. Dupont", competitions: ["LEAGUE"] }] }),
      lineup: lineupOf([starter("Noir", "LB", 58)], [injuredStarter("Morel")]),
      saleProposals: proposalsOf(proposal("Lemoine", 850_000)),
      coachTodos: [
        { kind: "offer", offers: ["POR"] },
        { kind: "call-up", code: "POR", first, last, tournament: false },
        { kind: "ended", code: "NED", outcome: "NOT_QUALIFIED" },
      ],
    });

    expect(idsOf(markup)).toEqual([
      "injured-starters",
      "coach-offer",
      "sale-proposals",
      "coach-call-up",
      "booking-risks",
      "weak-spot",
      "coach-ended",
    ]);
    expect(lines(markup).filter(({ id }) => id.startsWith("coach-"))).toEqual([
      {
        id: "coach-offer",
        href: `${SAVE}/season-start`,
        text: "Offre de sélection : la fédération du Portugal te propose son poste Tu gardes ton club · réponds avant ton premier match de la saison",
      },
      {
        id: "coach-call-up",
        href: `${SAVE}/nation`,
        text: "Convocations pour la trêve du 9 au 13 oct. : la liste de l'adjoint est prête Change-la jusqu'au premier match, sinon elle part telle quelle.",
      },
      {
        id: "coach-ended",
        href: null,
        text: "La fédération des Pays-Bas met fin à ta mission : pas qualifié Ton club continue avec toi. D'autres fédérations pourront te contacter.",
      },
    ]);
    // An offer to weigh in amber, his list ready in green (never blocking), a mission over in neutral.
    const tiles = tilesById(markup);
    expect([tiles["coach-offer"], tiles["coach-call-up"], tiles["coach-ended"]]).toEqual([
      "bg-warning/15 text-warning",
      "bg-win/15 text-win",
      "bg-secondary",
    ]);
  });

  it("names two offers together, a summer tournament's list by the tournament, and speaks British English", () => {
    const june = (day: number) => new Date(Date.UTC(2030, 5, day));
    const coachTodos: CoachTodo[] = [
      { kind: "offer", offers: ["POR", "CRO"] },
      { kind: "call-up", code: "POR", first: june(7), last: june(23), tournament: true },
      { kind: "ended", code: "NED", outcome: "MISSED" },
    ];
    const coachLines = (locale: Locale, coachTournament: TournamentCode | null = "int.world") =>
      lines(render({ dashboard: dashboardWith({}), lineup: NO_ELEVEN, coachTodos, coachTournament }, locale))
        .filter(({ id }) => id.startsWith("coach-"))
        .map(({ text }) => text);

    expect(coachLines("fr")).toEqual([
      "2 offres de sélection : le Portugal et la Croatie te proposent leur poste Tu gardes ton club · réponds avant ton premier match de la saison",
      "Convocations pour la Coupe des Hémisphères : la liste de l'adjoint est prête Change-la jusqu'au premier match, sinon elle part telle quelle.",
      "La fédération des Pays-Bas met fin à ta mission : tournoi sous l'objectif Ton club continue avec toi. D'autres fédérations pourront te contacter.",
    ]);
    expect(coachLines("en")).toEqual([
      "2 national team offers: Portugal and Croatia want you as their coach You keep your club · answer before your first match of the season",
      "Call-ups for the Hemispheres Cup: your assistant's squad is ready Change it until the first match, or it goes as it is.",
      "The federation of the Netherlands ends your mission: tournament below the objective Your club goes on with you. Other federations may contact you.",
    ]);
    // A summer tournament the line cannot name: the summer's, still.
    expect(coachLines("fr", null)[1]).toBe(
      "Convocations pour le tournoi d'été : la liste de l'adjoint est prête Change-la jusqu'au premier match, sinon elle part telle quelle.",
    );
    // Nothing of the kind for a player who coaches no nation and has no offer.
    expect(idsOf(render({ dashboard: dashboardWith({}), lineup: NO_ELEVEN })).some((id) => id.startsWith("coach-"))).toBe(false);
  });

  it("names the starters the assistant means to let go right after a federation's offer, and no other contract while he decides them", () => {
    const assisted = dashboardWith(
      {},
      { contractsByAssistant: true, importantContracts: ["M. Koné"], expiringContracts: ["M. Koné", "A. Faure", "B. Girard"] },
    );
    const markup = render({
      dashboard: assisted,
      lineup: NO_ELEVEN,
      saleProposals: proposalsOf(proposal("Lemoine", 850_000)),
      coachTodos: [{ kind: "offer", offers: ["POR"] }],
    });

    expect(idsOf(markup)).toEqual(["coach-offer", "important-contracts", "sale-proposals"]);
    expect(lines(markup).find(({ id }) => id === "important-contracts")).toEqual({
      id: "important-contracts",
      href: `${SAVE}/squad`,
      text: "Fin de contrat le 30 juin : M. Koné Ton adjoint compte le laisser partir · décide sur sa fiche",
    });
    expect(tilesById(markup)["important-contracts"]).toBe("bg-warning/15 text-warning");

    // Several: three names at most, and the plural.
    const several = dashboardWith({}, { contractsByAssistant: true, importantContracts: ["M. Koné", "A. Faure", "B. Girard", "C. Henry"] });
    expect(lines(render({ dashboard: several, lineup: NO_ELEVEN }))[0].text).toBe(
      "Fin de contrat le 30 juin : M. Koné, A. Faure, B. Girard et 1 autre Ton adjoint compte les laisser partir · décide sur leur fiche",
    );
    expect(lines(render({ dashboard: several, lineup: NO_ELEVEN }, "en"))[0].text).toBe(
      "Out of contract on 30 June: M. Koné, A. Faure, B. Girard and 1 other Your assistant means to let them go · decide on their sheets",
    );
    // Nobody he means to let go: nothing of the contracts at all, however many end.
    const calm = dashboardWith({}, { contractsByAssistant: true, expiringContracts: ["A. Faure"] });
    expect(idsOf(render({ dashboard: calm, lineup: NO_ELEVEN }))).toEqual([]);
  });

  it("lists every contract ending while the player keeps them, never the assistant's line", () => {
    const own = dashboardWith({}, { expiringContracts: ["A. Faure", "B. Girard"], importantContracts: ["A. Faure"] });

    expect(idsOf(render({ dashboard: own, lineup: NO_ELEVEN }))).toEqual(["expiring-contracts"]);
    expect(lines(render({ dashboard: own, lineup: NO_ELEVEN }, "en"))[0].text).toBe("2 contracts expire on 30 June A. Faure, B. Girard");
  });
});
