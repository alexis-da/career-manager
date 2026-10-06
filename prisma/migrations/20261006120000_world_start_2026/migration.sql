-- The game moves from the 2024-25 season to 2026-27 (WORLD_START_YEAR, src/engine/world.ts). Ages are counted on
-- 1 July 2026 instead of 1 July 2024: every birth date moves two years later, so every age stays the same.
-- "+ interval '2 years'" turns 29 February into 28 February, as addYears (src/lib/dates.ts) does in the seed:
-- a seed run after this migration rewrites no player.
-- Player.birthDate is the only date of the reference tables. Saves created before are left inconsistent (their
-- dates stay in 2024-25): they are deleted through the app, never here.
BEGIN;
UPDATE "Player" SET "birthDate" = "birthDate" + interval '2 years';
UPDATE "PlayerSave" SET "birthDate" = "birthDate" + interval '2 years';
COMMIT;
