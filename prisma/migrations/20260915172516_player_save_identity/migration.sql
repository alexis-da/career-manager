-- Identity of every player moves onto PlayerSave: the game no longer reads Player to know a player, and young
-- players arriving during a save have no Player row. Columns are added nullable, filled from Player (and Club
-- for the key, the same "slug#squadSlot" the seeds already used), then made NOT NULL. Prisma's generated SQL
-- added them NOT NULL at once, which fails on existing rows. Wrapped in a transaction so a failed fill leaves
-- nothing behind.
BEGIN;

ALTER TABLE "PlayerSave"
  ADD COLUMN "playerKey" TEXT,
  ADD COLUMN "firstName" TEXT,
  ADD COLUMN "lastName" TEXT,
  ADD COLUMN "birthDate" TIMESTAMP(3),
  ADD COLUMN "nationality" TEXT,
  ADD COLUMN "position" "Position";

UPDATE "PlayerSave" AS ps
SET "playerKey" = c."slug" || '#' || p."squadSlot",
    "firstName" = p."firstName",
    "lastName" = p."lastName",
    "birthDate" = p."birthDate",
    "nationality" = p."nationality",
    "position" = p."position"
FROM "Player" AS p
JOIN "Club" AS c ON c."id" = p."initialClubId"
WHERE p."id" = ps."playerId";

ALTER TABLE "PlayerSave"
  ALTER COLUMN "playerKey" SET NOT NULL,
  ALTER COLUMN "firstName" SET NOT NULL,
  ALTER COLUMN "lastName" SET NOT NULL,
  ALTER COLUMN "birthDate" SET NOT NULL,
  ALTER COLUMN "nationality" SET NOT NULL,
  ALTER COLUMN "position" SET NOT NULL,
  ALTER COLUMN "playerId" DROP NOT NULL;

CREATE UNIQUE INDEX "PlayerSave_saveId_playerKey_key" ON "PlayerSave"("saveId", "playerKey");

COMMIT;
