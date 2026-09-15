-- MatchEvent and Transfer rows referencing a PlayerSave now cascade with it. NO ACTION, set by the previous
-- migration, does not make a played save deletable: PostgreSQL checks it at the end of each internal step
-- of the cascade from Save, as soon as PlayerSave rows are deleted and before MatchEvent rows are reached
-- through Fixture.

-- DropForeignKey
ALTER TABLE "MatchEvent" DROP CONSTRAINT "MatchEvent_playerSaveId_fkey";

-- DropForeignKey
ALTER TABLE "MatchEvent" DROP CONSTRAINT "MatchEvent_relatedPlayerSaveId_fkey";

-- DropForeignKey
ALTER TABLE "Transfer" DROP CONSTRAINT "Transfer_playerSaveId_fkey";

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_playerSaveId_fkey" FOREIGN KEY ("playerSaveId") REFERENCES "PlayerSave"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_relatedPlayerSaveId_fkey" FOREIGN KEY ("relatedPlayerSaveId") REFERENCES "PlayerSave"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_playerSaveId_fkey" FOREIGN KEY ("playerSaveId") REFERENCES "PlayerSave"("id") ON DELETE CASCADE ON UPDATE CASCADE;

