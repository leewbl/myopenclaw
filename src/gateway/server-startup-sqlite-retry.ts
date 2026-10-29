import { isSqliteLockError } from "../infra/sqlite-error-diagnostics.js";

/** Retry only transient lock failures while the startup reconciliation still owns its resources. */
export async function retryStartupSqliteLock<T>(
  run: () => Promise<T>,
  isClosing: () => boolean,
  wait: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 250)),
): Promise<T | undefined> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!isSqliteLockError(error)) {
        throw error;
      }
      if (isClosing()) {
        return undefined;
      }
      if (attempt >= 4) {
        throw error;
      }
      await wait();
      if (isClosing()) {
        return undefined;
      }
    }
  }
}
