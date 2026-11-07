import { COMPETITIONS } from "./competitions";
import { extractClubs, fixtureFilePath, readFixtureFile } from "./openfootball";

/**
 * The real names of the world's 198 clubs, as OpenFootball spells them: what the tests of the texts the game shows the
 * world look for (src/lib/outward-names.ts). Read from the seed's files.
 */
export function realClubNames(): string[] {
  return COMPETITIONS.flatMap(({ code }) => extractClubs(readFixtureFile(fixtureFilePath(code))).map(({ name }) => name));
}
