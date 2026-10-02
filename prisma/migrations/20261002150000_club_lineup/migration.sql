-- ClubSave.formation: the club's formation (4-3-3 for every club until the manager picks another).
-- ClubSave.lineup: the managed club's saved lineup, validated by Zod on read and write (src/db/lineup.ts).
ALTER TABLE "ClubSave" ADD COLUMN     "formation" TEXT NOT NULL DEFAULT '4-3-3',
ADD COLUMN     "lineup" JSONB;
