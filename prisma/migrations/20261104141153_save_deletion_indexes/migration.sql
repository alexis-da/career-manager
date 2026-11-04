-- CreateIndex
CREATE INDEX "Fixture_seasonId_idx" ON "Fixture"("seasonId");

-- CreateIndex
CREATE INDEX "Fixture_homeClubSaveId_idx" ON "Fixture"("homeClubSaveId");

-- CreateIndex
CREATE INDEX "Fixture_awayClubSaveId_idx" ON "Fixture"("awayClubSaveId");

-- CreateIndex
CREATE INDEX "Fixture_winnerClubSaveId_idx" ON "Fixture"("winnerClubSaveId");

-- CreateIndex
CREATE INDEX "PlayerSave_clubSaveId_idx" ON "PlayerSave"("clubSaveId");

-- CreateIndex
CREATE INDEX "PlayerSeasonStats_playerSaveId_idx" ON "PlayerSeasonStats"("playerSaveId");

-- CreateIndex
CREATE INDEX "PlayerSeasonStats_seasonId_idx" ON "PlayerSeasonStats"("seasonId");

-- CreateIndex
CREATE INDEX "SeasonResult_seasonId_idx" ON "SeasonResult"("seasonId");

-- CreateIndex
CREATE INDEX "Transfer_playerSaveId_idx" ON "Transfer"("playerSaveId");
