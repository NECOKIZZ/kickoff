"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Hex } from "viem";
import { Check, HelpCircle, X } from "lucide-react";
import { Button3D } from "@/ui/Button3D";
import { useAuth } from "@/ui/auth/useAuth";
import { api } from "@/ui/clientApi";
import { MOCKUSDC_ADDRESS } from "@/lib/chainConfig";
import { tusdcBalance } from "@/ui/chain/escrowTx";

/**
 * Beginner checklist: five steps from sign-in to the leaderboard. Opens by
 * itself on a first visit, reopens from the "?" in the header. Steps tick
 * themselves off when we can see they happened (signed in, wallet funded,
 * a stake placed, a market settled); the rest can be marked done by hand.
 */

type StepId = "signin" | "funds" | "stake" | "settle" | "leaderboard";

const STEPS: { id: StepId; title: string; body: string }[] = [
  { id: "signin", title: "Sign in", body: "Use your email or a wallet. If you don't have a wallet, we make one for you." },
  { id: "funds", title: "Get test funds", body: "Claim free test USDC to try everything. It's play money, not real." },
  { id: "stake", title: "Call a score", body: "Open a match, pick a scoreline like 2-1 and stake before kickoff. You can change your pick until it locks." },
  { id: "settle", title: "Watch it settle", body: "Close picks still pay. Follow your stakes in My Positions and claim winnings after full time." },
  { id: "leaderboard", title: "Climb the leaderboard", body: "Settle 5 markets to enter the season rankings. The top 10 share the Season Accumulator." },
];

const DONE_KEY = "kickoff-guide-done";
const HIDE_KEY = "kickoff-guide-hidden"; // "Don't show again"
const SEEN_KEY = "kickoff-guide-seen"; // closed this session

const OPEN_EVENT = "kickoff:open-guide";

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}
function write(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value);
  } catch {}
}
const local = () => localStorage;
const session = () => sessionStorage;

/** Header button that reopens the guide from anywhere in the app. */
export function GuideButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      aria-label="Getting started guide"
      title="Getting started"
      className="flex items-center justify-center shrink-0 cursor-pointer"
      style={{
        width: 34,
        height: 34,
        background: "var(--muted)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        color: "var(--foreground)",
      }}
    >
      <HelpCircle size={15} />
    </button>
  );
}

export function GettingStarted() {
  const router = useRouter();
  const { ready, address, signIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState<Set<StepId>>(new Set());
  const [auto, setAuto] = useState<Set<StepId>>(new Set());
  const [busy, setBusy] = useState<StepId | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Restore hand-ticked steps, and open on a first visit.
  useEffect(() => {
    try {
      setManual(new Set(JSON.parse(read(local, DONE_KEY) ?? "[]") as StepId[]));
    } catch {}
    if (!read(local, HIDE_KEY) && !read(session, SEEN_KEY)) setOpen(true);
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // Detect what's already happened whenever the guide is on screen.
  const detect = useCallback(async () => {
    if (!address) return setAuto(new Set());
    const found = new Set<StepId>(["signin"]);
    const [bal, pos] = await Promise.all([
      MOCKUSDC_ADDRESS ? tusdcBalance(address as Hex).catch(() => null) : null,
      api<{ positions: { position: { isWinner: boolean | null } }[] }>(`/api/users/${address}/positions`).catch(
        () => null,
      ),
    ]);
    if (bal !== null && bal > 0n) found.add("funds");
    if (pos && pos.positions.length > 0) {
      found.add("funds");
      found.add("stake");
      if (pos.positions.some((p) => p.position.isWinner !== null)) found.add("settle");
    }
    setAuto(found);
  }, [address]);

  useEffect(() => {
    if (open && ready) void detect();
  }, [open, ready, detect]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const isDone = (id: StepId) => auto.has(id) || manual.has(id);
  const doneCount = STEPS.filter((s) => isDone(s.id)).length;
  const current = STEPS.find((s) => !isDone(s.id))?.id ?? null;

  const setManualDone = (id: StepId, done: boolean) => {
    setManual((prev) => {
      const next = new Set(prev);
      if (done) next.add(id);
      else next.delete(id);
      write(local, DONE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  function close() {
    write(session, SEEN_KEY, "1");
    setOpen(false);
    setNote(null);
  }

  const dontShowAgain = () => {
    write(local, HIDE_KEY, "1");
    close();
  };

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const run = async (id: StepId) => {
    setNote(null);
    switch (id) {
      case "signin":
        signIn();
        return;
      case "funds":
        if (!address) {
          setNote("Sign in first, then claim your test funds.");
          return;
        }
        setBusy("funds");
        try {
          await api("/api/faucet", { method: "POST" });
          setManualDone("funds", true);
          void detect();
        } catch (e) {
          const msg = (e as Error).message;
          // Already claimed today still means the wallet has been funded.
          if (/already topped up/i.test(msg)) setManualDone("funds", true);
          else setNote(msg);
        } finally {
          setBusy(null);
        }
        return;
      case "stake":
        return go("/markets");
      case "settle":
        return go("/positions");
      case "leaderboard":
        setManualDone("leaderboard", true);
        return go("/leaderboard");
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
      onClick={close}
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-diagonal w-full flex flex-col overflow-hidden"
        style={{
          maxWidth: 520,
          maxHeight: "100%",
          background: "var(--background)",
          color: "var(--foreground)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div
          className="relative px-6 sm:px-8 pt-6 pb-5"
          style={{
            background:
              "radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--ui-accent) 14%, transparent), transparent 60%)",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--muted-foreground)",
              }}
            >
              {doneCount} of {STEPS.length} done
            </span>
            <button
              onClick={close}
              aria-label="Close"
              className="cursor-pointer -mr-2 -mt-1 p-1.5"
              style={{ color: "var(--muted-foreground)", background: "none", border: "none" }}
            >
              <X size={18} />
            </button>
          </div>
          <h2 id="guide-title" style={{ fontSize: "clamp(1.75rem, 5vw, 2.1rem)", marginTop: 8 }}>
            Getting started
          </h2>
          <p style={{ marginTop: 6, fontSize: "0.95rem", color: "var(--muted-foreground)", lineHeight: 1.5 }}>
            Five steps from sign-in to your first payout. Kickoff is on testnet, so everything here uses play money.
          </p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={STEPS.length}
            aria-valuenow={doneCount}
            style={{ marginTop: 18, height: 4, borderRadius: 99, background: "var(--muted)", overflow: "hidden" }}
          >
            <div
              style={{
                width: `${(doneCount / STEPS.length) * 100}%`,
                height: "100%",
                background: "var(--ui-accent)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* Steps */}
        <ol className="overflow-y-auto px-6 sm:px-8" style={{ borderTop: "1px solid var(--border)" }}>
          {STEPS.map((s, i) => {
            const done = isDone(s.id);
            const active = s.id === current;
            const locked = auto.has(s.id); // detected, so there's nothing to undo
            return (
              <li
                key={s.id}
                className="flex items-start gap-4 py-4"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
              >
                <span
                  className="flex items-center justify-center shrink-0"
                  aria-hidden
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 99,
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    marginTop: 1,
                    background: done ? "var(--ui-accent)" : active ? "transparent" : "var(--muted)",
                    color: done ? "var(--ui-accent-contrast)" : active ? "var(--foreground)" : "var(--muted-foreground)",
                    border: active ? "1.5px solid var(--foreground)" : "1.5px solid transparent",
                  }}
                >
                  {done ? <Check size={15} strokeWidth={3} /> : i + 1}
                </span>

                <div className="flex-1 min-w-0" style={{ paddingTop: 4 }}>
                  <div
                    style={{
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: done ? "var(--muted-foreground)" : "var(--foreground)",
                    }}
                  >
                    {s.title}
                    <span className="sr-only">{done ? " (done)" : ""}</span>
                  </div>
                  {active && (
                    <p style={{ marginTop: 4, fontSize: "0.86rem", lineHeight: 1.5, color: "var(--muted-foreground)" }}>
                      {s.body}
                    </p>
                  )}
                  {active && note && (
                    <p style={{ marginTop: 6, fontSize: "0.8rem", color: "var(--destructive)" }}>{note}</p>
                  )}
                </div>

                <div className="shrink-0" style={{ paddingTop: active ? 2 : 3 }}>
                  {active ? (
                    <Button3D size="sm" color="accent" onClick={() => run(s.id)} disabled={busy === s.id}>
                      {busy === s.id ? "Claiming…" : s.id === "signin" ? "Sign in" : s.id === "funds" ? "Claim" : "Open"}
                    </Button3D>
                  ) : done ? (
                    !locked && (
                      <button
                        onClick={() => setManualDone(s.id, false)}
                        className="cursor-pointer"
                        style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", background: "none", border: "none" }}
                      >
                        Undo
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => setManualDone(s.id, true)}
                      className="cursor-pointer"
                      style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", background: "none", border: "none" }}
                    >
                      Mark done
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-3 px-6 sm:px-8 py-4"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={dontShowAgain}
            className="cursor-pointer"
            style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", background: "none", border: "none" }}
          >
            Don&apos;t show again
          </button>
          <button
            onClick={close}
            className="cursor-pointer"
            style={{
              fontSize: "0.85rem",
              padding: "8px 20px",
              borderRadius: 99,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--foreground)",
            }}
          >
            {current ? "Close" : "All done"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
