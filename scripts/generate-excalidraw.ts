import fs from "node:fs";
import path from "node:path";

interface ExcalidrawElement {
  id: string;
  type: "rectangle" | "text" | "arrow" | "line" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: "solid" | "hachure" | "cross-hatch";
  strokeWidth: number;
  strokeStyle: "solid" | "dashed";
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: { type: number } | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: Array<{ id: string; type: "arrow" | "text" }> | null;
  updated: number;
  link: string | null;
  locked: boolean;
  text?: string;
  fontSize?: number;
  fontFamily?: number; // 1: Virgil (hand-drawn), 2: Helvetica, 3: Cascadia (code)
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  baseline?: number;
  containerId?: string | null;
  originalText?: string;
  lineHeight?: number;
  points?: [number, number][];
  startArrowhead?: "arrow" | "bar" | "dot" | null;
  endArrowhead?: "arrow" | "bar" | "dot" | null;
}

let seedCounter = 100000;
function getSeed() {
  return seedCounter++;
}

function createRect(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  strokeColor: string,
  backgroundColor: string,
  options: Partial<ExcalidrawElement> = {}
): ExcalidrawElement {
  return {
    id,
    type: "rectangle",
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor,
    backgroundColor,
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: { type: 3 },
    seed: getSeed(),
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    ...options,
  };
}

function createText(
  id: string,
  x: number,
  y: number,
  text: string,
  strokeColor: string,
  fontSize: number = 18,
  fontFamily: number = 1,
  textAlign: "left" | "center" | "right" = "center",
  options: Partial<ExcalidrawElement> = {}
): ExcalidrawElement {
  const lines = text.split("\n");
  const height = lines.length * fontSize * 1.35;
  const maxLineLen = Math.max(...lines.map((l) => l.length));
  const width = maxLineLen * (fontSize * 0.62);

  return {
    id,
    type: "text",
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: getSeed(),
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    text,
    fontSize,
    fontFamily,
    textAlign,
    verticalAlign: "middle",
    baseline: fontSize,
    containerId: null,
    originalText: text,
    lineHeight: 1.35,
    ...options,
  };
}

function createArrow(
  id: string,
  x: number,
  y: number,
  points: [number, number][],
  strokeColor: string = "#ced4da",
  options: Partial<ExcalidrawElement> = {}
): ExcalidrawElement {
  const lastPt = points[points.length - 1] ?? [0, 0];
  const dx = lastPt[0];
  const dy = lastPt[1];
  return {
    id,
    type: "arrow",
    x,
    y,
    width: Math.abs(dx),
    height: Math.abs(dy),
    angle: 0,
    strokeColor,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: { type: 2 },
    seed: getSeed(),
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    points,
    startArrowhead: null,
    endArrowhead: "arrow",
    ...options,
  };
}

export function buildArchitectureElements(): ExcalidrawElement[] {
  const elements: ExcalidrawElement[] = [];

  // ==========================================
  // SECTION A: PRESENTATION VIEW (16:9 Canvas)
  // ==========================================
  const A_TOP = 80;

  // Header Title
  elements.push(
    createText(
      "title_a",
      80,
      A_TOP - 40,
      "VIEW A: PRESENTATION ARCHITECTURE  (Speed of Thought · 8-12s Walkthrough)",
      "#74c0fc",
      24,
      3,
      "left"
    )
  );

  // Subtitle / Mantra
  elements.push(
    createText(
      "mantra_a",
      80,
      A_TOP - 10,
      "\"The LLM extracts the claims. Pure deterministic code decides if they are true.\"",
      "#adb5bd",
      16,
      1,
      "left"
    )
  );

  // 1. INPUT: AI Coding Agent (Blue)
  const agentX = 80;
  const agentY = A_TOP + 40;
  const agentW = 240;
  const agentH = 170;
  elements.push(
    createRect("box_agent", agentX, agentY, agentW, agentH, "#339af0", "#18324a")
  );
  elements.push(
    createText(
      "text_agent_header",
      agentX + 15,
      agentY + 15,
      "1. AI CODING AGENT\nCompletion Message",
      "#74c0fc",
      18,
      3,
      "left"
    )
  );
  elements.push(
    createText(
      "text_agent_body",
      agentX + 15,
      agentY + 70,
      "\"Added 2 unit tests for\nretry backoff logic.\nAll 14 tests pass.\nDid not touch auth code.\"",
      "#d0ebff",
      14,
      3,
      "left"
    )
  );

  // Arrow Agent -> LLM Extraction
  elements.push(
    createArrow("arrow_agent_extract", agentX + agentW, agentY + 85, [[0, 0], [70, 0]], "#74c0fc")
  );

  // 2. EXTRACTION: LLM Claim Extractor (Purple)
  const extX = agentX + agentW + 70;
  const extY = agentY;
  const extW = 250;
  const extH = 170;
  elements.push(
    createRect("box_extract", extX, extY, extW, extH, "#cc5de8", "#2f1d3f")
  );
  elements.push(
    createText(
      "text_ext_header",
      extX + 15,
      extY + 15,
      "2. LLM CLAIM EXTRACTOR\nStructured Splitting",
      "#e599f7",
      18,
      3,
      "left"
    )
  );
  elements.push(
    createText(
      "text_ext_body",
      extX + 15,
      extY + 70,
      "• Claim 1: tests_added(retry)\n• Claim 2: test_count(14)\n• Claim 3: scope_untouched(auth)\n\n[Zero Truth Judgement]",
      "#f3d9fa",
      13,
      3,
      "left"
    )
  );

  // Arrow Extract -> Quote Guard
  elements.push(
    createArrow("arrow_ext_quote", extX + extW, extY + 85, [[0, 0], [70, 0]], "#e599f7")
  );

  // 3. VALIDATION: Quote Guard (Amber)
  const qgX = extX + extW + 70;
  const qgY = agentY;
  const qgW = 240;
  const qgH = 170;
  elements.push(
    createRect("box_quote_guard", qgX, qgY, qgW, qgH, "#fcc419", "#3d3013")
  );
  elements.push(
    createText(
      "text_qg_header",
      qgX + 15,
      qgY + 15,
      "3. QUOTE GUARD\nAnti-Hallucination",
      "#ffe066",
      18,
      3,
      "left"
    )
  );
  elements.push(
    createText(
      "text_qg_body",
      qgX + 15,
      qgY + 70,
      "Strict Substring Match:\nVerify claim text is a\nliteral quote of agent input.\n\n✗ Paraphrases rejected\n✓ Verifiable anchors kept",
      "#fff3bf",
      13,
      3,
      "left"
    )
  );

  // Arrow Quote Guard -> Deterministic Engine
  elements.push(
    createArrow("arrow_qg_engine", qgX + qgW, qgY + 85, [[0, 0], [70, 0]], "#ffe066")
  );

  // 4. VERIFICATION ENGINE: Deterministic Engine (Green)
  const engX = qgX + qgW + 70;
  const engY = agentY - 30;
  const engW = 440;
  const engH = 260;
  elements.push(
    createRect("box_engine", engX, engY, engW, engH, "#51cf66", "#14331d", {
      strokeWidth: 3,
    })
  );
  elements.push(
    createText(
      "text_eng_header",
      engX + 20,
      engY + 15,
      "4. DETERMINISTIC VERIFICATION ENGINE (Pure TypeScript)",
      "#8ce99a",
      18,
      3,
      "left"
    )
  );

  // Engine Submodules inside Box
  // 4a. Static checks
  elements.push(
    createRect("box_eng_static", engX + 20, engY + 50, 190, 80, "#69db7c", "#1d4426")
  );
  elements.push(
    createText(
      "text_eng_static",
      engX + 25,
      engY + 55,
      "STATIC VERIFIERS\n• Diff & ChangeSet\n• Scope / Paths Map\n• Tamper AST Rules",
      "#d3f9d8",
      12,
      3,
      "left"
    )
  );

  // 4b. Test execution
  elements.push(
    createRect("box_eng_exec", engX + 225, engY + 50, 195, 80, "#69db7c", "#1d4426")
  );
  elements.push(
    createText(
      "text_eng_exec",
      engX + 230,
      engY + 55,
      "WORKTREE EXECUTION\n• Isolated detached git\n• Safe CoW symlinks\n• Vitest / Jest / pytest",
      "#d3f9d8",
      12,
      3,
      "left"
    )
  );

  // 4c. BITECHECK (Highlight Feature)
  elements.push(
    createRect("box_eng_bitecheck", engX + 20, engY + 145, 400, 95, "#40c057", "#133a1e", {
      strokeWidth: 2,
    })
  );
  elements.push(
    createText(
      "text_bitecheck_header",
      engX + 30,
      engY + 152,
      "★ BITECHECK (Test Efficacy Engine)",
      "#b2f2bb",
      15,
      3,
      "left"
    )
  );
  elements.push(
    createText(
      "text_bitecheck_body",
      engX + 30,
      engY + 175,
      "1. Select claim-bound test hunks\n2. Revert source edit OR stub added function bodies via AST\n3. Re-run tests: If tests STILL PASS → Verdict: ✗ TOOTHLESS",
      "#ebfbee",
      12,
      3,
      "left"
    )
  );

  // Arrow Engine -> Output
  elements.push(
    createArrow("arrow_eng_out", engX + engW, engY + 115, [[0, 0], [70, 0]], "#8ce99a")
  );

  // 5. OUTPUT: Receipts & Proof Ledger (Neutral / Verdicts)
  const outX = engX + engW + 70;
  const outY = agentY - 30;
  const outW = 340;
  const outH = 260;
  elements.push(
    createRect("box_output", outX, outY, outW, outH, "#ced4da", "#212529", {
      strokeWidth: 2,
    })
  );
  elements.push(
    createText(
      "text_out_header",
      outX + 20,
      outY + 15,
      "5. EVIDENCE RECEIPT & LEDGER",
      "#f1f3f5",
      18,
      3,
      "left"
    )
  );

  // Verdict Badges inside output box
  elements.push(
    createRect("badge_ver", outX + 20, outY + 50, 90, 36, "#51cf66", "#14331d")
  );
  elements.push(
    createText("t_badge_ver", outX + 30, outY + 60, "✓ VERIFIED", "#b2f2bb", 12, 3, "left")
  );

  elements.push(
    createRect("badge_con", outX + 120, outY + 50, 115, 36, "#ff6b6b", "#441a1a")
  );
  elements.push(
    createText("t_badge_con", outX + 127, outY + 60, "✗ CONTRADICTED", "#ffc9c9", 12, 3, "left")
  );

  elements.push(
    createRect("badge_unv", outX + 245, outY + 50, 80, 36, "#fcc419", "#3d3013")
  );
  elements.push(
    createText("t_badge_unv", outX + 252, outY + 60, "! UNVERIF", "#ffe066", 12, 3, "left")
  );

  elements.push(
    createText(
      "text_out_body",
      outX + 20,
      outY + 105,
      "• Cryptographic Proof Chains (parentId)\n• Immutable Record: .nocap/ledger.jsonl\n• Markdown, JSON & Alan Plugin receipt\n• Multi-agent attribution tracking",
      "#ced4da",
      12,
      3,
      "left"
    )
  );

  elements.push(
    createRect("box_receipt_art", outX + 20, outY + 185, 300, 55, "#495057", "#1a1d20")
  );
  elements.push(
    createText(
      "text_receipt_preview",
      outX + 28,
      outY + 192,
      "RECEIPT: 1 pass · 1 fail (toothless) · 1 scope\nOVERALL: ✗ CONTRADICTED · chain: #c7f091",
      "#ff8787",
      11,
      3,
      "left"
    )
  );

  // 6. REPAIR LOOP: From Output back to AI Coding Agent (Red/Purple arrow)
  // Arrow curving back below
  elements.push(
    createArrow(
      "arrow_repair_loop",
      outX + 160,
      outY + outH,
      [
        [0, 0],
        [0, 70],
        [-(outX + 160 - (agentX + 120)), 70],
        [-(outX + 160 - (agentX + 120)), -(outY + outH - (agentY + agentH))],
      ],
      "#ff6b6b",
      {
        strokeStyle: "dashed",
        strokeWidth: 2,
      }
    )
  );
  elements.push(
    createRect("box_repair_note", engX - 40, outY + outH + 45, 360, 45, "#ff6b6b", "#3b1717")
  );
  elements.push(
    createText(
      "text_repair_note",
      engX - 25,
      outY + outH + 58,
      "REPAIR PACKET: Injects exact contradiction diff to agent",
      "#ffc9c9",
      12,
      3,
      "left"
    )
  );

  // ==========================================
  // SECTION B: ENGINEERING VIEW (Deep Dive)
  // ==========================================
  const B_TOP = 500;

  // Header Title
  elements.push(
    createText(
      "title_b",
      80,
      B_TOP - 40,
      "VIEW B: ENGINEERING ARCHITECTURE  (Ports, Invariants & Verification Subsystems)",
      "#51cf66",
      24,
      3,
      "left"
    )
  );

  // 1. Monorepo Core Boundary (Hexagonal / Ports Architecture)
  const coreX = 80;
  const coreY = B_TOP + 10;
  const coreW = 520;
  const coreH = 340;
  elements.push(
    createRect("box_b_core", coreX, coreY, coreW, coreH, "#339af0", "#0e2439", {
      strokeWidth: 2,
    })
  );
  elements.push(
    createText(
      "text_b_core_head",
      coreX + 20,
      coreY + 20,
      "ENGINE CORE: packages/core/src (Pure Invariant)",
      "#74c0fc",
      18,
      3,
      "left"
    )
  );
  elements.push(
    createText(
      "text_b_core_body",
      coreX + 20,
      coreY + 60,
      "Zero side-effects: NEVER directly accesses process.env, fs, git, or network.\nAll I/O inverted via dependency-injected ports (ports.ts).\n\n" +
        "• FsPort & GitPort (Working tree snapshot & diffs)\n" +
        "• LlmPort (OpenAI-compatible client with retry & fallback)\n" +
        "• ProcessPort (Isolated execution runner)\n" +
        "• ClockPort & IdPort (Deterministic testability)\n\n" +
        "Adapters:\n" +
        "  - local.ts: CLI, Stop hook, Stdio MCP server, Alan plugin\n" +
        "  - web.ts: Next.js web application (network-only subset)\n" +
        "  - mock.ts: 100% deterministic fixture test harness",
      "#d0ebff",
      13,
      3,
      "left"
    )
  );

  // 2. Bitecheck Deep Dive Subsystem
  const biteX = coreX + coreW + 40;
  const biteY = coreY;
  const biteW = 520;
  const biteH = 340;
  elements.push(
    createRect("box_b_bite", biteX, biteY, biteW, biteH, "#40c057", "#0f2e18", {
      strokeWidth: 2,
    })
  );
  elements.push(
    createText(
      "text_b_bite_head",
      biteX + 20,
      biteY + 20,
      "BITECHECK SUBSYSTEM (Algorithm & Modes)",
      "#8ce99a",
      18,
      3,
      "left"
    )
  );
  elements.push(
    createText(
      "text_b_bite_body",
      biteX + 20,
      biteY + 60,
      "Answers: \"Do added tests FAIL when the change is removed?\"\n\n" +
        "1. Candidate Selection: Only added/modified hunks (+3 named, +2 keyword)\n" +
        "2. Detached Worktree: git worktree add --detach <tmp>/cp-<runId>\n" +
        "   - Copy-on-write symlinked node_modules with install guards\n" +
        "3. Head Run: Baseline execution (must pass, else broken_on_head)\n" +
        "4. Mutation Strategy:\n" +
        "   - STUB MODE: If change added functions, ts-morph AST replaces\n" +
        "     function body with 'return undefined' (avoids import errors)\n" +
        "   - REVERT MODE: git checkout <baseSha> -- <source files>\n" +
        "5. Re-run: If all pass → TOOTHLESS (✗). If all fail → BITES (✓)",
      "#d3f9d8",
      13,
      3,
      "left"
    )
  );

  // 3. Verifier Matrix & Controlled Evaluation
  const evalX = biteX + biteW + 40;
  const evalY = coreY;
  const evalW = 500;
  const evalH = 340;
  elements.push(
    createRect("box_b_eval", evalX, evalY, evalW, evalH, "#fcc419", "#2e240c", {
      strokeWidth: 2,
    })
  );
  elements.push(
    createText(
      "text_b_eval_head",
      evalX + 20,
      evalY + 20,
      "CONTROLLED BENCHMARK: 5 Planted Lies",
      "#ffe066",
      18,
      3,
      "left"
    )
  );
  elements.push(
    createText(
      "text_b_eval_body",
      evalX + 20,
      evalY + 60,
      "Evaluation Suite (eval/results.md):\n" +
        "----------------------------------------------------\n" +
        "Strategy            Lies Caught   False Accusations\n" +
        "----------------------------------------------------\n" +
        "B0 Trust-Summary        0 / 5             0\n" +
        "B1 CI-Only              0 / 5             0\n" +
        "B2 nocap --no-exec      3 / 5             0\n" +
        "B3 nocap (full pipeline)5 / 5             0\n" +
        "----------------------------------------------------\n\n" +
        "5 Planted Scenarios Caught:\n" +
        "• toothless (Bitecheck revert)\n" +
        "• tampered (AST assertion deleter)\n" +
        "• scope_violation (Modified auth out of scope)\n" +
        "• denominator (Claimed 14 tests, ran 12)\n" +
        "• fake_refactor (Assertion weakened secretly)",
      "#fff3bf",
      13,
      3,
      "left"
    )
  );

  return elements;
}

const elements = buildArchitectureElements();
const excalidrawDoc = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements,
  appState: {
    theme: "dark",
    viewBackgroundColor: "#000000",
    currentItemTheme: "dark",
    gridSize: null,
  },
  files: {},
};

const outputPath = path.resolve("docs/media/nocap-architecture.excalidraw");
fs.writeFileSync(outputPath, JSON.stringify(excalidrawDoc, null, 2), "utf-8");
console.log(`Saved Excalidraw document to ${outputPath} (${elements.length} elements)`);
