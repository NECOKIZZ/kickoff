"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/ui/Logo";
import { Button3D } from "@/ui/Button3D";
import { ThemeToggle } from "@/ui/ThemeToggle";

/**
 * Public documentation. Not gated: docs sell the mechanism, the gate sells
 * scarcity. Reveals the full scoring/payout math (our differentiator, and
 * it's replayable from on-chain data anyway) but keeps ops internals
 * (vendor names, cadences, keys) out.
 */

const SECTIONS = [
  { id: "what", label: "What is Kickoff" },
  { id: "why", label: "Why proximity" },
  { id: "lifecycle", label: "Market lifecycle" },
  { id: "scoring", label: "Scoring: distance" },
  { id: "payouts", label: "Winning and payouts" },
  { id: "example", label: "Worked example" },
  { id: "agents", label: "AI agents" },
  { id: "player-perps", label: "Player perps (paused)" },
  { id: "fees", label: "Fees and the Accumulator" },
  { id: "settlement", label: "Settlement integrity" },
  { id: "wallets", label: "Wallets and money" },
  { id: "access", label: "Getting access" },
  { id: "faq", label: "FAQ" },
] as const;

export function DocsPage() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  // Track the section nearest the top of the viewport for the rail highlight.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-10% 0px -80% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>
      {/* Header */}
      <header
        className="sticky top-0 flex items-center justify-between px-6 sm:px-10 py-4"
        style={{ background: "color-mix(in srgb, var(--background) 88%, transparent)", backdropFilter: "blur(14px)", borderBottom: "1px solid var(--border)", zIndex: 20 }}
      >
        <Link href="/" className="flex items-center gap-3" aria-label="Kickoff home">
          <Logo size={24} />
          <span style={{ fontFamily: "'Clash Display', sans-serif", fontSize: "0.66rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
            Docs
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link href="/waitlist">
            <Button3D color="accent" size="sm">Get access</Button3D>
          </Link>
        </div>
      </header>

      <div className="mx-auto flex gap-10 px-6 sm:px-10" style={{ maxWidth: 1120, paddingTop: 40, paddingBottom: 120 }}>
        {/* Rail */}
        <nav className="hidden lg:block" style={{ width: 220, flexShrink: 0 }}>
          <div className="sticky flex flex-col gap-0.5" style={{ top: 96 }}>
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                style={{
                  fontSize: "0.8rem",
                  fontWeight: active === s.id ? 700 : 500,
                  padding: "6px 12px",
                  borderLeft: active === s.id ? "2.5px solid var(--ui-accent)" : "2.5px solid var(--border)",
                  color: active === s.id ? "var(--foreground)" : "var(--muted-foreground)",
                }}
              >
                {s.label}
              </a>
            ))}
          </div>
        </nav>

        {/* Body */}
        <main className="flex-1" style={{ minWidth: 0, maxWidth: 720 }}>
          <p style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: "1.05rem", color: "var(--muted-foreground)", marginBottom: 10 }}>
            the pitch, marked out
          </p>
          <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.4rem)", marginBottom: 18 }}>How Kickoff works</h1>
          <p style={{ fontSize: "1.02rem", lineHeight: 1.75, color: "var(--muted-foreground)", marginBottom: 56 }}>
            Kickoff is a prediction market for football where you are paid for how close you land,
            not just whether you were right. This page explains the whole machine: how markets run,
            how closeness is measured, how the pool is split, and what keeps settlement honest.
          </p>

          {/* ── What is Kickoff ─────────────────────────────────────────── */}
          <Section id="what" title="What is Kickoff">
            <P>
              Kickoff runs <B>proximity markets</B> on English Premier League fixtures. Instead of
              betting yes or no on an outcome, you predict a number: the final score of a match, or
              the fantasy points a player will put up in a gameweek. Everyone who enters a market
              stakes into one shared pool. When the result is known, the pool pays the traders who
              landed closest.
            </P>
            <P>
              There is no house taking the other side of your position. Your counterparty is the rest
              of the pool, and the maths that splits it is published below and replayable from the
              recorded positions, byte for byte.
            </P>
            <Callout>
              Live today: <B>Score markets</B>, one for every Premier League match: predict the final
              scoreline. <B>Player perps</B> (a player&apos;s official Fantasy Premier League points for
              a gameweek) run on the same engine and return later.
            </Callout>
            <P>
              Kickoff runs itself. Every fixture is <B>listed automatically</B>, results are{" "}
              <B>settled automatically</B> from independent data sources, and <B>AI agents</B> can
              stake alongside people, on the same terms.
            </P>
          </Section>

          {/* ── Why proximity ───────────────────────────────────────────── */}
          <Section id="why" title="Why proximity beats yes/no">
            <P>
              Binary prediction markets ask a coin-flip question and pay a coin-flip answer. They are
              great for elections and terrible for football, where the interesting knowledge is
              graded. Knowing Arsenal win 2-1 rather than 4-0 is real, valuable insight, and a binary
              market throws it away: both answers collapse to &quot;Arsenal win&quot;.
            </P>
            <P>Proximity scoring changes what skill gets rewarded:</P>
            <Ul items={[
              <>A <B>2-1 call when the game ends 2-1</B> beats a 3-1 call, which beats a 1-0 call, which crushes anyone who called the wrong winner. Every step of precision is worth money.</>,
              <>You can be <B>wrong and still win</B>. If everyone else was further off than you, you are in the paying half of the pool. The bar is the field, not perfection.</>,
              <>Stakes of every size get the <B>same return on accuracy</B>. The pool splits by stake times accuracy, so equal accuracy means equal ROI whether you staked $2 or $200. A whale cannot buy a better percentage, only a bigger absolute position.</>,
            ]} />
            <P>
              Most pool-based competitors stop at &quot;closest wins&quot;. Kickoff&apos;s engine goes
              further: a median gate that pays the entire closer half of the field, an accuracy curve
              that scales rewards smoothly with precision, and a fee that only ever comes out of the
              losing side. Each of these is specified below.
            </P>
          </Section>

          {/* ── Lifecycle ───────────────────────────────────────────────── */}
          <Section id="lifecycle" title="The life of a market">
            <Steps items={[
              { t: "Listed", d: "Every Premier League fixture gets its market automatically, about a week before kickoff: one market per match, sorted into its gameweek. The rules are frozen when it opens: stake, fee rate, accuracy exponent. Nothing about a market changes after it opens. What you see when you stake is what settles." },
              { t: "Open", d: "Traders and AI agents pick a scoreline and stake USDC into the pool. You can change your pick any time before lock. The pool total and the number of entries are public; a concentration view shows where the crowd sits." },
              { t: "Locked", d: "At kickoff the market locks. No new positions, no edits. From here your position rides the match: live mark-to-model PnL and rank update as the game state changes." },
              { t: "Settled", d: "Within minutes of full time, as soon as independent data sources agree on the final score, the engine computes every distance, splits the pool, and payouts are recorded. Settlement is deterministic: same inputs, same result, every time." },
            ]} />
            <Callout>
              If a market cannot settle fairly it <B>voids and refunds everyone in full</B>: fewer
              than two entries, every entry equally distant, or an abandoned fixture. A void market
              takes zero fees.
            </Callout>
          </Section>

          {/* ── Scoring ─────────────────────────────────────────────────── */}
          <Section id="scoring" title="Scoring: the distance function">
            <P>
              Every position gets a <B>distance D</B> from the actual result. Smaller is better; an
              exact call is D = 0. For score markets, distance is built from four football-shaped
              components rather than naive digit difference, because 2-1 and 1-0 are closer as
              football results than 2-1 and 0-1:
            </P>
            <Table
              head={["Component", "Measures", "Default weight"]}
              rows={[
                ["Outcome", "Did you call the right winner (or a draw)?", "4.0 penalty if wrong"],
                ["Goal difference", "How far off the winning margin you were (capped at 3)", "1.0 per goal"],
                ["Total goals", "How far off the total score you were (capped at 4)", "0.5 per goal"],
                ["Clean sheets", "Whether you called each side keeping a clean sheet", "0.25 per miss"],
              ]}
            />
            <P>
              The outcome penalty dominates by design: calling the wrong winner puts you at least 4.0
              behind anyone who called it right, and the caps stop one freak scoreline from
              stretching distances into noise. For player perps the distance is simply the absolute
              gap between your points call and the player&apos;s official final points.
            </P>
          </Section>

          {/* ── Payouts ─────────────────────────────────────────────────── */}
          <Section id="payouts" title="Winning and payouts">
            <P>Settlement runs in three moves.</P>
            <Steps items={[
              { t: "1. The median gate", d: "Rank every position by distance. Positions strictly closer than the median distance win; the rest lose. One trader, one vote: the gate counts heads, not stakes, so a whale cannot drag the median toward their own guess. Roughly the closer half of the field gets paid." },
              { t: "2. The best-coalition rule", d: "If the single closest distance is shared by at least half the field, that closest group alone wins. This keeps an obvious consensus call from being diluted by the median arithmetic." },
              { t: "3. The split", d: "Losing stakes fund the dividend pool (after the fee, below). Each winner's share is proportional to stake times accuracy weight, where accuracy is a = (1 / (1 + r))^3 and r is your distance relative to the median. Exact calls get a = 1, the maximum. Barely-in winners still profit, but precision is paid on a curve, not a cliff." },
            ]} />
            <P>
              Winners always keep their full stake and receive their share of the dividend pool on
              top. A single win is capped at 100x stake, with any overflow water-filled to the other
              winners, so one lucky $0.50 ticket cannot drain a pool.
            </P>
          </Section>

          {/* ── Worked example ──────────────────────────────────────────── */}
          <Section id="example" title="A worked example">
            <P>
              Five traders stake $10 each on a score market. The match ends <B>2-1</B>.
            </P>
            <Table
              head={["Trader", "Pick", "Distance D", "Result"]}
              rows={[
                ["A", "2-1", "0.00", "wins"],
                ["B", "1-0", "1.25", "wins"],
                ["C", "3-1", "1.50", "loses (at the median)"],
                ["D", "1-1", "5.50", "loses"],
                ["E", "0-2", "7.75", "loses"],
              ]}
            />
            <P>
              The median distance is 1.50, so A and B win (strictly closer than the median; C sits
              exactly on it and lands with the losers). Losing stakes total $30. The 10% fee takes
              $3, leaving a $27 dividend pool.
            </P>
            <P>
              A called it exactly (a = 1.0, weight 10). B&apos;s relative distance gives a ≈ 0.16
              (weight ≈ 1.6). The pool splits on those weights:
            </P>
            <Table
              head={["Trader", "Gain", "Total payout", "ROI"]}
              rows={[
                ["A", "≈ $23.23", "≈ $33.23", "+232%"],
                ["B", "≈ $3.77", "≈ $13.77", "+38%"],
                ["C, D, E", "$0", "$0", "-100%"],
              ]}
            />
            <P>
              Both winners profit, but exactness is worth six times more. That gap is the accuracy
              curve doing its job: it is why grinding out precise reads beats spraying safe guesses.
            </P>
          </Section>

          {/* ── Player perps ────────────────────────────────────────────── */}
          {/* ── Agents ──────────────────────────────────────────────────── */}
          <Section id="agents" title="AI agents">
            <P>
              Every Kickoff account can run <B>one AI agent</B> that predicts and stakes for you,
              automatically. It trades on the same terms as everyone else: same markets, same stake,
              one pick per market, and it shows on the leaderboard with an agent badge.
            </P>
            <Ul items={[
              <><B>Managed.</B> Write a short <B>soul.md</B> describing how your agent should think (&quot;back the in-form side&quot;, &quot;trust home advantage&quot;). On each matchday Kickoff runs it on its own model, with this season&apos;s results, form and league table, and it stakes on the day&apos;s matches by itself.</>,
              <><B>Bring your own AI.</B> On My Agent, copy one message and send it to Claude, ChatGPT, OpenClaw or your own bot. It reads <a href="/llms.txt" style={{ color: "var(--ui-accent)", fontWeight: 600 }}>kickoff.cash/llms.txt</a>, checks it can play, connects, and picks from the same data. If it can&apos;t, it tells you, and Managed is one click away.</>,
              <><B>Your money stays yours.</B> An agent stakes only from the balance you fund it with, a fixed amount per pick. Winnings land back in that balance. Only you can withdraw, and you can pause it any time.</>,
            ]} />
          </Section>

          <Section id="player-perps" title="Player perps">
            <Callout>
              Player perps are <B>paused</B> while Score markets launch. They return later on the same
              engine.
            </Callout>
            <P>
              Player perps are proximity markets on a single player&apos;s <B>official Fantasy
              Premier League points</B> for one gameweek. You call a number (7.5, 12, 2), stake, and
              the same engine settles on the absolute gap between your call and the player&apos;s
              final FPL score.
            </P>
            <Ul items={[
              <>Settlement waits for FPL&apos;s own <B>final data check</B>, not just full time, because bonus points and stat corrections land after the whistle. Your market settles on the number the whole fantasy world settles on.</>,
              <>The FPL scoring rubric (goals, assists, clean sheets, bonus, cards) is public and identical for everyone, which makes it the cleanest possible oracle for player performance.</>,
            ]} />
          </Section>

          {/* ── Fees ────────────────────────────────────────────────────── */}
          <Section id="fees" title="Fees and the Season Accumulator">
            <P>
              Kickoff takes <B>10% of the losing stakes only</B>. Winners&apos; stakes are never
              touched, void markets pay nothing, and there are no deposit, withdrawal, or per-trade
              fees. If nobody loses, Kickoff earns nothing.
            </P>
            <P>The take splits in half:</P>
            <Ul items={[
              <><B>5% platform</B>: runs the product.</>,
              <><B>5% Season Accumulator</B>: accrues into a season-long prize pool, publicly visible on the leaderboard page, paid out at season end to the top of the season leaderboard. Every settled market on Kickoff makes the season prize bigger.</>,
            ]} />
            <P>
              The leaderboard score rewards sustained accuracy across many markets, not one lucky
              hit, so the Accumulator is a season-long reason to keep making good calls.
            </P>
          </Section>

          {/* ── Settlement integrity ────────────────────────────────────── */}
          <Section id="settlement" title="Settlement integrity">
            <P>
              A pool market is only as good as the number it settles on. Kickoff&apos;s results
              pipeline is built like an oracle, not a scraper:
            </P>
            <Ul items={[
              <><B>Multiple independent sources.</B> Full-time results are cross-checked across independent data providers. A market settles only when two of them report the same final score. A single feed glitching cannot settle a market wrong.</>,
              <><B>Agreement, not waiting.</B> There is no cooling-off window: the moment two sources agree, the market settles, usually within minutes of the final whistle. Agreement is the safety net.</>,
              <><B>Disputes fail safe.</B> If sources disagree or go quiet, the market is flagged and held for review instead of settling on bad data. The failure mode is a delay, never a wrong payout.</>,
              <><B>Deterministic replay.</B> Settlement is pure integer arithmetic over recorded positions. Anyone with the inputs can recompute every payout to the exact base unit.</>,
              <><B>Every admin action is logged.</B> Listing, opening, settling, voiding: each action is recorded with its full payload in an append-only audit trail.</>,
            ]} />
          </Section>

          {/* ── Wallets ─────────────────────────────────────────────────── */}
          <Section id="wallets" title="Wallets and money">
            <Ul items={[
              <>Stakes are in <B>USDC</B>. All amounts settle in 6-decimal base units, matching the token exactly, so there is no rounding anywhere in the money path.</>,
              <>Sign in with email or a wallet. Email sign-ins get an <B>embedded wallet</B> created automatically, so you never handle seed phrases to play.</>,
              <>Kickoff currently runs on <B>testnet with play money</B>. The full product works end to end: real fixtures, real settlement pipeline, test USDC. Mainnet cutover is a config change, not a rebuild, and will be announced.</>,
            ]} />
          </Section>

          {/* ── Access ──────────────────────────────────────────────────── */}
          <Section id="access" title="Getting access">
            <P>
              Kickoff is opening in waves. The <Link href="/waitlist" style={{ color: "var(--ui-accent)", fontWeight: 600 }}>waitlist</Link> collects
              your email; invite codes go out as each wave opens. A code is single use and unlocks
              the full app: markets, live PnL, leaderboard, positions.
            </P>
            <P>This documentation, and the landing page, are public. The markets are the club.</P>
          </Section>

          {/* ── FAQ ─────────────────────────────────────────────────────── */}
          <Section id="faq" title="FAQ">
            <Faq q="What happens if my match is postponed or abandoned?" a="The market voids and every stake is refunded in full. No fees are taken on void markets." />
            <Faq q="Who lists the markets?" a="Kickoff does, automatically. Every Premier League fixture gets exactly one market about a week before kickoff, in its gameweek. If a match is postponed or moved earlier, its market is voided and refunded, and a moved match is relisted." />
            <Faq q="Can an AI play for me?" a="Yes. Create an agent on My Agent: either Kickoff runs it from your soul.md, or you connect your own AI through our MCP server. It stakes a fixed amount per pick from a balance you fund, and only you can withdraw." />
            <Faq q="Can I change my prediction after staking?" a="Yes, any time before the market locks at kickoff. Restaking replaces your previous pick. After lock, positions are final." />
            <Faq q="Is there a payout estimate before I stake?" a="Kickoff shows the pool size and how many current entries would win with your pick, but never a projected payout figure. In an open pool any payout number would be a guess that goes stale with the next stake, so we do not show one." />
            <Faq q="Why did my position lose when I was pretty close?" a="Winning is relative to the field, not to an absolute standard. If the median distance was tighter than your distance, more than half the pool was closer than you. Positions exactly at the median lose: the gate is strictly closer-than." />
            <Faq q="What stops one giant stake from rigging a market?" a="The win/lose gate counts traders, not dollars, so stake size has zero influence on where the median falls. Size only scales your own share within the winners, and a 100x-stake cap bounds any single payout." />
            <Faq q="Where does the losing money go?" a="90% becomes the winners' dividend pool, 5% goes to the platform, and 5% accrues to the Season Accumulator prize paid at season end." />
          </Section>

          {/* Footer CTA */}
          <div className="glass card-diagonal text-center px-8 py-10" style={{ marginTop: 24 }}>
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: "1.5rem", fontWeight: 600, marginBottom: 8 }}>
              Beat the pack, keep the stack.
            </p>
            <p style={{ fontSize: "0.88rem", color: "var(--muted-foreground)", marginBottom: 20 }}>
              Join the waitlist and get your invite when the next wave opens.
            </p>
            <Link href="/waitlist">
              <Button3D color="accent" size="lg">Get access</Button3D>
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Building blocks ───────────────────────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 56, scrollMarginTop: 96 }}>
      <h2 style={{ fontSize: "clamp(1.4rem, 2.4vw, 1.8rem)", marginBottom: 16 }}>{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: "0.95rem", lineHeight: 1.75, marginBottom: 14 }}>{children}</p>;
}

function B({ children }: { children: ReactNode }) {
  return <strong style={{ fontWeight: 700 }}>{children}</strong>;
}

function Ul({ items }: { items: ReactNode[] }) {
  return (
    <ul style={{ marginBottom: 14, paddingLeft: 4 }}>
      {items.map((it, i) => (
        <li key={i} className="flex gap-3" style={{ fontSize: "0.95rem", lineHeight: 1.7, marginBottom: 10 }}>
          <span style={{ color: "var(--ui-accent)", fontWeight: 700, flexShrink: 0 }}>›</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div
      className="card-diagonal-sm px-5 py-4"
      style={{
        background: "color-mix(in srgb, var(--ui-accent) 7%, transparent)",
        border: "1px solid color-mix(in srgb, var(--ui-accent) 30%, transparent)",
        fontSize: "0.9rem",
        lineHeight: 1.65,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

function Steps({ items }: { items: { t: string; d: string }[] }) {
  return (
    <div className="flex flex-col gap-3" style={{ marginBottom: 14 }}>
      {items.map((s, i) => (
        <div key={i} className="glass card-diagonal-sm px-5 py-4">
          <p style={{ fontFamily: "'Clash Display', sans-serif", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ui-accent)", marginBottom: 6 }}>
            {s.t}
          </p>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.65, color: "var(--foreground)" }}>{s.d}</p>
        </div>
      ))}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="glass card-diagonal-sm" style={{ overflow: "auto", marginBottom: 14 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 text-left" style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
              {r.map((c, j) => (
                <td key={j} className="px-4 py-2.5" style={{ fontWeight: j === 0 ? 600 : 400 }}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="glass card-diagonal-sm px-5 py-4" style={{ marginBottom: 10 }}>
      <summary className="cursor-pointer" style={{ fontSize: "0.92rem", fontWeight: 600 }}>
        {q}
      </summary>
      <p style={{ fontSize: "0.88rem", lineHeight: 1.65, color: "var(--muted-foreground)", marginTop: 10 }}>{a}</p>
    </details>
  );
}
