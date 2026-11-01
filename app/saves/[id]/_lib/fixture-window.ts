/** The matches of a calendar card, and how many of them are already played when the season allows it. */
const WINDOW_SIZE = 6;
const PLAYED_IN_WINDOW = 3;

type Scheduled = { played: boolean };

/** The managed club's next match, its fixtures being in date order: the first one not played. */
export function nextFixture<F extends Scheduled>(fixtures: readonly F[]): F | undefined {
  return fixtures.find((fixture) => !fixture.played);
}

/**
 * The matches a calendar card shows, the fixtures being in date order: the last three played, the next one and the two
 * after it. When one side runs short, the other fills the card: a season's last six at its end, its first six in a new
 * save.
 */
export function fixtureWindow<F extends Scheduled>(fixtures: readonly F[]): F[] {
  const next = fixtures.findIndex((fixture) => !fixture.played);
  const played = next === -1 ? fixtures.length : next;
  const start = Math.max(0, Math.min(played - PLAYED_IN_WINDOW, fixtures.length - WINDOW_SIZE));
  return fixtures.slice(start, start + WINDOW_SIZE);
}
