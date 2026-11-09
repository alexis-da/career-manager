-- Les passages du nettoyage des événements que plus aucun écran ne lit, un par appel de la maintenance (comptage ou
-- suppression), pour la section Santé de /admin. Une table neuve : rien d'existant ne change.
-- CreateTable
CREATE TABLE "CleanupPass" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dryRun" BOOLEAN NOT NULL,
    "otherGoalsDeleted" INTEGER NOT NULL,
    "otherGoalsRemaining" INTEGER NOT NULL,
    "managedEventsDeleted" INTEGER NOT NULL,
    "managedEventsRemaining" INTEGER NOT NULL,
    "decisionsDeleted" INTEGER NOT NULL,
    "decisionsRemaining" INTEGER NOT NULL,
    "milliseconds" INTEGER NOT NULL,

    CONSTRAINT "CleanupPass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CleanupPass_at_idx" ON "CleanupPass"("at");
