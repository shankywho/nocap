export interface RetryOptions {
  retries: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, delayMs: number) => void;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= opts.retries) {
        throw error;
      }
      attempt += 1;
      const delayMs = 100;
      opts.onRetry?.(attempt, delayMs);
      await (opts.sleep ?? defaultSleep)(delayMs);
    }
  }
}