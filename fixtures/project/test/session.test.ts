import { describe, expect, it } from "vitest";
import { isSessionValid } from "../src/auth/session";

describe("isSessionValid", () => {
  it("accepts a session that expires in the future", () => {
    expect(isSessionValid(2_000, 1_000)).toBe(true);
  });

  it("rejects a session that already expired", () => {
    expect(isSessionValid(1_000, 2_000)).toBe(false);
  });
});
