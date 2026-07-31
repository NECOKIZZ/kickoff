"use client";

import type { ReactNode } from "react";

/**
 * Brand rule: selected menu items get a green line below them.
 */
export function NavUnderlineItem({
  children,
  active,
  onClick,
  href,
  className = "",
  muted = "var(--muted-foreground)",
  activeColor = "var(--foreground)",
}: {
  children: ReactNode;
  active: boolean;
  onClick?: () => void;
  href?: string;
  className?: string;
  muted?: string;
  activeColor?: string;
}) {
  const inner = (
    <>
      {children}
      <span
        aria-hidden
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 2,
          borderRadius: 999,
          background: "var(--primary)",
          transition: "transform 0.25s ease, opacity 0.25s ease",
          transform: active ? "scaleX(1)" : "scaleX(0)",
          transformOrigin: "center",
          opacity: active ? 1 : 0,
        }}
      />
    </>
  );

  const style: React.CSSProperties = {
    position: "relative",
    display: "inline-block",
    paddingBottom: 6,
    color: active ? activeColor : muted,
    fontFamily: "'Clash Display', sans-serif",
    whiteSpace: "nowrap",
    transition: "color 0.15s",
    cursor: "pointer",
    background: "none",
    border: "none",
  };

  if (href) {
    return (
      <a href={href} onClick={onClick} className={className} style={style}>
        {inner}
      </a>
    );
  }
  return (
    <button onClick={onClick} className={className} style={style}>
      {inner}
    </button>
  );
}
