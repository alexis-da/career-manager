/** Three-letter codes of the name lists' nationalities. */
const CODES = new Map<string, string>([
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
]);

/** « FRA » for « France »; an unknown nationality falls back to its first three letters. */
export function nationalityCode(nationality: string): string {
  return (
    CODES.get(nationality) ??
    nationality
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .slice(0, 3)
      .toUpperCase()
  );
}
