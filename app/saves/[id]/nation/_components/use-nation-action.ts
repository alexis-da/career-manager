"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { isNewVersionError } from "@/app/_lib/new-version";
import type { ActionResult } from "../../_lib/action-result";

type Handlers = {
  onSuccess?: () => void; // run at once, before the page shows what the action changed
  onRefusal?: (message: string) => void; // where the refusal is told; a toast without it
};

/**
 * Runs one of the national coach's Server Actions in a transition: its confirmation in a toast; a refusal told where the
 * caller says (or in a toast), the page then read again, the action having changed nothing; a failure (a new version
 * of the game online, the network) in a toast. A success needs no refresh: the action revalidates the save's pages,
 * whose new state comes back with its answer.
 */
export function useNationAction(): { pending: boolean; run: (action: () => Promise<ActionResult>, handlers?: Handlers) => void } {
  const t = useTranslations("nationalTeam");
  const common = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult>, { onSuccess, onRefusal }: Handlers = {}) =>
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          toast.success(result.message);
          onSuccess?.();
          return;
        }
        if (onRefusal === undefined) {
          toast.error(result.message);
        } else {
          onRefusal(result.message);
        }
        router.refresh();
      } catch (error) {
        toast.error(isNewVersionError(error) ? common("newVersion") : t("failed"));
      }
    });

  return { pending, run };
}
