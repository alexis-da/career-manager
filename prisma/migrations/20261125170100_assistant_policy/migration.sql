-- La consigne de l'adjoint (docs/design/effectif-adjoint.md § 2) : une colonne d'ajout, aucune ligne existante modifiée.
-- Son défaut constant, « Meilleur onze » (BEST), est la consigne de toute carrière, d'avant comme nouvelle : le jeu
-- d'avant elle. PostgreSQL l'ajoute sans réécrire la table.
-- CreateEnum
CREATE TYPE "AssistantPolicy" AS ENUM ('BEST', 'YOUTH');

-- AlterTable
ALTER TABLE "Save" ADD COLUMN     "assistantPolicy" "AssistantPolicy" NOT NULL DEFAULT 'BEST';
