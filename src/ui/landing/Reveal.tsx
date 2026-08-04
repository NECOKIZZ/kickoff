"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Scroll-reveal primitives — no animation library, just IntersectionObserver
 * + CSS transitions (keeps the bundle lean; choppy loading was a complaint).
 *
 * Fail-open by design: the hidden state lives in the `reveal-pending` class,
 * which globals.css only applies under `html.js` and force-reveals via a
 * 3.5s CSS keyframe. No JS, blocked bundle, reduced motion — words always
 * show up.
 */

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)"; // ease-out-quint — soft landing

/** Stamp html.hydrated on first mount — disarms the CSS blocked-bundle
 *  failsafe (globals.css) so it can't force-reveal a working page. */
function useHydratedStamp() {
  useEffect(() => {
    document.documentElement.classList.add("hydrated");
  }, []);
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

function useInView<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect(); // reveal once — re-triggering on every scroll reads as jittery
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
    // NOTE: no timer failsafe here — a blanket "reveal after Ns" defeats the
    // scroll choreography (everything below the fold plays out invisibly while
    // the visitor is still reading the hero). The no-JS/blocked-bundle case is
    // covered by the CSS keyframe in globals.css, which hydration disables.
  }, [threshold]);
  return { ref, inView };
}

/** Block reveal: blur + slide + fade in when scrolled into view. */
export function Reveal({
  children,
  delay = 0,
  from = "up",
  duration = 900,
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  from?: "up" | "left" | "right" | "none";
  duration?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  useHydratedStamp();
  const shown = inView || reduced;
  const hiddenTransform =
    from === "up"
      ? "translateY(40px)"
      : from === "left"
      ? "translateX(-64px)"
      : from === "right"
      ? "translateX(64px)"
      : "none";
  return (
    <div
      ref={ref}
      className={`${shown ? "" : "reveal-pending "}${className ?? ""}`}
      style={{
        ...style,
        ["--reveal-transform" as string]: hiddenTransform,
        transition: `opacity ${duration}ms ${EASE} ${delay}ms, filter ${duration}ms ${EASE} ${delay}ms, transform ${duration}ms ${EASE} ${delay}ms`,
        willChange: shown ? undefined : "opacity, filter, transform",
      }}
    >
      {children}
    </div>
  );
}

/** Word-by-word blur-in for headlines (walrus.xyz-style). Inline — wrap it in your heading tag. */
export function RevealWords({
  text,
  delay = 0,
  stagger = 70,
}: {
  text: string;
  delay?: number;
  stagger?: number;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.3);
  const reduced = usePrefersReducedMotion();
  useHydratedStamp();
  const shown = inView || reduced;
  const words = text.split(" ");
  return (
    <span ref={ref} style={{ display: "inline" }}>
      {words.map((word, i) => (
        <span
          key={i}
          className={shown ? undefined : "reveal-pending"}
          style={{
            display: "inline-block",
            whiteSpace: "pre",
            ["--reveal-blur" as string]: "14px",
            ["--reveal-transform" as string]: "translateY(0.35em)",
            transition: `opacity 0.7s ${EASE} ${delay + i * stagger}ms, filter 0.7s ${EASE} ${delay + i * stagger}ms, transform 0.7s ${EASE} ${delay + i * stagger}ms`,
          }}
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}
