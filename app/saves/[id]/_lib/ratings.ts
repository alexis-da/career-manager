const GOOD_RATING = 75;
const FAIR_RATING = 65;

/** Colors of a rating: green from 75, blue from 65, grey below. */
export function ratingClasses(overall: number): string {
  if (overall >= GOOD_RATING) {
    return "bg-win/15 text-win";
  }
  if (overall >= FAIR_RATING) {
    return "bg-info/15 text-info";
  }
  return "bg-muted text-muted-foreground";
}

const HIGH_FORM = 65;
const LOW_FORM = 35;

/** Color of the form gauge (form runs from 1 to 99). */
export function formBarClass(form: number): string {
  if (form >= HIGH_FORM) {
    return "bg-win";
  }
  if (form <= LOW_FORM) {
    return "bg-loss";
  }
  return "bg-foreground/60";
}
