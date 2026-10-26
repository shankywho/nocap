import { createHash } from "node:crypto";
import type { FsPort } from "../ports.js";
import { Receipt } from "../schema/receipt.js";

export interface ChainStore {
  latest(chainId: string): Promise<Receipt | null>;
  save(chainId: string, receipt: Receipt): Promise<void>;
}

/** chainId = sha1(repoRoot + baseSha + agent + (taskId ?? sessionId ?? branch)).slice(0, 10) */
export function computeChainId(parts: {
  repoRoot: string;
  baseSha: string;
  agent: string;
  taskId: string | null;
  sessionId: string | null;
  branch: string;
}): string {
  const scope = parts.taskId ?? parts.sessionId ?? parts.branch;
  return createHash("sha1").update(parts.repoRoot + parts.baseSha + parts.agent + scope).digest("hex").slice(0, 10);
}

/** Latest receipt of each chain, as `<dir>/<chainId>.json` (local: `.nocap/chains`). */
export class FsChainStore implements ChainStore {
  constructor(
    private readonly fs: FsPort,
    private readonly dir: string,
  ) {}

  async latest(chainId: string): Promise<Receipt | null> {
    const file = `${this.dir}/${chainId}.json`;
    if (!(await this.fs.exists(file))) return null;
    try {
      return Receipt.parse(JSON.parse(await this.fs.readFile(file)));
    } catch {
      return null;
    }
  }

  async save(chainId: string, receipt: Receipt): Promise<void> {
    await this.fs.mkdir(this.dir);
    await this.fs.writeFile(`${this.dir}/${chainId}.json`, `${JSON.stringify(receipt, null, 2)}\n`);
  }
}

export class MemoryChainStore implements ChainStore {
  readonly map = new Map<string, Receipt>();
  async latest(chainId: string): Promise<Receipt | null> {
    return this.map.get(chainId) ?? null;
  }
  async save(chainId: string, receipt: Receipt): Promise<void> {
    this.map.set(chainId, receipt);
  }
}
