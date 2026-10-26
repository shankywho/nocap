import { describe, expect, it } from "vitest";
import { withRetry } from "../src/retry";

describe("withRetry", () => {
  it("returns the value when the first attempt succeeds", async () => {
    const result = await withRetry(async () => "ok", { retries: 3 });
    expect(result).toBe("ok");
  });

  it("eventually succeeds after two failures", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) {
          throw new Error("flaky");
        }
        return "ok";
      },
      { retries: 3, sleep: async () => {} },
    );
    expect(result).toBe("ok");
  });

  it("retries only the configured number of times", async () => {
    let calls = 0;
    await withRetry(
      async () => {
        calls += 1;
        throw new Error("boom");
      },
      { retries: 1, sleep: async () => {} },
    ).catch(() => undefined);

    expect(calls).toBe(2);
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
