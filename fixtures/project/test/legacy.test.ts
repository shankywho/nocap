import { describe, expect, it } from "vitest";
import { config } from "../src/config";

describe("legacy config", () => {
  it("defaults maxRetries to three", () => {
    expect(config.maxRetries).toBe(3);
  });

  it("keeps a stable object shape", () => {
    expect(Object.keys(config).sort()).toEqual(["featureFlag", "maxRetries"]);
  });

  it("starts with the feature flag off", () => {
    expect(config.featureFlag).toBe(false);
  });
});
