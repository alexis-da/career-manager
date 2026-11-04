import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LineupPlayer } from "@/src/db/lineup";
import { FORMATIONS } from "@/src/engine/formations";
import { secondaryPositions, type Position } from "@/src/engine/positions";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { Pitch } from "./pitch";

const SLOTS = FORMATIONS["4-3-3"]; // GK, RB, CB, CB, LB, CDM, CM, CM, RW, ST, LW

const player = (id: string, position: Position, lastName: string): LineupPlayer => ({
  id,
  position,
  overall: 70,
  injured: false,
  firstName: "Jean",
  lastName,
  age: 25,
  injuredUntil: null,
  fitness: 100,
  form: 50,
});

/**
 * The first key of a prefix whose secondary positions, drawn from the key alone, do or do not include a position: each
 * player of a pitch has his own prefix, and so his own key.
 */
const keyWhere = (prefix: string, primary: Position, wanted: Position, has: boolean): string => {
  const key = Array.from({ length: 1_000 }, (_, index) => `${prefix}#${index}`).find(
    (candidate) => secondaryPositions(candidate, primary).includes(wanted) === has,
  );
  if (key === undefined) {
    throw new Error(`No ${prefix} key ${has ? "with" : "without"} ${wanted} as a secondary position of ${primary}`);
  }
  return key;
};

// In goal, a goalkeeper; at centre-back, a centre-back who has a secondary position; in defensive midfield, a central
// midfielder for whom it is one; in central midfield, an attacking midfielder for whom it is none: he fills in; up front, a
// centre-back, out of position. The other slots are empty.
const ELEVEN: [number, LineupPlayer][] = [
  [0, player("keeper", "GK", "Gardien")],
  [2, player(keyWhere("central", "CB", "CDM", true), "CB", "Central")],
  [5, player(keyWhere("secondary", "CM", "CDM", true), "CM", "Secondaire")],
  [6, player(keyWhere("filling-in", "CAM", "CM", false), "CAM", "Depanneur")],
  [9, player("defender", "CB", "Perdu")],
];

/** Each slot with a player, in the order of the slots: its label, its name's chip, the line under it and its detail. */
function slotsOf(locale: Locale = "fr", withFitness = true) {
  const starters = SLOTS.map((_, index) => ELEVEN.find(([slot]) => slot === index)?.[1].id ?? null);
  const markup = renderToStaticMarkup(
    inLanguage(
      <Pitch
        slots={SLOTS}
        starters={starters}
        players={new Map(ELEVEN.map(([, starter]) => [starter.id, starter]))}
        clubColors={{ primary: "#000000", secondary: "#ffffff" }}
        label="Mon onze"
        fitnessAt={withFitness ? "nextMatch" : undefined}
      />,
      locale,
    ),
  );
  return markup
    .split('data-testid="pitch-slot"')
    .slice(1)
    .map((slot) => ({
      label: /aria-label="([^"]*)"/.exec(slot)?.[1].replaceAll("&#x27;", "'") ?? "",
      name: /data-slot-player="true" class="[^"]*">([^<]*)</.exec(slot)?.[1],
      gap: /data-rating-gap="([^"]+)" class="([^"]*)"/.exec(slot)?.slice(1) ?? null,
      secondary: [...slot.matchAll(/data-secondary-position="([A-Z]+)"/g)].map(([, position]) => position),
      detail: /data-slot-detail="true"[^>]*>(.*?)<\/span><\/span>/.exec(slot)?.[1].replace(/<[^>]+>/g, "") ?? null,
      fitLabel: /data-fit-label="[^"]+" class="([^"]*)">([^<]+)</.exec(slot)?.slice(1) ?? null,
    }))
    .filter((slot) => slot.name !== "Vide" && slot.name !== "Empty");
}

describe("the pitch's slots", () => {
  it("show his secondary positions under the name at his own position, what another costs him elsewhere", () => {
    const [keeper, centreBack, secondary, fillingIn, outOfPosition] = slotsOf();

    // At his own position: no gap, his secondary positions as before, a goalkeeper having none.
    expect(keeper).toMatchObject({ name: "Gardien", gap: null, secondary: [] });
    expect(centreBack.gap).toBeNull();
    expect(centreBack.secondary.length).toBeGreaterThan(0);
    // Elsewhere, in their place: « 70 → 68 » at a secondary position (0.97), unwarned; « 70 → 64 » filling in (0.92), in
    // amber; « 70 → 42 » out of position (0.6), in red. The name's chip keeps the name alone.
    expect(secondary).toMatchObject({ name: "Secondaire", secondary: [] });
    expect(secondary.gap?.[0]).toBe("70:68");
    expect(secondary.gap?.[1]).not.toMatch(/text-(warning|loss)/);
    expect(fillingIn).toMatchObject({ name: "Depanneur", secondary: [] });
    expect(fillingIn.gap?.[0]).toBe("70:64");
    expect(fillingIn.gap?.[1]).toContain("text-warning");
    expect(outOfPosition).toMatchObject({ name: "Perdu", secondary: [] });
    expect(outOfPosition.gap?.[0]).toBe("70:42");
    expect(outOfPosition.gap?.[1]).toContain("text-loss");
  });

  it("name how each one fits his slot for the screen readers, and in their detail, in the colour that warns of it", () => {
    const [keeper, , secondary, fillingIn, outOfPosition] = slotsOf();

    expect(keeper.label).toBe("Gardien : Jean Gardien, G 70 · joue G : 70, à son poste, Condition au prochain match : 100");
    expect(secondary.label).toContain("MC 70 · joue MDC : 68, poste secondaire, Condition");
    expect(fillingIn.label).toContain("MOC 70 · joue MC : 64, dépanne, Condition");
    expect(outOfPosition.label).toBe("Buteur : Jean Perdu, DC 70 · joue BU : 42, hors poste, Condition au prochain match : 100");

    expect(keeper.detail).toBe("G 70 · joue G : 70À son poste · condition 100");
    expect(keeper.fitLabel).toEqual(["font-semibold", "À son poste"]);
    expect(fillingIn.fitLabel).toEqual(["font-semibold text-warning", "Dépanne"]);
    expect(outOfPosition.fitLabel).toEqual(["font-semibold text-loss", "Hors poste"]);
  });

  it("speak British English", () => {
    const [keeper, , secondary, fillingIn, outOfPosition] = slotsOf("en");

    expect(keeper.label).toContain(", natural position, Fitness at the next match: 100");
    expect(secondary.label).toContain(", secondary position, Fitness");
    expect(fillingIn.label).toContain("CAM 70 · plays CM: 64, filling in, Fitness");
    expect(outOfPosition.label).toContain(", out of position, Fitness");
    expect(outOfPosition.fitLabel?.[1]).toBe("Out of position");
  });

  it("show the gap on a pitch without the fitness too: an opponent's eleven", () => {
    const [, , , fillingIn] = slotsOf("fr", false);

    expect(fillingIn.gap?.[0]).toBe("70:64");
    expect(fillingIn.label).toBe("Milieu central : Jean Depanneur, MOC 70 · joue MC : 64, dépanne");
    expect(fillingIn.detail).toBe("MOC 70 · joue MC : 64Dépanne");
  });
});
