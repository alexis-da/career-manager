import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LineupPlayer } from "@/src/db/lineup";
import { FORMATIONS } from "@/src/engine/formations";
import { secondaryPositions, type Position } from "@/src/engine/positions";
import { LineupSummary } from "./lineup-summary";

const SLOTS = FORMATIONS["4-3-3"]; // GK, RB, CB, CB, LB, CDM, CM, CM, RW, ST, LW
const DEFENSIVE_MIDFIELD = 5;
const CENTRAL_MIDFIELD = 6;

const player = (id: string, position: Position, lastName: string): LineupPlayer => ({
  id,
  position,
  overall: 70,
  injured: false,
  firstName: "Test",
  lastName,
  age: 25,
  injuredUntil: null,
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
  it("counts a starter at a secondary position as at his position, and names each one off position by its key", () => {
    // Two starters both called Richard: a central midfielder in the defensive midfield slot, one of his secondary
    // positions, and an attacking midfielder in a central midfield slot, which is none of his.
    const secondary = player(keyWhere("CM", "CDM", true), "CM", "Richard");
    const offPosition = player(keyWhere("CAM", "CM", false), "CAM", "Richard");
    const others = SLOTS.map((slot, index) => player(`exact#${index}`, slot.position, `Joueur${index}`));
    const starters = others.map((other, index) =>
      index === DEFENSIVE_MIDFIELD ? secondary.id : index === CENTRAL_MIDFIELD ? offPosition.id : other.id,
    );
    const players = new Map([...others, secondary, offPosition].map((candidate) => [candidate.id, candidate]));

    const markup = renderToStaticMarkup(<LineupSummary slots={SLOTS} starters={starters} players={players} />);

    expect(markup.replace(/<[^>]+>/g, "")).toBe("10 titulaires à leur poste · 1 hors poste : Richard (MOC en MC)");
    expect([...markup.matchAll(/data-off-position="([^"]+)"/g)].map((match) => match[1])).toEqual([offPosition.id]);
  });
});
