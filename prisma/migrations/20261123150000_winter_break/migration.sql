-- Trêve hivernale : les championnats d'Espagne, d'Italie, d'Allemagne et de France sans match du 21 décembre au 3 janvier,
-- l'Angleterre jouant. La première saison qui l'a : la première saison avec trêves d'une partie créée depuis, la suivante
-- d'une partie d'avant. Une colonne d'ajout, nulle pour une partie 1, une partie du défi, ou une partie d'avant jusqu'à
-- son prochain passage de saison.
-- AlterTable
ALTER TABLE "Save" ADD COLUMN "winterBreakFrom" INTEGER;
