import { describe, expect, it } from "vitest";
import { parsePrice } from "../src/parser";

describe("parsePrice", () => {
  it("parses a price with a currency symbol and decimals", () => {
    expect(parsePrice("₹1,299.50")).toBeCloseTo(1299.5, 0);
  });

  it("parses a plain decimal price", () => {
    expect(parsePrice("$12.99")).toEqual(12.99);
  });

  it("parses a whole number without separators", () => {
    expect(parsePrice("250")).toEqual(250);
  });

  it("returns NaN for free text", () => {
    expect(Number.isNaN(parsePrice("free"))).toBe(true);
  });
});
