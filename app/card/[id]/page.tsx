import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { loadPnlCard } from "@/lib/pnlCardData";
import type { PnlCardView } from "@/lib/pnlCard";

/**
 * Public share page for a settled position's PnL card — /card/:positionId.
 * Deliberately outside the invite gate: this is the URL people paste into
 * X / WhatsApp / Telegram, and those crawlers need its og:image (the card).
 */

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  const positionId = Number(id);
  if (!Number.isInteger(positionId) || positionId <= 0) return null;
  const card = await loadPnlCard(positionId);
  return card.ok ? { ...card, positionId } : null;
}

async function origin() {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const signed = (v: PnlCardView) => `${v.sign}${v.amount}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const card = await load((await params).id);
  if (!card) return { title: "Kickoff" };
  const { view } = card;
  const who = card.agentName ? `${card.agentName} (agent)` : null;
  const title = `${who ? `${who}: ` : ""}${signed(view)} on ${view.headline} | Kickoff`;
  const description = `Called ${view.prediction}, finished ${view.result}. Ranked #${view.rank} of ${view.of} on Kickoff.`;
  const image = { url: `${await origin()}/api/positions/${card.positionId}/card`, width: 1200, height: 675, alt: title };
  return {
    title,
    description,
    openGraph: { title, description, images: [image], type: "website", siteName: "Kickoff" },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function CardPage({ params }: Props) {
  const card = await load((await params).id);
  if (!card) notFound();
  const { view } = card;

  return (
    <main style={{ minHeight: "100vh", background: "#000", color: "#fff" }} className="flex flex-col items-center px-4 py-8">
      {/* The app theme paints body cream; this page is always black. */}
      <style>{"body{background:#000}"}</style>
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-6" style={{ maxWidth: 960 }}>
        <img
          src={`/api/positions/${card.positionId}/card?w=2000`}
          alt={`${signed(view)} on ${view.headline}: called ${view.prediction}, finished ${view.result}, rank ${view.rank} of ${view.of}`}
          width={2000}
          height={1125}
          style={{ width: "100%", height: "auto", display: "block" }}
        />
        {card.agentName && (
          <p style={{ fontSize: "0.85rem", color: "#bdbdbd" }}>
            Called by <strong style={{ color: "#fff" }}>{card.agentName}</strong>, a prediction agent on Kickoff.
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href={`/markets/${card.marketId}`}
            style={{ padding: "10px 18px", borderRadius: 8, background: "rgba(255,255,255,0.12)", color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}
          >
            See the market
          </Link>
          <Link
            href="/waitlist"
            style={{ padding: "10px 18px", borderRadius: 8, background: "#02F007", color: "#000", fontWeight: 700, fontSize: "0.85rem" }}
          >
            Play on Kickoff
          </Link>
        </div>
      </div>
    </main>
  );
}
