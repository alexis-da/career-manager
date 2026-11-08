-- Poids d'une carrière (chantier « fiabilité ») : rien n'est supprimé, aucune ligne de partie ne disparaît.

-- Les joueurs retraités, marqués : la liste des joueurs libres, son décompte et les propositions ne passent plus par
-- leurs transferts pour les écarter. Ceux d'avant la colonne sont ceux qui ont un transfert RETIREMENT, sans club.
ALTER TABLE "PlayerSave" ADD COLUMN     "retired" BOOLEAN NOT NULL DEFAULT false;

UPDATE "PlayerSave" AS p
SET "retired" = true
WHERE p."clubSaveId" IS NULL
  AND EXISTS (SELECT 1 FROM "Transfer" AS t WHERE t."playerSaveId" = p."id" AND t."type" = 'RETIREMENT');

-- Les joueurs d'un club, et les joueurs libres sans les retraités : l'index qui les lit prend la colonne.
DROP INDEX "PlayerSave_saveId_clubSaveId_idx";

CREATE INDEX "PlayerSave_saveId_clubSaveId_retired_idx" ON "PlayerSave"("saveId", "clubSaveId", "retired");

-- Index redondants : l'unicité qui commence par les mêmes colonnes sert déjà leurs lectures et la cascade.
DROP INDEX "ClubSave_saveId_idx";

DROP INDEX "PlayerSeasonStats_saveId_seasonId_idx";

DROP INDEX "Season_saveId_idx";

-- De la place dans chaque page pour les mises à jour de la saison (forme, condition, discipline, statistiques) : une
-- ligne réécrite reste dans sa page sans nouvelle entrée d'index (HOT), et la page se nettoie elle-même. Vaut pour les
-- pages écrites désormais : les lignes existantes ne bougent pas. Prisma ne lit pas ce réglage (migrate diff l'ignore).
ALTER TABLE "PlayerSave" SET (fillfactor = 50);

ALTER TABLE "PlayerSeasonStats" SET (fillfactor = 50);
