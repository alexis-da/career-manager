-- CreateTable
CREATE TABLE "SeasonBudget" (
    "id" TEXT NOT NULL,
    "saveId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "reputation" INTEGER NOT NULL,
    "reputationRank" INTEGER NOT NULL,
    "dotation" INTEGER NOT NULL,
    "coefficient" INTEGER NOT NULL,
    "carryOver" INTEGER NOT NULL,
    "budget" INTEGER NOT NULL,
    "wageBudget" INTEGER NOT NULL,

    CONSTRAINT "SeasonBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeasonBudget_seasonId_key" ON "SeasonBudget"("seasonId");

-- CreateIndex
CREATE INDEX "SeasonBudget_saveId_idx" ON "SeasonBudget"("saveId");

-- AddForeignKey
ALTER TABLE "SeasonBudget" ADD CONSTRAINT "SeasonBudget_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonBudget" ADD CONSTRAINT "SeasonBudget_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
