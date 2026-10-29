import type { Translator } from "@/src/i18n/translator";

/** Three-letter codes of the name lists' nationalities, by their French names (the lists' and Club.country's label). */
const CODES = new Map([
  ["Allemagne", "GER"],
  ["Angleterre", "ENG"],
  ["Argentine", "ARG"],
  ["Belgique", "BEL"],
  ["Brésil", "BRA"],
  ["Côte d'Ivoire", "CIV"],
  ["Croatie", "CRO"],
  ["Espagne", "ESP"],
  ["France", "FRA"],
  ["Italie", "ITA"],
  ["Maroc", "MAR"],
  ["Pays-Bas", "NED"],
  ["Portugal", "POR"],
  ["Sénégal", "SEN"],
] as const);

type NationalityName = Parameters<typeof CODES.get>[0];

const isKnown = (nationality: string): nationality is NationalityName => CODES.has(nationality as NationalityName);

/** « FRA » for « France »; an unknown nationality falls back to its first three letters. */
export function nationalityCode(nationality: string): string {
  return isKnown(nationality)
    ? (CODES.get(nationality) ?? nationality)
    : nationality
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .slice(0, 3)
        .toUpperCase();
}

/** A nationality's name in the player's language: « Germany » for « Allemagne »; an unknown one as it is stored. */
export function nationalityName(nationality: string, t: Translator<"world">): string {
  const code = isKnown(nationality) ? CODES.get(nationality) : undefined;
  return code === undefined ? nationality : t(`nationalities.${code}`);
}
