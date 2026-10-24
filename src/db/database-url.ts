// Where the code may connect. Development and tests run on a local PostgreSQL (latewinner_dev, latewinner_test); Neon
// holds production only, reached by Vercel alone. Plain functions on URLs, without Prisma or pg, so that the Prisma
// config, Playwright's config and the scripts can use them too.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Whether a database URL points to this machine. */
export function isLocalDatabase(url: string): boolean {
  return LOCAL_HOSTS.has(new URL(url).hostname);
}

/** Why a remote database may be reached: on Vercel (its builds and functions), or when asked for explicitly. */
function remoteAllowed(): boolean {
  return process.env.VERCEL === "1" || process.env.ALLOW_REMOTE_DB === "1";
}

/**
 * Refuses a database that is not on this machine: anything run from the workstation (dev server, tests, seed,
 * measures, migrations) works on the local PostgreSQL. Allowed on Vercel, and with ALLOW_REMOTE_DB=1 set by hand.
 * `name` is the variable the URL comes from, for the message. Nothing to check without a URL.
 */
export function assertLocalDatabase(url: string | undefined, name: string): void {
  if (url === undefined || url === "" || isLocalDatabase(url) || remoteAllowed()) {
    return;
  }
  throw new Error(
    `Refusing to connect: ${name} points to ${new URL(url).hostname}, not to localhost. Development and tests use the ` +
      "local PostgreSQL; Neon is reached by Vercel only. Set ALLOW_REMOTE_DB=1 to override, knowingly.",
  );
}

/**
 * pg options for a URL: a local URL without sslmode connects without SSL (the local server has none); any other URL is
 * passed as is, its sslmode deciding, as with Neon.
 */
export function pgConnection(url: string): { connectionString: string; ssl?: false } {
  return isLocalDatabase(url) && !new URL(url).searchParams.has("sslmode") ? { connectionString: url, ssl: false } : { connectionString: url };
}

/** A URL for the Prisma CLI: a local one without sslmode gets sslmode=disable; any other URL is left as is. */
export function cliDatabaseUrl(url: string): string {
  if (!isLocalDatabase(url)) {
    return url;
  }
  const parsed = new URL(url);
  if (!parsed.searchParams.has("sslmode")) {
    parsed.searchParams.set("sslmode", "disable");
  }
  return parsed.toString();
}
