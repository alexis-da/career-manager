/** A small word of a family name: « de », « van », « der ». A capital makes it part of the name: « De Smet », « El Amrani ». */
const SMALL_WORD = /^\p{Ll}/u;

/**
 * Two letters for a player: the first of his first name and of his family name, its small words left out. « Hugo Guérin »
 * gives HG, « Virgil van Dijk » VD.
 */
export function playerInitials(firstName: string, lastName: string): string {
  const family = lastName.split(" ").find((word) => !SMALL_WORD.test(word)) ?? lastName;
  return `${firstName.charAt(0)}${family.charAt(0)}`.toUpperCase();
}
