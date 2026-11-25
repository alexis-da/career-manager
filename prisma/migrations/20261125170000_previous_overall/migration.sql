-- Évolution des joueurs dans l'Effectif (docs/design/effectif-adjoint.md § 3) : une colonne d'ajout, aucune ligne
-- existante modifiée. La note d'un joueur avant la progression du dernier passage de saison, écrite par ce passage
-- (« 71 ↑+4 ») ; nulle pour un joueur arrivé dans le monde depuis, et tant que la partie n'a pas passé de saison.
-- AlterTable
ALTER TABLE "PlayerSave" ADD COLUMN "previousOverall" INTEGER;
