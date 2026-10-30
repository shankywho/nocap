import { getImageProps } from "next/image";
import { preload } from "react-dom";
import { CodeBlock, SeeItButton } from "./landing";

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
  const common = { alt: "", fill: true, priority: true, sizes: "100vw", quality: 90, loader, className: "object-[72%_40%] md:object-[70%_50%]", style: { objectFit: "cover" as const } };
  // The webp is served so the largest contentful paint is the hero webp. The .avif files are generated for hosts that prefer them.
  const webp = getImageProps({ ...common, src: "/art/hero-{w}.webp" });
  // Discover the hero image from the HTML head, before the body is parsed.
  preload(webp.props.src as string, { as: "image", imageSrcSet: webp.props.srcSet, imageSizes: "100vw", fetchPriority: "high" });
  return (
    <section className="relative isolate overflow-hidden bg-wall md:min-h-[88vh]" aria-labelledby="hero-title">
      {/* On a phone the painting is a 240px band above the text; from md up it is the full-bleed background. */}
      <div className="relative h-60 border-b border-brass md:absolute md:inset-0 md:h-auto md:border-0">
        <img {...webp.props} alt="" />
        {/* gradient 1: a legibility scrim on the left only */}
        <div aria-hidden className="absolute inset-0 hidden md:block" style={{ background: "linear-gradient(90deg, rgba(14,8,4,.88) 0%, rgba(14,8,4,.55) 38%, rgba(14,8,4,0) 62%)" }} />
        {/* gradient 2: the bottom 18% fades into the wall so the room continues into the page */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 hidden md:block" style={{ height: "18%", background: "linear-gradient(180deg, rgba(26,17,11,0) 0%, #1a110b 100%)" }} />
      </div>
      <p className="m-0 px-5 pt-2 text-[13px] leading-snug text-muted md:absolute md:bottom-3 md:right-4 md:max-w-[70%] md:p-0 md:text-right">{CAPTION}</p>
      <div className="relative mx-auto flex max-w-6xl items-center px-5 pb-16 pt-8 sm:px-8 md:min-h-[88vh] md:pb-24 md:pt-28">
        <div className="w-full md:w-[45%]">
          <h1 id="hero-title" className="m-0 text-[40px] font-normal leading-[1.08] text-cream sm:text-[54px]" style={{ textWrap: "balance" }}>
            Check what your coding agent says it did.
          </h1>
          <p className="mb-0 mt-5 max-w-[34rem] text-[17px] text-cream">
            nocap reads your agent&apos;s final message, checks every claim against the diff and a real test run, and reverts the fix to prove new tests catch it.
          </p>
          <dl className="mb-0 mt-7 flex flex-nowrap gap-x-8">
            {[
              [stats.caught, "planted problems caught"],
              [stats.falseAccusations, "false accusations"],
            ].map(([n, l]) => (
              <div key={l}>
                <dd className="m-0 font-heading text-[36px] leading-tight text-lamp sm:text-[44px]">{n}</dd>
                <dt className="smallcaps text-muted">{l}</dt>
              </div>
            ))}
          </dl>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <SeeItButton>See it catch a bad test</SeeItButton>
            <a href="https://github.com/shankywho/nocap" className="linklamp">View on GitHub</a>
          </div>
          <div className="mt-6 md:w-[38rem]">
            <CodeBlock
              lines={[
                { cmd: "npx @shankywho/nocap init --all", note: "wire it into your agents" },
                { cmd: "npx @shankywho/nocap check", note: "verify the last summary" },
              ]}
            />
            <p className="mb-0 mt-3 text-[13px] text-muted">
              Want to see it first? <code className="text-[13px] text-cream">npx @shankywho/nocap demo</code>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
