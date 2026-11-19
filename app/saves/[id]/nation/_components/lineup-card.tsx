import { ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "@/src/components/link";
import { Panel } from "@/src/components/panel";
import { buttonVariants } from "@/src/components/ui/button";
import type { NationalTeamView } from "@/src/db/national-view";
import { cn } from "@/src/lib/utils";
import { FriendliesSwitch } from "./friendlies-switch";

/**
 * His nation's lineup (docs/design/selections.md § 5.2, 9.7): his own (its formation and its starting instruction), or his
 * assistant's, who picks the formation and the eleven before each match; the way to his lineup editor, once a break or a
 * tournament is ahead with its 23; and who plays the friendlies.
 */
export function NationLineupCard({ saveId, view }: { saveId: string; view: NationalTeamView }) {
  const t = useTranslations("nationalTeam.lineup");
  const tFormations = useTranslations("formations");
  const { lineup } = view;
  return (
    <Panel aria-labelledby="nation-lineup-title" data-testid="nation-lineup" data-saved={lineup.saved} className="space-y-3">
      <h2 id="nation-lineup-title" className="font-heading text-[1.75rem] leading-none">
        {t("title")}
      </h2>
      {lineup.saved ? (
        <div className="space-y-0.5">
          <p data-testid="nation-lineup-formation" data-formation={lineup.formation} className="font-bold">
            {t("yours", { formation: tFormations(`label.${lineup.formation}`) })}
          </p>
          <p className="text-sm text-muted-foreground">{t("instruction", { instruction: t(`instructions.${lineup.instruction}`) })}</p>
        </div>
      ) : (
        // His assistant's formation is chosen before each match, from the 23 of its date: none to name here.
        <div className="space-y-0.5">
          <p className="font-bold">{t("assistant")}</p>
          <p className="text-sm text-muted-foreground">{t("assistantExplain")}</p>
        </div>
      )}
      {view.session === null ? (
        <p className="text-sm text-muted-foreground">{t("noSession")}</p>
      ) : (
        <Link
          href={`/saves/${saveId}/nation/lineup`}
          data-testid="nation-lineup-link"
          className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4 max-sm:w-full")}
        >
          {t("prepare")}
          <ChevronRightIcon data-icon="inline-end" aria-hidden />
        </Link>
      )}
      <div className="border-t pt-3">
        <FriendliesSwitch saveId={saveId} byAssistant={view.friendliesByAssistant} />
      </div>
    </Panel>
  );
}
