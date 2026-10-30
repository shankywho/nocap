import { PublishReceipt, type Receipt } from "@nocap/core";

export interface PublishResult {
  id: string;
  url: string;
  deleteToken: string;
}

export interface PublishOptions {
  apiUrl: string;
  noHunks?: boolean;
  fetchImpl?: typeof fetch;
}

/** Strips unknown fields (and, with noHunks, the diff hunks) before upload. */
export function preparePublishBody(receipt: Receipt, noHunks: boolean): unknown {
  const wire = PublishReceipt.parse(receipt);
  if (!noHunks) return wire;
  return {
    ...wire,
    claims: wire.claims.map((c) => ({
      ...c,
      verdict: { ...c.verdict, evidence: c.verdict.evidence.filter((e) => e.kind !== "hunk") },
    })),
  };
}

export async function publishReceipt(receipt: Receipt, opts: PublishOptions): Promise<PublishResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const response = await doFetch(`${opts.apiUrl.replace(/\/$/, "")}/api/receipts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(preparePublishBody(receipt, opts.noHunks ?? false)),
  });
  if (!response.ok) {
    throw new Error(`publish failed: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
  const data = (await response.json()) as Partial<PublishResult>;
  if (!data.id || !data.url) throw new Error("publish failed: unexpected response from server");
  return { id: data.id, url: data.url, deleteToken: data.deleteToken ?? "" };
}
