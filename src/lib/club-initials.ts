/** What a club's name holds besides its name: « FC », « VfL », the small words. */
const NOT_THE_NAME = /^(?:\p{Lu}{1,5}|\p{Ll}+|VfB|VfL|SpVgg)$/u;

/**
 * Two letters for a club, the only mark it has in a save: the initials of the first two words of its name, or the first
 * two letters of a single word. « Olympique de Marseille » gives OM, « 1. FC Köln » KÖ, « FC Nantes » NA.
 */
export function clubInitials(name: string): string {
  const [first, second] = name.split(/[\s-]+/).filter((word) => /^\p{L}/u.test(word) && !NOT_THE_NAME.test(word));
  if (first === undefined) {
    return name.slice(0, 2).toUpperCase();
  }
  return (second === undefined ? first.slice(0, 2) : `${first.charAt(0)}${second.charAt(0)}`).toUpperCase();
}
