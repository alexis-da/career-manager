import { createTranslator } from "next-intl";
import type { Locale } from "./locale";
import { MESSAGES } from "./messages";
import type { Namespace, Translator } from "./translator";

/**
 * A translator of one namespace in a language, outside any request: for work cached across requests (the season card,
 * app/saves/[id]/seasons/[seasonId]/card/route.tsx), whose language is in its address and never read from the request.
 */
export function translatorFor<N extends Namespace>(locale: Locale, namespace: N): Translator<N> {
  return createTranslator({ locale, messages: MESSAGES[locale], namespace });
}
