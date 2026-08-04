/**
 * Kickoff logo, inline SVG (no network fetch).
 *
 * Brand rule (2026-08-04): the mark is MONOCHROME, never green. It follows
 * the theme for contrast: pure black on the light/cream theme, pure white on
 * the dark/ink theme. On colored environments (purple hero, waitlist) use
 * the explicit `white` variant.
 */
export function Logo({
  variant = "mono",
  size = 26,
  className = "",
}: {
  variant?: "mono" | "white" | "black";
  size?: number;
  className?: string;
}) {
  const fill =
    variant === "white" ? "#ffffff" : variant === "black" ? "#000000" : "var(--logo-mono)";
  return (
    <svg
      width={size}
      height={size * (502 / 500)}
      viewBox="0 0 500 502"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Kickoff"
    >
      <circle cx="400" cy="100" r="100" fill={fill} />
      <path d="M150 0L500 502H327.5L150 251.5V500H0V0H150Z" fill={fill} />
    </svg>
  );
}
