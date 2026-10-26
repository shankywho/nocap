export function computeDelay(attempt: number, baseMs = 100): number {
  return baseMs * 2 ** (attempt - 1);
}
