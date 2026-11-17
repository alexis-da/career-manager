-- The European competitions (docs/design/europe.md): the kinds of competition and objective, a player's European
-- discipline, a season's European entrants, the managed club's European run of a season. Additive only: existing rows
-- keep 0 or null. The competitions themselves arrive with the next migration, once the new enum value is committed.

-- AlterEnum
ALTER TYPE "CompetitionKind" ADD VALUE 'EUROPE';

-- AlterEnum
ALTER TYPE "ObjectiveKind" ADD VALUE 'EUROPE';

-- AlterTable
ALTER TABLE "PlayerSave" ADD COLUMN     "europeYellows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "suspendedEuropeMatches" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Season" ADD COLUMN     "entrants" JSONB;

-- AlterTable
ALTER TABLE "SeasonResult" ADD COLUMN     "europeCode" TEXT,
ADD COLUMN     "europeStage" INTEGER;
