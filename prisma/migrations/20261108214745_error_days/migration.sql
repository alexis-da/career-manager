-- Les erreurs du jeu, du serveur et des navigateurs, regroupées par jour UTC et par empreinte : un compteur, la dernière
-- heure et un échantillon, sans donnée personnelle (src/db/errors.ts). Une table neuve : rien d'existant ne change.
-- CreateEnum
CREATE TYPE "ErrorSource" AS ENUM ('SERVER', 'CLIENT');

-- CreateTable
CREATE TABLE "ErrorDay" (
    "day" DATE NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "source" "ErrorSource" NOT NULL,
    "kind" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "digest" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErrorDay_pkey" PRIMARY KEY ("day","fingerprint")
);
