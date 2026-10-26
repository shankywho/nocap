import { fail, rateLimit } from "../../../src/server/api";
import { runPrStream } from "../../../src/server/run";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!rateLimit("verify-pr", req, Number(process.env.RATE_LIMIT_VERIFY_PER_HOUR ?? 20))) return fail("RATE_LIMITED", "Too many verifications. Try again later.");
  const body = (await req.json().catch(() => null)) as { prUrl?: unknown; summary?: unknown; agent?: unknown } | null;
  if (!body || typeof body.prUrl !== "string") return fail("INVALID_INPUT", "Body must include prUrl.");
  return runPrStream(
    req,
    { prUrl: body.prUrl, ...(typeof body.summary === "string" ? { summary: body.summary } : {}), ...(typeof body.agent === "string" ? { agent: body.agent } : {}) },
    "PR",
  );
}
