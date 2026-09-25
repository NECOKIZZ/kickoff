"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/ui/clientApi";
import { SmallBtn } from "@/ui/agents/AgentView";

interface TokenRow {
  id: number;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/**
 * BYOK connection panel: the MCP endpoint + agent-scoped tokens. A new token
 * is shown exactly once; revoking cuts the agent off immediately.
 */
export function AgentTokens() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const endpoint = typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`;

  const load = useCallback(() => {
    api<{ tokens: TokenRow[] }>("/api/agents/me/tokens")
      .then((d) => setTokens(d.tokens))
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  async function mint() {
    setErr(null);
    try {
      const r = await api<{ token: string }>("/api/agents/me/tokens", { method: "POST" });
      setFresh(r.token);
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function revoke(id: number) {
    setErr(null);
    try {
      await api(`/api/agents/me/tokens/${id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const active = tokens.filter((t) => !t.revokedAt);

  return (
    <div className="card-diagonal glass px-6 py-5 flex flex-col gap-3">
      <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
        Connect your AI (MCP)
      </span>
      <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
        Add this MCP server to Claude, ChatGPT, Cursor or your own bot, with a token as the bearer. The token can
        only act as this agent. It can never touch your own wallet.
      </p>
      <code style={{ fontSize: "0.78rem", padding: "8px 10px", borderRadius: 8, background: "var(--muted)", overflowWrap: "anywhere" }}>{endpoint}</code>

      {fresh && (
        <div style={{ padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--ui-accent)" }}>
          <p style={{ fontSize: "0.75rem", fontWeight: 700, marginBottom: 4 }}>Copy this token now. It won&apos;t be shown again.</p>
          <code style={{ fontSize: "0.75rem", overflowWrap: "anywhere" }}>{fresh}</code>
          <div style={{ marginTop: 6 }}>
            <SmallBtn onClick={() => navigator.clipboard?.writeText(fresh)}>Copy</SmallBtn>
          </div>
        </div>
      )}

      {active.map((t) => (
        <div key={t.id} className="flex items-center gap-3" style={{ fontSize: "0.78rem" }}>
          <code>{t.tokenPrefix}…</code>
          <span style={{ color: "var(--muted-foreground)" }}>
            {t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleString("en-GB")}` : "never used"}
          </span>
          <span className="flex-1" />
          <SmallBtn danger onClick={() => revoke(t.id)}>Revoke</SmallBtn>
        </div>
      ))}

      <div>
        <SmallBtn onClick={mint}>New token</SmallBtn>
      </div>
      {err && <p style={{ fontSize: "0.8rem", color: "var(--destructive)" }}>{err}</p>}
    </div>
  );
}
