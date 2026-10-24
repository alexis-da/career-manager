import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

/**
 * The environment of the database tests (vitest.config.mts, vitest.slow.config.mts): DATABASE_URL and DIRECT_URL on
 * DATABASE_URL_TEST from .env.test, the local test database (latewinner_test) that the end-to-end tests use too, where
 * the demo save lives. Without .env.test, nothing: the tests read .env, and those in base are skipped without a URL.
 */
export function testDatabaseEnv(): Record<string, string> {
  if (!existsSync(".env.test")) {
    return {};
  }
  const url = parse(readFileSync(".env.test")).DATABASE_URL_TEST;
  return url === undefined || url === "" ? {} : { DATABASE_URL: url, DIRECT_URL: url };
}
