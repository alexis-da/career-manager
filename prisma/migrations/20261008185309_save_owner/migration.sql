-- CreateEnum
CREATE TYPE "UserKind" AS ENUM ('ANONYMOUS', 'REGISTERED');

-- AlterTable
ALTER TABLE "Save" ADD COLUMN     "ownerId" TEXT;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "kind" "UserKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Save_ownerId_idx" ON "Save"("ownerId");

-- AddForeignKey
ALTER TABLE "Save" ADD CONSTRAINT "Save_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
