import { NextResponse } from "next/server";
import { dbStatus, getStore } from "../../../src/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  await getStore().examples(); // initialises the store so db status is accurate
  const mock = process.env.MOCK_EXTERNALS !== "false";
  return NextResponse.json({
    ok: true,
    version: "0.1.0",
    mode: mock ? "mock" : "live",
    db: dbStatus(),
    llm: mock ? "offline" : `${process.env.LLM_MODEL ?? "unknown"}@groq`,
  });
}
