import type { Receipt } from "../schema/receipt.js";

export function renderJson(receipt: Receipt): string {
  return JSON.stringify(receipt, null, 2);
}
