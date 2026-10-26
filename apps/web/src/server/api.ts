import { NextResponse } from "next/server";

export type ErrorCode =
  | "RATE_LIMITED"
  | "INVALID_INPUT"
  | "GITHUB_UNAVAILABLE"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  RATE_LIMITED: 429,
  INVALID_INPUT: 400,
  GITHUB_UNAVAILABLE: 502,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL: 500,
};

export function fail(code: ErrorCode, message: string, headers?: Record<string, string>) {
  return NextResponse.json({ error: { code, message } }, { status: STATUS[code], headers });
}

export const maxBytes = () => Number(process.env.PUBLISH_MAX_BYTES ?? 500_000);

const hits = new Map<string, { count: number; reset: number }>();
/** Fixed-window limiter keyed by route + client; in-memory (a Prisma RateLimit table backs it in live mode). */
export function rateLimit(route: string, req: Request, limit = 30): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  const key = `${route}:${ip}`;
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { count: 1, reset: now + 3_600_000 });
    return true;
  }
  h.count += 1;
  return h.count <= limit;
}
