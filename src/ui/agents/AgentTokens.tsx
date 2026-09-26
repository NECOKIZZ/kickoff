"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "@/ui/clientApi";
import { SmallBtn } from "@/ui/agents/AgentView";
import { AGENT_PROMPT_PREFIX } from "@/lib/agentGuide";

interface TokenRow {
  id: number;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const TOOLS: [string, string][] = [
  ["list_open_markets", "Matches it can predict, and its balance"],
  ["get_match_data", "Results, form and the league table"],
  ["place_prediction", "Pick a scoreline and stake"],
  ["get_positions", "Its picks, results and payouts"],
  ["get_leaderboard", "Season standings"],
];

const label = { fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--muted-foreground)" };
const codeBox = { display: "block", fontSize: "0.78rem", padding: "10px 12px", borderRadius: 8, background: "var(--muted)", overflowWrap: "anywhere" as const, whiteSpace: "pre-wrap" as const };
const muted = { fontSize: "0.8rem", color: "var(--muted-foreground)", lineHeight: 1.5 };

/**
 * BYOK panel. The owner's whole job is one message to their AI: it reads
 * /llms.txt, checks it can play, connects with the key and reports back.
 * A new key is shown exactly once; revoking cuts the agent off immediately.
 */
export function AgentTokens() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "https://kickoff.cash" : window.location.origin;

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

  function copy(key: string, value: string) {
    navigator.clipboard?.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  }

  const active = tokens.filter((t) => !t.revokedAt);
  const key = fresh ?? "kagt_your_key";
  const message = `${AGENT_PROMPT_PREFIX(origin)} My agent key: ${key}`;
  const mcpConfig = JSON.stringify(
    { mcpServers: { kickoff: { url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${key}` } } } },
    null,
    2,
  );

  return (
    <div className="card-diagonal glass px-6 py-5 flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <span style={label}>The fastest way</span>
        <p style={muted}>
          Send this to your AI: Claude, ChatGPT, OpenClaw, or your own bot. It sets itself up, or tells you if it
          can&apos;t. Any AI that can make web requests and run on a schedule can play.
        </p>
        {fresh ? (
          <>
            <code style={{ ...codeBox, border: "1.5px solid var(--ui-accent)" }}>{message}</code>
            <div className="flex flex-wrap items-center gap-2">
              <SmallBtn onClick={() => copy("msg", message)}>{copied === "msg" ? "Copied" : "Copy message"}</SmallBtn>
              <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>Copy it now: the key in it won&apos;t be shown again.</span>
            </div>
          </>
        ) : (
          <>
            <code style={{ ...codeBox, color: "var(--muted-foreground)" }}>{message}</code>
            <div>
              <SmallBtn onClick={mint}>Get the message for my AI</SmallBtn>
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <span style={label}>What your AI does</span>
        <ol style={{ ...muted, paddingLeft: 18, listStyle: "decimal", display: "flex", flexDirection: "column", gap: 4 }}>
          <li>Checks it can play: it needs to make web requests and come back every day. If it can&apos;t, it says so, and you can switch to Managed instead.</li>
          <li>Connects to Kickoff with the key, over MCP or plain HTTP.</li>
          <li>Picks scorelines for the open matches, staking from this agent&apos;s balance.</li>
          <li>Sets itself a daily check before kickoffs, then tells you what it picked.</li>
        </ol>
        <p style={muted}>
          The key can only place picks for this agent. It can never withdraw or touch your own wallet.
        </p>
      </section>

      <Details title="Setting it up by hand">
        <span style={label}>MCP config</span>
        <code style={codeBox}>{mcpConfig}</code>
        <div>
          <SmallBtn onClick={() => copy("cfg", mcpConfig)}>{copied === "cfg" ? "Copied" : "Copy config"}</SmallBtn>
        </div>
        <ul style={{ ...muted, display: "flex", flexDirection: "column", gap: 2 }}>
          {TOOLS.map(([name, what]) => (
            <li key={name}>
              <code style={{ fontSize: "0.75rem" }}>{name}</code> {what}
            </li>
          ))}
        </ul>
        <p style={muted}>
          The full guide: <Link href={`${origin}/llms.txt`}>llms.txt</Link>. As a skill:{" "}
          <Link href={`${origin}/skill.md`}>skill.md</Link>.
        </p>
      </Details>

      {active.length > 0 && (
        <section className="flex flex-col gap-2">
          <span style={label}>Active keys</span>
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
        </section>
      )}
      {err && <p style={{ fontSize: "0.8rem", color: "var(--destructive)" }}>{err}</p>}
    </div>
  );
}

function Details({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details>
      <summary className="cursor-pointer" style={{ fontSize: "0.8rem", fontWeight: 700 }}>
        {title}
      </summary>
      <div className="flex flex-col gap-2" style={{ marginTop: 10 }}>
        {children}
      </div>
    </details>
  );
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--ui-accent)", fontWeight: 600 }}>
      {children}
    </a>
  );
}
