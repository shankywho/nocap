import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const mock = process.env.MOCK_EXTERNALS !== "false";
  return NextResponse.json({
    ok: true,
    version: "0.1.0",
    mode: mock ? "mock" : "live",
    db: process.env.DATABASE_URL ? "ok" : "memory",
    llm: mock ? "offline" : `${process.env.LLM_MODEL ?? "unknown"}@groq`,
  });
}
