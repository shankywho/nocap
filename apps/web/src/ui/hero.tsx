import { getImageProps } from "next/image";
import { CopyPill } from "./landing";

/*
 * Hero painting: Thomas Eakins, "The Chess Players" (1876), The Metropolitan Museum of Art, public domain.
 * The canvas was extended to the left for this page (docs/media/source/hero-chess-extended.png).
 * Original: The Metropolitan Museum of Art, New York (Open Access, public domain). Look up the object by title and date on metmuseum.org.
 */
const loader = ({ src, width }: { src: string; width: number }) => src.replace("{w}", width <= 1280 ? "1280" : "2400");
const CAPTION = "After Thomas Eakins, The Chess Players (1876) · The Met, public domain · canvas extended for this page";

export interface HeroStats {
  caught: string;
  falseAccusations: string;
}

export function Hero({ stats }: { stats: HeroStats }) {
  const common = { alt: "", fill: true, priority: true, sizes: "100vw", quality: 90, loader, style: { objectFit: "cover" as const, objectPosition: "70% 50%" } };
  const webp = getImageProps({ ...common, src: "/art/hero-{w}.webp" });
  const avif = getImageProps({ ...common, src: "/art/hero-{w}.avif" });
  return (
    <section className="relative isolate min-h-[88vh] overflow-hidden bg-wall" aria-labelledby="hero-title">
      <picture>
        <source type="image/avif" srcSet={avif.props.srcSet} sizes="100vw" />
        <img {...webp.props} alt="" />
      </picture>
      {/* gradient 1: a legibility scrim on the left only */}
      <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(14,8,4,.88) 0%, rgba(14,8,4,.55) 38%, rgba(14,8,4,0) 62%)" }} />
      {/* gradient 2: the bottom 18% fades into the wall so the room continues into the page */}
      <div aria-hidden className="absolute inset-x-0 bottom-0" style={{ height: "18%", background: "linear-gradient(180deg, rgba(26,17,11,0) 0%, #1a110b 100%)" }} />
      <div className="relative mx-auto flex min-h-[88vh] max-w-6xl items-center px-5 pb-24 pt-28 sm:px-8">
        <div className="w-full bg-[rgba(14,8,4,0.72)] p-5 sm:p-0 md:w-[45%] md:bg-transparent">
          <h1 id="hero-title" className="m-0 text-[40px] font-normal leading-[1.08] text-cream sm:text-[54px]">
            Check what your coding agent says it did.
          </h1>
          <p className="mb-0 mt-5 max-w-[34rem] text-[17px] text-cream">
            nocap reads your agent&apos;s final message, checks every claim against the diff and a real test run, and reverts the fix to prove new tests catch it.
          </p>
          <dl className="mb-0 mt-7 flex flex-wrap gap-x-8 gap-y-3">
            {[
              [stats.caught, "planted problems caught"],
              [stats.falseAccusations, "false accusations"],
              ["< $0.01", "per check"],
            ].map(([n, l]) => (
              <div key={l}>
                <dd className="m-0 font-heading text-[32px] leading-tight text-lamp sm:text-[44px]">{n}</dd>
                <dt className="font-mono text-[12px] text-muted">{l}</dt>
              </div>
            ))}
          </dl>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <a href="#no-3" className="btn">Try the demo</a>
            <a href="https://github.com/shankywho/nocap" className="linklamp">View on GitHub</a>
          </div>
          <div className="mt-5">
            <CopyPill text="npx @shankywho/nocap demo" />
          </div>
        </div>
      </div>
      <p className="absolute bottom-3 right-4 m-0 max-w-[70%] text-right font-mono text-[12px] leading-snug text-muted">{CAPTION}</p>
    </section>
  );
}
