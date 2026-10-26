import { publishReceipt } from "../io/publish.js";
import { loadReceipt } from "@nocap/core/adapters";

export async function runPublish(file: string, opts: { noHunks: boolean }, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  try {
    const receipt = await loadReceipt(file);
    const result = await publishReceipt(receipt, { apiUrl: env.NOCAP_API_URL ?? "https://nocap.vercel.app", noHunks: opts.noHunks });
    process.stdout.write(`${result.url}\n`);
    if (result.deleteToken) process.stderr.write(`delete token: ${result.deleteToken} (shown once)\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`nocap: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}
