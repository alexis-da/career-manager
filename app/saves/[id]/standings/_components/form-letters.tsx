import { useTranslations } from "next-intl";
import type { FormResult } from "@/src/engine/standings";
import { cn } from "@/src/lib/utils";
import { RESULT_CLASSES } from "../../_lib/results";

/**
 * A club's last results in a table's cell, oldest first: a letter each in its result's color, on the row's own background
 * (at this size, the tint of RESULT_CLASSES takes contrast from the letter), read out as words.
 */
export function FormLetters({ form }: { form: readonly FormResult[] }) {
  const t = useTranslations("standings");
  const tResults = useTranslations("results");

  if (form.length === 0) {
    return (
      <>
        <span aria-hidden>—</span>
        <span className="sr-only">{t("noForm")}</span>
      </>
    );
  }
  return (
    <>
      <span aria-hidden className="inline-flex font-heading text-xs leading-none lg:text-sm">
        {form.map((result, index) => (
          <span key={index} title={tResults(`label.${result}`)} className={cn("w-2.5 text-center lg:w-3", RESULT_CLASSES[result], "bg-transparent")}>
            {tResults(`letter.${result}`)}
          </span>
        ))}
      </span>
      <span className="sr-only">{form.map((result) => tResults(`label.${result}`)).join(", ")}</span>
    </>
  );
}
