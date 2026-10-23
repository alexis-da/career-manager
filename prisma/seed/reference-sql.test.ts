import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { referenceInsertSql, secondDivisionsMigrationSql } from "./reference-sql";
import { buildWorldPlan } from "./seed";

const MIGRATION = new URL("../migrations/20261023120000_second_divisions/migration.sql", import.meta.url);

describe("reference data migrations", () => {
  it("commits the second divisions' migration exactly as the generator writes it from the seed's plan", () => {
    // Git may check the file out with CRLF line endings on Windows.
    const committed = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");

    expect(committed).toBe(secondDivisionsMigrationSql(buildWorldPlan()));
  });

  it("inserts each row on its natural key, doing nothing for a row already there, with quotes doubled", () => {
    const [plan] = buildWorldPlan().filter(({ competition }) => competition.tier === 2);
    const [club] = plan.clubs;
    const sql = referenceInsertSql([
      {
        competition: plan.competition,
        clubs: [{ ...club, name: "Club d'Essai", players: [{ ...club.players[0], lastName: "O'Brien" }] }],
      },
    ]);

    expect(sql).toContain('ON CONFLICT ("code") DO NOTHING');
    expect(sql).toContain('ON CONFLICT ("slug") DO NOTHING');
    expect(sql).toContain('ON CONFLICT ("initialClubId", "squadSlot") DO NOTHING');
    expect(sql).toContain("'Club d''Essai'");
    expect(sql).toContain("'O''Brien'");
  });
});
