import { fail, rateLimit } from "../../../src/server/api";
import { runPrStream } from "../../../src/server/run";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!rateLimit("demo", req, 60)) return fail("RATE_LIMITED", "Too many demo runs. Try again later.");
  return runPrStream(req, { prUrl: "https://github.com/demo/fixture-shop/pull/7", agent: "copilot" }, "DEMO");
}
