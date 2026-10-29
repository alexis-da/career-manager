import type { Locale as GameLocale } from "./locale";
import type { GameMessages } from "./messages";

// next-intl's types for the game: its two languages, and the keys of its messages, the French ones' (the English ones
// have the same: src/i18n/messages.test.ts). A key that does not exist fails the type check.
declare module "next-intl" {
  interface AppConfig {
    Locale: GameLocale;
    Messages: GameMessages;
  }
}
