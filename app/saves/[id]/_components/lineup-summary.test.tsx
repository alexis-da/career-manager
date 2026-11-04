import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LineupPlayer } from "@/src/db/lineup";
import { FORMATIONS } from "@/src/engine/formations";
import { secondaryPositions, type Position } from "@/src/engine/positions";
import { inLanguage } from "@/src/i18n/test-intl";
import { LineupSummary } from "./lineup-summary";

const SLOTS = FORMATIONS["4-3-3"]; // GK, RB, CB, CB, LB, CDM, CM, CM, RW, ST, LW
const DEFENSIVE_MIDFIELD = 5;
const CENTRAL_MIDFIELD = 6;
const STRIKER = 9;

const player = (id: string, position: Position, lastName: string): LineupPlayer => ({
  id,
  position,
  overall: 70,
  injured: false,
  firstName: "Test",
  lastName,
  age: 25,
  injuredUntil: null,
  fitness: 100,
  form: 50,
});

/** The first test key whose secondary positions, drawn from the key alone, do or do not include a position. */
const keyWhere = (primary: Position, wanted: Position, has: boolean): string => {
  const key = Array.from({ length: 1_000 }, (_, index) => `test#${index}`).find(
    (candidate) => secondaryPositions(candidate, primary).includes(wanted) === has,
  );
  if (key === undefined) {
    throw new Error(`No test key ${has ? "with" : "without"} ${wanted} as a secondary position of ${primary}`);
  }
  return key;
};

describe("the lineup summary", () => {
  it("counts the starters with the words of their labels, and names each one filling in by its key", () => {
    // Two starters both called Richard: a central midfielder in the defensive midfield slot, one of his secondary
    // positions, and an attacking midfielder in a central midfield slot, which is none of his: he fills in there.
    const secondary = player(keyWhere("CM", "CDM", true), "CM", "Richard");
    const fillingIn = player(keyWhere("CAM", "CM", false), "CAM", "Richard");
    const others = SLOTS.map((slot, index) => player(`exact#${index}`, slot.position, `Joueur${index}`));
    const starters = others.map((other, index) =>
      index === DEFENSIVE_MIDFIELD ? secondary.id : index === CENTRAL_MIDFIELD ? fillingIn.id : other.id,
    );
    const players = new Map([...others, secondary, fillingIn].map((candidate) => [candidate.id, candidate]));

    const markup = renderToStaticMarkup(inLanguage(<LineupSummary slots={SLOTS} starters={starters} players={players} />));

    expect(markup.replace(/<[^>]+>/g, "")).toBe(
      "9 titulaires à leur poste · 1 à un poste secondaire · 1 en dépanne : Richard (MOC en MC) · 0 hors poste",
    );
    expect([...markup.matchAll(/data-off-position="([^"]+)"/g)].map((match) => match[1])).toEqual([fillingIn.id]);
    expect(markup).toMatch(/<span class="text-warning">1 en dépanne<\/span>/);

    const english = renderToStaticMarkup(inLanguage(<LineupSummary slots={SLOTS} starters={starters} players={players} />, "en"));
    expect(english.replace(/<[^>]+>/g, "")).toBe(
      "9 starters in position · 1 in a secondary position · 1 filling in: Richard (CAM as CM) · 0 out of position",
    );
  });

  it("names a starter out of position, in another line, in red, after those filling in", () => {
    const outOfPosition = player("centre-back", "CB", "Martin");
    const fillingIn = player(keyWhere("CAM", "CM", false), "CAM", "Richard");
    const others = SLOTS.map((slot, index) => player(`exact#${index}`, slot.position, `Joueur${index}`));
    const starters = others.map((other, index) =>
      index === STRIKER ? outOfPosition.id : index === CENTRAL_MIDFIELD ? fillingIn.id : other.id,
    );
    const players = new Map([...others, outOfPosition, fillingIn].map((candidate) => [candidate.id, candidate]));
    const summary = (locale: "fr" | "en") =>
      renderToStaticMarkup(inLanguage(<LineupSummary slots={SLOTS} starters={starters} players={players} />, locale));

    expect(summary("fr").replace(/<[^>]+>/g, "")).toBe(
      "9 titulaires à leur poste · 1 en dépanne : Richard (MOC en MC) · 1 hors poste : Martin (DC en BU)",
    );
    expect(summary("fr")).toMatch(/<span class="text-loss">1 hors poste<\/span>/);
    expect([...summary("fr").matchAll(/data-off-position="([^"]+)"/g)].map((match) => match[1])).toEqual([
      fillingIn.id,
      outOfPosition.id,
    ]);
    expect(summary("en").replace(/<[^>]+>/g, "")).toBe(
      "9 starters in position · 1 filling in: Richard (CAM as CM) · 1 out of position: Martin (CB as ST)",
    );
  });

  it("counts one starter at his position, none, and the empty slots, a sent-off player's left out", () => {
    // A goalkeeper alone in goal, the rest of the eleven empty, one of them a sent-off player's.
    const keeper = player("exact#0", "GK", "Martin");
    const starters = SLOTS.map((_, index) => (index === 0 ? keeper.id : null));
    const players = new Map([[keeper.id, keeper]]);
    const summary = (locale: "fr" | "en") =>
      renderToStaticMarkup(
        inLanguage(<LineupSummary slots={SLOTS} starters={starters} players={players} closedSlots={1} />, locale),
      ).replace(/<[^>]+>/g, "");

    expect(summary("fr")).toBe("1 titulaire à son poste · 0 hors poste · 9 postes vides");
    expect(summary("en")).toBe("1 starter in position · 0 out of position · 9 empty positions");

    const empty = renderToStaticMarkup(inLanguage(<LineupSummary slots={SLOTS} starters={SLOTS.map(() => null)} players={new Map()} />));
    expect(empty.replace(/<[^>]+>/g, "")).toBe("0 titulaires à leur poste · 0 hors poste · 11 postes vides");
  });
});
