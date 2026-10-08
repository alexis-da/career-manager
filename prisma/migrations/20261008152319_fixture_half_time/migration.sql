-- CreateEnum
CREATE TYPE "FixtureStatus" AS ENUM ('SCHEDULED', 'HALF_TIME', 'PLAYED');

-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN     "awayHalfTimeGoals" INTEGER,
ADD COLUMN     "homeHalfTimeGoals" INTEGER,
ADD COLUMN     "liveState" JSONB,
ADD COLUMN     "status" "FixtureStatus" NOT NULL DEFAULT 'SCHEDULED';

-- AlterTable
ALTER TABLE "Save" ADD COLUMN     "liveFixtureId" TEXT;

-- Backfill: every match played so far was played in full; half-time scores of past matches stay unknown.
UPDATE "Fixture" SET "status" = 'PLAYED' WHERE "played" = true;
