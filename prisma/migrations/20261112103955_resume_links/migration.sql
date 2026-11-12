-- Les liens de reprise (src/db/resume-links.ts) : une table d'ajout, l'empreinte d'un jeton par lien, supprimée avec son
-- utilisateur.
-- CreateTable
CREATE TABLE "ResumeLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "ResumeLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResumeLink_tokenHash_key" ON "ResumeLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ResumeLink_userId_createdAt_idx" ON "ResumeLink"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ResumeLink" ADD CONSTRAINT "ResumeLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
