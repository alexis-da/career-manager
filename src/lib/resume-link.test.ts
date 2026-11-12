import { describe, expect, it } from "vitest";
import { RESUME_TOKEN_PATTERN, resumeLinkPath, resumeViewOf, type ResumeLinkState, type ResumeViewer } from "./resume-link";

const VALID: ResumeLinkState = { status: "valid", userId: "player", expiresAt: new Date("2026-11-19T10:00:00Z") };

describe("resumeViewOf", () => {
  it("offers the button to a browser without a player, or with an anonymous one without a career", () => {
    expect(resumeViewOf(VALID, null)).toBe("ready");
    expect(resumeViewOf(VALID, { id: "someone", kind: "ANONYMOUS", saves: 0 })).toBe("ready");
  });

  it("opens the careers where they already are, whatever the link's state", () => {
    const player: ResumeViewer = { id: "player", kind: "ANONYMOUS", saves: 1 };
    expect(resumeViewOf(VALID, player)).toBe("here");
    expect(resumeViewOf({ status: "used", userId: "player" }, player)).toBe("here");
    expect(resumeViewOf({ status: "expired", userId: "player" }, player)).toBe("here");
  });

  it("replaces nothing: a Google account, or another career without one", () => {
    expect(resumeViewOf(VALID, { id: "account", kind: "REGISTERED", saves: 0 })).toBe("account");
    expect(resumeViewOf(VALID, { id: "someone", kind: "ANONYMOUS", saves: 1 })).toBe("other-career");
  });

  it("says why a link no longer opens", () => {
    expect(resumeViewOf({ status: "unknown" }, null)).toBe("unknown");
    expect(resumeViewOf({ status: "used", userId: "player" }, null)).toBe("used");
    expect(resumeViewOf({ status: "expired", userId: "player" }, { id: "someone", kind: "ANONYMOUS", saves: 0 })).toBe("expired");
  });
});

describe("resume tokens", () => {
  it("are 43 characters of base64url, in a path without the origin", () => {
    const token = "a".repeat(42) + "_";
    expect(RESUME_TOKEN_PATTERN.test(token)).toBe(true);
    expect(RESUME_TOKEN_PATTERN.test(token.slice(1))).toBe(false);
    expect(RESUME_TOKEN_PATTERN.test(`${token.slice(1)}=`)).toBe(false);
    expect(resumeLinkPath(token)).toBe(`/resume?t=${token}`);
  });
});
