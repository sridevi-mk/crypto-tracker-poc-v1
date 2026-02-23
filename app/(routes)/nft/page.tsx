"use client";

import Link from "next/link";

const FEATURES = [
  {
    title: "NFT Marketplace",
    detail: "Buy, sell, and track NFT assets tied to project utilities.",
  },
  {
    title: "Collectibles",
    detail: "Curated collectible drops for community engagement and rewards.",
  },
  {
    title: "Premium Signal Passes",
    detail: "NFT-based access to advanced analytics and premium AI insights.",
  },
];

export default function NftPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 rounded-2xl border border-border bg-panel p-6 shadow-panel">
        <div className="mb-3">
          <Link
            href="/"
            className="inline-flex items-center rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
            title="Return to the main market overview page"
          >
            Back to Main Page
          </Link>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">NFT Section</h1>
        <p className="mt-2 text-sm text-mist">
          This area will host NFT-related utilities for the CryptoTracker ecosystem.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {FEATURES.map((feature) => (
          <section key={feature.title} className="rounded-xl border border-border bg-panel p-4 shadow-panel">
            <div className="mb-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              Planned
            </div>
            <h2 className="text-lg font-semibold text-ink">{feature.title}</h2>
            <p className="mt-2 text-sm text-mist">{feature.detail}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
