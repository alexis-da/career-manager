-- Ce que la règle des 14 jours de la purge supprime, à part dans les chiffres du jour : les joueurs sans compte vus le seul
-- jour de leur création (une carrière jamais reprise) et leurs parties, pour la section Santé de /admin. Deux colonnes
-- neuves, à 0 pour les jours d'avant : rien d'existant ne change.
-- AlterTable
ALTER TABLE "DailyStat" ADD COLUMN     "purgedOneDaySaves" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "purgedOneDayUsers" INTEGER NOT NULL DEFAULT 0;
