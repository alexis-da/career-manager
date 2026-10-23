import { describe, expect, it, vi } from "vitest";
import { isWakeUpError, retryOnWakeUp, WAKE_UP_RETRY_DELAY_MS } from "./retry";

/** An error shaped as Prisma's known request errors: a name, a code, a message. */
const prismaError = (code: string) => Object.assign(new Error(`Prisma error ${code}`), { name: "PrismaClientKnownRequestError", code });

describe("retryOnWakeUp", () => {
  it.each(["P2028", "P1001", "P1017"])("tries once more after a pause when the database is waking up (%s)", async (code) => {
    const operation = vi.fn<() => Promise<string>>().mockRejectedValueOnce(prismaError(code)).mockResolvedValueOnce("created");
    const wait = vi.fn(async () => {});
    const onRetry = vi.fn();

    await expect(retryOnWakeUp(operation, { wait, onRetry })).resolves.toBe("created");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledExactlyOnceWith(WAKE_UP_RETRY_DELAY_MS);
    expect(onRetry).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code }), 1);
  });

  it("gives up after the one new try, with the last error", async () => {
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(prismaError("P2028"));
    const wait = vi.fn(async () => {});

    await expect(retryOnWakeUp(operation, { wait })).rejects.toMatchObject({ code: "P2028" });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it("does not try again on any other error", async () => {
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(prismaError("P2002"));
    const wait = vi.fn(async () => {});

    await expect(retryOnWakeUp(operation, { wait })).rejects.toMatchObject({ code: "P2002" });
    await expect(retryOnWakeUp(() => Promise.reject(new Error("bug")), { wait })).rejects.toThrow("bug");
    expect(operation).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("returns at once when the first try succeeds", async () => {
    const wait = vi.fn(async () => {});

    await expect(retryOnWakeUp(async () => 42, { wait })).resolves.toBe(42);
    expect(wait).not.toHaveBeenCalled();
  });
});

describe("isWakeUpError", () => {
  it("knows the codes of a database waking up, and nothing else", () => {
    expect(isWakeUpError(prismaError("P1001"))).toBe(true);
    expect(isWakeUpError(prismaError("P2025"))).toBe(false);
    expect(isWakeUpError(new Error("no code"))).toBe(false);
    expect(isWakeUpError("P2028")).toBe(false);
  });
});
