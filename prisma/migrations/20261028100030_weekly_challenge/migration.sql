-- AlterTable
ALTER TABLE "Save" ADD COLUMN     "challengeId" TEXT;

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "horizonMatchdays" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeEntry" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saveId" TEXT,
    "matchdaysPlayed" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER,
    "goalDiff" INTEGER,
    "goalsFor" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Challenge_weekKey_key" ON "Challenge"("weekKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeEntry_saveId_key" ON "ChallengeEntry"("saveId");

-- CreateIndex
CREATE INDEX "ChallengeEntry_userId_idx" ON "ChallengeEntry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeEntry_challengeId_userId_key" ON "ChallengeEntry"("challengeId", "userId");

-- CreateIndex
CREATE INDEX "Save_challengeId_idx" ON "Save"("challengeId");

-- AddForeignKey
ALTER TABLE "Save" ADD CONSTRAINT "Save_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeEntry" ADD CONSTRAINT "ChallengeEntry_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeEntry" ADD CONSTRAINT "ChallengeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeEntry" ADD CONSTRAINT "ChallengeEntry_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE SET NULL ON UPDATE CASCADE;
