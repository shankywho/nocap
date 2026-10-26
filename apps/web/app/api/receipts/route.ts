import { NextResponse } from "next/server";
import { PublishReceipt } from "@nocap/core";
import { fail, maxBytes, rateLimit } from "../../../src/server/api";
import { getStore, hashToken, headlineOf, newId } from "../../../src/server/store";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!rateLimit("publish", req)) return fail("RATE_LIMITED", "Too many publishes. Try again later.");
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes()) return fail("PAYLOAD_TOO_LARGE", "Receipt is too large.");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("INVALID_INPUT", "Body is not valid JSON.");
  }
  const parsed = PublishReceipt.safeParse(json);
  if (!parsed.success) return fail("INVALID_INPUT", "Not a valid nocap receipt (schemaVersion 1).");
  const receipt = parsed.data;
  const id = newId();
  const deleteToken = randomBytes(16).toString("hex");
  await getStore().put({
    id,
    createdAt: new Date().toISOString(),
    source: receipt.input.mode === "pr" ? "PR" : "CLI",
    isExample: false,
    headline: headlineOf(receipt),
    deleteTokenHash: hashToken(deleteToken),
    receipt: { ...receipt, id },
  });
  const origin = new URL(req.url).origin;
  return NextResponse.json({ id, url: `${origin}/r/${id}`, deleteToken }, { status: 201 });
}
