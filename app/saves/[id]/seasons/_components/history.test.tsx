import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { careerHistoryView, type CompletedCareer, type LiveCareer } from "@/src/db/career-history";
import type { HistoryLine, HistorySeason } from "@/src/engine/career-history";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { careerCardPath, divisionsPath } from "../_lib/career";
import { CareerLegends } from "./career-legends";
import { CareerRecords } from "./career-records";
import { CurrentSeasonLine } from "./current-season";
import { HistoryHead } from "./history-head";
import { NewRecordsPanel } from "./new-records-panel";
import { TrophyRoom } from "./trophy-room";

const render = (node: ReactNode, locale?: Locale): string => renderToStaticMarkup(inLanguage(node, locale));
/** The visible text of a markup, its tags and spacing flattened. */
const textOf = (markup: string): string =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
/** The text of the element of a test id (its first, with whatever it holds). */
const partOf = (markup: string, testId: string): string => {
  const start = markup.indexOf(`data-testid="${testId}"`);
  return start === -1 ? "" : textOf(markup.slice(markup.lastIndexOf("<", start)));
};

function season(startYear: number, overrides: Partial<HistorySeason> = {}): HistorySeason {
  return {
    seasonId: `s${startYear}`,
    startYear,
    competitionCode: "fr.1",
    tier: 1,
    rank: 4,
    points: 66,
    played: 34,
    won: 20,
    drawn: 6,
    lost: 8,
    goalsFor: 60,
    goalsAgainst: 35,
    champion: false,
    promoted: false,
    relegated: false,
    cupRound: null,
    cupWinner: false,
    europeCode: null,
    europeStage: null,
    europeWinner: false,
    bestPlayer: null,
    objectives: null,
    budget: null,
    highlights: null,
    ...overrides,
  };
}

const line = (playerKey: string, startYear: number, appearances: number, goals: number): HistoryLine => ({
  playerKey,
  startYear,
  kind: "LEAGUE",
  appearances,
  goals,
  assists: 1,
});

const COMPLETED: CompletedCareer = {
  seasons: [season(2026, { tier: 2, competitionCode: "fr.2", rank: 2, points: 88, played: 46, promoted: true, objectives: { met: 2, total: 3 } }), season(2027, { rank: 1, champion: true, cupRound: 6 })],
  matches: [
    { date: Date.UTC(2026, 8, 5), startYear: 2026, kind: "LEAGUE", competitionCode: "fr.2", round: 3, opponentClubSaveId: "rival", home: true, goalsFor: 6, goalsAgainst: 1, penalties: false },
    { date: Date.UTC(2027, 8, 5), startYear: 2027, kind: "CUP", competitionCode: "fr.cup", round: 2, opponentClubSaveId: "rival", home: false, goalsFor: 0, goalsAgainst: 2, penalties: false },
  ],
  lines: [line("lyon#9", 2026, 44, 30), line("lyon#9", 2027, 40, 26), line("youth:2027:lyon:1", 2027, 18, 2), line("lyon#4", 2027, 30, 1)],
};

const LIVE: LiveCareer = {
  managedSlug: "lyon",
  clubColors: { primary: "#1B3E8F", secondary: "#E2001A" },
  challenge: false,
  context: { currentTier: 1, secondDivisions: true, cups: true, europe: true },
  current: { startYear: 2028, competitionCode: "fr.1", tier: 1, rank: 3, points: 21, played: 10, cup: { round: 3, out: true, won: false }, europe: { code: "eu.1", stage: 1, out: false, won: false } },
  matches: [],
  lines: [],
  players: [
    { playerKey: "lyon#9", name: "Karim Diallo", position: "ST", overall: 84, atClub: true, age: 27 },
    { playerKey: "youth:2027:lyon:1", name: "Enzo Faure", position: "CM", overall: 71, atClub: true, age: 19 },
    { playerKey: "lyon#4", name: "Marc Roy", position: "CB", overall: 77, atClub: false, age: 31 },
  ],
  transfers: [
    { playerKey: "lyon#4", fee: 18_500_000, date: Date.UTC(2028, 6, 20), incoming: false, otherClubId: "club-abroad" },
    { playerKey: "lyon#9", fee: 9_000_000, date: Date.UTC(2026, 6, 10), incoming: true, otherClubId: null },
  ],
  clubNames: new Map([
    ["rival", "Racing Nord"],
    ["club-abroad", "Sporting Est"],
  ]),
};

const HISTORY = careerHistoryView(COMPLETED, LIVE);

describe("the History tab", () => {
  it("shows the trophy room, a trophy to conquer unlit, the lost final counted", () => {
    const markup = render(<TrophyRoom room={HISTORY.trophyRoom} />);
    const tiles = [...markup.matchAll(/data-testid="trophy-tile" data-kind="(\w+)" data-count="(\d)" data-to-conquer="(\w+)"/g)].map((match) => match.slice(1));

    expect(tiles).toEqual([
      ["championD1", "1", "false"],
      ["cup", "0", "true"],
      ["eu1", "0", "true"],
      ["eu2", "0", "true"],
      ["promotion", "1", "false"],
    ]);
    expect(textOf(markup)).toContain("×1 Champion de D1 2027-28");
    expect(textOf(markup)).toContain("— Coupe des Fanions À conquérir");
    expect(textOf(markup)).toContain("1 finale perdue");
    expect(textOf(render(<TrophyRoom room={HISTORY.trophyRoom} />, "en"))).toContain("— Pennant Cup Still to win");
  });

  it("tells each record with its context, a player still at the club, a transfer's other club", () => {
    const markup = render(<CareerRecords history={HISTORY} />);

    expect(partOf(markup, "record-biggest-win")).toMatch(/^Plus large victoire 6-1 contre Racing Nord · France — Division 2 · 2026-27/);
    expect(partOf(markup, "record-unbeaten")).toMatch(/^Plus longue invincibilité 1 match du /);
    expect(partOf(markup, "record-points-d1")).toMatch(/^Meilleur total · Division 1 66 pts 2027-28 · Champion · 34 matchs/);
    expect(partOf(markup, "record-points-d2")).toMatch(/^Meilleur total · Division 2 88 pts 2026-27 · 2e · 46 matchs/);
    expect(partOf(markup, "record-top-scorer")).toMatch(/^Meilleur buteur de l'histoire 56 buts Karim Diallo · BU · toujours au club/);
    expect(partOf(markup, "record-transfer-out")).toMatch(/^Plus grosse vente 18,5 M€ Marc Roy · à Sporting Est · 2028-29/);
    expect(partOf(markup, "record-transfer-in")).toMatch(/^Plus gros achat 9 M€ Karim Diallo · de un club hors du jeu · 2026-27/);
    expect(partOf(markup, "record-best-youth")).toMatch(/^Jeune formé le plus réussi \d+ pts Enzo Faure · formé en 2027 · 18 matchs · note 71/);
    expect(partOf(render(<CareerRecords history={HISTORY} />, "en"), "record-top-scorer")).toMatch(/^All-time top scorer 56 goals Karim Diallo · ST · still at the club/);
  });

  it("names the legends, and the players at the club above 75 points on their way", () => {
    const markup = render(<CareerLegends history={HISTORY} />);

    // Karim Diallo: 84 matches, 56 goals, 2 assists, the 2026 promotion (no title) and the 2027 title with him.
    expect(partOf(markup, "legend")).toMatch(/^Karim Diallo BU 228 pts 2026-27 → 2027-28 · 84 matchs · 56 buts · 2 passes 1 trophée/);
    // Enzo Faure, 43 points: not on his way yet, more than 75 are needed.
    expect(HISTORY.onTheWay).toEqual([]);
    expect(markup).not.toContain('data-testid="on-the-way"');
    // At 80 points, he is; one season at the club: its label alone.
    const faure = { playerKey: "youth:2027:lyon:1", index: 80, matches: 18, goals: 2, assists: 1, firstYear: 2027, lastYear: 2027, titles: 1, awards: 0 };
    const onHisWay = render(<CareerLegends history={{ ...HISTORY, onTheWay: [faure] }} />);
    expect(partOf(onHisWay, "on-the-way")).toMatch(/^Enzo Faure MC 80 pts 2027-28 · 18 matchs · 2 buts · 1 passe 1 trophée · encore 70 pts/);
    expect(textOf(render(<CareerLegends history={{ ...HISTORY, legends: [] }} />))).toContain("Aucune légende pour l'instant");
  });

  it("shows five legends, and the others on demand", () => {
    const paths = { some: "/saves/s/seasons", all: "/saves/s/seasons?legends=all" };
    const [karim] = HISTORY.legends;
    const seven = Array.from({ length: 7 }, (_, index) => ({ ...karim, playerKey: `lyon#${20 + index}`, index: 160 - index }));
    const history = { ...HISTORY, legends: seven };

    const five = render(<CareerLegends history={history} paths={paths} />);
    expect(five.match(/data-testid="legend"/g)).toHaveLength(5);
    expect(partOf(five, "career-legends-all")).toMatch(/^Voir toutes les légendes \(7\) /);
    expect(five).toContain('href="/saves/s/seasons?legends=all#legendes"');

    const all = render(<CareerLegends history={history} paths={paths} showAll />);
    expect(all.match(/data-testid="legend"/g)).toHaveLength(7);
    expect(partOf(all, "career-legends-all")).toMatch(/^Voir moins /);
    expect(all).toContain('href="/saves/s/seasons#legendes"');
    expect(partOf(render(<CareerLegends history={history} paths={paths} />, "en"), "career-legends-all")).toMatch(/^See all legends \(7\) /);

    // Five or fewer: no link.
    expect(render(<CareerLegends history={HISTORY} paths={paths} />)).not.toContain("career-legends-all");
  });

  it("sums the career up in its head, with the card's way out from a completed season", () => {
    const card = {
      square: { url: careerCardPath("save", "fr", 2, "square"), fileName: "late-winner-carriere.png" },
      landscape: { url: careerCardPath("save", "fr", 2), fileName: "late-winner-carriere-paysage.png" },
    };
    const markup = render(<HistoryHead history={HISTORY} card={card} />);

    expect(partOf(markup, "history-seasons")).toMatch(/^2 saisons terminées · 2026-27 → 2027-28 D2 → D1 · 1 trophée · 1 montée Objectifs atteints : 2\/3 /);
    expect(markup).toContain('href="/saves/save/seasons/card?lang=fr&amp;v=1&amp;n=2"');
    expect(markup).toContain('data-testid="career-card-image"');
    expect(render(<HistoryHead history={HISTORY} card={null} />)).not.toContain("career-card");
  });

  it("shows the season in progress: its place, its cup's run ended, its European stage", () => {
    const current = HISTORY.current;
    if (current === null) {
      throw new Error("No season in progress");
    }
    expect(textOf(render(<CurrentSeasonLine season={current} />))).toBe(
      "Saison 2028-29 · en cours France — Division 1 3e · 21 points Coupe : 8es de finale · éliminé Coupe des Lauriers : phase de ligue",
    );
    expect(textOf(render(<CurrentSeasonLine season={{ ...current, rank: null, played: 0 }} />, "en"))).toContain("No league match yet");
  });

  it("tells a season's review the records it broke", () => {
    const markup = render(<NewRecordsPanel records={[{ kind: "points", tier: 1, points: 86 }, { kind: "biggestWin", goalsFor: 7, goalsAgainst: 0 }, { kind: "unbeaten", length: 23 }]} />);
    expect(textOf(markup)).toBe("Records battus cette saison 86 points : record en Division 1 Plus large victoire : 7-0 Invincibilité record : 23 matchs");
  });

  it("names the card's address by its state, and the divisions' path", () => {
    expect(careerCardPath("save", "en", 5, "square", { frame: "frame-gold", title: "title-champion" })).toBe(
      "/saves/save/seasons/card?lang=en&v=1&n=5&format=square&frame=frame-gold&title=title-champion",
    );
    expect(divisionsPath([1])).toBeNull();
    expect(divisionsPath([2, 1, 2])).toBe("D2 → D1 → D2");
  });
});
