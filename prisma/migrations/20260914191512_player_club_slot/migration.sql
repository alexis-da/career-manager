-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "clubId" TEXT NOT NULL,
ADD COLUMN     "squadSlot" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Player_clubId_squadSlot_key" ON "Player"("clubId", "squadSlot");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

