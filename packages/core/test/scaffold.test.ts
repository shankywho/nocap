import { describe, expect, it } from "vitest";
import { NOCAP_NAME, NOCAP_VERSION, NocapEvents, type NocapEvent } from "@nocap/core";

describe("core scaffold", () => {
  it("exposes the product identity", () => {
    expect(NOCAP_NAME).toBe("nocap");
    expect(NOCAP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("emits typed events to every listener and unsubscribes", () => {
    const events = new NocapEvents();
    const seen: NocapEvent[] = [];
    const off = events.on((event) => seen.push(event));
    events.emit({ type: "step.start", runId: "r1", step: "resolve", at: 1 });
    off();
    events.emit({ type: "step.start", runId: "r1", step: "diff", at: 2 });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.type).toBe("step.start");
  });
});
