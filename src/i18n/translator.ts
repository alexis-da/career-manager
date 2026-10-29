import type { Messages, NamespaceKeys, NestedKeyOf, useTranslations } from "next-intl";

/** A namespace of the game's messages: « positions », « squad »… */
export type Namespace = NamespaceKeys<Messages, NestedKeyOf<Messages>>;

/**
 * A translator of one namespace, for the helpers that name things (positions, stages, competitions…): what
 * useTranslations gives a component and getTranslations an async one, the same function.
 */
export type Translator<N extends Namespace> = ReturnType<typeof useTranslations<N>>;
