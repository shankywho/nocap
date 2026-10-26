import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { NocapEvents, parsePrUrl, prVerify, PrUrlError, type GithubPort, type LlmPort, type Receipt } from "@nocap/core";
import { FetchGithub, GithubUnavailable, MockGithub, MockLlm, OpenAiCompatLlm, SystemClock } from "@nocap/core/adapters/web";
import { hashToken, getStore, headlineOf, newId } from "./store";
import { randomBytes } from "node:crypto";

export const isMock = () => process.env.MOCK_EXTERNALS !== "false";

export function repoDir(sub: string): string {
  for (const base of [process.cwd(), resolve(process.cwd(), "../..")]) if (existsSync(resolve(base, sub))) return resolve(base, sub);
  throw new Error(`cannot find ${sub}`);
}

export function makeLlm(): LlmPort {
  const key = process.env.LLM_API_KEY ?? "";
  if (isMock() || !key) return new MockLlm();
  return new OpenAiCompatLlm({
    primary: { baseUrl: process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1", apiKey: key, model: process.env.LLM_MODEL ?? "openai/gpt-oss-120b" },
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 20_000),
    reasoningEffort: process.env.LLM_REASONING_EFFORT ?? "low",
  });
}

export function makeGithub(owner: string, repo: string): GithubPort {
  if (owner === "demo" && repo === "fixture-shop") return new MockGithub(repoDir("fixtures/github"));
  if (isMock()) throw new GithubUnavailable("Mock mode only serves the demo PR (demo/fixture-shop#7).");
  return new FetchGithub(process.env.GITHUB_TOKEN || null);
}

export type SseEvent = { event: string; data: unknown };

/** Wraps an async producer as an SSE response. Producer errors become an `error` event, never a 500. */
export function sse(produce: (send: (e: SseEvent) => void) => Promise<void>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: SseEvent) => controller.enqueue(enc.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`));
      try {
        await produce(send);
      } catch (error) {
        const code = error instanceof PrUrlError ? "INVALID_INPUT" : error instanceof GithubUnavailable ? "GITHUB_UNAVAILABLE" : "INTERNAL";
        send({ event: "error", data: { code, message: code === "INTERNAL" ? "Something went wrong." : (error as Error).message } });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
}

export async function storeReceipt(receipt: Receipt, origin: string, source: "PR" | "DEMO") {
  const id = newId();
  const deleteToken = randomBytes(16).toString("hex");
  await getStore().put({ id, createdAt: new Date().toISOString(), source, isExample: false, headline: headlineOf(receipt), deleteTokenHash: hashToken(deleteToken), receipt: { ...receipt, id } });
  return { id, url: `${origin}/r/${id}`, deleteToken };
}

export function runPrStream(req: Request, args: { prUrl: string; summary?: string; agent?: string }, source: "PR" | "DEMO") {
  return sse(async (send) => {
    const { owner, repo } = parsePrUrl(args.prUrl);
    const github = makeGithub(owner, repo);
    const events = new NocapEvents();
    events.on((e) => {
      if (e.type === "step.end") send({ event: "step", data: { step: e.step, status: e.status, ms: e.ms, detail: e.detail } });
      if (e.type === "claim.verdict") send({ event: "claim", data: { id: e.claimId, status: e.status, reason: e.reason } });
    });
    const receipt = await prVerify({ ...args, runId: newId(), github, llm: makeLlm(), clock: new SystemClock(), events });
    send({ event: "done", data: await storeReceipt(receipt, new URL(req.url).origin, source) });
  });
}
