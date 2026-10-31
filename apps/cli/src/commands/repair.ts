import { buildRepairPacket, repairMarkdown } from "@nocap/core";
import { latestRepairReceiptFile, loadReceipt } from "@nocap/core/adapters";

export async function runRepair(file: string | undefined, json: boolean, cwd = process.cwd()): Promise<number> {
  try {
    const path = file ?? (await latestRepairReceiptFile(cwd));
    if (!path) {
      process.stderr.write("nocap: no receipt found. Run `nocap check` first.\n");
      return 2;
    }
    const receipt = await loadReceipt(path);
    const packet = buildRepairPacket(receipt.chain.chainId, receipt.chain.attempt, receipt.overall, receipt.claims, receipt.chain.items);
    if (packet.items.length === 0) {
      process.stdout.write("Nothing to repair: no contradicted claims in this receipt.\n");
      return 0;
    }
    process.stdout.write(json ? `${JSON.stringify(packet, null, 2)}\n` : `${repairMarkdown(packet)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`nocap: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}
