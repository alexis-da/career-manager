-- Position: twelve precise positions instead of the four lines (GK, DF, MF, FW).
-- Existing players keep a valid value: DF becomes CB, MF becomes CM, FW becomes ST. A real spread of positions
-- comes from regenerating the world (prisma migrate reset, then the seed); saves created before are not migrated.
BEGIN;
CREATE TYPE "Position_new" AS ENUM ('GK', 'RB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RM', 'LM', 'RW', 'LW', 'ST');

ALTER TABLE "Player" ALTER COLUMN "position" TYPE "Position_new" USING (
  CASE "position"::text WHEN 'DF' THEN 'CB' WHEN 'MF' THEN 'CM' WHEN 'FW' THEN 'ST' ELSE "position"::text END
)::"Position_new";
ALTER TABLE "PlayerSave" ALTER COLUMN "position" TYPE "Position_new" USING (
  CASE "position"::text WHEN 'DF' THEN 'CB' WHEN 'MF' THEN 'CM' WHEN 'FW' THEN 'ST' ELSE "position"::text END
)::"Position_new";

ALTER TYPE "Position" RENAME TO "Position_old";
ALTER TYPE "Position_new" RENAME TO "Position";
DROP TYPE "public"."Position_old";
COMMIT;
