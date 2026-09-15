-- MatchEvent.side: the team of the event, stored with it. The player's club when the match sheet is read is
-- not enough: players are transferred, released or retire after the match.
BEGIN;

CREATE TYPE "MatchSide" AS ENUM ('HOME', 'AWAY');
ALTER TABLE "MatchEvent" ADD COLUMN "side" "MatchSide";

-- Existing events: the player's club on the match date, which is the club he left in his first transfer on or
-- after that date (a release sorts before a signing on the same day), or else his current club. The current
-- club alone left 5 830 of the 26 048 events of the development database without a side.
WITH played_for AS (
  SELECT
    e.id,
    home."clubId" AS home_club,
    away."clubId" AS away_club,
    COALESCE(
      (SELECT t."fromClubId"
         FROM "Transfer" t
        WHERE t."playerSaveId" = e."playerSaveId" AND t."date" >= f."scheduledAt"
        ORDER BY t."date", (t."fromClubId" IS NULL)
        LIMIT 1),
      (SELECT cs."clubId"
         FROM "PlayerSave" ps
         JOIN "ClubSave" cs ON cs.id = ps."clubSaveId"
        WHERE ps.id = e."playerSaveId")
    ) AS club_id
  FROM "MatchEvent" e
  JOIN "Fixture" f ON f.id = e."fixtureId"
  JOIN "ClubSave" home ON home.id = f."homeClubSaveId"
  JOIN "ClubSave" away ON away.id = f."awayClubSaveId"
)
UPDATE "MatchEvent" AS target
SET "side" = CASE
  WHEN played_for.club_id = played_for.home_club THEN 'HOME'::"MatchSide"
  WHEN played_for.club_id = played_for.away_club THEN 'AWAY'::"MatchSide"
END
FROM played_for
WHERE target.id = played_for.id;

-- An event whose team cannot be told stops the migration rather than getting a guessed side.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "MatchEvent" WHERE "side" IS NULL) THEN
    RAISE EXCEPTION 'MatchEvent.side could not be determined for every event';
  END IF;
END $$;

ALTER TABLE "MatchEvent" ALTER COLUMN "side" SET NOT NULL;

COMMIT;
