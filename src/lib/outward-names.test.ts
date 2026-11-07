import { describe, expect, it } from "vitest";
import { realClubNames } from "@/prisma/seed/real-club-names";
import { clubNameCore, forbiddenNamesIn } from "./outward-names";

describe("clubNameCore", () => {
  it("takes the words that make no club of their own from both ends of a name", () => {
    expect(clubNameCore("Real Madrid CF")).toBe("Real Madrid");
    expect(clubNameCore("1. FC Köln")).toBe("Köln");
    expect(clubNameCore("AS Monaco FC")).toBe("Monaco");
    expect(clubNameCore("Olympique de Marseille")).toBe("Olympique de Marseille");
    expect(clubNameCore("FC")).toBe("FC");
  });
});

describe("forbiddenNamesIn", () => {
  const clubs = ["Real Madrid CF", "RC Lens", "Liverpool FC"];

  it("finds a brand, a licensed competition, a competing game, with their case", () => {
    expect(forbiddenNamesIn("Better than FIFA and the Premier League", clubs)).toEqual(["FIFA", "Premier League"]);
    expect(forbiddenNamesIn("A Football Manager clone", clubs)).toEqual(["Football Manager"]);
    // The genre's own words, in lower case.
    expect(forbiddenNamesIn("A free football manager game in your browser", clubs)).toEqual([]);
  });

  it("finds a real club by its whole name or its core, never inside another word", () => {
    expect(forbiddenNamesIn("Take Real Madrid to the top", clubs)).toEqual(["Real Madrid"]);
    expect(forbiddenNamesIn("Liverpool FC, champion", clubs)).toEqual(["Liverpool FC", "Liverpool"]);
    expect(forbiddenNamesIn("Un club lensois, des lentilles", clubs)).toEqual([]);
    expect(forbiddenNamesIn("Lens", clubs, ["Lens"])).toEqual([]);
  });

  it("reads the world's 198 real clubs from the seed", () => {
    const names = realClubNames();
    expect(names).toHaveLength(198);
    expect(new Set(names).size).toBe(198);
  });
});
