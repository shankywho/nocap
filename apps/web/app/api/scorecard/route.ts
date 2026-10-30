import { NextResponse } from "next/server";
import { aggregate, SCORECARD_CAPTION } from "@nocap/core";
import { getStore } from "../../../src/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await getStore().published();
  return NextResponse.json({ caption: SCORECARD_CAPTION, rows: aggregate(rows.map((r) => r.receipt)) });
}
