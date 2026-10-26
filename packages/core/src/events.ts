export type NocapEvent =
  | { type: "step.start"; runId: string; step: string; at: number }
  | {
      type: "step.end";
      runId: string;
      step: string;
      ms: number;
      status: "ok" | "skipped" | "error";
      detail: string;
    }
  | {
      type: "claim.verdict";
      runId: string;
      claimId: string;
      status: "verified" | "contradicted" | "unverifiable";
      reason: string;
    }
  | {
      type: "bitecheck";
      runId: string;
      claimId: string;
      phase: "head" | "revert" | "rerun";
      detail: string;
    }
  | {
      type: "receipt.done";
      runId: string;
      id: string;
      overall: "PASS" | "FAIL" | "MIXED";
      totals: { verified: number; contradicted: number; unverifiable: number; flags: number };
      durationMs: number;
    };

export type NocapEventListener = (event: NocapEvent) => void;

/** Small synchronous emitter so core stays free of Node's EventEmitter. */
export class NocapEvents {
  private readonly listeners = new Set<NocapEventListener>();

  on(listener: NocapEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: NocapEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
