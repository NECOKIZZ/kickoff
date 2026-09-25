"use client";

import { useEffect, useState } from "react";
import { api } from "@/ui/clientApi";

interface Run {
  id: number;
  status: "ok" | "error" | "refused";
  trigger: string;
  picks: Array<{ marketId?: number; home?: number; away?: number; why?: string; placed: boolean; error?: string }>;
  error: string | null;
  createdAt: string;
}

/** Managed agent's recent runs: what it picked, why, and what didn't go through. */
export function AgentRuns() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  useEffect(() => {
    api<{ runs: Run[] }>("/api/agents/me/runs")
      .then((d) => setRuns(d.runs))
      .catch(() => setRuns([]));
  }, []);

  return (
    <div className="card-diagonal glass px-6 py-5 flex flex-col gap-3">
      <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
        Recent runs
      </span>
      {runs?.length === 0 && (
        <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
          No runs yet. Your agent runs automatically when new markets open, before they lock.
        </p>
      )}
      {runs?.map((r) => (
        <div key={r.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
          <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
            {new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {" · "}
            <span style={{ color: r.status === "ok" ? "var(--ui-accent)" : "var(--destructive)", fontWeight: 700 }}>{r.status}</span>
            {r.error ? ` · ${r.error}` : ""}
          </p>
          {r.picks.filter((p) => p.marketId != null).map((p, i) => (
            <p key={i} style={{ fontSize: "0.8rem", marginTop: 3 }}>
              <strong>#{p.marketId}</strong> {p.home}-{p.away}
              {p.why && <span style={{ color: "var(--muted-foreground)" }}> · {p.why}</span>}
              {!p.placed && <span style={{ color: "var(--destructive)" }}> · not placed: {p.error}</span>}
            </p>
          ))}
          {r.status === "ok" && r.picks.every((p) => p.marketId == null) && (
            <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginTop: 3 }}>Sat this round out.</p>
          )}
        </div>
      ))}
    </div>
  );
}
