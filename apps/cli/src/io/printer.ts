import ora, { type Ora } from "ora";
import type { NocapEvent } from "@nocap/core";

export interface Printer {
  onEvent(event: NocapEvent): void;
  stop(): void;
}

/** Spinner on a TTY; one line per step with --verbose; silent otherwise. Writes to stderr so stdout stays parseable. */
export function createPrinter(opts: { verbose: boolean; quiet: boolean }): Printer {
  const tty = process.stderr.isTTY === true && !opts.quiet;
  let spinner: Ora | null = null;
  return {
    onEvent(event) {
      if (opts.quiet) return;
      if (event.type === "step.start" && tty) {
        spinner ??= ora({ stream: process.stderr, text: event.step }).start();
        spinner.text = event.step;
      }
      if (event.type === "step.end" && opts.verbose) {
        spinner?.stop();
        process.stderr.write(`  ${event.status === "ok" ? "✓" : event.status === "skipped" ? "-" : "✗"} ${event.step} ${event.ms}ms ${event.detail}\n`);
        if (tty) spinner?.start();
      }
      if (event.type === "bitecheck" && opts.verbose) {
        spinner?.stop();
        process.stderr.write(`    bitecheck ${event.claimId} ${event.phase}: ${event.detail}\n`);
        if (tty) spinner?.start();
      }
    },
    stop() {
      spinner?.stop();
      spinner = null;
    },
  };
}
