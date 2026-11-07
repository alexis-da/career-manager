-- CreateTable
CREATE TABLE "DailyStat" (
    "day" DATE NOT NULL,
    "liveMatches" INTEGER NOT NULL DEFAULT 0,
    "simulatedMatches" INTEGER NOT NULL DEFAULT 0,
    "databaseBytes" BIGINT,
    "purgedUsers" INTEGER NOT NULL DEFAULT 0,
    "purgedSaves" INTEGER NOT NULL DEFAULT 0,
    "purgedChallengeSaves" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyStat_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "UserDay_day_idx" ON "UserDay"("day");
