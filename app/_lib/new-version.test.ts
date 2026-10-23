import { describe, expect, it } from "vitest";
import { isNewVersionError } from "./new-version";

describe("isNewVersionError", () => {
  it("recognises the error of a Server Action from another deployment", () => {
    const stale = new Error(
      'Failed to find Server Action "7f3a". This request might be from an older or newer deployment.\nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action',
    );

    expect(isNewVersionError(stale)).toBe(true);
  });

  it("leaves any other error to the generic message", () => {
    expect(isNewVersionError(new Error("Network request failed"))).toBe(false);
    expect(isNewVersionError("Failed to find Server Action")).toBe(false);
  });
});
