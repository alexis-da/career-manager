-- CreateEnum
CREATE TYPE "ObjectiveKind" AS ENUM ('RANKING', 'CUP', 'YOUTH', 'ENTERTAINMENT', 'SOLIDITY', 'FINANCES');

-- CreateEnum
CREATE TYPE "ObjectiveOutcome" AS ENUM ('EXCEEDED', 'ACHIEVED', 'MISSED');

-- AlterTable
ALTER TABLE "PlayerSeasonStats" ADD COLUMN     "starts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SeasonObjective" (
    "id" TEXT NOT NULL,
    "saveId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "kind" "ObjectiveKind" NOT NULL,
    "imposed" BOOLEAN NOT NULL,
    "chosen" BOOLEAN NOT NULL DEFAULT false,
    "byAssistant" BOOLEAN NOT NULL DEFAULT false,
    "variant" TEXT,
    "target" INTEGER NOT NULL,
    "exceed" INTEGER,
    "outcome" "ObjectiveOutcome",

    CONSTRAINT "SeasonObjective_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeasonObjective_saveId_idx" ON "SeasonObjective"("saveId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonObjective_seasonId_kind_key" ON "SeasonObjective"("seasonId", "kind");

-- AddForeignKey
ALTER TABLE "SeasonObjective" ADD CONSTRAINT "SeasonObjective_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonObjective" ADD CONSTRAINT "SeasonObjective_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
