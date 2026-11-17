-- Le premier match en direct d'un joueur (src/db/activation.ts) : une colonne d'ajout, nulle pour ceux d'avant son suivi.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstLiveMatchAt" TIMESTAMP(3);
