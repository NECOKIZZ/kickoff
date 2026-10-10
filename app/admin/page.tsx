"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { adminApi, getAdminKey, setAdminKey, AdminAuthError } from "@/ui/admin/adminApi";
import { fmtUsdc, fmtKickoff, shortAddr } from "@/ui/clientApi";
import { Button3D } from "@/ui/Button3D";
import { Logo } from "@/ui/Logo";
import { explainVoid } from "@/lib/voidReasons";

/**
 * Admin control room — /admin.
 *
 * Gate: the ADMIN_API_KEY itself, entered once per tab. There is no separate
 * admin session — every request re-presents the bearer key and the SERVER is
 * the authority (a wrong key renders this page useless, by design).
 *
 * Tabs: Overview (stats) · Markets (create / open / settle / void) ·
 * Invites (mint codes, waitlist funnel).
 */

// ── Types (mirror the admin API responses) ────────────────────────────────────

interface Totals {
  signups: number;
  total_positions: number;
  total_volume: string;
  open_markets: number;
  live_markets: number;
  settled_markets: number;
  void_markets: number;
  platform_take: string;
  accumulator_balance: string;
}

interface AdminMarket {
  id: number;
  kind: "scoreline" | "player_points";
  status: string;
  title: string;
  gameweek: number | null;
  playerName: string | null;
  kickoffAt: string;
  locksAt: string;
  gamma: number;
  stakeMode: "variable" | "fixed";
  minStake: string;
  maxStake: string;
  fixedStake: string | null;
  takeRateBps: number;
  capMultiple: number;
  positionCount: number;
  distinctGuesses: number;
  voidReason: string | null;
  dataFixtureId: string | null;
  escrowAddress: string | null;
  onChainMarketId: string | null;
}

interface SettlePreview {
  positionCount: number;
  distinctGuesses: number;
  void: string | null;
  voidExplanation: string | null;
  winners: number;
}

interface AdminEvent {
  id: number;
  actor: string;
  action: string;
  marketId: number | null;
  createdAt: string;
}

interface InviteData {
  stats: { signups: number; invited: number; codesMinted: number; codesRedeemed: number };
  signups: { id: number; email: string; invitedAt: string | null; createdAt: string }[];
  codes: {
    id: number;
    code: string;
    note: string | null;
    waitlistId: number | null;
    redeemedAt: string | null;
    createdAt: string;
  }[];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null); // null = booting

  useEffect(() => {
    if (!getAdminKey()) {
      setUnlocked(false);
      return;
    }
    // Validate the remembered key against the server before showing anything.
    adminApi("/api/admin/stats")
      .then(() => setUnlocked(true))
      .catch(() => {
        setAdminKey(null);
        setUnlocked(false);
      });
  }, []);

  if (unlocked === null) return null;
  if (!unlocked) return <KeyGate onUnlock={() => setUnlocked(true)} />;
  return <Dashboard onLock={() => { setAdminKey(null); setUnlocked(false); }} />;
}

// ── Key gate ──────────────────────────────────────────────────────────────────

function KeyGate({ onUnlock }: { onUnlock: () => void }) {
  const [key, setKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (checking || !key) return;
    setErr(null);
    setChecking(true);
    setAdminKey(key.trim());
    try {
      await adminApi("/api/admin/stats");
      onUnlock();
    } catch {
      setAdminKey(null);
      setErr("key rejected");
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6" style={{ background: "var(--background)" }}>
      <form onSubmit={submit} className="glass card-diagonal w-full flex flex-col gap-4" style={{ maxWidth: 380, padding: "32px 28px" }}>
        <div className="flex items-center gap-3">
          <Logo size={24} />
          <span style={{ fontFamily: "'Clash Display', sans-serif", fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
            Control room
          </span>
        </div>
        <input
          type="password"
          autoFocus
          placeholder="Admin key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--input-background)",
            color: "var(--foreground)",
            fontSize: "0.9rem",
            outline: "none",
          }}
        />
        {err && <p style={{ color: "var(--destructive)", fontSize: "0.78rem" }}>{err}</p>}
        <Button3D color="accent" type="submit" disabled={checking || !key}>
          {checking ? "Checking…" : "Unlock"}
        </Button3D>
      </form>
    </main>
  );
}

// ── Dashboard shell ───────────────────────────────────────────────────────────

const TABS = ["Overview", "Markets", "Agents", "Invites"] as const;
type Tab = (typeof TABS)[number];

function Dashboard({ onLock }: { onLock: () => void }) {
  const [tab, setTab] = useState<Tab>("Overview");

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <Logo size={22} />
          <span style={{ fontFamily: "'Clash Display', sans-serif", fontSize: "0.66rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
            Control room
          </span>
        </div>
        <div className="flex items-center gap-1" style={{ background: "var(--muted)", borderRadius: 10, padding: 3 }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="cursor-pointer"
              style={{
                fontFamily: "'Clash Display', sans-serif",
                fontSize: "0.74rem",
                fontWeight: 600,
                padding: "6px 14px",
                borderRadius: 8,
                border: "none",
                background: tab === t ? "var(--ui-accent)" : "transparent",
                color: tab === t ? "var(--ui-accent-contrast)" : "var(--muted-foreground)",
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={onLock}
          className="cursor-pointer"
          style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--muted-foreground)", background: "none", border: "none" }}
        >
          Lock
        </button>
      </header>

      <main className="mx-auto px-6 py-8" style={{ maxWidth: 1080 }}>
        {tab === "Overview" && <OverviewTab />}
        {tab === "Markets" && <MarketsTab />}
        {tab === "Agents" && <AgentsTab />}
        {tab === "Invites" && <InvitesTab />}
      </main>
    </div>
  );
}

function useAdminData<T>(path: string, deps: unknown[] = []): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    adminApi<T>(path)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof AdminAuthError ? "key expired, reload the page" : e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}

// ── Overview ──────────────────────────────────────────────────────────────────

function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="glass card-diagonal-sm px-5 py-4">
      <p style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 6 }}>
        {label}
      </p>
      <p style={{ fontFamily: "'Fraunces', serif", fontSize: "1.55rem", fontWeight: 700 }}>{value}</p>
    </div>
  );
}

function OverviewTab() {
  const { data, error } = useAdminData<{ totals: Totals; topTraders: { address: string; positions: number; volume: string }[]; recentEvents: AdminEvent[] }>("/api/admin/stats");

  if (error) return <ErrorNote text={error} />;
  if (!data) return <Loading />;
  const t = data.totals;

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatTile label="Volume" value={fmtUsdc(t.total_volume, { compact: true })} />
        <StatTile label="Positions" value={t.total_positions} />
        <StatTile label="Users" value={t.signups} />
        <StatTile label="Platform take" value={fmtUsdc(t.platform_take, { compact: true })} />
        <StatTile label="Accumulator" value={fmtUsdc(t.accumulator_balance, { compact: true })} />
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Open" value={t.open_markets} />
        <StatTile label="Live / settling" value={t.live_markets} />
        <StatTile label="Settled" value={t.settled_markets} />
        <StatTile label="Void" value={t.void_markets} />
      </section>

      <section>
        <SectionTitle>Top traders</SectionTitle>
        <SimpleTable
          head={["Address", "Positions", "Volume"]}
          rows={data.topTraders.map((r) => [shortAddr(r.address), r.positions, fmtUsdc(r.volume)])}
        />
      </section>

      <section>
        <SectionTitle>Recent admin events</SectionTitle>
        <SimpleTable
          head={["When", "Actor", "Action", "Market"]}
          rows={data.recentEvents.slice(0, 20).map((e) => [
            new Date(e.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
            e.actor,
            e.action,
            e.marketId ?? "-",
          ])}
        />
      </section>
    </div>
  );
}

// ── Agents ────────────────────────────────────────────────────────────────────

interface AgentsData {
  managedEnabled: boolean;
  model: string;
  stakingHalted: boolean | null;
  agents: { id: number; name: string; mode: string; status: string; owner: string; positions: number }[];
  runs7d: { runs: number; errors: number; refused: number; input_tokens: string; output_tokens: string; estCostUsd: number };
  herding: { market_id: number; title: string; positions: number; agent_positions: number; top_agent_pick_count: number | null }[];
  recentErrors: { id: number; agentId: number; status: string; error: string | null; createdAt: string }[];
}

function AgentsTab() {
  const { data, error, reload } = useAdminData<AgentsData>("/api/admin/agents");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function act(path: string, body: object, label: string) {
    setBusy(true);
    setNote(null);
    try {
      const r = await adminApi<Record<string, unknown>>(path, { method: "POST", body: JSON.stringify(body) });
      setNote(`${label}: ${JSON.stringify(r).slice(0, 240)}`);
      reload();
    } catch (e) {
      setNote(`${label} failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorNote text={error} />;
  if (!data) return <Loading />;
  const r = data.runs7d;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionTitle>Managed runs, last 7 days ({data.model})</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatTile label="Agents" value={data.agents.length} />
          <StatTile label="Runs" value={r.runs} />
          <StatTile label="Errors / refused" value={`${r.errors} / ${r.refused}`} />
          <StatTile label="Tokens in / out" value={`${Number(r.input_tokens).toLocaleString()} / ${Number(r.output_tokens).toLocaleString()}`} />
          <StatTile label="Est. cost" value={`$${r.estCostUsd}`} />
        </div>
        <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 12 }}>
          <ActionBtn disabled={busy || !data.managedEnabled} onClick={() => act("/api/admin/agents/run", {}, "run")}>
            Run managed agents now
          </ActionBtn>
          <ActionBtn danger={!data.stakingHalted} disabled={busy || data.stakingHalted == null} onClick={() => act("/api/admin/agents/halt", { halted: !data.stakingHalted }, data.stakingHalted ? "resume" : "halt")}>
            {data.stakingHalted ? "Resume all agent staking" : "Halt all agent staking"}
          </ActionBtn>
          {!data.managedEnabled && <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>Set OPENROUTER_API_KEY to enable managed agents.</span>}
        </div>
        {note && <p style={{ fontSize: "0.78rem", color: "var(--ui-accent)", marginTop: 8, overflowWrap: "anywhere" }}>{note}</p>}
      </section>

      <section>
        <SectionTitle>Herding on open markets</SectionTitle>
        <SimpleTable
          head={["Market", "Positions", "Agents", "Top agent pick"]}
          rows={data.herding.map((h) => {
            // Risk = 2+ agents on one scoreline AND that's half the pool or more.
            const top = h.top_agent_pick_count ?? 0;
            const share = top >= 2 ? top / h.positions : 0;
            return [
              `#${h.market_id} ${h.title}`,
              h.positions,
              h.agent_positions,
              <span key="t" style={{ color: share >= 0.5 ? "var(--destructive)" : undefined, fontWeight: share >= 0.5 ? 700 : 400 }}>
                {h.top_agent_pick_count ? `${h.top_agent_pick_count} on one scoreline${share >= 0.5 ? " · coalition/void risk" : ""}` : "-"}
              </span>,
            ];
          })}
        />
      </section>

      <section>
        <SectionTitle>Agents</SectionTitle>
        <SimpleTable
          head={["Name", "Mode", "Status", "Owner", "Positions"]}
          rows={data.agents.map((a) => [a.name, a.mode, a.status, shortAddr(a.owner), a.positions])}
        />
      </section>

      <section>
        <SectionTitle>Failed runs</SectionTitle>
        <SimpleTable
          head={["When", "Agent", "Status", "Error"]}
          rows={data.recentErrors.map((e) => [new Date(e.createdAt).toLocaleString("en-GB"), e.agentId, e.status, e.error ?? ""])}
        />
      </section>
    </div>
  );
}

// ── Markets ───────────────────────────────────────────────────────────────────

function MarketsTab() {
  const { data, error, reload } = useAdminData<{ markets: AdminMarket[] }>("/api/admin/markets");
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [listing, setListing] = useState(false);

  // Same run the daily cron does: lists + opens every upcoming fixture that
  // has no market, voids markets whose fixture was postponed/moved earlier.
  async function runListing() {
    setListing(true);
    setNote(null);
    try {
      const r = await adminApi<{ listed: unknown[]; voided: unknown[]; deletedDrafts: unknown[]; skipped: number; errors: { fixtureId: string; error: string }[] }>(
        "/api/admin/listing/run",
        { method: "POST" },
      );
      setNote(
        `listing agent: ${r.listed.length} listed, ${r.voided.length} voided, ${r.deletedDrafts.length} drafts removed, ${r.skipped} already listed/out of window` +
          (r.errors.length ? `, ${r.errors.length} error(s): ${r.errors.map((e) => `${e.fixtureId}: ${e.error}`).join("; ")}` : ""),
      );
      reload();
    } catch (e) {
      setNote(`listing agent failed: ${(e as Error).message}`);
    } finally {
      setListing(false);
    }
  }

  const act = useCallback(
    async (id: number, action: "open" | "settle" | "void" | "delete", body?: object) => {
      setBusy(id);
      setNote(null);
      try {
        if (action === "delete") {
          if (!window.confirm(`Delete market ${id}? This removes it and its positions from the app for good.`)) return;
          await adminApi(`/api/admin/markets/${id}`, { method: "DELETE" });
          setNote(`market ${id}: deleted ✓`);
          reload();
          return;
        }
        // Settle: dry-run first so a void is never a surprise.
        if (action === "settle" && body) {
          const qs = new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
          const p = await adminApi<SettlePreview>(`/api/admin/markets/${id}/settle?${qs}`);
          if (p.void && !window.confirm(`Market ${id} will VOID: ${p.voidExplanation}.\n\n${p.positionCount} position(s), ${p.distinctGuesses} distinct guess(es). Settle anyway?`)) {
            setNote(`market ${id}: settle cancelled (would void: ${p.voidExplanation})`);
            return;
          }
        }
        const r = await adminApi<{ engine?: { void: string | null; voidExplanation?: string | null; outcomes?: { isWinner: boolean }[] } }>(
          `/api/admin/markets/${id}/${action}`,
          { method: "POST", body: JSON.stringify(body ?? {}) },
        );
        setNote(
          action === "settle" && r.engine
            ? r.engine.void
              ? `market ${id}: VOIDED, ${r.engine.voidExplanation ?? r.engine.void}`
              : `market ${id}: settled ✓ (${r.engine.outcomes?.filter((o) => o.isWinner).length ?? 0} winner(s))`
            : `market ${id}: ${action} ✓`,
        );
        reload();
      } catch (e) {
        setNote(`market ${id}: ${(e as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [reload],
  );

  if (error) return <ErrorNote text={error} />;
  if (!data) return <Loading />;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start gap-3">
        <CreateMarketForm
          onCreated={reload}
          listed={new Set(data.markets.filter((m) => m.status !== "void" && m.dataFixtureId).map((m) => m.dataFixtureId!))}
        />
        <ActionBtn disabled={listing} onClick={runListing}>
          {listing ? "Listing…" : "Run listing agent now"}
        </ActionBtn>
      </div>

      {note && <p style={{ fontSize: "0.8rem", color: "var(--ui-accent)" }}>{note}</p>}

      <section>
        <SectionTitle>All markets ({data.markets.length})</SectionTitle>
        <div className="flex flex-col gap-2">
          {data.markets.map((m) => (
            <MarketRow key={m.id} m={m} busy={busy === m.id} onAct={act} onPatched={reload} />
          ))}
        </div>
      </section>
    </div>
  );
}

function MarketRow({
  m,
  busy,
  onAct,
  onPatched,
}: {
  m: AdminMarket;
  busy: boolean;
  onAct: (id: number, action: "open" | "settle" | "void" | "delete", body?: object) => void;
  onPatched: () => void;
}) {
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [points, setPoints] = useState("");
  const [showEdit, setShowEdit] = useState(false);

  // Edit knob state — seeded from current market values
  const baseToUsdc = (v: string | bigint | null) => v == null ? "" : String(Number(v) / 1_000_000);
  const usdcToBase = (v: string) => String(Math.round(Number(v) * 1_000_000));

  const [gamma, setGamma] = useState(String(m.gamma));
  const [stakeMode, setStakeMode] = useState<"variable" | "fixed">(m.stakeMode);
  const [minStake, setMinStake] = useState(baseToUsdc(m.minStake));
  const [maxStake, setMaxStake] = useState(baseToUsdc(m.maxStake));
  const [fixedStake, setFixedStake] = useState(baseToUsdc(m.fixedStake));
  const [takeRateBps, setTakeRateBps] = useState(String(m.takeRateBps));
  const [capMultiple, setCapMultiple] = useState(String(m.capMultiple));
  const [patchErr, setPatchErr] = useState<string | null>(null);
  const [patching, setPatching] = useState(false);

  // On-chain markets freeze their config at open (the escrow enforces it).
  const onChain = m.escrowAddress != null && m.onChainMarketId != null;
  const canEdit = m.status === "draft" || (m.status === "open" && !onChain);

  const statusColor =
    m.status === "open" || m.status === "locked" ? "var(--ui-accent)"
    : m.status === "settled" ? "var(--muted-foreground)"
    : m.status === "void" ? "var(--destructive)"
    : "var(--foreground)";

  async function saveKnobs() {
    if (patching) return;
    setPatchErr(null);
    setPatching(true);
    try {
      const body: Record<string, unknown> = {
        gamma: Number(gamma),
        stakeMode,
        minStake: usdcToBase(minStake),
        maxStake: usdcToBase(maxStake),
        takeRateBps: Number(takeRateBps),
        capMultiple: Number(capMultiple),
      };
      if (stakeMode === "fixed") body.fixedStake = usdcToBase(fixedStake);
      else body.fixedStake = null;
      await adminApi(`/api/admin/markets/${m.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setShowEdit(false);
      onPatched();
    } catch (e) {
      setPatchErr((e as Error).message);
    } finally {
      setPatching(false);
    }
  }

  return (
    <div className="glass card-diagonal-sm px-4 py-3 flex flex-col gap-3">
      {/* Main row */}
      <div className="flex flex-wrap items-center gap-3">
        <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, minWidth: 34 }}>#{m.id}</span>
        <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: statusColor, minWidth: 62 }}>
          {m.status}
        </span>
        <span className="flex-1" style={{ fontSize: "0.85rem", fontWeight: 600, minWidth: 200 }}>
          {m.title}
          <span style={{ color: "var(--muted-foreground)", fontWeight: 400, marginLeft: 8, fontSize: "0.72rem" }}>
            {m.kind === "player_points" ? "player" : `GW${m.gameweek ?? "?"}`} · {fmtKickoff(m.kickoffAt)}
          </span>
          <span style={{ color: "var(--muted-foreground)", fontWeight: 400, marginLeft: 8, fontSize: "0.68rem" }}>
            γ{m.gamma} · {m.stakeMode === "fixed" ? `$${baseToUsdc(m.fixedStake)} fixed` : `$${baseToUsdc(m.minStake)}-$${baseToUsdc(m.maxStake)}`} · {m.takeRateBps / 100}% take
          </span>
          <span style={{ color: "var(--muted-foreground)", fontWeight: 400, marginLeft: 8, fontSize: "0.68rem" }}>
            {onChain ? `on-chain #${m.onChainMarketId}` : "off-chain"} · {m.positionCount} position{m.positionCount === 1 ? "" : "s"} · {m.distinctGuesses} distinct guess{m.distinctGuesses === 1 ? "" : "es"}
            {(m.status === "open" || m.status === "locked") && m.positionCount < 2 && (
              <span style={{ color: "var(--destructive)", marginLeft: 6 }}>· will void (needs 2+ positions)</span>
            )}
            {(m.status === "open" || m.status === "locked") && m.positionCount >= 2 && m.distinctGuesses < 2 && (
              <span style={{ color: "var(--destructive)", marginLeft: 6 }}>· will void (everyone guessed the same)</span>
            )}
          </span>
          {m.status === "void" && m.voidReason && (
            <span style={{ display: "block", color: "var(--destructive)", fontWeight: 400, fontSize: "0.7rem", marginTop: 2 }}>
              Void: {explainVoid(m.voidReason)}
            </span>
          )}
        </span>

        {canEdit && (
          <ActionBtn disabled={busy} onClick={() => setShowEdit((v) => !v)}>
            {showEdit ? "Cancel edit" : "Edit knobs"}
          </ActionBtn>
        )}
        {m.status === "draft" && (
          <ActionBtn disabled={busy} onClick={() => onAct(m.id, "open")}>
            Open
          </ActionBtn>
        )}
        {(m.status === "open" || m.status === "locked") && (
          <>
            {m.kind === "scoreline" ? (
              <span className="flex items-center gap-1">
                <MiniInput value={home} onChange={setHome} placeholder="H" width={40} />
                <MiniInput value={away} onChange={setAway} placeholder="A" width={40} />
                <ActionBtn
                  disabled={busy || home === "" || away === ""}
                  onClick={() => onAct(m.id, "settle", { home: Number(home), away: Number(away) })}
                >
                  Settle
                </ActionBtn>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <MiniInput value={points} onChange={setPoints} placeholder="pts" width={56} />
                <ActionBtn
                  disabled={busy || points === ""}
                  onClick={() => onAct(m.id, "settle", { points: String(Math.round(Number(points) * 1e6)) })}
                >
                  Settle
                </ActionBtn>
              </span>
            )}
            <ActionBtn danger disabled={busy} onClick={() => onAct(m.id, "void", { reason: "admin void via dashboard" })}>
              Void
            </ActionBtn>
          </>
        )}
        {/* Server refuses a void market with unclaimed on-chain refunds and says why. */}
        {(m.status === "draft" || m.status === "void") && (
          <ActionBtn danger disabled={busy} onClick={() => onAct(m.id, "delete")}>
            Delete
          </ActionBtn>
        )}
      </div>

      {/* Inline knob editor */}
      {showEdit && canEdit && (
        <div className="flex flex-col gap-3 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
          <KnobFields
            gamma={gamma} setGamma={setGamma}
            stakeMode={stakeMode} setStakeMode={setStakeMode}
            minStake={minStake} setMinStake={setMinStake}
            maxStake={maxStake} setMaxStake={setMaxStake}
            fixedStake={fixedStake} setFixedStake={setFixedStake}
            takeRateBps={takeRateBps} setTakeRateBps={setTakeRateBps}
            capMultiple={capMultiple} setCapMultiple={setCapMultiple}
          />
          {patchErr && <p style={{ color: "var(--destructive)", fontSize: "0.78rem" }}>{patchErr}</p>}
          <div>
            <ActionBtn disabled={patching} onClick={saveKnobs}>
              {patching ? "Saving…" : "Save knobs"}
            </ActionBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function KnobFields({
  gamma, setGamma,
  stakeMode, setStakeMode,
  minStake, setMinStake,
  maxStake, setMaxStake,
  fixedStake, setFixedStake,
  takeRateBps, setTakeRateBps,
  capMultiple, setCapMultiple,
}: {
  gamma: string; setGamma: (v: string) => void;
  stakeMode: "variable" | "fixed"; setStakeMode: (v: "variable" | "fixed") => void;
  minStake: string; setMinStake: (v: string) => void;
  maxStake: string; setMaxStake: (v: string) => void;
  fixedStake: string; setFixedStake: (v: string) => void;
  takeRateBps: string; setTakeRateBps: (v: string) => void;
  capMultiple: string; setCapMultiple: (v: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <FormInput label="Gamma (1-12)" value={gamma} onChange={setGamma} placeholder="3" />
        <FormInput label="Take rate (bps)" value={takeRateBps} onChange={setTakeRateBps} placeholder="1000" />
      </div>
      <div className="flex flex-col gap-1">
        <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
          Stake mode
        </span>
        <div className="flex gap-2">
          {(["variable", "fixed"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setStakeMode(m)}
              className="cursor-pointer"
              style={{
                fontFamily: "'Clash Display', sans-serif",
                fontSize: "0.72rem",
                fontWeight: 600,
                padding: "5px 14px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: stakeMode === m ? "var(--ui-accent)" : "transparent",
                color: stakeMode === m ? "var(--ui-accent-contrast)" : "var(--muted-foreground)",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      {stakeMode === "variable" ? (
        <div className="grid grid-cols-3 gap-2">
          <FormInput label="Min stake (USDC)" value={minStake} onChange={setMinStake} placeholder="1" />
          <FormInput label="Max stake (USDC)" value={maxStake} onChange={setMaxStake} placeholder="500" />
          <FormInput label="Cap multiple" value={capMultiple} onChange={setCapMultiple} placeholder="100" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <FormInput label="Fixed stake (USDC)" value={fixedStake} onChange={setFixedStake} placeholder="10" />
          <FormInput label="Cap multiple" value={capMultiple} onChange={setCapMultiple} placeholder="100" />
        </div>
      )}
    </>
  );
}

interface UpcomingFixture {
  fixtureId: string;
  kickoffAt: string;
  status: string;
  homeTeam: string;
  awayTeam: string;
}

function CreateMarketForm({ onCreated, listed }: { onCreated: () => void; listed: Set<string> }) {
  const [openForm, setOpenForm] = useState(false);
  const [kind, setKind] = useState<"scoreline" | "player_points">("scoreline");
  // Score markets are picked from kickoff-data's fixture list, never typed:
  // the server fills teams/kickoff/gameweek and refuses a second live market.
  const [fixtures, setFixtures] = useState<UpcomingFixture[] | null>(null);
  const [fixtureErr, setFixtureErr] = useState<string | null>(null);
  const [fixtureId, setFixtureId] = useState("");
  const [title, setTitle] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [kickoffAt, setKickoffAt] = useState("");
  // Knobs
  const [gamma, setGamma] = useState("3");
  const [stakeMode, setStakeMode] = useState<"variable" | "fixed">("fixed");
  const [minStake, setMinStake] = useState("1");
  const [maxStake, setMaxStake] = useState("500");
  const [fixedStake, setFixedStake] = useState("10");
  const [takeRateBps, setTakeRateBps] = useState("1000");
  const [capMultiple, setCapMultiple] = useState("100");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Convert human-readable USDC to base units (6 decimals)
  const usdcToBase = (v: string) => String(Math.round(Number(v) * 1_000_000));

  useEffect(() => {
    if (!openForm || kind !== "scoreline" || fixtures !== null) return;
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 21 * 24 * 3600_000).toISOString().slice(0, 10);
    fetch(`/api/fixtures?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d: { fixtures?: UpcomingFixture[]; error?: string }) => {
        if (d.error) throw new Error(d.error);
        setFixtures((d.fixtures ?? []).filter((f) => f.status === "scheduled" && Date.parse(f.kickoffAt) > Date.now()));
      })
      .catch((e) => setFixtureErr((e as Error).message));
  }, [openForm, kind, fixtures]);

  const available = (fixtures ?? []).filter((f) => !listed.has(f.fixtureId));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setErr(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        kind,
        gamma: Number(gamma),
        stakeMode,
        minStake: usdcToBase(minStake),
        maxStake: usdcToBase(maxStake),
        takeRateBps: Number(takeRateBps),
        capMultiple: Number(capMultiple),
      };
      if (stakeMode === "fixed") body.fixedStake = usdcToBase(fixedStake);
      if (kind === "scoreline") {
        body.dataFixtureId = fixtureId;
      } else {
        body.title = title;
        body.kickoffAt = new Date(kickoffAt).toISOString();
        body.playerName = playerName;
      }
      await adminApi("/api/admin/markets", { method: "POST", body: JSON.stringify(body) });
      setTitle(""); setPlayerName(""); setKickoffAt(""); setFixtureId(""); setFixtures(null);
      setOpenForm(false);
      onCreated();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!openForm) {
    return (
      <Button3D color="accent" size="sm" onClick={() => setOpenForm(true)}>
        + New market
      </Button3D>
    );
  }

  return (
    <form onSubmit={submit} className="glass card-diagonal px-5 py-5 flex flex-col gap-3" style={{ maxWidth: 600 }}>
      <div className="flex items-center gap-2">
        {(["scoreline", "player_points"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className="cursor-pointer"
            style={{
              fontFamily: "'Clash Display', sans-serif",
              fontSize: "0.72rem",
              fontWeight: 600,
              padding: "5px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: kind === k ? "var(--ui-accent)" : "transparent",
              color: kind === k ? "var(--ui-accent-contrast)" : "var(--muted-foreground)",
            }}
          >
            {k === "scoreline" ? "Score" : "Player points"}
          </button>
        ))}
      </div>
      {kind === "scoreline" ? (
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
            Fixture (EPL, from kickoff-data)
          </span>
          <select
            value={fixtureId}
            onChange={(e) => setFixtureId(e.target.value)}
            required
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: "0.85rem" }}
          >
            <option value="">
              {fixtureErr ? `Couldn't load fixtures: ${fixtureErr}` : fixtures === null ? "Loading fixtures…" : available.length ? "Pick a fixture" : "Every upcoming fixture is already listed"}
            </option>
            {available.map((f) => (
              <option key={f.fixtureId} value={f.fixtureId}>
                {fmtKickoff(f.kickoffAt)} · {f.homeTeam} vs {f.awayTeam}
              </option>
            ))}
          </select>
          <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
            Teams, kickoff and gameweek come from the fixture. Already-listed fixtures are hidden.
          </span>
        </label>
      ) : (
        <>
          <FormInput label="Title" value={title} onChange={setTitle} placeholder="Erling Haaland points" required />
          <FormInput label="Player name" value={playerName} onChange={setPlayerName} placeholder="Erling Haaland" required />
          <FormInput label="Kickoff (local)" value={kickoffAt} onChange={setKickoffAt} type="datetime-local" required />
        </>
      )}
      <p style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-foreground)", marginTop: 4 }}>
        Market knobs
      </p>
      <KnobFields
        gamma={gamma} setGamma={setGamma}
        stakeMode={stakeMode} setStakeMode={setStakeMode}
        minStake={minStake} setMinStake={setMinStake}
        maxStake={maxStake} setMaxStake={setMaxStake}
        fixedStake={fixedStake} setFixedStake={setFixedStake}
        takeRateBps={takeRateBps} setTakeRateBps={setTakeRateBps}
        capMultiple={capMultiple} setCapMultiple={setCapMultiple}
      />
      {err && <p style={{ color: "var(--destructive)", fontSize: "0.78rem" }}>{err}</p>}
      <div className="flex items-center gap-3">
        <Button3D color="accent" size="sm" type="submit" disabled={saving}>
          {saving ? "Creating…" : "Create draft"}
        </Button3D>
        <button type="button" onClick={() => setOpenForm(false)} className="cursor-pointer" style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", background: "none", border: "none" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Invites ───────────────────────────────────────────────────────────────────

function InvitesTab() {
  const { data, error, reload } = useAdminData<InviteData>("/api/admin/invites");
  const [count, setCount] = useState("5");
  const [note, setNote] = useState("");
  const [minting, setMinting] = useState(false);
  const [freshCodes, setFreshCodes] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function mint(waitlistIds?: number[]) {
    if (minting) return;
    setErr(null);
    setMinting(true);
    try {
      const body = waitlistIds ? { waitlistIds, note: note || undefined } : { count: Number(count), note: note || undefined };
      const res = await adminApi<{ codes: { code: string }[] }>("/api/admin/invites", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setFreshCodes(res.codes.map((c) => c.code));
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setMinting(false);
    }
  }

  if (error) return <ErrorNote text={error} />;
  if (!data) return <Loading />;

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Waitlist signups" value={data.stats.signups} />
        <StatTile label="Invited" value={data.stats.invited} />
        <StatTile label="Codes minted" value={data.stats.codesMinted} />
        <StatTile label="Codes redeemed" value={data.stats.codesRedeemed} />
      </section>

      <section className="glass card-diagonal px-5 py-5 flex flex-col gap-3" style={{ maxWidth: 560 }}>
        <SectionTitle>Mint codes</SectionTitle>
        <div className="flex items-end gap-2">
          <FormInput label="Count" value={count} onChange={setCount} width={80} />
          <FormInput label="Note (wave name)" value={note} onChange={setNote} placeholder="wave-1" />
          <Button3D color="accent" size="sm" onClick={() => mint()} disabled={minting}>
            {minting ? "Minting…" : "Mint"}
          </Button3D>
        </div>
        {err && <p style={{ color: "var(--destructive)", fontSize: "0.78rem" }}>{err}</p>}
        {freshCodes.length > 0 && (
          <div className="glass-dark card-diagonal-sm px-4 py-3" style={{ background: "var(--muted)" }}>
            <p style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 6 }}>
              Fresh codes, copy now
            </p>
            <div className="flex flex-wrap gap-2">
              {freshCodes.map((c) => (
                <code
                  key={c}
                  className="cursor-pointer"
                  onClick={() => navigator.clipboard?.writeText(c)}
                  title="Click to copy"
                  style={{ fontFamily: "'Clash Display', sans-serif", fontSize: "0.8rem", fontWeight: 600, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)" }}
                >
                  {c}
                </code>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Waitlist</SectionTitle>
        <SimpleTable
          head={["Email", "Joined", "Invited", ""]}
          rows={data.signups.map((s) => [
            s.email,
            new Date(s.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
            s.invitedAt ? "✓" : "-",
            <ActionBtn key={s.id} disabled={minting || !!s.invitedAt} onClick={() => mint([s.id])}>
              Mint for
            </ActionBtn>,
          ])}
        />
      </section>

      <section>
        <SectionTitle>Codes</SectionTitle>
        <SimpleTable
          head={["Code", "Note", "State", "Created"]}
          rows={data.codes.slice(0, 100).map((c) => [
            <code key={c.id} style={{ fontFamily: "'Clash Display', sans-serif", fontSize: "0.78rem" }}>{c.code}</code>,
            c.note ?? "-",
            c.redeemedAt ? "redeemed" : "unused",
            new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
          ])}
        />
      </section>
    </div>
  );
}

// ── Small shared pieces ───────────────────────────────────────────────────────

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.05rem", fontWeight: 600, marginBottom: 12 }}>{children}</h3>
  );
}

function Loading() {
  return <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)" }}>Loading…</p>;
}

function ErrorNote({ text }: { text: string }) {
  return <p style={{ fontSize: "0.85rem", color: "var(--destructive)" }}>{text}</p>;
}

function ActionBtn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer"
      style={{
        fontFamily: "'Clash Display', sans-serif",
        fontSize: "0.7rem",
        fontWeight: 600,
        padding: "5px 12px",
        borderRadius: 8,
        border: `1px solid ${danger ? "var(--destructive)" : "var(--border)"}`,
        background: "transparent",
        color: danger ? "var(--destructive)" : "var(--foreground)",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

function MiniInput({ value, onChange, placeholder, width }: { value: string; onChange: (v: string) => void; placeholder: string; width: number }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode="numeric"
      style={{
        width,
        padding: "5px 8px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--input-background)",
        color: "var(--foreground)",
        fontSize: "0.78rem",
        outline: "none",
        textAlign: "center",
      }}
    />
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  width,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  width?: number;
}) {
  return (
    <label className="flex flex-col gap-1" style={{ flex: width ? undefined : 1, width }}>
      <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "9px 12px",
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--input-background)",
          color: "var(--foreground)",
          fontSize: "0.85rem",
          outline: "none",
        }}
      />
    </label>
  );
}

function SimpleTable({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
  if (rows.length === 0) return <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>Nothing yet.</p>;
  return (
    <div className="glass card-diagonal-sm" style={{ overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-2.5 text-left" style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
              {r.map((c, j) => (
                <td key={j} className="px-4 py-2.5">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
