/**
 * Parses a display price into a number.
 *
 * Known bug at base: a value without a decimal part keeps its thousands
 * separator, so `parsePrice("1,000")` returns 1 instead of 1000.
 */
export function parsePrice(input: string): number {
  const cleaned = input.replace(/[^\d.,]/g, "");
  const normalized = cleaned.includes(".") ? cleaned.replace(/,/g, "") : cleaned;
  return Number.parseFloat(normalized);
}