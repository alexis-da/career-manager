import { describe, expect, it } from "vitest";
import { canCreateSave, MAX_SAVES_ANONYMOUS, MAX_SAVES_REGISTERED, maxSavesFor, SaveLimitError } from "./limits";

describe("save limits", () => {
  it("allows one save to an anonymous player and three to a Google account", () => {
    expect([MAX_SAVES_ANONYMOUS, MAX_SAVES_REGISTERED]).toEqual([1, 3]);
    expect(maxSavesFor("ANONYMOUS")).toBe(1);
    expect(maxSavesFor("REGISTERED")).toBe(3);
  });

  it("lets a player create a save below their limit only", () => {
    expect(canCreateSave("ANONYMOUS", 0)).toBe(true);
    expect(canCreateSave("ANONYMOUS", 1)).toBe(false);
    expect(canCreateSave("REGISTERED", 2)).toBe(true);
    expect(canCreateSave("REGISTERED", 3)).toBe(false);
  });

  it("refuses beyond the limit too: an account may hold more saves after a sign-in merged an anonymous one's", () => {
    expect(canCreateSave("REGISTERED", 4)).toBe(false);
  });

  it("tells the kind of user and their count in its error", () => {
    const error = new SaveLimitError("REGISTERED", 3);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: "SaveLimitError", kind: "REGISTERED", saveCount: 3 });
  });
});
