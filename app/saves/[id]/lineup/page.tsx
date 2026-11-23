import { DumbbellIcon } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getLineupEditor } from "@/src/db/lineup";
import { getOpponentPreview } from "@/src/db/opponent";
import { getShopShortcuts } from "@/src/db/shop";
import { getSquadView } from "@/src/db/squad";
import Link from "@/src/components/link";
import { ROTATION_FITNESS } from "@/src/engine/balance";
import { resolveLineup } from "@/src/engine/lineup";
import { elevenOf, weakSpotIndexOf } from "@/src/engine/market-proposals";
import { formatShortDate } from "@/src/lib/format";
import { screenStep, tipsReplaced } from "@/src/lib/tutorial";
import { FirstStepTip, getFirstSteps } from "../_components/first-steps";
import { MarkSeen } from "../_components/mark-seen";
import { OpponentSheet } from "../_components/opponent-sheet";
import { PointerText } from "../_components/pointer-text";
import { TutorialBubble } from "../_components/tutorial/tutorial-bubble";
import { showsFirstActions, showsTip } from "../_lib/first-steps";
import { getSaveTutorial } from "../_lib/tutorial";
import { LineupScreen } from "./_components/lineup-editor";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("lineup"))("title") };
}

export default async function LineupPage({ params }: PageProps<"/saves/[id]/lineup">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [t, tShortcuts, tTutorial, locale] = await Promise.all([
    getTranslations("lineup"),
    getTranslations("rewards.shortcuts"),
    getTranslations("tutorial"),
    getLocale(),
  ]);
  const [editor, squad, opponent, firstSteps, shortcuts, tutorial] = await Promise.all([
    getLineupEditor(id),
    getSquadView(id),
    getOpponentPreview(id),
    getFirstSteps(id),
    getShopShortcuts(id),
    getSaveTutorial(id),
  ]);
  // The tutorial's step of the line-up, at its opening (scenario 2), on the slot of the eleven's weak spot, the one the
  // editor opens with (its saved line-up resolved, as the match plays it). Not simulation code: its day is real time.
  const weakSlot =
    tutorial !== null && screenStep(tutorial, "lineup", new Date())
      ? weakSpotIndexOf(elevenOf(editor.formation, resolveLineup(editor.formation, editor.saved, editor.players).starters))
      : -1;
  const date = formatShortDate(editor.matchDate, locale);
  // A fitness camp (missions v2), while the shop has one today and a player of the squad is tired at kick-off.
  const camp = shortcuts.camp !== null && editor.players.some((player) => player.fitness < ROTATION_FITNESS) ? shortcuts.camp : null;

  return (
    <div className="space-y-5">
      {showsFirstActions(firstSteps) && !firstSteps.seen.has("lineup") && <MarkSeen saveId={id} item="lineup" />}
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="font-heading text-4xl font-bold" data-testid="lineup-title">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground first-letter:uppercase" data-testid="lineup-instructions">
          <PointerText touch={t("instructions.touch", { date })} click={t("instructions.click", { date })} />
        </p>
        {camp !== null && (
          <Link
            href={`/saves/${id}/rewards?buy=FITNESS_CAMP`}
            data-testid="lineup-camp"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--club) hover:text-(--club-hover) max-sm:min-h-11"
          >
            <DumbbellIcon aria-hidden className="size-4 shrink-0" />
            {tShortcuts("camp", { price: camp.price, left: camp.left })}
          </Link>
        )}
        {/* Next to my eleven: adjust it while looking at his. */}
        {opponent !== null && (
          <div className="ml-auto">
            <OpponentSheet preview={opponent} besidePage />
          </div>
        )}
      </div>
      {weakSlot >= 0 ? (
        <TutorialBubble
          saveId={id}
          step="lineup"
          text={<PointerText touch={tTutorial("steps.lineup", { touch: "touch" })} click={tTutorial("steps.lineup", { touch: "click" })} />}
          place={null}
          target={`[data-testid="pitch-slot"][data-slot-index="${weakSlot}"]`}
          // A slot touched is its move (« Enregistrer » too, the follow-up then moot).
          doneOn='[data-testid="pitch-slot"], [data-testid="lineup-save"]'
          followUp={{ text: tTutorial("steps.lineupPick", { save: t("save") }), target: '[data-testid="lineup-save"]' }}
        />
      ) : (
        !tipsReplaced(tutorial, new Date()) && showsTip("secondary", firstSteps) && <FirstStepTip saveId={id} tip="secondary" />
      )}
      <LineupScreen
        saveId={id}
        editor={editor}
        squad={squad}
        // Built once here: the panel keeps its comparison while the opponent stays the same object.
        opponent={
          opponent === null
            ? null
            : { name: opponent.clubName, formation: opponent.formation, strength: opponent.strength, atHome: opponent.atHome }
        }
        care={shortcuts.care}
      />
    </div>
  );
}
