import { renderMarkdown } from "@nocap/core";
import { fail } from "../../../../src/server/api";
import { getStore } from "../../../../src/server/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const row = await getStore().get((await params).id);
  if (!row) return fail("NOT_FOUND", "No such receipt.");
  return new Response(renderMarkdown(row.receipt), { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
