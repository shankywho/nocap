import { describe, expect, it } from "vitest";
import { computeDelay } from "../src/backoff";

describe("computeDelay", () => {
  it("doubles the delay on every attempt", () => {
    expect([1, 2, 3].map((attempt) => computeDelay(attempt))).toEqual([100, 200, 400]);
  });
});
