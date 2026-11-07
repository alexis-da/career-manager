-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstMatchAt" TIMESTAMP(3),
ADD COLUMN     "firstSaveAt" TIMESTAMP(3),
ADD COLUMN     "firstSeasonEndAt" TIMESTAMP(3);
