-- Tutoriel de la première carrière (docs/design/tutoriel.md) : deux tables nouvelles, rien d'existant n'est modifié. Le
-- tutoriel d'un joueur, né avec sa première carrière hors défi, et chacune de ses étapes : montrée quand, combien de fois,
-- et ce qu'en a fait le joueur. Supprimés avec leur joueur ; la carrière suivie peut partir sans eux (SET NULL).

-- CreateTable
CREATE TABLE "Tutorial" (
    "userId" TEXT NOT NULL,
    "saveId" TEXT,
    "version" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "day1At" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "skippedStep" TEXT,
    "resumedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedBy" TEXT,

    CONSTRAINT "Tutorial_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "TutorialStep" (
    "userId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "shownAt" TIMESTAMP(3),
    "shows" INTEGER NOT NULL DEFAULT 0,
    "endedAt" TIMESTAMP(3),
    "outcome" TEXT,

    CONSTRAINT "TutorialStep_pkey" PRIMARY KEY ("userId","step")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tutorial_saveId_key" ON "Tutorial"("saveId");

-- CreateIndex
CREATE INDEX "Tutorial_startedAt_idx" ON "Tutorial"("startedAt");

-- AddForeignKey
ALTER TABLE "Tutorial" ADD CONSTRAINT "Tutorial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tutorial" ADD CONSTRAINT "Tutorial_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorialStep" ADD CONSTRAINT "TutorialStep_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Tutorial"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
