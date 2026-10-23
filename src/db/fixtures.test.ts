import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildWorldPlan } from "../../prisma/seed/seed";
import { seasonFixtures } from "./fixtures";

const plan = buildWorldPlan();

/** The fixtures of a competition's season with a fixed seed, club save ids standing for the slugs. */
function fixturesOf(code: string, startYear: number, worldVersion: 1 | 2) {
  const competition = plan.find((candidate) => candidate.competition.code === code);
  if (competition === undefined) {
    throw new Error(`No competition ${code}`);
  }
  return seasonFixtures({
    saveId: "save",
    saveSeed: "calendar-v1",
    worldVersion,
    seasonId: code,
    competitionCode: code,
    startYear,
    clubs: competition.clubs.map((club) => ({ slug: club.slug, clubSaveId: club.slug })),
  });
}

const line = (startYear: number) => (fixture: ReturnType<typeof fixturesOf>[number]): string =>
  `${fixture.seasonId}|${startYear}|${fixture.round}|${new Date(fixture.scheduledAt).toISOString()}|${fixture.homeClubSaveId}|${fixture.awayClubSaveId}`;

describe("seasonFixtures", () => {
  // Pinned before the second divisions: a worldVersion 1 save keeps the calendar it always had, pairings and dates.
  it("gives a worldVersion 1 save the same calendar as before the second divisions", () => {
    const codes = plan.filter(({ competition }) => competition.tier === 1).map(({ competition }) => competition.code);
    const lines = codes.flatMap((code) => [2026, 2027].flatMap((startYear) => fixturesOf(code, startYear, 1).map(line(startYear))));

    expect(lines).toHaveLength(3504);
    expect(createHash("sha256").update(lines.join("\n")).digest("hex")).toBe(
      "848a76ded70bb5cce537cf271617eb4ea23069da634698d463fccf9bc9c6b7b3",
    );
  });

  it("keeps the pairings of each matchday in a worldVersion 2 save, and only moves the dates", () => {
    const pairings = (fixtures: ReturnType<typeof fixturesOf>) =>
      fixtures.map(({ round, homeClubSaveId, awayClubSaveId }) => `${round}|${homeClubSaveId}|${awayClubSaveId}`);

    expect(pairings(fixturesOf("fr.1", 2026, 2))).toEqual(pairings(fixturesOf("fr.1", 2026, 1)));
    expect(fixturesOf("fr.1", 2026, 2).map((fixture) => fixture.scheduledAt)).not.toEqual(
      fixturesOf("fr.1", 2026, 1).map((fixture) => fixture.scheduledAt),
    );
  });

  it("ends every competition of a worldVersion 2 save on the same day, the smallest and the largest alike", () => {
    const lastDay = (code: string) =>
      Math.max(...fixturesOf(code, 2026, 2).map((fixture) => new Date(fixture.scheduledAt).getTime()));
    const codes = plan.map(({ competition }) => competition.code);

    expect(codes).toHaveLength(10);
    expect(new Set(codes.map(lastDay)).size).toBe(1);
  });
});
