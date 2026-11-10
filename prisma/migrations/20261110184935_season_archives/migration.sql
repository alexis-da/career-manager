-- The archives of completed seasons (chantier « archives », 10/11): their fixtures and statistics in a compact form,
-- written and then pruned by the « archive » maintenance task (src/db/season-archiving.ts), and its passes. Additive:
-- two new tables and an enum, no existing row touched; the task alone deletes rows, later, by batches.

-- CreateEnum
CREATE TYPE "ArchivePassMode" AS ENUM ('COUNT', 'ARCHIVE', 'DELETE');

-- CreateTable
CREATE TABLE "SeasonArchive" (
    "seasonId" TEXT NOT NULL,
    "saveId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "clubSaveIds" TEXT[],
    "fixtures" INTEGER[],
    "goalTimes" INTEGER[],
    "instructions" JSONB,
    "playerSaveIds" TEXT[],
    "stats" INTEGER[],
    "fixtureCount" INTEGER NOT NULL,
    "statCount" INTEGER NOT NULL,
    "managedPlayed" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonArchive_pkey" PRIMARY KEY ("seasonId")
);

-- CreateTable
CREATE TABLE "ArchivePass" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mode" "ArchivePassMode" NOT NULL,
    "seasonsArchived" INTEGER NOT NULL,
    "seasonsPending" INTEGER NOT NULL,
    "seasonsDeleted" INTEGER NOT NULL,
    "fixturesDeleted" INTEGER NOT NULL,
    "statsDeleted" INTEGER NOT NULL,
    "seasonsDeletable" INTEGER NOT NULL,
    "rowsRemaining" INTEGER NOT NULL,
    "mismatches" INTEGER NOT NULL,
    "milliseconds" INTEGER NOT NULL,

    CONSTRAINT "ArchivePass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeasonArchive_saveId_idx" ON "SeasonArchive"("saveId");

-- CreateIndex
CREATE INDEX "ArchivePass_at_idx" ON "ArchivePass"("at");

-- AddForeignKey
ALTER TABLE "SeasonArchive" ADD CONSTRAINT "SeasonArchive_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonArchive" ADD CONSTRAINT "SeasonArchive_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE CASCADE ON UPDATE CASCADE;
