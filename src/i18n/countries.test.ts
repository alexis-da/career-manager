import { describe, expect, it } from "vitest";
import { competitionCountry } from "./countries";

describe("competitionCountry", () => {
  it("reads the country from a competition's code, league or cup", () => {
    expect(["de.1", "en.2", "es.cup", "fr.1", "it.2"].map(competitionCountry)).toEqual(["de", "en", "es", "fr", "it"]);
  });

  it("refuses a code of no country of the game", () => {
    expect(() => competitionCountry("pt.1")).toThrow(/no country of the game/);
    expect(() => competitionCountry("")).toThrow(/no country of the game/);
  });
});
