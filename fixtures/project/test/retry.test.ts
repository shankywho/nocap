import { describe, expect, it } from "vitest";
import { withRetry } from "../src/retry";

describe("withRetry", () => {
  it("returns the value when the first attempt succeeds", async () => {
    const result = await withRetry(async () => "ok", { retries: 3 });
    expect(result).toBe("ok");
  });

  it("waits a constant 100ms between attempts", async () => {
    const delays: number[] = [];
    await withRetry(
      async () => {
        throw new Error("boom");
      },
      {
        retries: 2,
        sleep: async () => {},
        onRetry: (_attempt, delayMs) => delays.push(delayMs),
      },
    ).catch(() => undefined);

    expect(delays).toEqual([100, 100]);
  });

  it("throws after the retries are exhausted", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error("still failing");
        },
        { retries: 2, sleep: async () => {} },
      ),
    ).rejects.toThrow("still failing");
    expect(calls).toBe(3);
  });
});
