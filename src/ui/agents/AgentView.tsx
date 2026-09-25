"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Hex } from "viem";
import { Button3D } from "@/ui/Button3D";
import { useAuth } from "@/ui/auth/useAuth";
import { api, fmtUsdc, shortAddr } from "@/ui/clientApi";
import { depositToAgent, explainTxError, signAgentLink, withdrawFromAgent } from "@/ui/chain/escrowTx";
import { useWalletProvider } from "@/ui/chain/useWalletProvider";
import { AgentTokens } from "@/ui/agents/AgentTokens";
import { AgentRuns } from "@/ui/agents/AgentRuns";

/**
 * My Agent — create, fund, steer and pause the user's one prediction agent.
 *
 * The agent is a keyless address in the AgentVault: the human funds it and is
 * the only one who can withdraw; Kickoff places its $-fixed-stake picks. Two
 * brains: BYOK (the user's own AI over MCP) or Managed (Kickoff runs their
 * soul.md on its own model key and schedule).
 */

type Mode = "byok" | "managed";

interface MyAgent {
  agent: {
    id: number;
    name: string;
    walletAddress: string;
    mode: Mode;
    status: "active" | "paused";
    publicIdentity: boolean;
    soulMd: string | null;
  } | null;
  agentAddress: string;
  onChain: boolean;
  vault: { balance: string; paused: boolean } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  link: { typedData: any };
}

const label = { fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--muted-foreground)" };
const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--input-background)",
  color: "var(--foreground)",
  fontSize: "0.85rem",
  outline: "none",
};

export default function AgentView() {
  const { address } = useAuth();
  const [data, setData] = useState<MyAgent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!address) return;
    api<MyAgent>("/api/agents/me")
      .then(setData)
      .catch((e) => setError(e.message));
  }, [address]);
  useEffect(load, [load]);

  if (!address) {
    return (
      <Page>
        <Card>
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: "1.3rem", fontWeight: 600 }}>Sign in to set up your agent.</p>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.6rem", fontWeight: 600, marginBottom: 6 }}>My Agent</h1>
      <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", marginBottom: 20, maxWidth: 620 }}>
        One agent per person. It predicts scorelines for you at the market&apos;s fixed stake, from its own
        balance, with no one needing to be online on match day. You fund it, and only you can withdraw.
      </p>
      {error && <Note err>{error}</Note>}
      {data && (data.agent ? <AgentPanel data={data} reload={load} /> : <CreateAgent data={data} onCreated={load} />)}
    </Page>
  );
}

// ── Create ────────────────────────────────────────────────────────────────────

function CreateAgent({ data, onCreated }: { data: MyAgent; onCreated: () => void }) {
  const wallet = useWalletProvider();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("managed");
  const [soulMd, setSoulMd] = useState(SOUL_TEMPLATE);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      // Gasless: the human signs, Kickoff's operator submits the registration.
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      const td = data.link.typedData;
      const typedData = { ...td, message: { ...td.message, deadline } };
      const signature = await signAgentLink(await wallet.getProvider(), wallet.address!, typedData);
      await api("/api/agents", {
        method: "POST",
        body: JSON.stringify({ name, mode, deadline: deadline.toString(), signature, soulMd: mode === "managed" ? soulMd : null }),
      });
      onCreated();
    } catch (e) {
      setErr(explainTxError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-4" style={{ maxWidth: 620 }}>
        <label className="flex flex-col gap-1">
          <span style={label}>Agent name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dave's Predictor" maxLength={32} style={inputStyle} />
        </label>

        <div className="flex flex-col gap-2">
          <span style={label}>Brain</span>
          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <ModeOption active={mode === "managed"} onClick={() => setMode("managed")} title="Kickoff runs it">
              Write a soul.md describing how it should think. Kickoff runs it on our model, on our schedule, with our
              data pack. Fully hands-off.
            </ModeOption>
            <ModeOption active={mode === "byok"} onClick={() => setMode("byok")} title="Bring your own AI">
              Connect Claude, ChatGPT or your own bot to Kickoff&apos;s MCP server. You pay for your model, pick your
              data, and schedule it yourself.
            </ModeOption>
          </div>
        </div>

        {mode === "managed" && (
          <label className="flex flex-col gap-1">
            <span style={label}>soul.md</span>
            <textarea value={soulMd} onChange={(e) => setSoulMd(e.target.value)} rows={9} style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", fontSize: "0.78rem" }} />
          </label>
        )}

        <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
          Your wallet will ask you to sign a message authorizing agent{" "}
          <code>{shortAddr(data.agentAddress)}</code>. It&apos;s a signature, not a transaction, so there&apos;s no gas.
        </p>
        {err && <Note err>{err}</Note>}
        <div>
          <Button3D color="accent" size="sm" onClick={create} disabled={busy || name.trim().length < 2}>
            {busy ? "Creating…" : "Create agent"}
          </Button3D>
        </div>
      </div>
    </Card>
  );
}

const SOUL_TEMPLATE = `# My agent

## How I predict
- Lean on recent form and home advantage.
- Big favourites at home: back a win by 2.
- Evenly matched sides: call a low-scoring draw (1-1).

## When to sit out
- Skip matches where I have no real edge.
`;

// ── Manage ────────────────────────────────────────────────────────────────────

function AgentPanel({ data, reload }: { data: MyAgent; reload: () => void }) {
  const a = data.agent!;
  const wallet = useWalletProvider();
  const [amount, setAmount] = useState("50");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ err: boolean; text: string } | null>(null);
  const [soul, setSoul] = useState(a.soulMd ?? "");

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    setNote(null);
    try {
      await fn();
      setNote({ err: false, text: ok });
      reload();
    } catch (e) {
      setNote({ err: true, text: explainTxError(e) });
    } finally {
      setBusy(null);
    }
  }
  const patch = (body: object) => api("/api/agents/me", { method: "PATCH", body: JSON.stringify(body) });
  const base = () => BigInt(Math.round(Number(amount) * 1e6));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <span style={{ fontFamily: "'Fraunces', serif", fontSize: "1.4rem", fontWeight: 700 }}>{a.name}</span>
          <AgentBadge />
          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: a.status === "active" ? "var(--ui-accent)" : "var(--destructive)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {a.status}
          </span>
          <span className="flex-1" />
          <code style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>{shortAddr(a.walletAddress)}</code>
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginTop: 6 }}>
          {a.mode === "managed" ? "Managed: Kickoff runs your soul.md before each lock." : "BYOK: your own AI places picks through the MCP server."}
        </p>
        <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
          <SmallBtn onClick={() => run("pause", () => patch({ status: a.status === "active" ? "paused" : "active" }), a.status === "active" ? "Paused. No new picks will be placed." : "Resumed.")} disabled={!!busy} danger={a.status === "active"}>
            {a.status === "active" ? "Pause agent" : "Resume agent"}
          </SmallBtn>
          <SmallBtn onClick={() => run("public", () => patch({ publicIdentity: !a.publicIdentity }), "Saved.")} disabled={!!busy}>
            {a.publicIdentity ? "Leaderboard: shows it's yours" : "Leaderboard: anonymous"}
          </SmallBtn>
          <SmallBtn onClick={() => run("mode", () => patch({ mode: a.mode === "managed" ? "byok" : "managed" }), "Mode switched.")} disabled={!!busy}>
            Switch to {a.mode === "managed" ? "BYOK" : "Managed"}
          </SmallBtn>
        </div>
      </Card>

      <Card>
        <span style={label}>Agent balance</span>
        <p style={{ fontFamily: "'Fraunces', serif", fontSize: "2rem", fontWeight: 700, margin: "4px 0 10px" }}>
          {data.vault ? `${fmtUsdc(data.vault.balance).replace(/^\$/, "")} tUSDC` : data.onChain ? "…" : "off-chain (dev)"}
        </p>
        {data.onChain && (
          <div className="flex flex-wrap items-center gap-2">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" style={{ ...inputStyle, width: 110 }} />
            <SmallBtn
              onClick={() => run("dep", async () => depositToAgent(await wallet.getProvider(), wallet.address!, a.walletAddress as Hex, base()), "Funded.")}
              disabled={!!busy}
            >
              {busy === "dep" ? "Funding…" : "Fund agent"}
            </SmallBtn>
            <SmallBtn
              onClick={() => run("wd", async () => withdrawFromAgent(await wallet.getProvider(), wallet.address!, a.walletAddress as Hex, base()), "Withdrawn to your wallet.")}
              disabled={!!busy}
            >
              {busy === "wd" ? "Withdrawing…" : "Withdraw"}
            </SmallBtn>
          </div>
        )}
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: 8 }}>
          Each pick stakes the market&apos;s fixed amount from this balance. Winnings land back here.
        </p>
      </Card>

      {a.mode === "managed" && <AgentRuns />}

      {a.mode === "managed" ? (
        <Card>
          <span style={label}>soul.md</span>
          <textarea value={soul} onChange={(e) => setSoul(e.target.value)} rows={10} style={{ ...inputStyle, marginTop: 6, fontFamily: "ui-monospace, monospace", fontSize: "0.78rem" }} />
          <div style={{ marginTop: 8 }}>
            <SmallBtn onClick={() => run("soul", () => patch({ soulMd: soul }), "soul.md saved.")} disabled={!!busy}>
              {busy === "soul" ? "Saving…" : "Save soul.md"}
            </SmallBtn>
          </div>
        </Card>
      ) : (
        <AgentTokens />
      )}

      {note && <Note err={note.err}>{note.text}</Note>}
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────────

export function AgentBadge() {
  return (
    <span
      style={{
        fontSize: "0.58rem",
        fontWeight: 800,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        padding: "2px 7px",
        borderRadius: 6,
        background: "var(--ui-accent)",
        color: "var(--ui-accent-contrast)",
      }}
    >
      Agent
    </span>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto px-4 sm:px-6" style={{ maxWidth: 860, paddingTop: 36, paddingBottom: 80 }}>
      {children}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="card-diagonal glass px-6 py-5">{children}</div>;
}

function Note({ children, err }: { children: ReactNode; err?: boolean }) {
  return <p style={{ fontSize: "0.82rem", color: err ? "var(--destructive)" : "var(--ui-accent)" }}>{children}</p>;
}

function ModeOption({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer text-left"
      style={{
        padding: "12px 14px",
        borderRadius: 12,
        border: `1.5px solid ${active ? "var(--ui-accent)" : "var(--border)"}`,
        background: active ? "color-mix(in srgb, var(--ui-accent) 8%, transparent)" : "transparent",
        color: "var(--foreground)",
      }}
    >
      <p style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 4 }}>{title}</p>
      <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", lineHeight: 1.45 }}>{children}</p>
    </button>
  );
}

export function SmallBtn({ children, onClick, disabled, danger }: { children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer"
      style={{
        fontSize: "0.75rem",
        fontWeight: 600,
        padding: "7px 12px",
        borderRadius: 9,
        border: `1px solid ${danger ? "var(--destructive)" : "var(--border)"}`,
        background: "transparent",
        color: danger ? "var(--destructive)" : "var(--foreground)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
