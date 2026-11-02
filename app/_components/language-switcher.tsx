import { useLocale, useTranslations } from "next-intl";
import { LOCALES } from "@/src/i18n/locale";
import { cn } from "@/src/lib/utils";
import { setLanguageAction } from "../actions";

const SWITCH = {
  plain: {
    group: "flex items-center gap-0.5",
    // 44 px to the touch on a phone.
    option: "rounded px-1.5 py-0.5 text-xs font-semibold tracking-wide transition-colors max-sm:min-h-11 max-sm:min-w-11",
    current: "bg-foreground/10 text-foreground",
    other: "text-muted-foreground hover:text-foreground",
  },
  segmented: {
    group: "flex gap-1 rounded-lg bg-background p-1",
    option: "h-9 rounded-md px-3.5 text-sm font-bold transition-colors max-sm:min-h-11",
    current: "bg-primary text-primary-foreground",
    other: "text-muted-foreground hover:text-foreground",
  },
};

type LanguageSwitcherProps = {
  className?: string;
  segmented?: boolean; // « Français / English », a switch for a card; « FR · EN » otherwise
};

/**
 * « FR · EN »: the game's language for this player, kept a year by the lw_lang cookie (setLanguageAction). The current
 * one is pressed; each is named in its own language. A form of plain buttons: it works before the page's JavaScript.
 */
export function LanguageSwitcher({ className, segmented = false }: LanguageSwitcherProps) {
  const locale = useLocale();
  const t = useTranslations("language");
  const styles = SWITCH[segmented ? "segmented" : "plain"];
  return (
    <form action={setLanguageAction} lang={locale} className={className}>
      <fieldset className={styles.group}>
        <legend className="sr-only">{t("label")}</legend>
        {LOCALES.map((option) => (
          <button
            key={option}
            type="submit"
            name="locale"
            value={option}
            lang={option}
            aria-label={t(option)}
            title={t(option)}
            aria-pressed={option === locale}
            data-testid={`language-${option}`}
            className={cn(styles.option, option === locale ? styles.current : styles.other)}
          >
            {segmented ? t(option) : option.toUpperCase()}
          </button>
        ))}
      </fieldset>
    </form>
  );
}
