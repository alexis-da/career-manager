import "dotenv/config";
import { testDatabaseEnv } from "./test-database";

/**
 * Vitest's global setup (vitest.config.mts, vitest.slow.config.mts): once every test file has run, deletes the
 * throwaway owners of test saves (src/db/test-support.ts) left without a save, in the test database the tests used
 * (testDatabaseEnv: the global setup runs outside the test workers, which get it from the config). Nothing without
 * DATABASE_URL; the client is imported lazily because it throws without it.
 */
export default function setup(): (() => Promise<void>) | undefined {
  Object.assign(process.env, testDatabaseEnv());
  if (process.env.DATABASE_URL === undefined) {
    return undefined;
  }
  return async () => {
    const [{ prisma }, { deleteSavelessTestOwners }] = await Promise.all([import("./client"), import("./test-support")]);
    try {
      await deleteSavelessTestOwners();
    } finally {
      await prisma.$disconnect();
    }
  };
}
