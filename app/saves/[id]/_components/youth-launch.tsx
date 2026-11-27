"use client";

import { CheckIcon, SproutIcon } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { isNewVersionError } from "@/app/_lib/new-version";
import Link from "@/src/components/link";
import { Button } from "@/src/components/ui/button";
import type { PlayerProfile, YouthLaunchView } from "@/src/db/players";
import { YOUTH_ENTRY_MAX_TARGETS } from "@/src/engine/balance";
import { cn } from "@/src/lib/utils";
import { setYouthLaunchAction } from "../squad/actions";

// « Le lancer » / « Ne plus le lancer » (docs/design/effectif-adjoint.md § 9): the manager marks the young players « Lancer
// les jeunes » brings on at the hour when they do not start, YOUTH_ENTRY_MAX_TARGETS at most. On the sheet of an outfield
// player of the club aged 21 or under on 1 July, and on each such row of the squad's « Jeunes » view.

const fullName = (player: Pick<PlayerProfile, "firstName" | "lastName">): string => `${player.firstName} ${player.lastName}`;

/** Marking or unmarking a player of the save: the action, its toast, the page read again on a refusal. */
function useYouthLaunchAction(saveId: string) {
  const t = useTranslations("player.youthLaunch");
  const tContract = useTranslations("contract");
  const tCommon = useTranslations("common");
  const router = useRouter();
  return async (player: Pick<PlayerProfile, "id" | "firstName" | "lastName">, launch: boolean): Promise<void> => {
    try {
      const result = await setYouthLaunchAction(saveId, player.id, launch);
      if (result.ok) {
        toast.success(tContract("done", { label: fullName(player), message: result.message }));
        return;
      }
      toast.error(result.message);
      router.refresh();
    } catch (error) {
      toast.error(isNewVersionError(error) ? tCommon("newVersion") : t("failed"));
    }
  };
}

type ToggleProps = {
  name: string;
  marked: boolean;
  full: boolean; // three marks already, his not among them: marking him is refused
  pending: boolean;
  onToggle: () => void;
  className?: string;
};

/**
 * The toggle itself: « Le lancer » in an outline, « Ne plus le lancer » with a tick on the active blue once he is marked;
 * named after its player for the screen readers, a row having several. Out of reach at three marks for an unmarked player.
 */
export function YouthLaunchToggle({ name, marked, full, pending, onToggle, className }: ToggleProps) {
  const t = useTranslations("player.youthLaunch");
  const Icon = marked ? CheckIcon : SproutIcon;
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={!marked && full}
      aria-busy={pending}
      aria-label={t(marked ? "unlaunchName" : "launchName", { name })}
      data-testid="youth-launch-toggle"
      data-marked={marked}
      onClick={(event) => {
        // A row of the squad opens the sheet on a click: the toggle is not one.
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "gap-1.5",
        marked && "border-primary text-highlight hover:text-highlight dark:border-primary",
        className,
      )}
    >
      <Icon aria-hidden />
      {t(marked ? "unlaunch" : "launch")}
    </Button>
  );
}

/**
 * The marks of the squad's « Jeunes » view, kept at once on the screen for every row together (useOptimistic): the
 * count of three holds across the rows before the page is read again.
 */
export function useYouthLaunches(saveId: string, players: readonly Pick<PlayerProfile, "id" | "youthLaunch">[]) {
  const run = useYouthLaunchAction(saveId);
  const marked = players.flatMap((player) => (player.youthLaunch?.marked === true ? [player.id] : []));
  const [marks, setMarks] = useOptimistic(marked, (current: string[], change: { id: string; launch: boolean }) =>
    change.launch ? [...current.filter((id) => id !== change.id), change.id] : current.filter((id) => id !== change.id),
  );
  const [pending, startTransition] = useTransition();
  const toggle = (player: Pick<PlayerProfile, "id" | "firstName" | "lastName">) => {
    const launch = !marks.includes(player.id);
    startTransition(async () => {
      setMarks({ id: player.id, launch });
      await run(player, launch);
    });
  };
  return { marks, full: marks.length >= YOUTH_ENTRY_MAX_TARGETS, pending, toggle };
}

/** What a mark does now: nothing under « Meilleur onze », nor while the player makes the line-up himself. */
function inactiveKeyOf(launch: YouthLaunchView): "best" | "byPlayer" | null {
  if (launch.policy !== "YOUTH") {
    return "best";
  }
  return launch.lineupByAssistant ? null : "byPlayer";
}

/**
 * The sheet's « Lancer les jeunes », for an outfield player of the managed club aged 21 or under on 1 July: what the
 * assistant does with him, marked or not, the toggle, and why a mark waits (« Meilleur onze », or the line-up the player
 * makes), with the way to the settings. An injured or suspended player marked keeps his mark: he comes on again once back.
 */
export function YouthLaunchField({ player }: { player: PlayerProfile }) {
  const t = useTranslations("player.youthLaunch");
  // Null outside the App Router: no save there, no mark.
  const params: { id: string } | null = useParams<{ id: string }>();
  const saveId = params?.id;
  const run = useYouthLaunchAction(saveId ?? "");
  const launch = player.youthLaunch;
  const [marked, setMarked] = useOptimistic(launch?.marked ?? false);
  const [pending, startTransition] = useTransition();
  if (saveId === undefined || launch === null) {
    return null;
  }
  // The marks once this one is counted as the screen shows it.
  const marks = launch.marks + (marked === launch.marked ? 0 : marked ? 1 : -1);
  const full = marks >= YOUTH_ENTRY_MAX_TARGETS;
  const unavailable = player.injuredUntil !== null || player.discipline?.suspended === true;
  const inactive = inactiveKeyOf(launch);

  const toggle = () => {
    const next = !marked;
    startTransition(async () => {
      setMarked(next);
      await run(player, next);
    });
  };

  const about = marked
    ? t("marked")
    : full
      ? t("full", { max: YOUTH_ENTRY_MAX_TARGETS })
      : marks === 0
        ? t("unmarkedNone", { max: YOUTH_ENTRY_MAX_TARGETS })
        : t("unmarkedSome", { marks, max: YOUTH_ENTRY_MAX_TARGETS });

  return (
    <section
      aria-label={t("title")}
      data-testid="player-youth-launch"
      data-marked={marked}
      data-inactive={inactive ?? undefined}
      className="space-y-2 rounded-lg bg-background p-3.5"
    >
      <p className="eyebrow text-muted-foreground">{t("title")}</p>
      <p className="text-xs text-muted-foreground" data-testid="player-youth-launch-about">
        {about}
      </p>
      {marked && unavailable && (
        <p className="text-xs text-warning" data-testid="player-youth-launch-unavailable">
          {t("unavailable")}
        </p>
      )}
      {inactive !== null && (
        <p className="text-xs text-muted-foreground" data-testid="player-youth-launch-inactive">
          {t(inactive)}{" "}
          <Link
            href={`/saves/${saveId}/club#reglages`}
            data-testid="player-youth-launch-settings"
            className="inline-flex items-center font-semibold text-highlight hover:underline max-sm:min-h-11"
          >
            {t("settings")} ›
          </Link>
        </p>
      )}
      <YouthLaunchToggle name={fullName(player)} marked={marked} full={full} pending={pending} onToggle={toggle} />
    </section>
  );
}
