"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Line = { kind: "step" | "claim" | "info"; text: string; tone?: string };
type State = { phase: "idle" | "running" | "done" | "error"; lines: Line[]; url?: string; message?: string };
const TONE: Record<string, string> = { verified: "text-verified", contradicted: "text-contradicted", unverifiable: "text-unverifiable" };
const GLYPH: Record<string, string> = { verified: "✓", contradicted: "✗", unverifiable: "!" };

/** Reads an SSE response from a POST endpoint and narrates it. Handles loading, error and rate-limit states. */
export function StreamRun({ endpoint, body, autostart = false, label = "Run" }: { endpoint: string; body?: unknown; autostart?: boolean; label?: string }) {
  const [s, setS] = useState<State>({ phase: "idle", lines: [] });
  const started = useRef(false);

  const run = useCallback(async () => {
    setS({ phase: "running", lines: [] });
    const push = (line: Line) => setS((p) => ({ ...p, lines: [...p.lines, line] }));
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : null });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setS((p) => ({ ...p, phase: "error", message: j?.error?.message ?? `Request failed (${res.status}).` }));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() ?? "";
        for (const b of blocks) {
          const [e, d] = b.split("\n");
          if (!e || !d) continue;
          const event = e.slice(7);
          const data = JSON.parse(d.slice(6)) as Record<string, string>;
          if (event === "step") push({ kind: "step", text: `${data.status === "ok" ? "✓" : "-"} ${data.step}  ${data.detail ?? ""}` });
          else if (event === "claim") push({ kind: "claim", text: `${GLYPH[data.status as string]} ${(data.status as string).toUpperCase()}  ${data.quote ?? data.reason}`, tone: TONE[data.status as string] ?? "" });
          else if (event === "attempt") push({ kind: "info", text: `ATTEMPT ${data.attempt}: ${data.overall}` });
          else if (event === "repair") push({ kind: "info", text: "repair packet sent to the agent" });
          else if (event === "done") setS((p) => ({ ...p, phase: "done", url: data.url as string }));
          else if (event === "error") setS((p) => ({ ...p, phase: "error", message: data.message as string }));
        }
      }
    } catch {
      setS((p) => ({ ...p, phase: "error", message: "Network error. Check your connection and try again." }));
    }
  }, [endpoint, body]);

  useEffect(() => {
    if (autostart && !started.current) {
      started.current = true;
      void run();
    }
  }, [autostart, run]);

  return (
    <div className="space-y-3">
      {s.phase !== "running" && (
        <button onClick={() => void run()} className="rounded-md bg-accent px-4 py-2 font-mono text-sm font-semibold text-black">
          {s.phase === "idle" ? label : "Run again"}
        </button>
      )}
      <div aria-live="polite" className="min-h-24 space-y-1 rounded-lg bg-surface p-4 font-mono text-sm ring-1 ring-hairline">
        {s.phase === "idle" && <p className="text-muted">Nothing running yet.</p>}
        {s.phase === "running" && s.lines.length === 0 && <p className="text-muted">Starting…</p>}
        {s.lines.map((l, i) => (
          <p key={i} className={l.tone ?? (l.kind === "step" ? "text-muted" : "")}>{l.text}</p>
        ))}
        {s.phase === "error" && <p className="text-contradicted">✗ {s.message}</p>}
        {s.phase === "done" && s.url && <p><a className="text-accent underline" href={s.url}>open the receipt →</a></p>}
      </div>
    </div>
  );
}
