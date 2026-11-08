import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { listClubsByCompetition, type CompetitionClubs } from "@/src/db/clubs";
import { suggestClubs, suggestionPreview, type ClubSuggestion, type SuggestionPreview } from "@/src/engine/club-suggestions";
import type { Country } from "@/src/i18n/countries";
import type { Locale } from "@/src/i18n/locale";

/** A competition of the creation form, its country named in the page's language. */
export type CreatableCompetition = CompetitionClubs & { countryName: string };

/** What the creation form offers: the competitions a save can be created in, and the three clubs suggested. */
export type CreationChoices = { competitions: CreatableCompetition[]; suggestions: ClubSuggestion[] };

/** The country whose clubs a player is suggested: the one of the page's language. */
const SUGGESTED_COUNTRY: Record<Locale, Country> = { fr: "fr", en: "en" };

/**
 * The creation form's clubs, in the page's language: the competitions, their countries named and sorted by name, and the
 * three clubs suggested to a player of that language. Clubs have names: never in a public page's HTML, the browser asks
 * for them (creationChoicesAction).
 */
export async function creationChoices(): Promise<CreationChoices> {
  const [listed, t, locale] = await Promise.all([listClubsByCompetition(), getTranslations("world"), getLocale()]);
  const competitions = listed
    .map((competition) => ({ ...competition, countryName: t(`countries.${competition.country}`) }))
    .sort((a, b) => a.countryName.localeCompare(b.countryName, locale) || a.tier - b.tier);
  return { competitions, suggestions: suggestClubs(listed.filter(({ country }) => country === SUGGESTED_COUNTRY[locale])) };
}

/** What the page says of the creation before the clubs' names come: their number, and the cards' kinds, divisions and objectives. */
export type CreationPreview = { clubCount: number; previews: SuggestionPreview[] };

/**
 * The creation form's clubs as the page gives them, in the page's language, without a name: how many there are, and each
 * suggested card's kind, division and objective (suggestionPreview), so that its place shows them before its club comes.
 */
export async function creationPreview(): Promise<CreationPreview> {
  const [listed, locale] = await Promise.all([listClubsByCompetition(), getLocale()]);
  return {
    clubCount: listed.reduce((count, competition) => count + competition.clubs.length, 0),
    previews: suggestClubs(listed.filter(({ country }) => country === SUGGESTED_COUNTRY[locale])).map(suggestionPreview),
  };
}
