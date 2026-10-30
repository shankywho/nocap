import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const css = read("app/globals.css");

function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!m) throw new Error(`token --${name} not found in globals.css`);
  return (m[1] as string).toLowerCase();
}

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe("study theme tokens match the spec", () => {
  it("has the sampled palette", () => {
    expect({ wall: token("wall"), desk: token("desk"), document: token("document"), text: token("text"), muted: token("muted"), ink: token("ink"), inkMuted: token("ink-muted"), lamp: token("lamp"), brass: token("brass"), verified: token("verified"), contradicted: token("contradicted"), unverifiable: token("unverifiable") }).toEqual({
      wall: "#1a110b", desk: "#24170f", document: "#f1e6d0", text: "#f1e6d0", muted: "#b9a588", ink: "#1a110b", inkMuted: "#5c4a36", lamp: "#d8a45f", brass: "#a76d38", verified: "#2f5a3a", contradicted: "#8e2a1e", unverifiable: "#7a5600",
    });
  });
});

describe("WCAG contrast of every text pair the page uses is at least 4.5:1", () => {
  const pairs: [string, string, string][] = [
    ["text", "wall", "body text on the wall"],
    ["text", "desk", "body text on the desk"],
    ["muted", "wall", "secondary text on the wall"],
    ["muted", "desk", "secondary text on the desk"],
    ["lamp", "wall", "links, numbers and labels on the wall"],
    ["lamp", "desk", "links, numbers and labels on the desk"],
    ["ink", "lamp", "primary button text"],
    ["ink", "document", "text on documents"],
    ["ink-muted", "document", "secondary text on documents"],
    ["verified", "document", "✓ verified on a document"],
    ["contradicted", "document", "✗ contradicted on a document"],
    ["unverifiable", "document", "! unverifiable on a document"],
  ];
  for (const [fg, bg, what] of pairs) {
    it(`${what} (${fg} on ${bg})`, () => {
      const ratio = contrast(token(fg), token(bg));
      expect(ratio, `${fg} ${token(fg)} on ${bg} ${token(bg)} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("hanging numerals (lamp at 70% opacity on the wall) keep 3:1, the large-text minimum", () => {
    const mix = (fg: string, bg: string, a: number) => `#${[1, 3, 5].map((i) => Math.round(Number.parseInt(fg.slice(i, i + 2), 16) * a + Number.parseInt(bg.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, "0")).join("")}`;
    expect(contrast(mix(token("lamp"), token("wall"), 0.7), token("wall"))).toBeGreaterThanOrEqual(3);
    expect(contrast(mix(token("lamp"), token("desk"), 0.7), token("desk"))).toBeGreaterThanOrEqual(3);
  });
  it("computes known ratios correctly", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });
});

describe("banned styles never appear in the landing files", () => {
  const files = ["app/page.tsx", "app/globals.css", "app/layout.tsx", "src/ui/landing.tsx", "src/ui/hero.tsx", "src/ui/StreamRun.tsx"];
  const text = Object.fromEntries(files.map((f) => [f, read(f)]));
  const each = (re: RegExp) => files.filter((f) => re.test(text[f] as string));

  it("no italics", () => expect(each(/italic|<em>|<i>|font-style:\s*oblique/i)).toEqual([]));
  it("no em dashes", () => expect(each(/—/)).toEqual([]));
  it("no box-shadow, ring or shadow utilities (ring is a box-shadow)", () => expect(each(/box-shadow|\bshadow-|\bshadow\b|\bring(-|\b)/)).toEqual([]));
  it("no blur, backdrop-filter or glow", () => expect(each(/blur|backdrop-filter|\bglow\b|drop-shadow/i)).toEqual([]));
  it("no glass or emoji", () => {
    expect(each(/\bglass/i)).toEqual([]);
    expect(each(/\p{Extended_Pictographic}(?<![✓✗])/u).filter((f) => /[\u{1F300}-\u{1FAFF}]/u.test(text[f] as string))).toEqual([]);
  });
  it("no gradient except the two in the hero", () => {
    const counts = files.map((f) => [f, (text[f]!.match(/gradient\(/g) ?? []).length] as const);
    expect(counts.filter(([f, n]) => n > 0 && f !== "src/ui/hero.tsx")).toEqual([]);
    expect(counts.find(([f]) => f === "src/ui/hero.tsx")?.[1]).toBe(2);
  });
  it("the hero gradients are exactly the two specified", () => {
    const hero = text["src/ui/hero.tsx"] as string;
    expect(hero).toContain("linear-gradient(90deg, rgba(14,8,4,.88) 0%, rgba(14,8,4,.55) 38%, rgba(14,8,4,0) 62%)");
    expect(hero).toContain('height: "18%"');
    expect(hero).toContain("#1a110b 100%)");
  });
  it("none of the banned marketing words", () => expect(each(/revolutioni[sz]e|supercharge|seamless|blazing|AI-powered/i)).toEqual([]));
  it("headings are never italic and the fonts are the specified families", () => {
    const layout = text["app/layout.tsx"] as string;
    expect(layout).toContain("OldStandardTT-400.woff2");
    expect(layout).toContain("OldStandardTT-700.woff2");
    expect(layout).toContain("IBMPlexSans.woff2");
    expect(layout).toContain("IBMPlexMono-600.woff2");
    expect(layout).not.toMatch(/style:\s*"[a-z]*italic"/);
  });
});

describe("hero image", () => {
  it("uses the generated art, priority, sizes 100vw, cover, and the right focal point", () => {
    const hero = read("src/ui/hero.tsx");
    expect(hero).toContain("priority: true");
    expect(hero).toContain('sizes: "100vw"');
    expect(hero).toContain('objectFit: "cover"');
    // 72% 40% in the phone band, 70% 50% as the full-bleed background
    expect(hero).toContain("object-[72%_40%]");
    expect(hero).toContain("md:object-[70%_50%]");
    expect(hero).toContain("h-60");
    expect(hero).toContain("/art/hero-{w}.webp");
  });
  it("has the caption, in the muted colour, bottom right", () => {
    const hero = read("src/ui/hero.tsx");
    expect(hero).toContain("After Thomas Eakins, The Chess Players (1876) · The Met, public domain · canvas extended for this page");
    expect(hero).toContain("md:bottom-3 md:right-4");
  });
});

describe("copy and structure of the refined landing page", () => {
  const page = read("app/page.tsx");
  const landing = read("src/ui/landing.tsx");
  const hero = read("src/ui/hero.tsx");
  const all = `${page}\n${landing}\n${hero}`;

  it("leads with install and checking, not the demo", () => {
    expect(all).not.toContain("Try the demo");
    expect(all).not.toContain("Play the repair loop");
    expect(all).not.toContain("Nothing running yet");
    expect(landing).toContain("Install");
    expect(hero).toContain("See it catch a bad test");
    expect(hero).toContain("View on GitHub");
    expect(landing).toContain("Replay this chain");
    expect(hero).toContain("npx @shankywho/nocap init --all");
    expect(hero).toContain("npx @shankywho/nocap check");
    expect(hero).toContain("Want to see it first?");
  });
  it("hero stats are measured numbers only, on one row", () => {
    expect(hero).not.toMatch(/\$0\.01|per check/);
    expect(hero).toContain("flex-nowrap");
  });
  it("the H1 balances its lines", () => expect(hero).toContain('textWrap: "balance"'));
  it("hanging numerals sit in the left margin on wide screens", () => {
    expect(page).toContain("xl:absolute xl:right-full");
    expect(page).toContain("text-[64px]");
    expect(page).toContain("text-lamp/70");
    expect(page).not.toMatch(/No\. \{n\}|className="label/);
  });
  it("limitations and FAQ are plain lists on the wall, with details for the FAQ", () => {
    expect(page).toContain("listrule");
    expect(page).toContain("<details");
    expect(page).toContain("<summary");
    expect(page).not.toMatch(/FAQ[\s\S]{0,400}className="doc/);
  });
  it("receipts are never truncated in code", () => {
    expect(page).not.toMatch(/slice\(0, 147\)|\.\.\.`: l\b/);
    expect(page).toContain("scrollx");
  });
  it("the eval box shows the strategy table and links to the full results", () => {
    expect(page).toContain("eval/results.md");
    expect(page).toContain('split("\\n\\n")[0]');
  });
});

describe("native scroll and content on first paint", () => {
  const page = read("app/page.tsx");
  it("has no smooth-scroll library or scroll-linked reveal", () => {
    for (const f of ["app/page.tsx", "app/layout.tsx", "src/ui/landing.tsx", "src/ui/hero.tsx", "package.json"]) {
      expect(read(f), f).not.toMatch(/lenis|framer-motion|whileInView|useScroll|ScrollProgress|SmoothScroll/i);
    }
  });
  it("the Galley is server-rendered in its finished state", () => {
    expect(read("src/ui/landing.tsx")).toContain("useState(n + 1)");
  });
  it("every section opens with a visible paragraph", () => {
    expect(page).toContain("What nocap cannot check, as of version 0.1.2.");
    expect(page).toContain("The questions we hear most.");
  });
  it("small caps labels are 12px Plex Sans small caps, not uppercase", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/\.smallcaps\s*{[^}]*font-size:\s*12px[^}]*font-variant-caps:\s*all-small-caps/);
    // the rubber stamp is the only uppercase text; labels, the copy tab and stat captions are not
    expect(read("src/ui/hero.tsx")).not.toMatch(/uppercase/);
    const landing = read("src/ui/landing.tsx");
    expect(landing.match(/uppercase/g)?.length).toBe(1);
    expect(landing).toMatch(/stamp[^`]*uppercase/);
  });
});

