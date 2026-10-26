export function isSessionValid(expiresAt: number, now: number): boolean {
  // a small grace window keeps clock skew from logging people out
  return expiresAt + 500 > now;
}
