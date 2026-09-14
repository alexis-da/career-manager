-- CreateEnum
CREATE TYPE "Position" AS ENUM ('GK', 'DF', 'MF', 'FW');

-- CreateEnum
CREATE TYPE "MatchEventType" AS ENUM ('GOAL', 'ASSIST', 'YELLOW_CARD', 'RED_CARD', 'INJURY', 'SUBSTITUTION');

-- CreateEnum
CREATE TYPE "TransferType" AS ENUM ('TRANSFER', 'LOAN', 'FREE', 'RETIREMENT');

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "country" TEXT NOT NULL,
    "city" TEXT,
    "stadium" TEXT,
    "founded" INTEGER,
    "competitionId" TEXT,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "nationality" TEXT NOT NULL,
    "position" "Position" NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Save" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerName" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "currentDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Save_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "saveId" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubSave" (
    "id" TEXT NOT NULL,
    "saveId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "isManaged" BOOLEAN NOT NULL DEFAULT false,
    "budget" INTEGER NOT NULL DEFAULT 0,
    "wageBudget" INTEGER NOT NULL DEFAULT 0,
    "reputation" INTEGER NOT NULL DEFAULT 50,
    "boardConfidence" INTEGER NOT NULL DEFAULT 50,

    CONSTRAINT "ClubSave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerSave" (
    "id" TEXT NOT NULL,
    "saveId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "clubSaveId" TEXT,
    "overall" INTEGER NOT NULL,
    "potential" INTEGER NOT NULL,
    "pace" INTEGER NOT NULL,
    "shooting" INTEGER NOT NULL,
    "passing" INTEGER NOT NULL,
    "dribbling" INTEGER NOT NULL,
    "defending" INTEGER NOT NULL,
    "physical" INTEGER NOT NULL,
    "goalkeeping" INTEGER NOT NULL DEFAULT 1,
    "form" INTEGER NOT NULL DEFAULT 50,
    "morale" INTEGER NOT NULL DEFAULT 50,
    "fitness" INTEGER NOT NULL DEFAULT 100,
    "injuredUntil" TIMESTAMP(3),
    "marketValue" INTEGER NOT NULL DEFAULT 0,
    "wage" INTEGER NOT NULL DEFAULT 0,
    "contractUntil" TIMESTAMP(3),

    CONSTRAINT "PlayerSave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fixture" (
    "id" TEXT NOT NULL,
    "saveId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "homeClubSaveId" TEXT NOT NULL,
    "awayClubSaveId" TEXT NOT NULL,
    "played" BOOLEAN NOT NULL DEFAULT false,
    "homeGoals" INTEGER,
    "awayGoals" INTEGER,

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchEvent" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "minute" INTEGER NOT NULL,
    "type" "MatchEventType" NOT NULL,
    "playerSaveId" TEXT,

    CONSTRAINT "MatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "saveId" TEXT NOT NULL,
    "playerSaveId" TEXT NOT NULL,
    "fromClubId" TEXT,
    "toClubId" TEXT,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "type" "TransferType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerSeasonStats" (
    "id" TEXT NOT NULL,
    "saveId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "playerSaveId" TEXT NOT NULL,
    "appearances" INTEGER NOT NULL DEFAULT 0,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "yellowCards" INTEGER NOT NULL DEFAULT 0,
    "redCards" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlayerSeasonStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Competition_code_key" ON "Competition"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");

-- CreateIndex
CREATE INDEX "Club_competitionId_idx" ON "Club"("competitionId");

-- CreateIndex
CREATE INDEX "Season_saveId_idx" ON "Season"("saveId");

-- CreateIndex
CREATE UNIQUE INDEX "Season_saveId_competitionId_startYear_key" ON "Season"("saveId", "competitionId", "startYear");

-- CreateIndex
CREATE INDEX "ClubSave_saveId_idx" ON "ClubSave"("saveId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubSave_saveId_clubId_key" ON "ClubSave"("saveId", "clubId");

-- CreateIndex
CREATE INDEX "PlayerSave_saveId_clubSaveId_idx" ON "PlayerSave"("saveId", "clubSaveId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerSave_saveId_playerId_key" ON "PlayerSave"("saveId", "playerId");

-- CreateIndex
CREATE INDEX "Fixture_saveId_seasonId_round_idx" ON "Fixture"("saveId", "seasonId", "round");

-- CreateIndex
CREATE INDEX "Fixture_saveId_scheduledAt_idx" ON "Fixture"("saveId", "scheduledAt");

-- CreateIndex
CREATE INDEX "MatchEvent_fixtureId_idx" ON "MatchEvent"("fixtureId");

-- CreateIndex
CREATE INDEX "Transfer_saveId_date_idx" ON "Transfer"("saveId", "date");

-- CreateIndex
CREATE INDEX "PlayerSeasonStats_saveId_seasonId_idx" ON "PlayerSeasonStats"("saveId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerSeasonStats_saveId_seasonId_playerSaveId_key" ON "PlayerSeasonStats"("saveId", "seasonId", "playerSaveId");

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubSave" ADD CONSTRAINT "ClubSave_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubSave" ADD CONSTRAINT "ClubSave_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSave" ADD CONSTRAINT "PlayerSave_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSave" ADD CONSTRAINT "PlayerSave_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSave" ADD CONSTRAINT "PlayerSave_clubSaveId_fkey" FOREIGN KEY ("clubSaveId") REFERENCES "ClubSave"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_homeClubSaveId_fkey" FOREIGN KEY ("homeClubSaveId") REFERENCES "ClubSave"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_awayClubSaveId_fkey" FOREIGN KEY ("awayClubSaveId") REFERENCES "ClubSave"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_playerSaveId_fkey" FOREIGN KEY ("playerSaveId") REFERENCES "PlayerSave"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_playerSaveId_fkey" FOREIGN KEY ("playerSaveId") REFERENCES "PlayerSave"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSeasonStats" ADD CONSTRAINT "PlayerSeasonStats_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSeasonStats" ADD CONSTRAINT "PlayerSeasonStats_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSeasonStats" ADD CONSTRAINT "PlayerSeasonStats_playerSaveId_fkey" FOREIGN KEY ("playerSaveId") REFERENCES "PlayerSave"("id") ON DELETE CASCADE ON UPDATE CASCADE;
