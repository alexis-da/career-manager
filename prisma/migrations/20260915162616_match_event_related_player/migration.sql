-- MatchEvent.relatedPlayerSaveId: the assist provider of a goal, the player going off in a substitution.
ALTER TABLE "MatchEvent" ADD COLUMN "relatedPlayerSaveId" TEXT;

-- Move each ASSIST event onto its goal before dropping the ASSIST type. Every ASSIST was written right
-- after its GOAL, so it is the next event of the fixture in id order, at the same minute (checked on the
-- existing data: 3 968 assists, each following a distinct goal of the same club at the same minute).
UPDATE "MatchEvent" AS goal
SET "relatedPlayerSaveId" = pair."assistPlayerSaveId"
FROM (
  SELECT
    e."type",
    e."minute",
    e."playerSaveId" AS "assistPlayerSaveId",
    lag(e."id") OVER w AS "goalId",
    lag(e."type") OVER w AS "previousType",
    lag(e."minute") OVER w AS "previousMinute"
  FROM "MatchEvent" e
  WINDOW w AS (PARTITION BY e."fixtureId" ORDER BY e."id")
) AS pair
WHERE pair."type" = 'ASSIST'
  AND pair."previousType" = 'GOAL'
  AND pair."previousMinute" = pair."minute"
  AND goal."id" = pair."goalId";

DELETE FROM "MatchEvent" WHERE "type" = 'ASSIST';

-- AlterEnum
BEGIN;
CREATE TYPE "MatchEventType_new" AS ENUM ('GOAL', 'YELLOW_CARD', 'RED_CARD', 'INJURY', 'SUBSTITUTION');
ALTER TABLE "MatchEvent" ALTER COLUMN "type" TYPE "MatchEventType_new" USING ("type"::text::"MatchEventType_new");
ALTER TYPE "MatchEventType" RENAME TO "MatchEventType_old";
ALTER TYPE "MatchEventType_new" RENAME TO "MatchEventType";
DROP TYPE "public"."MatchEventType_old";
COMMIT;

-- Foreign keys between save tables: NO ACTION is checked at the end of the statement, so the cascade
-- from Save can delete a whole save; RESTRICT was checked during the cascade and blocked it.
ALTER TABLE "MatchEvent" DROP CONSTRAINT "MatchEvent_playerSaveId_fkey";
ALTER TABLE "PlayerSave" DROP CONSTRAINT "PlayerSave_clubSaveId_fkey";
ALTER TABLE "Transfer" DROP CONSTRAINT "Transfer_playerSaveId_fkey";

CREATE INDEX "MatchEvent_playerSaveId_idx" ON "MatchEvent"("playerSaveId");
CREATE INDEX "MatchEvent_relatedPlayerSaveId_idx" ON "MatchEvent"("relatedPlayerSaveId");

ALTER TABLE "PlayerSave" ADD CONSTRAINT "PlayerSave_clubSaveId_fkey" FOREIGN KEY ("clubSaveId") REFERENCES "ClubSave"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_playerSaveId_fkey" FOREIGN KEY ("playerSaveId") REFERENCES "PlayerSave"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_relatedPlayerSaveId_fkey" FOREIGN KEY ("relatedPlayerSaveId") REFERENCES "PlayerSave"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_playerSaveId_fkey" FOREIGN KEY ("playerSaveId") REFERENCES "PlayerSave"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
