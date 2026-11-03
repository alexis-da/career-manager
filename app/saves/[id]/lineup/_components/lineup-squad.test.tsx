import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LineupPlayer } from "@/src/db/lineup";
import type { Position } from "@/src/engine/positions";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { LineupSquad } from "./lineup-squad";
import { usePointerDrag } from "./use-pointer-drag";

const player = (id: string, position: Position, overall: number, fitness = 100): LineupPlayer => ({
  id,
  position,
  overall,
  injured: false,
  firstName: "Test",
  lastName: id,
  age: 25,
  injuredUntil: null,
  fitness,
});

// A goalkeeper who starts, alone at his line; a striker on the pitch, one on the bench, one in the stands, tired.
const PLAYERS = [player("keeper", "GK", 80), player("starter", "ST", 75), player("sub", "ST", 74), player("stands", "ST", 70, 72)];

type SquadProps = Pick<ComponentProps<typeof LineupSquad>, "activeKey" | "position">;

function Squad({ activeKey, position }: SquadProps) {
  const { sourceProps } = usePointerDrag(() => undefined);
  return (
    <LineupSquad
      players={PLAYERS}
      starters={["keeper", "starter"]}
      bench={["sub"]}
      position={position}
      activeKey={activeKey}
      draggedKey={null}
      selection={null}
      onLineClick={() => undefined}
      sourceProps={sourceProps}
    />
  );
}

const render = (locale: Locale = "fr", { activeKey = null, position = null }: Partial<SquadProps> = {}): string =>
  renderToStaticMarkup(inLanguage(<Squad activeKey={activeKey} position={position} />, locale));

/** The opening tags of the elements with an attribute: enough to read their other attributes. */
const tagsWith = (markup: string, attribute: string): string[] =>
  [...markup.matchAll(new RegExp(`<[a-z]+ [^>]*${attribute}[^>]*>`, "g"))].map((match) => match[0]);

describe("the squad beside the pitch", () => {
  it("heads the list with the size of the squad and its average rating", () => {
    expect(render()).toContain("Effectif · 4 joueurs · moy. 75");
    expect(render("en")).toContain("Squad · 4 players · avg. 75");
  });

  it("keeps a substitute and a reserve in the lines the page has always had", () => {
    const lines = tagsWith(render(), 'data-testid="lineup-reserve"');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('data-player-key="sub"');
    expect(lines[0]).toContain('data-bench="true"');
    expect(lines[1]).toContain('data-player-key="stands"');
    expect(lines[1]).toContain('data-bench="false"');
  });

  it("marks the starters in lines of their own, from lg only, and never as players outside the eleven", () => {
    const markup = render();
    const lines = tagsWith(markup, 'data-testid="lineup-starter"');

    expect(lines.map((line) => /data-starter-key="([^"]+)"/.exec(line)?.[1]).sort()).toEqual(["keeper", "starter"]);
    expect(lines.join()).not.toContain("data-player-key");
    expect(lines.join()).not.toContain("data-bench");
    expect(markup).toMatch(/<li class="max-lg:hidden"><button[^>]*data-starter-key="starter"/);
    expect(markup).toContain("Titulaire");
    expect(render("en")).toContain("Starter");
  });

  it("hides a line of the pitch that only has starters under lg, where his group would be an empty title", () => {
    const groups = tagsWith(render(), "data-testid=\"lineup-group-");

    expect(groups.find((group) => group.includes("lineup-group-gk"))).toContain("max-lg:hidden");
    expect(groups.find((group) => group.includes("lineup-group-fw"))).not.toContain("max-lg:hidden");
  });

  it("gives each line the player's fitness at the next match, named for the screen readers, amber once he is tired", () => {
    const markup = render();
    const gauges = tagsWith(markup, "data-fitness=");

    expect(gauges).toHaveLength(PLAYERS.length);
    expect(markup).toContain('title="Condition au prochain match : 100"');
    expect(markup).toContain('<span class="sr-only">Condition au prochain match : 72</span>');
    expect(markup).toMatch(/<span aria-hidden="true" class="[^"]*text-warning[^"]*">72<\/span>/);
    expect(render("en")).toContain('<span class="sr-only">Fitness at the next match: 72</span>');
  });

  it("keeps one element of class block in a line, the name, which the end-to-end tests read", () => {
    const lines = render().split("<button").slice(1);

    expect(lines).toHaveLength(PLAYERS.length);
    for (const line of lines) {
      const classes = [...line.slice(0, line.indexOf("</button>")).matchAll(/<span [^>]*class="([^"]*)"/g)].map((match) => match[1]);
      expect(classes.filter((list) => list.split(" ").includes("block"))).toHaveLength(1);
    }
  });

  it("adds a line's rating at the selected slot, and shows who is active", () => {
    expect(tagsWith(render("fr", { position: "ST" }), 'title="Note au poste BU"').length).toBeGreaterThan(0);
    expect(tagsWith(render(), 'title="Note au poste')).toHaveLength(0);
    expect(tagsWith(render("fr", { activeKey: "sub" }), 'aria-current="true"')).toEqual([
      expect.stringContaining('data-player-key="sub"'),
    ]);
  });
});
