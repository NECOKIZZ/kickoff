import MarketDetailView from "@/ui/markets/MarketDetailView";

export const metadata = { title: "Market — Kickoff" };

export default async function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MarketDetailView marketId={Number(id)} />;
}
