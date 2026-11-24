-- Simplification (docs/design/simplification.md § 12) : six colonnes d'ajout, aucune ligne existante modifiée.
-- Le choix du joueur pour un contrat qui finit cette saison (RENEW ou LEAVE), et une vente proposée par l'adjoint
-- gardée jusqu'à la fin du mercato.
-- AlterTable
ALTER TABLE "PlayerSave" ADD COLUMN     "contractChoice" TEXT,
ADD COLUMN     "saleKeptUntil" TIMESTAMP(3);

-- Les réglages de l'adjoint, par carrière : l'annonce fermée (vide : à montrer), les contrats (l'adjoint par défaut), la
-- composition (vide pour une carrière d'avant : le mode joueur si elle a une composition enregistrée).
-- AlterTable
ALTER TABLE "Save" ADD COLUMN     "assistantNoticeAt" TIMESTAMP(3),
ADD COLUMN     "contractsByAssistant" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lineupByAssistant" BOOLEAN;

-- Ce que l'adjoint a fait des contrats au passage qui ouvre la saison : prolongés, partis, recrues.
-- AlterTable
ALTER TABLE "SeasonBudget" ADD COLUMN     "contractMoves" JSONB;
