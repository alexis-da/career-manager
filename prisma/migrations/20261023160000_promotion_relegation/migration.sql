-- Promotion and relegation (worldVersion 2 saves). Additive: nothing existing changes.

-- The moves at the end of a completed season, clubs leaving its competition; null for worldVersion 1 saves and for
-- the seasons in progress or completed before this migration.
ALTER TABLE "Season" ADD COLUMN "movements" JSONB;

-- The managed club went up or down at the end of the season. A row written before, or rebuilt lazily, stays false.
ALTER TABLE "SeasonResult" ADD COLUMN "promoted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "relegated" BOOLEAN NOT NULL DEFAULT false;
