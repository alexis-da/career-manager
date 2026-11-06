-- CreateIndex
CREATE INDEX "ClubSave_saveId_isManaged_idx" ON "ClubSave"("saveId", "isManaged");

-- CreateIndex
CREATE INDEX "ClubSave_saveId_reputation_idx" ON "ClubSave"("saveId", "reputation");

-- CreateIndex
CREATE INDEX "PlayerSave_saveId_overall_wage_idx" ON "PlayerSave"("saveId", "overall", "wage");

-- CreateIndex
CREATE INDEX "PlayerSave_saveId_potential_overall_wage_idx" ON "PlayerSave"("saveId", "potential", "overall", "wage");
