import { describe, expect, it } from "vitest";
import { quoteGuard } from "../src/extract/quoteGuard";
import type { RawClaim } from "../src/extract/regexExtractor";

function raw(quote: string, type: RawClaim["type"] = "tests_pass"): RawClaim {
  return {
    quote,
    type,
    subject: null,
    keywords: [],
    paths: [],
    symbols: [],
    count: null,
    command: null,
  };
}

const summary = "Done. Added tests for the retry backoff.\nDidn't touch auth. All 13 tests pass.";

describe("quoteGuard", () => {
  it("keeps a verbatim quote and assigns a span", () => {
    const { claims, dropped } = quoteGuard([raw("Added tests for the retry backoff")], summary);
    expect(dropped).toBe(0);
    expect(claims).toHaveLength(1);
    const span = claims[0]?.span;
    expect(span).not.toBeNull();
    expect(summary.slice(span?.[0], span?.[1])).toBe("Added tests for the retry backoff");
  });

  it("drops a paraphrased quote", () => {
    const { claims, dropped } = quoteGuard([raw("Added unit tests for backoff")], summary);
    expect(claims).toEqual([]);
    expect(dropped).toBe(1);
  });

  it("normalises whitespace and backticks on both sides", () => {
    const { claims } = quoteGuard([raw("Added   tests for the `retry` backoff")], summary);
    expect(claims).toHaveLength(1);
    expect(claims[0]?.quote).toBe("Added   tests for the `retry` backoff");
  });

  it("assigns ids in summary order", () => {
    const { claims } = quoteGuard(
      [raw("All 13 tests pass"), raw("Didn't touch auth", "scope_none")],
      summary,
    );
    expect(claims.map((claim) => claim.id)).toEqual(["c1", "c2"]);
    expect(claims[0]?.quote).toBe("Didn't touch auth");
  });

  it("dedupes identical type and quote pairs", () => {
    const { claims } = quoteGuard([raw("All 13 tests pass"), raw("All 13 tests pass")], summary);
    expect(claims).toHaveLength(1);
  });
});
