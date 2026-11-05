import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EditorPlayer } from "@/src/db/lineup";
import { POSITION_PROFILES } from "@/src/engine/balance";
import { FORMATION_NAMES, formationPositions, type FormationName } from "@/src/engine/formations";
import { ATTRIBUTE_NAMES, clampRating, overallFor, type AttributeName } from "@/src/engine/generation";
import { selectRestedLineup, type Lineup } from "@/src/engine/lineup";
import { POSITIONS, type Position } from "@/src/engine/positions";
import { compareFormations, formationStrength } from "@/src/engine/strength";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { formatHundredths } from "@/src/lib/format";
import { signedFigure } from "../_lib/formation-profile";
import { FormationPanel, type PanelOpponent } from "./formation-panel";

// A static render keeps no handler: here a button keeps its own, by its name, for a test to press it.
const pressed = vi.hoisted(() => new Map<string, () => void>());

vi.mock("@/src/components/ui/button", () => ({
  Button: ({ onClick, ...props }: ComponentProps<"button">) => {
    if (props["aria-label"] !== undefined && onClick !== undefined) {
      pressed.set(props["aria-label"], onClick as () => void);
    }
    return <button {...props} />;
  },
}));

const CLEAN = { suspended: false, suspendedLater: null, bookingRisks: [], bookingRiskNextMatch: false };

/** A player of the managed club whose attributes are his position's profile at a level, as the engine's tests build them. */
function player(id: string, position: Position, level: number): EditorPlayer {
  const attributes = Object.fromEntries(
    ATTRIBUTE_NAMES.map((name) => [name, clampRating(level + POSITION_PROFILES[position][name])]),
  ) as Record<AttributeName, number>;
  return {
    id,
    position,
    overall: overallFor(position, attributes),
    injured: false,
    suspended: false,
    firstName: "Test",
    lastName: id,
    age: 25,
    injuredUntil: null,
    fitness: 100,
    form: 50,
    morale: 50,
    discipline: CLEAN,
    ...attributes,
  };
}

/** Two players at every position, the second a point below: each formation finds its eleven at their positions. */
const squad = (level: number): EditorPlayer[] =>
  POSITIONS.flatMap((position) => [player(`${position}#1`, position, level), player(`${position}#2`, position, level - 1)]);

const PLAYERS = squad(72);

const automatic = (formation: FormationName): Lineup<EditorPlayer> => selectRestedLineup(PLAYERS, formationPositions(formation));

/** The manager's 4-3-3: the automatic one, but for a right-back up front in place of the striker. */
const ELEVEN: Lineup<EditorPlayer> = (() => {
  const lineup = automatic("4-3-3");
  const fullBack = PLAYERS.find((candidate) => candidate.id === "RB#2");
  if (fullBack === undefined || lineup.starters.some((starter) => starter.player === fullBack)) {
    throw new Error("RB#2 should be out of the automatic eleven");
  }
  return { ...lineup, starters: lineup.starters.map((starter) => (starter.slot === "ST" ? { ...starter, player: fullBack } : starter)) };
})();

const OPPONENT: PanelOpponent = {
  name: "Rhône FC",
  formation: "4-4-2",
  strength: formationStrength(selectRestedLineup(squad(66), formationPositions("4-4-2")), "4-4-2"),
  atHome: true,
};

const onApply = vi.fn();

type RenderOptions = { formation?: FormationName; eleven?: Lineup<EditorPlayer>; opponent?: PanelOpponent | null; locale?: Locale };

function render({ formation = "4-3-3", eleven = ELEVEN, opponent = OPPONENT, locale = "fr" }: RenderOptions = {}): string {
  return renderToStaticMarkup(
    inLanguage(<FormationPanel formation={formation} eleven={eleven} players={PLAYERS} opponent={opponent} onApply={onApply} />, locale),
  );
}

/** The opening tags of the elements with an attribute: enough to read their other attributes. */
const tagsWith = (markup: string, attribute: string): string[] =>
  [...markup.matchAll(new RegExp(`<[a-z]+ [^>]*${attribute}[^>]*>`, "g"))].map((match) => match[0]);

const attributeOf = (tag: string, name: string): string | undefined => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];

/** The comparison's rows, whole. */
const rowsOf = (markup: string): string[] => markup.match(/<tr [^>]*data-testid="formation-option"[\s\S]*?<\/tr>/g) ?? [];

describe("the formation panel of the lineup", () => {
  it("says the formation's profile in words, with the true minus and the French spaces, and shows it in bars", () => {
    expect(render()).toContain("Plus offensif : +3 % en attaque, −3 % en défense");
    expect(render({ formation: "5-3-2", eleven: automatic("5-3-2") })).toContain(
      "Très défensif : −5 % en attaque, +5 % en défense",
    );
    expect(render({ formation: "4-4-2", eleven: automatic("4-4-2") })).toContain("Équilibré : 0 % en attaque, 0 % en défense");
    expect(render({ locale: "en" })).toContain("More attacking: +3% attack, −3% defence");

    // +3 % fills half of the right half, the 5-4-1's 6 % its end, −3 % as much of the left one.
    const profile = render().split('data-testid="formation-profile"')[1].split('data-testid="formation-strength"')[0];
    expect(profile).toMatch(/class="[^"]*left-1\/2[^"]*bg-win[^"]*" style="width:25%"/);
    expect(profile).toMatch(/class="[^"]*right-1\/2[^"]*bg-loss[^"]*" style="width:25%"/);
  });

  it("shows the attack and defense the engine gives the eleven the match would play, beside the opponent's likely eleven", () => {
    const markup = render();
    const mine = formationStrength(ELEVEN, "4-3-3");
    const [ours] = tagsWith(markup, 'data-testid="formation-strength"');
    const [theirs] = tagsWith(markup, 'data-testid="opponent-strength"');

    expect(attributeOf(ours, "data-attack")).toBe(String(Math.round(mine.attack)));
    expect(attributeOf(ours, "data-defense")).toBe(String(Math.round(mine.defense)));
    // The full-back up front: the manager's eleven, weaker in attack than the automatic one.
    expect(Math.round(mine.attack)).toBeLessThan(Math.round(formationStrength(automatic("4-3-3"), "4-3-3").attack));
    expect(attributeOf(theirs, "data-attack")).toBe(String(Math.round(OPPONENT.strength.attack)));
    expect(attributeOf(theirs, "data-defense")).toBe(String(Math.round(OPPONENT.strength.defense)));
    expect(markup).toContain(`>${Math.round(mine.attack)}</span>`);
    expect(markup).toContain("Mon onze");
    expect(markup).toContain("En 4-3-3 sentinelle");
    expect(markup).toContain("Rhône FC");
    expect(markup).toContain("Onze prévu en 4-4-2 à plat");
  });

  it("compares the seven formations with their automatic elevens, folded, and flags the engine's best", () => {
    const markup = render();
    const { options, best } = compareFormations(PLAYERS, { strength: OPPONENT.strength, atHome: OPPONENT.atHome });
    const rows = rowsOf(markup);

    expect(tagsWith(markup, 'data-testid="formation-compare-toggle"')[0]).toContain('aria-expanded="false"');
    expect(markup).toContain(`Comparer les ${FORMATION_NAMES.length} dispositifs`);
    expect(tagsWith(markup, 'data-testid="formation-compare"')[0]).toContain("hidden");
    expect(rows.map((row) => attributeOf(row, "data-formation"))).toEqual([...FORMATION_NAMES]);
    rows.forEach((row, index) => {
      const { strength, goalDifference } = options[index];
      expect(attributeOf(row, "data-attack")).toBe(String(Math.round(strength.attack)));
      expect(attributeOf(row, "data-defense")).toBe(String(Math.round(strength.defense)));
      // Signed, to a hundredth, in the player's language.
      const margin = signedFigure(Math.round((goalDifference ?? NaN) * 100) / 100, (size) => formatHundredths(size, "fr"));
      expect(margin).toMatch(/^[+−]?\d,\d\d$/);
      expect(row).toContain(`>${margin}</td>`);
    });
    expect(best).not.toBeNull();
    expect(rows.filter((row) => row.includes('data-best="true"')).map((row) => attributeOf(row, "data-formation"))).toEqual([best]);
    expect(markup.match(/Meilleur/g)).toHaveLength(1);
    expect(markup).toContain("Écart : buts attendus pour, moins contre, au prochain match.");
  });

  it("marks the current formation, and picks any other", () => {
    pressed.clear();
    onApply.mockClear();
    const rows = rowsOf(render());
    const current = rows.find((row) => attributeOf(row, "data-formation") === "4-3-3") ?? "";

    expect(current).toContain('aria-current="true"');
    expect(current).toContain("bg-secondary");
    expect(current).toContain("Actuel");
    expect(current).not.toContain('data-testid="formation-apply"');
    expect(rows.filter((row) => row.includes('data-testid="formation-apply"'))).toHaveLength(FORMATION_NAMES.length - 1);
    expect(pressed.has("Choisir le 4-3-3 sentinelle")).toBe(false);
    pressed.get("Choisir le 5-3-2")?.();
    expect(onApply).toHaveBeenCalledWith("5-3-2");
  });

  it("without a next match, shows the eleven alone, and no margin nor best", () => {
    const markup = render({ opponent: null });

    expect(markup).toContain('data-testid="formation-strength"');
    expect(markup).not.toContain('data-testid="opponent-strength"');
    expect(markup).not.toContain("Écart");
    expect(markup).not.toContain('data-best="true"');
    expect(rowsOf(markup)).toHaveLength(FORMATION_NAMES.length);
    expect(rowsOf(markup).every((row) => (row.match(/<td/g) ?? []).length === 3)).toBe(true);
  });

  it("speaks English", () => {
    const markup = render({ locale: "en" });

    for (const text of ["My eleven", "In a 4-3-3 holding", "Likely eleven in a 4-4-2 flat", `Compare the ${FORMATION_NAMES.length} formations`, "Margin", "Best", "Current", ">Pick<"]) {
      expect(markup).toContain(text);
    }
    expect(markup).toContain('aria-label="Pick the 5-3-2"');
  });
});
