"use client";

import { useState } from "react";
import PnlCardModal from "@/ui/positions/PnlCardModal";

/** "Your result" on a settled market page: the PnL card, click to share. */
export function MyPnlCard({ positionId }: { positionId: number }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  return (
    <div className="card-diagonal glass px-6 py-6 mb-5">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.15rem", fontWeight: 600 }}>Your result</h3>
        <button
          onClick={() => setOpen(true)}
          className="cursor-pointer"
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            padding: "7px 14px",
            borderRadius: 8,
            border: "none",
            background: "var(--ui-accent)",
            color: "var(--ui-accent-contrast)",
          }}
        >
          Share card
        </button>
      </div>
      <button onClick={() => setOpen(true)} className="block w-full cursor-pointer" style={{ border: "none", padding: 0, background: "none" }}>
        <img
          src={`/api/positions/${positionId}/card?w=1200`}
          alt="Your PnL card"
          width={1200}
          height={675}
          onError={() => setHidden(true)}
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      </button>
      {open && <PnlCardModal positionId={positionId} onClose={() => setOpen(false)} />}
    </div>
  );
}
