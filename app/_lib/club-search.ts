// The creation form's search among its clubs: pure, on the list the form already has.

/** A club the form offers: the Select's item, and the name of its competition. */
export type ClubChoice = { value: string; label: string; competition: string };

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 6;

/** A text without its accents or its case. In capitals, which spell « ß » out: « Preußen » is found by « preussen ». */
function folded(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();
}

/**
 * The first clubs with a query in their name, in the list's order, accents and case aside: an empty list when none has it,
 * null when the query is too short to be a search.
 */
export function searchClubs(clubs: readonly ClubChoice[], query: string): ClubChoice[] | null {
  const wanted = folded(query.trim());
  if (wanted.length < MIN_QUERY_LENGTH) {
    return null;
  }
  return clubs.filter(({ label }) => folded(label).includes(wanted)).slice(0, MAX_RESULTS);
}
