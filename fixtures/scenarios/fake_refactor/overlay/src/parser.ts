export function parsePrice(input: string): number {
  const digits = input.replace(/[^\d.,]/g, "");
  const withoutThousands = digits.includes(".") ? digits.replace(/,/g, "") : digits;
  return Number.parseFloat(withoutThousands);
}
