-- La mission du jour (src/db/missions.ts) : un type et une table d'ajout, une ligne par joueur et par jour UTC, supprimée
-- avec son utilisateur. Rien d'existant n'est modifié.
-- CreateEnum
CREATE TYPE "MissionKind" AS ENUM ('PLAY_LIVE', 'LIVE_SUBSTITUTION', 'LIVE_INSTRUCTION', 'LIVE_WIN', 'WIN', 'CLEAN_SHEET', 'PLAY_MATCHES', 'START_YOUTH');

-- CreateTable
CREATE TABLE "DailyMission" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "kind" "MissionKind" NOT NULL,
    "target" INTEGER NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "streak" INTEGER,
    "best" INTEGER,

    CONSTRAINT "DailyMission_pkey" PRIMARY KEY ("userId","day")
);

-- CreateIndex
CREATE INDEX "DailyMission_day_idx" ON "DailyMission"("day");

-- AddForeignKey
ALTER TABLE "DailyMission" ADD CONSTRAINT "DailyMission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
