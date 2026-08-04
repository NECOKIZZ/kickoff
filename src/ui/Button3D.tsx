"use client";

import { useState, type ReactNode } from "react";

/**
 * Brand rule (instuctions.md): buttons are strictly always 3D.
 * Green pairs with ink text, purple pairs with white text.
 * "accent" follows the theme: purple in light mode, green in dark.
 */
export function Button3D({
  children,
  color = "green",
  size = "md",
  className = "",
  onClick,
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  color?: "green" | "purple" | "accent";
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const bg =
    color === "green" ? "var(--color-kickoff-green)"
    : color === "purple" ? "var(--color-new-purple)"
    : "var(--ui-accent)";
  const shadow =
    color === "green" ? "var(--color-kickoff-green-deep)"
    : color === "purple" ? "var(--color-new-purple-deep)"
    : "var(--ui-accent-deep)";
  const textColor =
    color === "green" ? "#111210"
    : color === "purple" ? "#ffffff"
    : "var(--ui-accent-contrast)";
  const pad =
    size === "sm" ? "6px 14px" : size === "lg" ? "14px 32px" : "10px 20px";
  const fontSize = size === "sm" ? "0.78rem" : size === "lg" ? "0.95rem" : "0.875rem";

  const down = pressed && !disabled;

  return (
    <button
      type={type}
      disabled={disabled}
      className={`relative select-none font-semibold rounded-xl transition-all duration-75 ${className}`}
      style={{
        background: bg,
        color: textColor,
        fontFamily: "'Clash Display', sans-serif",
        fontSize,
        padding: pad,
        opacity: disabled ? 0.5 : 1,
        boxShadow: down
          ? `0 1px 0 ${shadow}, inset 0 1px 0 rgba(255,255,255,0.15)`
          : `0 5px 0 ${shadow}, 0 6px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.2)`,
        transform: down ? "translateY(4px)" : "translateY(0)",
        border: `1px solid ${shadow}`,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
