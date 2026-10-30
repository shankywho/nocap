import { fail, rateLimit } from "../../../../src/server/api";
import { getStore } from "../../../../src/server/store";
import { sse } from "../../../../src/server/run";

export const dynamic = "force-dynamic";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Replays the stored example chain (attempt 1 → repair packet → attempt 2). No keys, no execution. */
export async function POST(req: Request) {
  if (!rateLimit("demo-loop", req, 60)) return fail("RATE_LIMITED", "Too many demo runs. Try again later.");
  return sse(async (send) => {
    const store = getStore();
    const first = await store.get("ex-toothless");
    const second = await store.get("ex-loop-2");
    if (!first || !second) throw new Error("example chain missing");
    const origin = new URL(req.url).origin;
    for (const [n, row] of [[1, first], [2, second]] as const) {
      send({ event: "attempt", data: { attempt: n, id: row.id, overall: row.receipt.overall, headline: row.headline } });
      for (const c of row.receipt.claims) {
        await sleep(250);
        send({ event: "claim", data: { id: c.claim.id, quote: c.claim.quote, status: c.verdict.status } });
      }
      if (n === 1) {
        await sleep(400);
        send({ event: "repair", data: { items: first.receipt.claims.filter((c) => c.verdict.status === "contradicted").map((c) => ({ quote: c.claim.quote, repair: c.verdict.repair })) } });
      }
    }
    send({ event: "done", data: { chainId: second.receipt.chain.chainId, url: `${origin}/c/${second.receipt.chain.chainId}`, outcome: second.receipt.chain.outcome } });
  });
}
