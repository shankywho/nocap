import { readFile } from "node:fs/promises";

export class UsageError extends Error {}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** `--summary <file|->`; defaults to stdin when piped. */
export async function readSummary(flag: string | undefined): Promise<string> {
  let text: string;
  if (flag === undefined) {
    if (process.stdin.isTTY) {
      throw new UsageError("no summary given. Pass --summary <file>, or pipe the agent's final message: `echo \"...\" | nocap check`.");
    }
    text = await readStdin();
  } else if (flag === "-") {
    text = await readStdin();
  } else {
    try {
      text = await readFile(flag, "utf8");
    } catch {
      throw new UsageError(`cannot read summary file: ${flag}`);
    }
  }
  if (text.trim().length === 0) throw new UsageError("the summary is empty.");
  return text;
}
