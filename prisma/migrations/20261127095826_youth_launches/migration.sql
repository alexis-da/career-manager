-- Les jeunes marqués « Le lancer » (docs/design/effectif-adjoint.md § 9) : une colonne d'ajout, aucune ligne existante
-- modifiée. Son défaut constant, la liste vide, est celui de toute carrière ; PostgreSQL l'ajoute sans réécrire la table.
-- AlterTable
ALTER TABLE "Save" ADD COLUMN     "youthLaunches" TEXT[] DEFAULT ARRAY[]::TEXT[];
