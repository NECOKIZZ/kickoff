/**
 * Kickoff logo. Brand rule: logo color adapts to its environment —
 * `green` on light surfaces, `white` on dark/colored surfaces.
 * Inlined SVG so no network fetch and CSS vars can drive fill if needed.
 */
export function Logo({
  variant = "green",
  size = 26,
  className = "",
}: {
  variant?: "green" | "white";
  size?: number;
  className?: string;
}) {
  if (variant === "white") {
    return (
      <svg
        width={size}
        height={size * (502 / 500)}
        viewBox="0 0 500 502"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="Kickoff"
      >
        <circle cx="400" cy="100" r="100" fill="white" />
        <path d="M150 0L500 502H327.5L150 251.5V500H0V0H150Z" fill="white" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size * (502 / 500)}
      viewBox="0 0 500 502"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Kickoff"
    >
      <rect width="150" height="500" fill="#01EF07" />
      <path d="M150 251.5V0L500 502H327.5L150 251.5Z" fill="url(#logo_grad)" />
      <circle cx="400" cy="100" r="100" fill="#01EF07" />
      <defs>
        <linearGradient
          id="logo_grad"
          x1="262.5"
          y1="286"
          x2="120.5"
          y2="90"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#01EF07" />
          <stop offset="1" stopColor="#006202" />
        </linearGradient>
      </defs>
    </svg>
  );
}
