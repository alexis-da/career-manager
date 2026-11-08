-- Les buts d'un match sans le club dirigé, gardés dans son match plutôt qu'en lignes MatchEvent : la minute (+ 1000 en
-- prolongation), négative pour l'équipe à l'extérieur. Les matchs joués avant gardent leurs MatchEvent ; rien n'est supprimé.
ALTER TABLE "Fixture" ADD COLUMN     "goalTimes" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
