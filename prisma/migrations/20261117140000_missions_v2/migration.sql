-- Missions v2 (docs/design/missions-v2.md) : trois missions par jour, jetons et leur journal, série et protège-série,
-- boutique de carrière, collection de cosmétiques. Uniquement des ajouts : types, valeurs de type, colonnes et tables ;
-- DailyMission (v1) reste telle quelle, comme historique.

-- CreateEnum
CREATE TYPE "MissionTier" AS ENUM ('EASY', 'MEDIUM', 'HARD');
-- CreateEnum
CREATE TYPE "TokenReason" AS ENUM ('MISSION', 'ALL_THREE', 'STREAK', 'WELCOME', 'PURCHASE');
-- CreateEnum
CREATE TYPE "ShopItem" AS ENUM ('FITNESS_CAMP', 'EXPRESS_CARE', 'BUDGET_TOP_UP', 'PROMISING_YOUTH', 'STREAK_SHIELD', 'COSMETIC');
-- CreateEnum
CREATE TYPE "CosmeticSource" AS ENUM ('STREAK', 'SHOP', 'ACHIEVEMENT');
-- AlterEnum
ALTER TYPE "MissionKind" ADD VALUE 'PLAY_MATCH';
ALTER TYPE "MissionKind" ADD VALUE 'SCORE';
ALTER TYPE "MissionKind" ADD VALUE 'SAVE_LINEUP';
ALTER TYPE "MissionKind" ADD VALUE 'LIVE_DECISION';
ALTER TYPE "MissionKind" ADD VALUE 'LIVE_WIN_COACHED';
ALTER TYPE "MissionKind" ADD VALUE 'LIVE_SCORE_TWO';
ALTER TYPE "MissionKind" ADD VALUE 'LIVE_CLEAN_SHEET';
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "badge" TEXT,
ADD COLUMN     "frame" TEXT,
ADD COLUMN     "liveMatches" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "liveWins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "streakShield" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "tokens" INTEGER NOT NULL DEFAULT 0;
-- CreateTable
CREATE TABLE "MissionTask" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "tier" "MissionTier" NOT NULL,
    "kind" "MissionKind" NOT NULL,
    "target" INTEGER NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "changedFrom" "MissionKind",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "MissionTask_pkey" PRIMARY KEY ("userId","day","tier")
);
-- CreateTable
CREATE TABLE "MissionDay" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "done" INTEGER NOT NULL DEFAULT 0,
    "countedAt" TIMESTAMP(3),
    "allDoneAt" TIMESTAMP(3),
    "streak" INTEGER,
    "best" INTEGER,
    "cycles" INTEGER,
    "changedAt" TIMESTAMP(3),
    "shieldedAt" TIMESTAMP(3),
    CONSTRAINT "MissionDay_pkey" PRIMARY KEY ("userId","day")
);
-- CreateTable
CREATE TABLE "TokenEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "reason" "TokenReason" NOT NULL,
    "amount" INTEGER NOT NULL,
    "day" DATE,
    "saveId" TEXT,
    "item" "ShopItem",
    "cosmetic" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TokenEntry_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ShopPurchase" (
    "id" TEXT NOT NULL,
    "saveId" TEXT NOT NULL,
    "item" "ShopItem" NOT NULL,
    "seasonStartYear" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "effect" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopPurchase_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "PlayerCosmetic" (
    "userId" TEXT NOT NULL,
    "cosmetic" TEXT NOT NULL,
    "source" "CosmeticSource" NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerCosmetic_pkey" PRIMARY KEY ("userId","cosmetic")
);
-- CreateIndex
CREATE INDEX "MissionTask_day_idx" ON "MissionTask"("day");
-- CreateIndex
CREATE INDEX "MissionDay_day_idx" ON "MissionDay"("day");
-- CreateIndex
CREATE INDEX "TokenEntry_createdAt_idx" ON "TokenEntry"("createdAt");
-- CreateIndex
CREATE INDEX "TokenEntry_saveId_idx" ON "TokenEntry"("saveId");
-- CreateIndex
CREATE UNIQUE INDEX "TokenEntry_userId_key_key" ON "TokenEntry"("userId", "key");
-- CreateIndex
CREATE INDEX "ShopPurchase_saveId_item_seasonStartYear_idx" ON "ShopPurchase"("saveId", "item", "seasonStartYear");
-- AddForeignKey
ALTER TABLE "MissionTask" ADD CONSTRAINT "MissionTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "MissionDay" ADD CONSTRAINT "MissionDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TokenEntry" ADD CONSTRAINT "TokenEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TokenEntry" ADD CONSTRAINT "TokenEntry_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ShopPurchase" ADD CONSTRAINT "ShopPurchase_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PlayerCosmetic" ADD CONSTRAINT "PlayerCosmetic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Le solde de jetons ne passe jamais sous 0 : un achat le vérifie, la base le garantit.
ALTER TABLE "User" ADD CONSTRAINT "User_tokens_not_negative" CHECK ("tokens" >= 0);
