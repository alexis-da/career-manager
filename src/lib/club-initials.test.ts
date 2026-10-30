import { describe, expect, it } from "vitest";
import { clubInitials } from "./club-initials";

describe("clubInitials", () => {
  it("takes the first letters of the first two words of the name", () => {
    expect(clubInitials("Olympique Lyonnais")).toBe("OL");
    expect(clubInitials("Paris Saint-Germain FC")).toBe("PS");
    expect(clubInitials("Wolverhampton Wanderers FC")).toBe("WW");
  });

  it("leaves out legal forms, numbers, symbols and small words", () => {
    expect(clubInitials("Olympique de Marseille")).toBe("OM");
    expect(clubInitials("FC Bayern München")).toBe("BM");
    expect(clubInitials("TSG 1899 Hoffenheim")).toBe("HO");
    expect(clubInitials("VfB Stuttgart")).toBe("ST");
    expect(clubInitials("Brighton & Hove Albion FC")).toBe("BH");
  });

  it("takes the first two letters of a single word, accents kept", () => {
    expect(clubInitials("FC Nantes")).toBe("NA");
    expect(clubInitials("1. FC Köln")).toBe("KÖ");
    expect(clubInitials("Sampdoria")).toBe("SA");
  });

  it("falls back on the name itself when nothing else is left", () => {
    expect(clubInitials("RB")).toBe("RB");
  });
});
