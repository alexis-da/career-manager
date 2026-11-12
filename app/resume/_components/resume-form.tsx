"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/src/components/ui/button";
import { resumeCareerAction, type ResumeActionState } from "../actions";
import { resumeViewText } from "../_lib/view-text";

const INITIAL: ResumeActionState = { refused: null };

/**
 * « Reprendre ma carrière »: the button that spends the link (resumeCareerAction), the page's only orange. A refusal
 * (the link spent meanwhile, in another browser) says why in its place.
 */
export function ResumeForm({ token }: { token: string }) {
  const t = useTranslations("resume");
  const [state, action, pending] = useActionState(resumeCareerAction, INITIAL);
  if (state.refused !== null) {
    const { heading, text } = resumeViewText(state.refused, t);
    return (
      <div role="alert" data-testid="resume-refused" data-view={state.refused} className="space-y-1 rounded-lg bg-card p-4">
        <p className="font-bold">{heading}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" variant="club" size="lg" disabled={pending} data-testid="resume-submit" className="max-sm:w-full">
        {pending ? t("ready.pending") : t("ready.submit")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("ready.once")}</p>
    </form>
  );
}
