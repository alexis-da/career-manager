-- Le dispositif qu'un club IA d'un autre pays que le club dirigé garde pour le mois du jeu (ClubSave.formation), et ce
-- mois : une colonne d'ajout, nulle tant que le club n'a pas choisi ainsi.
-- AlterTable
ALTER TABLE "ClubSave" ADD COLUMN     "formationMonth" INTEGER;
