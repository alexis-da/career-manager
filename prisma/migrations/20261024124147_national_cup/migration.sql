-- CreateEnum
CREATE TYPE "EventPeriod" AS ENUM ('REGULAR', 'EXTRA_TIME', 'SHOOTOUT');

-- CreateEnum
CREATE TYPE "CompetitionKind" AS ENUM ('LEAGUE', 'CUP');

-- CreateEnum
CREATE TYPE "DecidedBy" AS ENUM ('REGULATION', 'EXTRA_TIME', 'PENALTIES');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MatchEventType" ADD VALUE 'SHOOTOUT_GOAL';
ALTER TYPE "MatchEventType" ADD VALUE 'SHOOTOUT_MISS';

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "kind" "CompetitionKind" NOT NULL DEFAULT 'LEAGUE';

-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN     "awayPenalties" INTEGER,
ADD COLUMN     "decidedBy" "DecidedBy",
ADD COLUMN     "homePenalties" INTEGER,
ADD COLUMN     "winnerClubSaveId" TEXT;

-- AlterTable
ALTER TABLE "MatchEvent" ADD COLUMN     "period" "EventPeriod" NOT NULL DEFAULT 'REGULAR';

-- AlterTable
ALTER TABLE "SeasonResult" ADD COLUMN     "cupRound" INTEGER;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_winnerClubSaveId_fkey" FOREIGN KEY ("winnerClubSaveId") REFERENCES "ClubSave"("id") ON DELETE CASCADE ON UPDATE CASCADE;
