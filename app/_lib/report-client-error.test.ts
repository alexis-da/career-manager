import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_ERRORS_ENDPOINT, MAX_REPORTS_PER_PAGE, reportClientError, resetClientErrorReports } from "./report-client-error";

// The browser's reports, outside a browser: a page at /saves/x/live whose beacon is a mock.
describe("reportClientError", () => {
  const beacon = vi.fn<(url: string, body: Blob) => boolean>(() => true);

  beforeEach(() => {
    resetClientErrorReports();
    beacon.mockClear();
    vi.stubGlobal("window", { location: { pathname: "/saves/cmw4ubb6p0000usi84bksfc49/live" } });
    vi.stubGlobal("navigator", { sendBeacon: beacon });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sent = async (call: number) => JSON.parse(await (beacon.mock.calls[call][1] as Blob).text()) as Record<string, string>;

  it("sends an error's name, message and page by beacon, once", async () => {
    reportClientError("error", new TypeError("score is undefined"));
    reportClientError("error", new TypeError("score is undefined"));

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe(CLIENT_ERRORS_ENDPOINT);
    expect(await sent(0)).toEqual({ kind: "error", message: "TypeError: score is undefined", route: "/saves/cmw4ubb6p0000usi84bksfc49/live" });
  });

  it("sends a few reports a page at most, whatever comes", () => {
    for (let index = 0; index < 20; index++) {
      reportClientError("rejection", `failure ${index}`);
    }

    expect(beacon).toHaveBeenCalledTimes(MAX_REPORTS_PER_PAGE);
  });

  it("leaves out an extension's errors, a cross-origin script's and the browser's layout warning", () => {
    reportClientError("error", new Error("boom"), "chrome-extension://abcdef/content.js");
    reportClientError("error", "Script error.");
    reportClientError("error", "ResizeObserver loop completed with undelivered notifications.");
    reportClientError("rejection", undefined);

    expect(beacon).not.toHaveBeenCalled();
  });

  it("falls back on fetch when the browser refuses the beacon", () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("navigator", { sendBeacon: () => false });
    vi.stubGlobal("fetch", fetch);

    reportClientError("react", new Error("render failed"));

    expect(fetch).toHaveBeenCalledWith(CLIENT_ERRORS_ENDPOINT, expect.objectContaining({ method: "POST", keepalive: true }));
  });
});
