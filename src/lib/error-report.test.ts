import { describe, expect, it } from "vitest";
import { cleanErrorKind, cleanErrorMessage, ERROR_MESSAGE_MAX, ERROR_ROUTE_MAX, errorFingerprint, routeOfPath } from "./error-report";

describe("cleanErrorMessage", () => {
  it("keeps the code's words, never an address, an id, a long number or a query string", () => {
    expect(
      cleanErrorMessage(
        "TypeError: save cmw4ubb6p0000usi84bksfc49 of alexis.martin+test@example.com failed at /saves/x?token=abc123 (4815162342)",
      ),
    ).toBe("TypeError: save [id] of [email] failed at /saves/x ([n])");
    expect(cleanErrorMessage("Fixture 0d3c9a1e-2b4f-4c6d-8e9f-0a1b2c3d4e5f not found")).toBe("Fixture [id] not found");
    expect(cleanErrorMessage("hash deadbeefdeadbeefdeadbeef mismatch")).toBe("hash [id] mismatch");
  });

  it("puts a message on one line, cut to its maximum, and names an empty one", () => {
    expect(cleanErrorMessage("first line\n   second\tline")).toBe("first line second line");
    const long = cleanErrorMessage("x".repeat(1000));
    expect(long).toHaveLength(ERROR_MESSAGE_MAX);
    expect(long.endsWith("…")).toBe(true);
    expect(cleanErrorMessage("  ")).toBe("(no message)");
  });
});

describe("routeOfPath", () => {
  it("gives a page's route without its ids, numbers, query or fragment", () => {
    expect(routeOfPath("/saves/cmw4ubb6p0000usi84bksfc49/live?rejouer=1")).toBe("/saves/[id]/live");
    expect(routeOfPath("/saves/cmw4ubb6p0000usi84bksfc49/seasons/cmw4ubcey020tusi877gmg09q#card")).toBe("/saves/[id]/seasons/[id]");
    expect(routeOfPath("/fr/defi")).toBe("/fr/defi");
    expect(routeOfPath("/")).toBe("/");
    expect(routeOfPath("")).toBe("/");
    expect(routeOfPath(`/${"x".repeat(500)}`)).toHaveLength(ERROR_ROUTE_MAX);
  });
});

describe("cleanErrorKind", () => {
  it("keeps a short lower-case word", () => {
    expect(cleanErrorKind("Render")).toBe("render");
    expect(cleanErrorKind("un<handled>rejection!")).toBe("unhandledrejection");
    expect(cleanErrorKind("")).toBe("unknown");
  });
});

describe("errorFingerprint", () => {
  const error = { source: "SERVER" as const, kind: "render", route: "/saves/[id]", message: "Timeout after 5003 ms" };

  it("groups the occurrences of one error, whatever their numbers", () => {
    expect(errorFingerprint({ ...error, message: "Timeout after 5120 ms" })).toBe(errorFingerprint(error));
    expect(errorFingerprint(error)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("tells apart another source, kind, route or message", () => {
    const fingerprints = new Set([
      errorFingerprint(error),
      errorFingerprint({ ...error, source: "CLIENT" }),
      errorFingerprint({ ...error, kind: "action" }),
      errorFingerprint({ ...error, route: "/saves/[id]/live" }),
      errorFingerprint({ ...error, message: "Connection refused" }),
    ]);
    expect(fingerprints.size).toBe(5);
  });
});
