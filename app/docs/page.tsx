import type { Metadata } from "next";
import { DocsPage } from "@/ui/docs/DocsPage";

export const metadata: Metadata = {
  title: "Docs | Kickoff",
  description:
    "How Kickoff proximity markets work: scoring, payouts, fees, settlement integrity, and why closeness beats yes/no.",
};

export default function Docs() {
  return <DocsPage />;
}
