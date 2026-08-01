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
 * Everything respects prefers-reduced-motion by revealing instantly.
 */

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)"; // ease-out-quint — soft landing

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
      className={className}
      style={{
        ...style,
        opacity: shown ? 1 : 0,
        filter: shown ? "blur(0px)" : "blur(10px)",
        transform: shown ? "none" : hiddenTransform,
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
  const shown = inView || reduced;
  return (
    <span ref={ref} style={{ display: "inline" }}>
      {text.split(" ").map((word, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            whiteSpace: "pre",
            opacity: shown ? 1 : 0,
            filter: shown ? "blur(0px)" : "blur(14px)",
            transform: shown ? "none" : "translateY(0.35em)",
            transition: `opacity 0.7s ${EASE} ${delay + i * stagger}ms, filter 0.7s ${EASE} ${delay + i * stagger}ms, transform 0.7s ${EASE} ${delay + i * stagger}ms`,
          }}
        >
          {word}
          {i < text.split(" ").length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}
