-- CreateEnum
CREATE TYPE "DeviceKind" AS ENUM ('PHONE', 'COMPUTER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "device" "DeviceKind",
ADD COLUMN     "landingPage" TEXT,
ADD COLUMN     "locale" TEXT,
ADD COLUMN     "referrerDomain" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "VisitDay" (
    "day" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "visits" INTEGER NOT NULL,

    CONSTRAINT "VisitDay_pkey" PRIMARY KEY ("day","source","page")
);
