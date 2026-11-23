import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getShopShortcuts } from "@/src/db/shop";
import { getSquadView } from "@/src/db/squad";
import { formatMillions } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { screenStep, tipsReplaced } from "@/src/lib/tutorial";
import { FirstStepTip, getFirstSteps } from "../_components/first-steps";
import { MarkSeen } from "../_components/mark-seen";
import { PointerText } from "../_components/pointer-text";
import { TutorialBubble } from "../_components/tutorial/tutorial-bubble";
import { showsFirstActions, showsTip } from "../_lib/first-steps";
import { getSaveTutorial } from "../_lib/tutorial";
import { isPayrollHigh } from "../_lib/payroll";
import { SquadTable } from "./_components/squad-table";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("squad"))("title") };
}

export default async function SquadPage({ params }: PageProps<"/saves/[id]/squad">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [t, tTutorial, locale] = await Promise.all([getTranslations("squad"), getTranslations("tutorial"), getLocale()]);
  const [squad, firstSteps, shortcuts, tutorial] = await Promise.all([
    getSquadView(id),
    getFirstSteps(id),
    getShopShortcuts(id),
    getSaveTutorial(id),
  ]);
  // The tutorial's step of the squad, at its opening (scenario 2): the rating and the heart, then a player's profile.
  // Not simulation code: its day is real time.
  const tutorialStep = tutorial !== null && squad.players.length > 0 && screenStep(tutorial, "squad", new Date());
  const players = squad.players.length;
  const goalkeepers = squad.players.filter((player) => player.position === "GK").length;

  const header = (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-heading text-4xl font-bold" data-testid="squad-title">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground tabular-nums" data-testid="squad-summary">
          <span data-summary="players">{players}</span> {t("players", { count: players })} ·{" "}
          <span data-summary="goalkeepers">{goalkeepers}</span> {t("goalkeepers", { count: goalkeepers })} · {t("wageBill")}{" "}
          <span className={cn(isPayrollHigh(squad.club.payroll, squad.club.wageBudget) && "text-warning")}>
            {t("payroll", {
              payroll: formatMillions(squad.club.payroll, locale),
              budget: formatMillions(squad.club.wageBudget, locale),
            })}
          </span>
        </p>
      </div>
      {!squad.windowOpen && (
        <p className="text-xs text-muted-foreground" data-testid="squad-window-closed">
          {t("windowClosed")}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {showsFirstActions(firstSteps) && !firstSteps.seen.has("squad") && <MarkSeen saveId={id} item="squad" />}
      {tutorialStep ? (
        <TutorialBubble
          saveId={id}
          step="squad"
          text={<PointerText touch={tTutorial("steps.squad", { touch: "touch" })} click={tTutorial("steps.squad", { touch: "click" })} />}
          place={null}
          target='[data-testid="squad-row"]'
          doneOn='[data-testid="squad-row"]'
        />
      ) : (
        !tipsReplaced(tutorial, new Date()) && showsTip("rating", firstSteps) && <FirstStepTip saveId={id} tip="rating" />
      )}
      <SquadTable
        saveId={id}
        header={header}
        players={squad.players}
        currentDate={squad.currentDate}
        startYear={squad.startYear}
        windowOpen={squad.windowOpen}
        nextWindowOpensOn={squad.nextWindowOpensOn}
        care={shortcuts.care}
      />
    </div>
  );
}
