import { deleteUsersLeftSince } from "./db";

/**
 * Each browser context that creates a save becomes an anonymous user. The specs delete their saves through the page;
 * the teardown returned here deletes the users this run left without a save.
 */
export default function globalSetup(): () => Promise<void> {
  // Not simulation code: the run's real start.
  const startedAt = new Date();
  return async () => {
    const deleted = await deleteUsersLeftSince(startedAt);
    console.log(`E2E: ${deleted} utilisateur(s) de test sans partie supprimé(s).`);
  };
}
