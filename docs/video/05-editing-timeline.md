# nocap — Multitrack Editing Timeline & Post-Production Guide
**Project:** Speed of Thought 2026 Social Media Video  
**Target Specs:** 1080p (1920x1080) @ 60fps (16:9 Master) & 1080x1920 (9:16 Vertical Cut)  
**Editor Software:** DaVinci Resolve, Adobe Premiere Pro, or Final Cut Pro  

---

## 1. Track Architecture Layout

```text
[V3] TITLES / GRAPHICS : Kinetic text overlays, bounding boxes, verdict stamps, lower thirds
[V2] SCREEN / DIAGRAMS : Terminal recordings (1080p 60fps), Excalidraw camera flyover
[V1] LIVE ACTION       : A-Roll Founder talking head, B-Roll hackathon floor, macro OLED shots
------------------------------------------------------------------------------------------------
[A1] VO DIALOGUE       : Lead narration (Cleaned, compressed, de-essed, centered mono)
[A2] DIEGETIC SOUND    : Mechanical keyboard clacks, ambient room hum (panned stereo -3dB)
[A3] SOUND EFFECTS     : Sub-bass impacts, risers, latch clicks, tape stop, receipt stamp
[M1] SCORE / MUSIC     : Cinematic modular synth pulse (84 BPM, sidechained to A1 voiceover)
```

---

## 2. Second-by-Second Multitrack Breakdown (60s Master)

| Timecode | Video Layer 1 (V1) | Video Layer 2 (V2) | Video Layer 3 (V3) | Audio 1: VO (A1) | Audio 2: SFX (A3) | Audio 3: Music (M1) |
|---|---|---|---|---|---|---|
| `00:00 - 00:02.5` | Macro shot: Green CI check on laptop display | — | Subtle red vignette pulse | *"Your AI coding agent just told you..."* | Low 30Hz room tone | Silent / tension drone begins |
| `00:02.5 - 00:05.2` | Whip-pan to agent prompt | Chat bubble close-up | `CLAIM: UNVERIFIED` (Red monospace) | *"...everything is working. What if it's lying?"* | **Heavy sub-bass impact (40Hz)** on *"lying"* | Analog synth bass note drops |
| `00:05.2 - 00:09.5` | — | Split-screen: Agent summary vs git diff with empty assertion | Red bracket highlighting empty `expect(true)` | *"It said it added test coverage, fixed retry logic..."* | Mechanical keyboard typing | Rhythmic 84 BPM bass heartbeat starts |
| `00:09.5 - 00:14.0` | B-Roll: Founder looking closely at laptop | — | Lower third: `SUMMARY ≠ REPOSITORY REALITY` | *"...often means the tests never actually exercised the code."* | Muted terminal bell | Synth arp builds tension |
| `00:14.0 - 00:17.5` | — | Excalidraw Stage 1 (Blue) pan to Stage 2 (Purple) | Glowing node connectors | *"Enter nocap. We don't use AI to judge AI..."* | Digital whoosh / data sweep | Percussion enters (kick + closed hi-hat) |
| `00:17.5 - 00:20.5` | — | Excalidraw Stage 3 (Amber Quote Guard) | Badge: `[QUOTE VERIFIED: SUBSTRING]` | *"...a Quote Guard drops any hallucinations..."* | **Metallic latch sound** | Synth filters open slightly |
| `00:20.5 - 00:24.0` | — | Excalidraw Stage 4 (Green Deterministic Engine) | Glowing green node borders | *"...and deterministic code proves what really happened. Diff analysis..."* | Short digital blip per node | Full 84 BPM groove driving forward |
| `00:24.0 - 00:27.0` | — | Excalidraw Stage 4: Punch-in on ★ BITECHECK | Highlight box: `REVERT & AST STUB` | *"...and Bitecheck."* | **Accent bass hit** | Brief 0.2s musical drop-out |
| `00:27.0 - 00:32.0` | — | Real Terminal: `pnpm demo toothless` execution | Pill: `REAL FIXTURE: TOOTHLESS TEST` | *"Watch Bitecheck catch a toothless test in real time..."* | Crisp mechanical keystrokes | Driving bass pulse resumes |
| `00:32.0 - 00:36.5` | — | Terminal shows revert of `retry.ts` and test rerun | Split arrow: `14 passed on revert` | *"...reverts the agent's code, and reruns the tests. The tests still pass..."* | Server CPU fan whoosh | High-frequency synth tension |
| `00:36.5 - 00:40.0` | — | Terminal prints Receipt. Red line: `✗ toothless` | Red border around terminal | *"Verdict: Contradicted."* | **Heavy mechanical stamp + tape stop** | Music drops out completely for 0.8s |
| `00:40.0 - 00:43.0` | — | Terminal shows repair packet emitted | Cyan text: `↺ REPAIR PACKET GENERATED` | *"Then nocap automatically generates a repair packet..."* | Quick data chirps | Music kicks back in with warm pads |
| `00:43.0 - 00:47.0` | — | Benchmark Card rows 1-3 animating in | Numbers: `0/5`, `0/5`, `3/5` | *"In our controlled benchmark across five planted lies..."* | 3 discrete metallic clicks | Steady, measured rhythm |
| `00:47.0 - 00:51.0` | — | Benchmark Card row 4 slams in: `5 / 5 LIES CAUGHT` | Neon green banner: `0 FALSE ACCUSATIONS` | *"nocap caught five out of five, with zero false accusations."* | **Heavy cinematic boom** | Score reaches triumphant crescendo |
| `00:51.0 - 00:55.0` | B-Roll Hackathon floor: monitors, hackers, badges | — | Lower third: `SPEED OF THOUGHT 2026` | *"Built solo in 31 hours here at Speed of Thought."* | Ambient venue murmur | Warm acoustic undertones |
| `00:55.0 - 00:58.0` | A-Roll Founder at desk holding laptop | — | Founder lower third | *"We taught AI to write code. Now we need tools that prove it."* | Room ambience | Synth notes sustaining |
| `00:58.0 - 01:00.0` | Black screen with minimal logo & URL | — | `⚡ nocap` · `github.com/shankywho/nocap` | *"Don't trust the summary. Check the evidence."* | Clean dry cut on *"evidence"* | **Sudden cut to dead silence** |

---

## 3. Audio Engineering Master Chain (A1 Voiceover)

1. **High-Pass Filter:** 80 Hz steep cutoff (removes desk thumps, AC rumble).
2. **Parametric EQ:**
   - Wide dip at 350 Hz (-2.5 dB) to eliminate boxy room reflections.
   - Gentle boost at 3.5 kHz (+2.0 dB) for vocal clarity.
   - High-shelf at 10 kHz (+1.5 dB) for pristine presence.
3. **De-Esser:** Centered at 6.8 kHz with 4 dB threshold to tame sibilance.
4. **Compressor:** Optical-style (e.g., LA-2A emulation or standard digital compressor):
   - Ratio: 3.5:1
   - Attack: 15 ms
   - Release: 65 ms
   - Target Gain Reduction: 3 to 5 dB for smooth, consistent volume.
5. **Limiter:** True Peak Ceiling at -1.0 dBTP.

---

## 4. Visual Grade & Color Palette

- **Base Contrast:** High contrast, crushed deep blacks (`#090c10`), clean highlights.
- **Color Grading:**
  - Shadows: Pushed slightly cool / cyan (+4% teal in lift).
  - Highlights: Neutral white / warm skin tones.
  - Accent Saturation: Push greens (`#3fb950`) and reds (`#ff7b72`) by +15% so verification badges pop off the screen.
- **Grain:** 35mm fine digital grain (FilmConvert / DaVinci Resolve Film Grain plugin) at 12% opacity to give the digital terminal captures organic cinematic texture.
