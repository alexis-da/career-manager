-- CreateEnum
CREATE TYPE "ChoiceKind" AS ENUM ('PENALTY', 'FREE_KICK', 'HOTHEAD', 'SCUFFLE', 'KNOCK', 'EXHAUSTED', 'LEADING', 'CHASING');

-- CreateEnum
CREATE TYPE "ChoiceOption" AS ENUM ('TAKER', 'SHOOT', 'COMBINE', 'TAKE_OFF', 'KEEP', 'CALM', 'PROTEST', 'PLAY_ON', 'REPLACE', 'DEFEND', 'ATTACK', 'STEADY');

-- AlterEnum
ALTER TYPE "FixtureStatus" ADD VALUE 'IN_PLAY';

-- CreateTable
CREATE TABLE "MatchDecision" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL,
    "kind" "ChoiceKind" NOT NULL,
    "option" "ChoiceOption" NOT NULL,
    "assistant" BOOLEAN NOT NULL,
    "playerSaveId" TEXT,

    CONSTRAINT "MatchDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchDecision_playerSaveId_idx" ON "MatchDecision"("playerSaveId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchDecision_fixtureId_sequence_key" ON "MatchDecision"("fixtureId", "sequence");

-- AddForeignKey
ALTER TABLE "MatchDecision" ADD CONSTRAINT "MatchDecision_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDecision" ADD CONSTRAINT "MatchDecision_playerSaveId_fkey" FOREIGN KEY ("playerSaveId") REFERENCES "PlayerSave"("id") ON DELETE CASCADE ON UPDATE CASCADE;
