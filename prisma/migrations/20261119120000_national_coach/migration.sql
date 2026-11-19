-- Sélectionneur et direct d'un match de sélection (docs/design/selections.md, N4 et N4b) : ajouts seulement. La
-- sélection dirigée, ses amicaux confiés à l'adjoint et son match en suspens sur Save ; la liste, la composition, les 23
-- d'une trêve en cours et l'offre de chaque fédération sur NationSave ; l'état, les événements et le résultat des seuls
-- matchs du sélectionneur sur InternationalMatch ; ses missions dans CoachSpell.

-- AlterTable
ALTER TABLE "InternationalMatch" ADD COLUMN     "decisions" JSONB,
ADD COLUMN     "events" JSONB,
ADD COLUMN     "instructions" JSONB,
ADD COLUMN     "liveState" JSONB,
ADD COLUMN     "outcome" JSONB;

-- AlterTable
ALTER TABLE "NationSave" ADD COLUMN     "callUp" JSONB,
ADD COLUMN     "lineup" JSONB,
ADD COLUMN     "offeredIn" INTEGER,
ADD COLUMN     "squad" JSONB;

-- AlterTable
ALTER TABLE "Save" ADD COLUMN     "liveInternationalId" TEXT,
ADD COLUMN     "nationCode" TEXT,
ADD COLUMN     "nationFriendlies" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "CoachSpell" (
    "id" TEXT NOT NULL,
    "saveId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fromYear" INTEGER NOT NULL,
    "toYear" INTEGER,
    "objective" INTEGER,
    "objectiveYear" INTEGER,
    "exceeded" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachSpell_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachSpell_saveId_idx" ON "CoachSpell"("saveId");

-- AddForeignKey
ALTER TABLE "CoachSpell" ADD CONSTRAINT "CoachSpell_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE CASCADE ON UPDATE CASCADE;
