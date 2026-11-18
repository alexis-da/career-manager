-- Sélections nationales (docs/design/selections.md, N1 et N2) : ajouts seulement. Les sélections et buts internationaux
-- des joueurs, la première saison avec trêves d'une partie, les nations d'une partie avec leur réserve hors
-- championnats, et les matchs internationaux, hors de Fixture.

-- AlterTable
ALTER TABLE "PlayerSave" ADD COLUMN     "caps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "internationalGoals" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Save" ADD COLUMN     "breaksFrom" INTEGER;

-- CreateTable
CREATE TABLE "NationSave" (
    "id" TEXT NOT NULL,
    "saveId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "reserve" JSONB NOT NULL,
    "reserveCaps" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "reserveGoals" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NationSave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternationalMatch" (
    "id" TEXT NOT NULL,
    "saveId" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "competition" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "pool" INTEGER,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "home" TEXT NOT NULL,
    "away" TEXT NOT NULL,
    "neutral" BOOLEAN NOT NULL DEFAULT false,
    "played" BOOLEAN NOT NULL DEFAULT false,
    "homeGoals" INTEGER,
    "awayGoals" INTEGER,
    "decidedBy" "DecidedBy",
    "homePenalties" INTEGER,
    "awayPenalties" INTEGER,
    "winner" TEXT,
    "goalTimes" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "scorers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "managedPlayers" JSONB,

    CONSTRAINT "InternationalMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NationSave_saveId_code_key" ON "NationSave"("saveId", "code");

-- CreateIndex
CREATE INDEX "InternationalMatch_saveId_scheduledAt_idx" ON "InternationalMatch"("saveId", "scheduledAt");

-- CreateIndex
CREATE INDEX "InternationalMatch_saveId_competition_startYear_idx" ON "InternationalMatch"("saveId", "competition", "startYear");

-- AddForeignKey
ALTER TABLE "NationSave" ADD CONSTRAINT "NationSave_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternationalMatch" ADD CONSTRAINT "InternationalMatch_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE CASCADE ON UPDATE CASCADE;

