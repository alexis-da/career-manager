import { describe, expect, it } from "vitest";
import { signInErrorOf } from "./account";

describe("signInErrorOf", () => {
  it("tells an account our sign-in refused from any other failure", () => {
    expect(signInErrorOf("AccessDenied")).toBe("refused");
    expect(signInErrorOf("Configuration")).toBe("failed");
    expect(signInErrorOf("OAuthCallbackError")).toBe("failed");
  });

  it("says nothing without one error", () => {
    expect(signInErrorOf(undefined)).toBeNull();
    expect(signInErrorOf("")).toBeNull();
    expect(signInErrorOf(["AccessDenied", "Configuration"])).toBeNull();
  });
});
