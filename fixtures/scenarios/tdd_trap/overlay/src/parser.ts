export function parsePrice(input: string): number {
  const cleaned = input.replace(/[^\d.,]/g, "");
  return Number.parseFloat(cleaned.replace(/,/g, ""));
}
