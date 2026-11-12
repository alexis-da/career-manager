import type { Translator } from "@/src/i18n/translator";
import { RESUME_LINK_DAYS, type ResumeView } from "@/src/lib/resume-link";

/** What a link's page says for a view: its heading and its sentence (the « ready » one is the form's own). */
export function resumeViewText(view: Exclude<ResumeView, "ready">, t: Translator<"resume">): { heading: string; text: string } {
  switch (view) {
    case "here":
      return { heading: t("here.heading"), text: t("here.text") };
    case "account":
      return { heading: t("account.heading"), text: t("account.text") };
    case "other-career":
      return { heading: t("other-career.heading"), text: t("other-career.text") };
    case "used":
      return { heading: t("used.heading"), text: t("used.text") };
    case "expired":
      return { heading: t("expired.heading"), text: t("expired.text", { days: RESUME_LINK_DAYS }) };
    case "unknown":
      return { heading: t("unknown.heading"), text: t("unknown.text") };
  }
}
