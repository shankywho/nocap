export function isSessionValid(expiresAt: number, now: number): boolean {
  return expiresAt > now;
}
