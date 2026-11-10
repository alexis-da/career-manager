-- PlayerSave.playerId only traced a world player's origin, which playerKey already says (« club#squadSlot »,
-- « free-agents#slot »): no code reads or writes it since the release before this one, which this migration follows so
-- that no running code ever lacks the column. Its unique index weighed about 0.6 MB per career. Catalog changes only, no
-- table rewrite: rows lose the column's bytes as they are next updated.

-- DropForeignKey
ALTER TABLE "PlayerSave" DROP CONSTRAINT "PlayerSave_playerId_fkey";

-- DropIndex
DROP INDEX "PlayerSave_saveId_playerId_key";

-- AlterTable
ALTER TABLE "PlayerSave" DROP COLUMN "playerId";
