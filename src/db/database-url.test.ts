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

  it("connects to a local URL without SSL, and to Neon's with its sslmode written as pg reads it, verify-full", () => {
    expect(pgConnection(LOCAL)).toEqual({ connectionString: LOCAL, ssl: false });
    expect(pgConnection(`${LOCAL}?sslmode=require`)).toEqual({ connectionString: `${LOCAL}?sslmode=verify-full` });
    expect(pgConnection(NEON)).toEqual({ connectionString: NEON.replace("sslmode=require", "sslmode=verify-full") });
    // Only the sslmode changes, wherever it is in the query.
    const last = "postgresql://owner:secret@ep-example-123.eu-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=prefer";
    expect(pgConnection(last).connectionString).toBe(last.replace("sslmode=prefer", "sslmode=verify-full"));
    for (const mode of ["verify-full", "disable", "no-verify"]) {
      expect(pgConnection(`${NEON}`.replace("sslmode=require", `sslmode=${mode}`)).connectionString).toContain(`sslmode=${mode}&`);
    }
    // libpq's meaning, asked for: left as it is.
    expect(pgConnection(`${NEON}&uselibpqcompat=true`).connectionString).toBe(`${NEON}&uselibpqcompat=true`);
    expect(cliDatabaseUrl(LOCAL)).toBe(`${LOCAL}?sslmode=disable`);
    expect(cliDatabaseUrl(NEON)).toBe(NEON);
  });

  it("gives pg a Neon URL it reads without its sslmode warning, where the URL as it is gets one", async () => {
    const warnings = async (connectionString: string): Promise<number> => {
      // A fresh module: pg-connection-string warns once per process.
      vi.resetModules();
      const { parse } = await import("pg-connection-string");
      const emitWarning = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
      try {
        parse(connectionString);
        return emitWarning.mock.calls.filter(([message]) => String(message).includes("sslmode")).length;
      } finally {
        emitWarning.mockRestore();
      }
    };

    expect(await warnings(NEON)).toBe(1);
    expect(await warnings(pgConnection(NEON).connectionString)).toBe(0);
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
