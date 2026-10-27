"use client";
import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import Lenis from "lenis";
import { useEffect } from "react";

/*
 * Smooth scrolling for the landing page: Lenis eases the wheel and anchor links, and Framer Motion drives the
 * scroll progress rule and the section reveals. Everything is off under prefers-reduced-motion, and wide receipts
 * (data-lenis-prevent) keep their own native scrolling.
 */
export function SmoothScroll() {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({ duration: 1.1, easing: (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t)), anchors: { offset: -56 } });
    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, [reduced]);
  return null;
}

/* A thin lamp-coloured rule at the top of the page that fills as you read. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 28, restDelta: 0.001 });
  return <motion.div aria-hidden className="fixed inset-x-0 top-0 z-40 h-[2px] origin-left bg-lamp" style={{ scaleX }} />;
}

/* Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -10% 0px" }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}
