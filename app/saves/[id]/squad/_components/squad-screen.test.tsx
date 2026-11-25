import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SquadPlayerView } from "@/src/db/squad";
import type { ContractTerms } from "@/src/db/transfers";
import { SQUAD_LIMIT } from "@/src/engine/balance";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { PlayerCardBody } from "./player-hover-card";
import { SquadSummary } from "./squad-summary";
import { SquadTable } from "./squad-table";

// The sheet's actions call Server Actions, which need a request: none is rendered here, the table being empty.
vi.mock("@/app/saves/[id]/_components/contract-actions", () => ({ SquadPlayerActions: () => null }));

const render = (node: ReactNode, locale: Locale = "fr"): string => renderToStaticMarkup(inLanguage(node, locale));

/** A text without its tags, its spaces as one. */
const textOfMarkup = (markup: string): string =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replace(/\s+/g, " ")
    .trim();

/** The class of the summary's count of players. */
const playersClass = (markup: string): string => /data-testid="squad-summary-players" class="([^"]*)"/.exec(markup)?.[1] ?? "";

describe("the squad's summary", () => {
  it("counts the players against the squad's limit, then the goalkeepers, and no wage bill", () => {
    const markup = render(<SquadSummary players={27} goalkeepers={3} />);

    expect(textOfMarkup(markup)).toBe(`27 joueurs sur ${SQUAD_LIMIT} · 3 gardiens`);
    // The count alone in its element, which the end-to-end tests read.
    expect(markup).toContain('<span data-summary="players">27</span>');
    expect(markup).not.toMatch(/masse salariale|M€/);
    expect(textOfMarkup(render(<SquadSummary players={27} goalkeepers={3} />, "en"))).toBe(`27 players of ${SQUAD_LIMIT} · 3 goalkeepers`);
  });

  it("turns amber once the squad is full, and only then", () => {
    expect(playersClass(render(<SquadSummary players={SQUAD_LIMIT - 1} goalkeepers={3} />))).not.toContain("text-warning");
    expect(playersClass(render(<SquadSummary players={SQUAD_LIMIT} goalkeepers={3} />))).toContain("text-warning");
    expect(playersClass(render(<SquadSummary players={SQUAD_LIMIT + 1} goalkeepers={3} />))).toContain("text-warning");
  });
});

describe("the squad's table", () => {
  const table = (locale?: Locale): string =>
    render(
      <SquadTable
        saveId="save-1"
        header={null}
        players={[]}
        currentDate={new Date(Date.UTC(2026, 6, 1))}
        startYear={2026}
        windowOpen
        nextWindowOpensOn={new Date(Date.UTC(2027, 0, 1))}
      />,
      locale,
    );

  it("has no wage column: its sortable columns, in order", () => {
    const columns = [...table().matchAll(/data-testid="squad-column-([a-z-]+)"/g)].map(([, column]) => column);

    expect(columns).toEqual([
      "position",
      "name",
      "age",
      "overall",
      "expected-progression",
      "potential",
      "form",
      "fitness",
      "market-value",
      "contract-until",
    ]);
    expect(textOfMarkup(table())).not.toContain("Salaire");
    expect(textOfMarkup(table("en"))).not.toContain("Wage");
  });
});

/** A player of the squad aged `age`, his summer passed `last` and to come `expected` (a growth, rounded). */
function squadPlayer(key: string, age: number, last: number | null, expected: number | null): SquadPlayerView {
  return {
    id: key,
    playerKey: key,
    firstName: "Joueur",
    lastName: key,
    nationality: "France",
    birthDate: new Date(Date.UTC(2026 - age, 2, 1)),
    age,
    position: "CM",
    clubName: "Rhône FC",
    clubColors: null,
    overall: 70,
    potential: expected === null ? 70 : 82,
    form: 50,
    fitness: 100,
    fitnessAtNextMatch: false,
    discipline: null,
    marketValue: 6_000_000,
    wage: 1_200_000,
    contractUntil: new Date(Date.UTC(2029, 5, 30)),
    injuredUntil: null,
    contractExpiring: false,
    managed: true,
    contractChoice: null,
    contractIntention: null,
    assistantIntention: null,
    arrivedThisSeason: false,
    progression: {
      last,
      outlook: { leagueMinutes: 620, growth: expected === null ? null : { expected, idle: 1, starter: 4 }, decline: null },
      history: [],
    },
    attributes: { pace: 70, shooting: 70, passing: 70, dribbling: 70, defending: 70, physical: 70, goalkeeping: 1 },
    seasonStats: { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 },
    transfers: [],
    international: { caps: 0, goals: 0, calledFor: null, injuredWith: null, titles: [] },
    // The sheet's actions are not rendered here: no sheet is open.
    terms: {} as ContractTerms,
  };
}

describe("the squad's progression", () => {
  const PLAYERS = [
    squadPlayer("a-up", 19, 4, 3),
    squadPlayer("b-down", 31, -1, null),
    squadPlayer("c-flat", 21, 0, 1),
    squadPlayer("d-new", 22, null, 2),
    squadPlayer("e-none", 26, null, 0),
  ];

  const table = (players: SquadPlayerView[], locale?: Locale): string =>
    render(
      <SquadTable
        saveId="save-1"
        header={null}
        players={players}
        currentDate={new Date(Date.UTC(2027, 6, 1))}
        startYear={2027}
        windowOpen
        nextWindowOpensOn={new Date(Date.UTC(2028, 0, 1))}
      />,
      locale,
    );

  /** Each row's markup, by its player's key, in the table's order. */
  const rowsOf = (markup: string): Map<string, string> =>
    new Map(
      markup
        .split("<tr")
        .filter((row) => row.includes('data-testid="squad-row"'))
        .map((row) => [/data-player-key="([^"]+)"/.exec(row)?.[1] ?? "", row] as const),
    );

  it("writes the summer passed beside the rating, up in green, down in red with a true minus, nothing at 0 or unknown", () => {
    const rows = rowsOf(table(PLAYERS));
    const lasts = (row: string | undefined): string[] =>
      [...(row ?? "").matchAll(/data-testid="player-last-progression" data-change="(-?\d+)" class="([^"]*)"/g)].map(
        ([, change, classes]) => `${change}:${classes.includes("text-win") ? "win" : classes.includes("text-loss") ? "loss" : "?"}`,
      );

    // Twice: in the rating's cell of the table, right of the name on a card.
    expect(lasts(rows.get("a-up"))).toEqual(["4:win", "4:win"]);
    expect(lasts(rows.get("b-down"))).toEqual(["-1:loss", "-1:loss"]);
    expect(textOfMarkup(rows.get("b-down") ?? "")).toContain("−1");
    for (const key of ["c-flat", "d-new", "e-none"]) {
      expect(lasts(rows.get(key)), key).toEqual([]);
    }
  });

  it("writes the summer to come in its column, only from a point", () => {
    const rows = rowsOf(table(PLAYERS));
    const expected = (row: string | undefined): string | null =>
      /data-testid="player-expected-progression" data-change="(\d+)"/.exec(row ?? "")?.[1] ?? null;

    expect(expected(rows.get("a-up"))).toBe("3");
    expect(textOfMarkup(rows.get("a-up") ?? "")).toContain("+3 prévu");
    expect(expected(rows.get("c-flat"))).toBe("1");
    expect(expected(rows.get("d-new"))).toBe("2");
    expect(expected(rows.get("b-down"))).toBeNull();
    expect(expected(rows.get("e-none"))).toBeNull();
    expect(textOfMarkup(rowsOf(table(PLAYERS, "en")).get("a-up") ?? "")).toContain("+3 expected");
  });

  it("offers the young players' view, counted at 21 and under, and none without them", () => {
    const markup = table(PLAYERS);
    expect(markup).toMatch(/data-testid="squad-young-toggle"[^>]*>Jeunes · 2</);
    expect(markup).toMatch(/aria-pressed="false"[^>]*data-testid="squad-young-toggle"|data-testid="squad-young-toggle"[^>]*aria-pressed="false"/);
    expect(table(PLAYERS, "en")).toMatch(/data-testid="squad-young-toggle"[^>]*>Under-21s · 2</);
    expect(markup).not.toContain('data-testid="squad-young-intro"');
    expect(table(PLAYERS.filter((player) => player.age > 21))).not.toContain('data-testid="squad-young-toggle"');
  });
});

describe("the squad's hover card", () => {
  const PLAYER = {
    playerKey: "olympique-lyonnais#5",
    firstName: "Yann",
    lastName: "Martin",
    age: 28,
    clubColors: null,
    position: "CM",
    overall: 70,
    potential: 72,
    attributes: { pace: 60, shooting: 62, passing: 74, dribbling: 70, defending: 55, physical: 66, goalkeeping: 10 },
    form: 60,
    fitness: 92,
    fitnessAtNextMatch: true,
    contractUntil: new Date(Date.UTC(2027, 5, 30)),
    contractExpiring: true,
  } as const;

  it("gives his contract's end, and no wage", () => {
    const french = textOfMarkup(render(<PlayerCardBody player={PLAYER} />));
    const english = textOfMarkup(render(<PlayerCardBody player={PLAYER} />, "en"));

    expect(french).toContain("30 juin 2027");
    expect(french).not.toMatch(/Salaire|saison/);
    expect(english).toContain("30 June 2027");
    expect(english).not.toMatch(/Wage|season/);
  });
});
