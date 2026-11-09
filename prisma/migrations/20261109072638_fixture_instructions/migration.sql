-- Les consignes du club dirigé pendant son match, gardées avec lui pour son fil et sa feuille de match : une colonne
-- d'ajout, nulle pour les autres matchs et ceux d'avant.
-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN     "instructions" JSONB;
