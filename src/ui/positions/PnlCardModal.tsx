"use client";

import { useEffect, useState } from "react";

/**
 * Preview + download/share for a settled position's PnL card. The card is
 * rendered server-side (/api/positions/:id/card), so what's previewed is
 * byte-for-byte what gets downloaded, and what the /card/:id share link
 * unfurls into.
 */
export default function PnlCardModal({ positionId, onClose }: { positionId: number; onClose: () => void }) {
  const src = `/api/positions/${positionId}/card?w=2000`;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fileName = `kickoff-pnl-${positionId}.png`;
  const fetchPng = async () => new File([await (await fetch(src)).blob()], fileName, { type: "image/png" });

  const download = async () => {
    setBusy(true);
    try {
      const url = URL.createObjectURL(await fetchPng());
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  // The share link (/card/:id) unfurls into the card on X, WhatsApp, Telegram…
  const shareUrl = () => `${window.location.origin}/card/${positionId}`;
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl()).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const postOnX = () => {
    const intent = new URL("https://x.com/intent/post");
    intent.searchParams.set("text", "Called it on Kickoff.");
    intent.searchParams.set("url", shareUrl());
    window.open(intent.toString(), "_blank", "noopener,noreferrer");
  };

  // Native share sheet (mobile): the link, so the chat app shows the card preview.
  const share = async () => {
    if (navigator.share) await navigator.share({ url: shareUrl(), text: "Called it on Kickoff." }).catch(() => {});
    else await copyLink();
  };

  const btn = {
    fontSize: "0.8rem",
    fontWeight: 700,
    padding: "9px 16px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    opacity: busy || !loaded ? 0.5 : 1,
  } as const;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PnL card"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)" }}
    >
      <div onClick={(e) => e.stopPropagation()} className="flex w-full flex-col gap-4" style={{ maxWidth: 820 }}>
        <div style={{ position: "relative", aspectRatio: "16 / 9", width: "100%" }}>
          {!loaded && !failed && (
            <div
              className="absolute inset-0 animate-pulse"
              style={{ background: "#111", borderTopRightRadius: "6%", borderBottomLeftRadius: "6%" }}
            />
          )}
          {failed ? (
            <div className="absolute inset-0 flex items-center justify-center" style={{ color: "#fff", fontSize: "0.9rem" }}>
              Couldn&apos;t render this card.
            </div>
          ) : (
            <img
              src={src}
              alt="PnL card"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              style={{ width: "100%", height: "100%", display: "block", opacity: loaded ? 1 : 0 }}
            />
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={onClose} style={{ ...btn, opacity: 1, background: "rgba(255,255,255,0.12)", color: "#fff" }}>
            Close
          </button>
          <button onClick={download} disabled={busy || !loaded} style={{ ...btn, background: "#fff", color: "#000" }}>
            Download
          </button>
          <button onClick={copyLink} disabled={!loaded} style={{ ...btn, background: "#fff", color: "#000" }}>
            {copied ? "Copied" : "Copy link"}
          </button>
          <button onClick={postOnX} disabled={!loaded} style={{ ...btn, background: "#fff", color: "#000" }}>
            Post on X
          </button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button
              onClick={share}
              disabled={!loaded}
              style={{ ...btn, background: "var(--ui-accent)", color: "var(--ui-accent-contrast)" }}
            >
              Share
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
