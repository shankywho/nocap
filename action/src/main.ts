import process from "node:process";
import { runAction } from "./run.js";

runAction(process.env, { log: (line) => process.stdout.write(`${line}\n`) })
  .then((r) => {
    process.stdout.write(`nocap: ${r.skipped ? `skipped (${r.skipped})` : `${r.overall}${r.commented ? ", commented" : ""}`}\n`);
    process.exitCode = r.exitCode;
  })
  .catch((error: unknown) => {
    process.stderr.write(`nocap: ${error instanceof Error ? error.message : "failed"}\n`);
    process.exitCode = 1;
  });
