import { describe, expect, it, vi } from "vitest";
import { retryStartupSqliteLock } from "./server-startup-sqlite-retry.js";

describe("retryStartupSqliteLock", () => {
  const locked = () => Object.assign(new Error("database is locked"), { errcode: 5 });
  it("retries a transient SQLite lock and returns the result", async () => {
    const run = vi.fn().mockRejectedValueOnce(locked()).mockResolvedValueOnce("ready");
    await expect(
      retryStartupSqliteLock(
        run,
        () => false,
        async () => {},
      ),
    ).resolves.toBe("ready");
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("does not suppress unrelated errors", async () => {
    const error = new Error("broken");
    const run = vi.fn().mockRejectedValue(error);
    await expect(
      retryStartupSqliteLock(
        run,
        () => false,
        async () => {},
      ),
    ).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("stops after four failures and does not retry during shutdown", async () => {
    const run = vi.fn().mockRejectedValue(locked());
    await expect(
      retryStartupSqliteLock(
        run,
        () => false,
        async () => {},
      ),
    ).rejects.toThrow("locked");
    expect(run).toHaveBeenCalledTimes(4);
    run.mockClear();
    await expect(
      retryStartupSqliteLock(
        run,
        () => true,
        async () => {},
      ),
    ).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("stops cleanly if shutdown starts during the wait", async () => {
    let closing = false;
    const run = vi.fn().mockRejectedValue(locked());
    await expect(
      retryStartupSqliteLock(
        run,
        () => closing,
        async () => {
          closing = true;
        },
      ),
    ).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
