-- Les lancements de l'appli installée, un total par jour, sans rien du joueur : une colonne d'ajout à 0.
-- AlterTable
ALTER TABLE "DailyStat" ADD COLUMN     "appLaunches" INTEGER NOT NULL DEFAULT 0;
