import { NextResponse } from "next/server";
import { fail } from "../../../../src/server/api";
import { getStore, hashToken } from "../../../../src/server/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const row = await getStore().get((await params).id);
  return row ? NextResponse.json(row.receipt) : fail("NOT_FOUND", "No such receipt.");
}

export async function DELETE(req: Request, { params }: Ctx) {
  const store = getStore();
  const id = (await params).id;
  const row = await store.get(id);
  if (!row) return fail("NOT_FOUND", "No such receipt.");
  const token = req.headers.get("x-delete-token");
  if (row.isExample || !token || hashToken(token) !== row.deleteTokenHash) {
    return fail("INVALID_INPUT", "Missing or wrong delete token.");
  }
  await store.remove(id);
  return new NextResponse(null, { status: 204 });
}
