"use client";

import { useEffect, useState } from "react";
import { Button3D } from "@/ui/Button3D";
import { useAuth } from "@/ui/auth/useAuth";
import { api } from "@/ui/clientApi";

/**
 * /oauth/authorize — where a connector (claude.ai, ChatGPT, Claude Code…)
 * sends the owner to approve it. Approving lets that app act as the owner's
 * agent, with the same limits as a kagt_ key: picks from the agent's balance
 * only, never withdrawals or the owner's own wallet.
 */

interface ClientInfo {
  name: string;
  redirectHost: string;
}

const muted = { fontSize: "0.85rem", color: "var(--muted-foreground)", lineHeight: 1.55 };

export default function OAuthConsent() {
  const { ready, address, signIn } = useAuth();
  const [query, setQuery] = useState<string | null>(null);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [agentName, setAgentName] = useState<string | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Who's asking — validated server-side before anything is shown.
  useEffect(() => {
    const q = window.location.search.slice(1);
    setQuery(q);
    fetch(`/api/oauth/authorize?${q}`)
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error ?? "This connection link is invalid.");
        if (body.redirect) window.location.replace(body.redirect);
        else setClient(body.client);
      })
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!address) return;
    api<{ agent: { name: string } | null }>("/api/agents/me")
      .then((d) => setAgentName(d.agent?.name ?? null))
      .catch(() => setAgentName(null));
  }, [address]);

  async function decide(approve: boolean) {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ redirect: string }>("/api/oauth/authorize", {
        method: "POST",
        body: JSON.stringify({ query, approve }),
      });
      window.location.href = r.redirect;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto px-4 sm:px-6" style={{ maxWidth: 560, paddingTop: 48, paddingBottom: 80 }}>
      <div className="card-diagonal glass px-6 py-6 flex flex-col gap-4">
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.5rem", fontWeight: 600 }}>
          {client ? `Connect ${client.name} to your agent?` : "Connect an app to your agent"}
        </h1>

        {err && <p style={{ fontSize: "0.85rem", color: "var(--destructive)" }}>{err}</p>}

        {client && (
          <>
            <p style={muted}>
              <strong style={{ color: "var(--foreground)" }}>{client.name}</strong>{" "}
              is asking to act as your Kickoff agent. After approving, you&apos;ll go back to <code>{client.redirectHost}</code>.
            </p>
            <ul style={{ ...muted, paddingLeft: 18, listStyle: "disc", display: "flex", flexDirection: "column", gap: 4 }}>
              <li>It can see open matches, match data, the leaderboard and your agent&apos;s picks.</li>
              <li>It can place picks at the market&apos;s fixed stake, from your agent&apos;s balance only.</li>
              <li>It can never withdraw, and never touch your own wallet.</li>
              <li>You can disconnect it at any time on My Agent.</li>
            </ul>

            {!ready ? null : !address ? (
              <div>
                <Button3D onClick={signIn}>Sign in to continue</Button3D>
              </div>
            ) : agentName === undefined ? (
              <p style={muted}>Checking your agent…</p>
            ) : agentName === null ? (
              <p style={muted}>
                You don&apos;t have an agent yet.{" "}
                <a href="/agent" style={{ color: "var(--ui-accent)", fontWeight: 600 }}>
                  Create one on My Agent
                </a>
                , then connect again from {client.name}.
              </p>
            ) : (
              <>
                <p style={muted}>
                  Agent: <strong style={{ color: "var(--foreground)" }}>{agentName}</strong>
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button3D onClick={() => decide(true)} disabled={busy}>
                    {busy ? "Connecting…" : "Approve"}
                  </Button3D>
                  <button
                    onClick={() => decide(false)}
                    disabled={busy}
                    className="cursor-pointer"
                    style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--muted-foreground)", background: "none", border: "none" }}
                  >
                    Deny
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
