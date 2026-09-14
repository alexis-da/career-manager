-- Rename Player.clubId to initialClubId in place: the existing players keep their club (no DROP/ADD).
ALTER TABLE "Player" RENAME COLUMN "clubId" TO "initialClubId";
ALTER TABLE "Player" RENAME CONSTRAINT "Player_clubId_fkey" TO "Player_initialClubId_fkey";
ALTER INDEX "Player_clubId_squadSlot_key" RENAME TO "Player_initialClubId_squadSlot_key";

-- Club.initialRank: existing rows get a temporary 0, replaced by the seed with the computed 2024-25 rank.
ALTER TABLE "Club" ADD COLUMN "initialRank" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Club" ALTER COLUMN "initialRank" DROP DEFAULT;
