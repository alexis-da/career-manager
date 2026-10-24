import { afterEach, describe, expect, it, vi } from "vitest";
import { assertLocalDatabase, cliDatabaseUrl, isLocalDatabase, pgConnection } from "./database-url";

const LOCAL = "postgresql://postgres:secret@localhost:5432/latewinner_dev";
const NEON = "postgresql://owner:secret@ep-example-123.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("database URLs", () => {
  it("tells the local server from any other", () => {
    expect(isLocalDatabase(LOCAL)).toBe(true);
    expect(isLocalDatabase("postgresql://postgres@127.0.0.1:5432/latewinner_test")).toBe(true);
    expect(isLocalDatabase(NEON)).toBe(false);
  });

  it("connects to a local URL without SSL, and leaves Neon's as it is", () => {
    expect(pgConnection(LOCAL)).toEqual({ connectionString: LOCAL, ssl: false });
    expect(pgConnection(`${LOCAL}?sslmode=require`)).toEqual({ connectionString: `${LOCAL}?sslmode=require` });
    expect(pgConnection(NEON)).toEqual({ connectionString: NEON });
    expect(cliDatabaseUrl(LOCAL)).toBe(`${LOCAL}?sslmode=disable`);
    expect(cliDatabaseUrl(NEON)).toBe(NEON);
  });

  it("refuses a remote database, unless on Vercel or with ALLOW_REMOTE_DB=1", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("ALLOW_REMOTE_DB", "");
    expect(() => assertLocalDatabase(LOCAL, "DATABASE_URL")).not.toThrow();
    expect(() => assertLocalDatabase(undefined, "DATABASE_URL")).not.toThrow();
    expect(() => assertLocalDatabase(NEON, "DIRECT_URL")).toThrow(/DIRECT_URL points to ep-example-123\..*not to localhost/);
    // The message never shows the URL's credentials.
    expect(() => assertLocalDatabase(NEON, "DIRECT_URL")).not.toThrow(/secret/);

    vi.stubEnv("ALLOW_REMOTE_DB", "1");
    expect(() => assertLocalDatabase(NEON, "DIRECT_URL")).not.toThrow();
    vi.stubEnv("ALLOW_REMOTE_DB", "");
    vi.stubEnv("VERCEL", "1");
    expect(() => assertLocalDatabase(NEON, "DATABASE_URL")).not.toThrow();
  });
});
