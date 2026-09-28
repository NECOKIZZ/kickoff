---
version: alpha
name: Kickoff Noir Glass — Frame
description: >
  Bespoke dark-glass system for the Kickoff launch promo. Near-black void, frosted
  glass panels, brand purple and green used as neon light sources.
unit: the frame — 1920×1080
principle: glass over void · light is information · purple = your pick, green = payout

colors:
  canvas: "#05060A"
  canvas-alt: "#0B0C14"
  ink: "#F5F4FF"
  ink-muted: "#A6A3C2"
  ink-hint: "#5E5B7A"
  purple: "#7B62F6"
  purple-deep: "#4E3CB5"
  purple-glow: "rgba(123,98,246,0.55)"
  green: "#00C805"
  green-glow: "rgba(0,200,5,0.55)"
  glass-bg: "rgba(255,255,255,0.06)"
  glass-border: "rgba(255,255,255,0.18)"
  glass-highlight: "rgba(255,255,255,0.32)"

typography:
  display: { fontFamily: "Clash Display", weight: 600, tracking: "-0.03em", lineHeight: 0.95 }
  h1:      { fontFamily: "Clash Display", weight: 600, tracking: "-0.02em" }
  body:    { fontFamily: "Inter", weight: 400 }
  label:   { fontFamily: "Inter", weight: 600, tracking: "0.24em", upper: true }
  mono:    { fontFamily: "JetBrains Mono, ui-monospace, monospace", weight: 500 }

components:
  glass-panel:
    background: "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))"
    backdropFilter: "blur(24px) saturate(140%)"
    border: "1px solid {colors.glass-border}"
    boxShadow: "inset 0 1px 0 {colors.glass-highlight}, 0 30px 80px rgba(0,0,0,0.55)"
    radius: "28px"
  neon:
    textShadow: "0 0 18px {colors.purple-glow}, 0 0 60px {colors.purple-glow}"
  overlays: "film grain (4% opacity), scanlines (3%), vignette"
