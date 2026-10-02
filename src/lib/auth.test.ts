import { describe, expect, it } from "vitest";
import {
  createSessionValue,
  isValidSession,
  passwordMatches,
  safeNextPath,
  SESSION_MAX_AGE_SECONDS,
} from "./auth";

const NOW = 1_800_000_000_000;

describe("session cookie", () => {
  it("accepts a session signed with the password until it expires", () => {
    const value = createSessionValue("secret", NOW);

    expect(isValidSession(value, "secret", NOW)).toBe(true);
    expect(isValidSession(value, "secret", NOW + SESSION_MAX_AGE_SECONDS * 1000 - 1)).toBe(true);
    expect(isValidSession(value, "secret", NOW + SESSION_MAX_AGE_SECONDS * 1000)).toBe(false);
  });

  it("refuses a session of another password, a forged expiry or garbage", () => {
    const value = createSessionValue("secret", NOW);
    const [, signature] = value.split(".");

    expect(isValidSession(value, "other", NOW)).toBe(false);
    expect(isValidSession(`9999999999999.${signature}`, "secret", NOW)).toBe(false);
    expect(isValidSession(undefined, "secret", NOW)).toBe(false);
    expect(isValidSession("", "secret", NOW)).toBe(false);
    expect(isValidSession(`${value}.extra`, "secret", NOW)).toBe(false);
  });
});

describe("passwordMatches", () => {
  it("matches the exact password only", () => {
    expect(passwordMatches("secret", "secret")).toBe(true);
    expect(passwordMatches("Secret", "secret")).toBe(false);
    expect(passwordMatches("", "secret")).toBe(false);
    expect(passwordMatches("a much longer attempt", "secret")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps a path of the app and refuses anything else", () => {
    expect(safeNextPath("/saves/abc/lineup?x=1")).toBe("/saves/abc/lineup?x=1");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("/login")).toBe("/");
  });
});
