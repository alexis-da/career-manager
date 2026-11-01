import { CheckCircle2Icon, CircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cookies } from "next/headers";
import Link from "next/link";
import { managedMatchesPlayed } from "@/src/db/first-steps";
import { SECONDARY_POSITION_FAMILIARITY } from "@/src/engine/balance";
import { cn } from "@/src/lib/utils";
import { FIRST_STEPS_MATCHES, seenItems, type FirstSteps, type SeenItem, type Tip } from "../_lib/first-steps";
import { TipFrame } from "./tip-frame";

/** Where a save's first steps are at: its club's matches, from the game, and what the player has seen, from the cookies. */
export async function getFirstSteps(saveId: string): Promise<FirstSteps> {
  const [matches, store] = await Promise.all([managedMatchesPlayed(saveId, FIRST_STEPS_MATCHES), cookies()]);
  return { matches, seen: seenItems((name) => store.has(name)) };
}

/** A short tip of a save's screens: the page decides whether to show it (showsTip). */
export function FirstStepTip({ saveId, tip, className }: { saveId: string; tip: Tip; className?: string }) {
  const t = useTranslations("firstSteps.tips");
  const tGame = useTranslations("gameActions");
  const text =
    tip === "secondary"
      ? t("secondary", { percent: Math.round(SECONDARY_POSITION_FAMILIARITY * 100) })
      : tip === "simulation"
        ? t("simulation", { button: tGame("simulateShort") })
        : t(tip);
  return (
    <TipFrame saveId={saveId} tip={tip} className={className}>
      {text}
    </TipFrame>
  );
}

type ActionRowProps = {
  id: SeenItem | "match";
  title: string;
  hint: string;
  done: boolean;
  href?: string; // the first match has no link: its button is the hero's, at the top of the same page
};

function ActionRow({ id, title, hint, done, href }: ActionRowProps) {
  const t = useTranslations("firstSteps");
  const className = "flex gap-3 rounded-md p-2";
  const content = (
    <>
      {done ? (
        <CheckCircle2Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-win" />
      ) : (
        <CircleIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0">
        <span className={cn("block font-semibold", done && "text-muted-foreground")}>
          {title}
          {done && <span className="sr-only"> ({t("done")})</span>}
        </span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </>
  );
  return (
    <li data-testid={`first-action-${id}`} data-done={done}>
      {href === undefined ? (
        <div className={className}>{content}</div>
      ) : (
        <Link href={href} className={cn(className, "hover:bg-muted")}>
          {content}
        </Link>
      )}
    </li>
  );
}

type FirstActionsProps = {
  saveId: string;
  seen: FirstSteps["seen"];
  button: string; // the name of the button that plays the next match
};

/** The first three actions of a new save, in the panel of the last result until there is one. They tick themselves. */
export function FirstActions({ saveId, seen, button }: FirstActionsProps) {
  const t = useTranslations("firstSteps");
  const base = `/saves/${saveId}`;
  return (
    <ol className="my-auto space-y-1 pt-3" aria-label={t("title")} data-testid="first-actions">
      <ActionRow id="squad" title={t("squad.title")} hint={t("squad.hint")} done={seen.has("squad")} href={`${base}/squad`} />
      <ActionRow id="lineup" title={t("lineup.title")} hint={t("lineup.hint")} done={seen.has("lineup")} href={`${base}/lineup`} />
      <ActionRow id="match" title={t("match.title")} hint={t("match.hint", { button })} done={false} />
    </ol>
  );
}
