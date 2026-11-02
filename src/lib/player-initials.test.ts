import { describe, expect, it } from "vitest";
import { playerInitials } from "./player-initials";

describe("playerInitials", () => {
  it("takes the first letter of the first name and of the family name", () => {
    expect(playerInitials("Hugo", "Guérin")).toBe("HG");
    expect(playerInitials("Jean-Philippe", "N'Guessan")).toBe("JN");
  });

  it("leaves out the small words of a family name", () => {
    expect(playerInitials("Virgil", "van Dijk")).toBe("VD");
    expect(playerInitials("Luuk", "de Jong")).toBe("LJ");
    expect(playerInitials("Pim", "van der Heijden")).toBe("PH");
  });

  it("keeps the words of a family name written with a capital", () => {
    expect(playerInitials("Karim", "El Amrani")).toBe("KE");
    expect(playerInitials("Tom", "De Smet")).toBe("TD");
  });

  it("keeps accents", () => {
    expect(playerInitials("Émile", "Öztürk")).toBe("ÉÖ");
  });

  it("falls back on the family name as it is when it has nothing but small words", () => {
    expect(playerInitials("Hugo", "da silva")).toBe("HD");
  });
});
