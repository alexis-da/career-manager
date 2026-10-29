import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import type { Locale } from "./locale";
import { MESSAGES } from "./messages";
import type { Namespace, Translator } from "./translator";

// The game's messages outside a request, for the tests: a translator for the helpers that name things, a provider for
// the components that translate.

/** A translator of one namespace in one language. */
export function testTranslator<N extends Namespace>(locale: Locale, namespace: N): Translator<N> {
  return createTranslator({ locale, messages: MESSAGES[locale], namespace });
}

/** A component rendered in a language, French unless told otherwise. */
export function inLanguage(children: ReactNode, locale: Locale = "fr") {
  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}
