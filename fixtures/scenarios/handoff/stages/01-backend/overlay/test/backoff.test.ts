import { describe, expect, it } from "vitest";
import { getDelay } from "../src/backoff";

describe("getDelay", () => {
  it("returns a positive delay", () => {
    expect(getDelay(1)).toBeGreaterThan(0);
  });
});
