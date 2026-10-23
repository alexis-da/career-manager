-- Two divisions per country: a save says which world it plays in, and a club's competition becomes part of the save.
-- Rewritten from Prisma's ADD COLUMN … NOT NULL, which existing rows would refuse.

-- Save.worldVersion: every existing save plays the first divisions only (1). The default only fills those rows and is
-- dropped at once: createSave always gives the version, never the database.
ALTER TABLE "Save" ADD COLUMN "worldVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Save" ALTER COLUMN "worldVersion" DROP DEFAULT;

-- ClubSave.competitionId: a club's current competition in the save, which promotion and relegation will change; the
-- world's Club.competitionId never changes. Filled from the world, then NOT NULL: a club without a competition makes
-- the migration fail rather than leave a row without one.
ALTER TABLE "ClubSave" ADD COLUMN "competitionId" TEXT;
UPDATE "ClubSave" AS cs SET "competitionId" = c."competitionId" FROM "Club" AS c WHERE c."id" = cs."clubId";
ALTER TABLE "ClubSave" ALTER COLUMN "competitionId" SET NOT NULL;

CREATE INDEX "ClubSave_saveId_competitionId_idx" ON "ClubSave"("saveId", "competitionId");

ALTER TABLE "ClubSave" ADD CONSTRAINT "ClubSave_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
