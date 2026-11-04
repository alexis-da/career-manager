import { describe, expect, it } from "vitest";
import type { LivePause } from "@/src/engine/live";
import { coachingTarget, endMinute, goesToExtraTime, isMatchBreak, pauseKey, skipTarget, startMinute, stepUntil } from "./live-pause";

const inPlay = (minute: number): LivePause => ({ phase: "IN_PLAY", minute });
const HALF_TIME: LivePause = { phase: "HALF_TIME", minute: 45 };
const REGULATION_END: LivePause = { phase: "REGULATION_END", minute: 90 };
const EXTRA_TIME_BREAK: LivePause = { phase: "EXTRA_TIME_BREAK", minute: 105 };

describe("the pauses of a match played live", () => {
  it("has the Coaching panel at half-time and at the end of regulation time only", () => {
    expect(isMatchBreak("HALF_TIME")).toBe(true);
    expect(isMatchBreak("REGULATION_END")).toBe(true);
    expect(isMatchBreak("IN_PLAY")).toBe(false);
    expect(isMatchBreak("EXTRA_TIME_BREAK")).toBe(false);
  });

  it("tells two pauses apart by their phase and minute", () => {
    expect(pauseKey(inPlay(15))).toBe("IN_PLAY:15");
    expect(pauseKey(inPlay(15))).not.toBe(pauseKey(inPlay(30)));
    expect(pauseKey(HALF_TIME)).toBe("HALF_TIME:45");
  });
});

describe("startMinute", () => {
  it("starts from kick-off with ?rejouer=1, wherever the match waits", () => {
    expect(startMinute(inPlay(15), true)).toBe(0);
    expect(startMinute(HALF_TIME, true)).toBe(0);
    expect(startMinute(null, true)).toBe(0);
  });

  it("starts where the match waits without it, and from kick-off for a match over", () => {
    expect(startMinute(inPlay(30), false)).toBe(30);
    expect(startMinute(HALF_TIME, false)).toBe(45);
    expect(startMinute(REGULATION_END, false)).toBe(90);
    expect(startMinute(EXTRA_TIME_BREAK, false)).toBe(105);
    expect(startMinute(null, false)).toBe(0);
  });
});

describe("endMinute", () => {
  it("runs the clock up to the pause the match waits at, never further", () => {
    expect([inPlay(15), inPlay(30), HALF_TIME, inPlay(60), inPlay(75), REGULATION_END, EXTRA_TIME_BREAK].map((pause) => endMinute(pause, null))).toEqual([
      15, 30, 45, 60, 75, 90, 105,
    ]);
  });

  it("runs it to the 90th once over, to the 120th after extra time, shoot-out or not", () => {
    expect(endMinute(null, null)).toBe(90);
    expect(endMinute(null, "REGULATION")).toBe(90);
    expect(endMinute(null, "EXTRA_TIME")).toBe(120);
    expect(endMinute(null, "PENALTIES")).toBe(120);
  });
});

describe("goesToExtraTime", () => {
  it("knows of extra time from the end of regulation time of a level cup tie", () => {
    expect(goesToExtraTime(REGULATION_END, null)).toBe(true);
    expect(goesToExtraTime(EXTRA_TIME_BREAK, null)).toBe(true);
    expect(goesToExtraTime(null, "EXTRA_TIME")).toBe(true);
    expect(goesToExtraTime(null, "PENALTIES")).toBe(true);
  });

  it("never before: a match waiting in the second half may still end in 90 minutes", () => {
    expect(goesToExtraTime(inPlay(75), null)).toBe(false);
    expect(goesToExtraTime(HALF_TIME, null)).toBe(false);
    expect(goesToExtraTime(null, "REGULATION")).toBe(false);
    expect(goesToExtraTime(null, null)).toBe(false);
  });
});

describe("skipTarget", () => {
  it("leads to half-time until the match has reached it", () => {
    expect(skipTarget(inPlay(15))).toBe("halfTime");
    expect(skipTarget(inPlay(30))).toBe("halfTime");
    expect(skipTarget(HALF_TIME)).toBe("halfTime");
  });

  it("leads to the result after it, even to a level cup tie waiting at the 90th: that break is never announced", () => {
    expect(skipTarget(inPlay(60))).toBe("result");
    expect(skipTarget(inPlay(75))).toBe("result");
    expect(skipTarget(REGULATION_END)).toBe("result");
    expect(skipTarget(EXTRA_TIME_BREAK)).toBe("result");
  });

  it("leads to the result of a match over, replayed", () => {
    expect(skipTarget(null)).toBe("result");
  });
});

describe("stepUntil", () => {
  it("plays one segment while the player watches the clock run", () => {
    expect(stepUntil(false, false)).toBe("segment");
  });

  it("plays on to the next pause the player acts at without motion: his choice events are his", () => {
    expect(stepUntil(false, true)).toBe("pause");
  });

  it("plays on to the next break once skipped, his assistant deciding on the way", () => {
    expect(stepUntil(true, false)).toBe("break");
    expect(stepUntil(true, true)).toBe("break");
  });
});

describe("coachingTarget", () => {
  it("stops at the next boundary between two segments, of regular time or of extra time", () => {
    expect([inPlay(15), inPlay(30), inPlay(60), inPlay(75), EXTRA_TIME_BREAK].map(coachingTarget)).toEqual([
      { minute: 15 },
      { minute: 30 },
      { minute: 60 },
      { minute: 75 },
      { minute: 105 },
    ]);
  });

  it("leaves half-time to its own panel, and asks for nothing in the last segment, whatever follows it", () => {
    expect(coachingTarget(HALF_TIME)).toBe("halfTime");
    expect(coachingTarget(REGULATION_END)).toBeNull();
    expect(coachingTarget(null)).toBeNull();
  });
});
