import { useLocale, useTranslations } from "next-intl";
import { LOCALES } from "@/src/i18n/locale";
import { cn } from "@/src/lib/utils";
import { setLanguageAction } from "../actions";

/**
 * « FR · EN »: the game's language for this player, kept a year by the lw_lang cookie (setLanguageAction). The current
 * one is pressed; each is named in its own language. A form of plain buttons: it works before the page's JavaScript.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("language");
  return (
    <form action={setLanguageAction} lang={locale} className={className}>
      <fieldset className="flex items-center gap-0.5">
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
            className={cn(
              "rounded px-1.5 py-0.5 text-xs font-semibold tracking-wide transition-colors",
              option === locale ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.toUpperCase()}
          </button>
        ))}
      </fieldset>
    </form>
  );
}
