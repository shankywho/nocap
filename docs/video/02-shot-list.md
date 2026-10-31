# nocap — Shot List & Camera Production Guide
**Event:** Speed of Thought 2026 Hackathon  
**Target Duration:** 60s (with 90s coverage options)  
**Production Setup:** 1 Person (Solo Builder) with iPhone / Mirrorless camera + MacBook Pro.

---

## Equipment & Camera Configuration

- **Primary Camera (A-Roll & Macro):** iPhone 15/16 Pro (ProRes Log / Cinematic Mode) OR Sony A7/FX3 (35mm f/1.8 & 50mm f/1.8).
- **Color Space:** Rec.709 Neutral / Log (high dynamic range, deep shadows, controlled highlights).
- **Framing:** 16:9 Landscape (1920x1080 @ 60fps for crisp screen tracking; 24fps for cinematic live-action).
- **Audio Gear:** Wireless lavalier microphone (DJI Mic 2 / Rode Wireless PRO) clipped inside collar, or directional shotgun mic on mini-tripod 18 inches from mouth.
- **Lighting:** Warm ambient hackathon lighting augmented by a small bi-color LED pocket light (Aputure MC / Godox M1) set to 4500K at 25% power as an edge/key light.

---

## Detailed Shot-by-Shot Matrix

| Shot # | Timecode | Shot Type | Focal Length & Framing | Movement | Subject / Action | Lighting & Environment | Audio Sync |
|---|---|---|---|---|---|---|---|
| **SH-01** | `00:00 - 00:02.5` | B-Roll Macro | 50mm Macro / 2x Telephoto, Tight CU | Slow push-in (0.5s), static hold | MacBook OLED screen: GitHub Actions PR checkmark glowing green (`All checks passed`). | Dark room, screen light reflecting subtly on keyboard aluminum. | SFX: Subtle sub-bass hum + UI chime. |
| **SH-02** | `00:02.5 - 00:05.2` | Screen Cap / B-Roll | Tight Split CU | Snap whip-cut to terminal | Chat interface of Cursor / Claude Code showing the agent completion message. | High-contrast monospace, dark theme (`#0d1117`). | VO: *"Your AI coding agent just told you everything is working. What if it's lying?"* SFX: Bass drop on *"lying"*. |
| **SH-03** | `00:05.2 - 00:09.5` | Screen Recording | 1080p 60fps Full Screen | Smooth 120% zoom punch into diff | Agent summary on left; Git diff on right exposing empty test assertion `expect(true).toBe(true)` in `retry.test.ts`. | Pristine terminal capture (IBM Plex Mono, 18pt font). | VO: *"It said it added test coverage, fixed the retry logic, and never touched authentication..."* |
| **SH-04** | `00:09.5 - 00:14.0` | A-Roll B-Roll Blend | 35mm f/1.8 Medium Close-Up | Handheld micro-drift | Developer at desk rubbing chin / temples looking at code with slight frustration, then typing `git diff`. | Hackathon venue background with blurred event badges and ambient desk glow. | VO: *"But summaries are just tokens. In production, 'all tests pass' often means the tests never actually exercised the code."* |
| **SH-05** | `00:14.0 - 00:17.5` | Motion Graphic | 1080p 60fps Graphics Canvas | Pan from left to right (X: 80 to 450) | Excalidraw Architecture (`docs/media/nocap-architecture.png`): Blue Agent input box flows into Purple LLM Extractor box. | Dark canvas (`#0b0e14`), glowing node outlines. | VO: *"Enter nocap. We don't use AI to judge AI. An LLM extracts the claims..."* SFX: Digital modular riser. |
| **SH-06** | `00:17.5 - 00:20.5` | Motion Graphic | 1080p 60fps Graphics Canvas | Snap punch-in (140% scale) on Amber box | Excalidraw Quote Guard box pulses amber with badge: `[STRICT SUBSTRING QUOTE MATCH]`. Unquoted text turns red and drops off canvas. | High-contrast amber (`#fcc419`). | VO: *"...a Quote Guard drops any hallucinations..."* SFX: Clean mechanical latch lock sound. |
| **SH-07** | `00:20.5 - 00:24.0` | Motion Graphic | 1080p 60fps Graphics Canvas | Wide smooth glide across Green Engine | Excalidraw Green Engine: Diff analysis, Scope verification, Tamper AST rules glowing green. | Forest green / emerald glow (`#3fb950`). | VO: *"...and deterministic code proves what really happened. Diff analysis, AST tamper rules..."* |
| **SH-08** | `00:24.0 - 00:27.0` | Motion Graphic | 1080p 60fps Graphics Canvas | Rapid dynamic punch on Bitecheck | Excalidraw ★ BITECHECK module expands with animated arrows showing revert & stub mode. | Bright emerald highlight (`#7ee787`). | VO: *"...and Bitecheck."* SFX: Accent sub-bass impact. |
| **SH-09** | `00:27.0 - 00:32.0` | Screen Recording | 1080p 60fps Terminal Capture | Static locked terminal, 80 columns | Terminal running `pnpm demo toothless`. Real output shows: `✓ diff ChangeSet (2 files)`, `✓ claim extraction: 3 claims`. | Monokai / Dark theme terminal, crisp monospace. | VO: *"Watch Bitecheck catch a toothless test in real time. It isolates a throwaway git worktree, runs the suite..."* SFX: Mechanical keystrokes. |
| **SH-10** | `00:32.0 - 00:36.5` | Screen Recording | 1080p 60fps Terminal Capture | Slow 110% punch-in on test runner | Bitecheck reverts `retry.ts` inside detached worktree `tmp/cp-...`. Vitest re-runs: `14 passed (0 failed)`. | Subtle red edge highlight on the terminal window. | VO: *"...reverts the agent's code, and reruns the tests. The tests still pass without the fix."* |
| **SH-11** | `00:36.5 - 00:40.0` | Screen Recording | 1080p 60fps Terminal Capture | Punch-in (130%) on Receipt line | Terminal receipt prints in spec-style. Big red contradiction line: `✗ claim 0: toothless (tests pass on revert)`. `OVERALL: ✗ CONTRADICTED`. | High-contrast red (`#ff7b72`) on deep black. | VO: *"Verdict: Contradicted."* SFX: Heavy tape-stop + sub-bass stamp sound. |
| **SH-12** | `00:40.0 - 00:43.0` | Screen Recording | 1080p 60fps Terminal Capture | Camera pans down to repair packet | Terminal displays repair packet generation: `repair packet emitted to agent (2 claims valid, 1 toothless test requiring assertions)`. | Cyan / Purple accents for repair loop. | VO: *"Then nocap automatically generates a repair packet to force the agent to fix it."* |
| **SH-13** | `00:43.0 - 00:47.0` | Motion Graphic | 1080p 60fps Card Overlay | 4-row sequential slide-in | Dark benchmark card displays rows 1, 2, and 3: Trust Summary (0/5), CI Only (0/5), nocap Static (3/5). | Dark slate card with border (`#30363d`). | VO: *"In our controlled benchmark across five planted lies: Trusting the summary caught zero. Standard CI caught zero."* SFX: Sequential muted clicks. |
| **SH-14** | `00:47.0 - 00:51.0` | Motion Graphic | 1080p 60fps Card Overlay | Glowing pulse on row 4 | Row 4 slams into place: `nocap Full: 5 / 5 LIES CAUGHT (100%) · 0 FALSE ACCUSATIONS`. | Vibrant neon green highlight (`#3fb950`). | VO: *"nocap caught five out of five, with zero false accusations."* SFX: Heavy synth chord hit. |
| **SH-15** | `00:51.0 - 00:55.0` | B-Roll Hackathon | 35mm f/1.8 Medium Shot | Slow handheld pan left | Live event b-roll at Speed of Thought: Hackathon venue, developers discussing code, laptop screens, event signage. | Warm overhead venue lights, cinematic shallow depth of field. | VO: *"Built solo in 31 hours here at Speed of Thought."* Background hackathon hum mixed low. |
| **SH-16** | `00:55.0 - 00:58.0` | A-Roll Founder | 35mm f/1.8 Close-Up | Direct eye contact, slight handheld | Founder seated at desk, holding up MacBook running nocap, confident, earnest expression. | Rim light on hair, screen glow on face. | VO: *"We taught AI to write code. Now we need tools that prove it."* |
| **SH-17** | `00:58.0 - 01:00.0` | Title Card / Logo | Graphic Still, Center | Static hold | Minimal title card: `⚡ nocap` logo, tagline `Proof over promises`, repository link `github.com/shankywho/nocap`. | Pure black (`#000000`) with crisp white typography. | VO: *"Don't trust the summary. Check the evidence."* Music cuts abruptly on *"evidence"*. |

---

## Solo-Shooter Practical Checklist (How to execute in 30 minutes at the venue)

1. **Step 1: Terminal Screen Captures (10 mins)**
   - Set Mac resolution to 1920x1080 (Scaled display mode).
   - Open Terminal or Ghostty, full screen. Font: IBM Plex Mono 18pt.
   - Run `pnpm demo toothless` and record screen with QuickTime (Cmd+Shift+5, Record Entire Screen).
   - Run `pnpm eval` to have backup footage of the benchmark running.

2. **Step 2: Architecture Motion Captures (5 mins)**
   - Open `docs/media/nocap-architecture.png` in browser at 100% scale.
   - Screen record smooth camera zooms into the 5 stages using your editing software (Final Cut / Premiere / DaVinci Resolve keyframing).

3. **Step 3: A-Roll Founder & Event B-Roll (15 mins)**
   - Set phone on a stable surface (or ask another participant to hold it at eye level for 60 seconds).
   - Record 3 takes of the founder saying lines 15, 16, and 17.
   - Walk the venue floor for 2 minutes to capture 5-second b-roll cutaways of monitors, coffee cups, whiteboards, and fellow hackers.
