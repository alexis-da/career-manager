-- Éliminatoires et tournois d'été (docs/design/selections.md, N3) : ajouts seulement. La première saison du premier
-- cycle d'une partie, la force de chaque nation à l'ouverture d'un cycle, et les tournois gagnés par chaque joueur.

-- AlterTable
ALTER TABLE "NationSave" ADD COLUMN     "strength" INTEGER;

-- AlterTable
ALTER TABLE "PlayerSave" ADD COLUMN     "internationalTitles" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Save" ADD COLUMN     "cyclesFrom" INTEGER;
