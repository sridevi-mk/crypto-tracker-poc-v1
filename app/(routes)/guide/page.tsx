"use client";
import Link from "next/link";

export default function GuidePage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="rounded-2xl border border-border bg-panel p-6 shadow-panel">
      <div className="mb-4">
        <Link
          href="/"
          className="inline-flex items-center rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
          title="Return to the main market overview page"
        >
          Back to Main Page
        </Link>
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-ink">CryptoTracker Quick Guide</h1>
      <p className="mt-2 text-sm text-mist">
        This page explains what you are seeing in the app in simple terms.
      </p>

      <h2 className="mt-6 text-xl font-semibold text-ink">Market Overview</h2>
      <p className="mt-2 text-sm text-slate-700">
        The market page shows popular coins and their latest values from CoinGecko.
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
        <li><b>Price:</b> current coin price in USD.</li>
        <li><b>24h %:</b> how much the price changed in the last 24 hours.</li>
        <li><b>Market Cap:</b> estimated total value of all circulating coins.</li>
        <li><b>Volume:</b> how much was traded in the last 24 hours.</li>
      </ul>

      <h2 className="mt-6 text-xl font-semibold text-ink">Top Gainer / Top Loser</h2>
      <p className="mt-2 text-sm text-slate-700">
        Top gainer is the strongest 24h performer in the current list. Top loser is the weakest.
      </p>

      <h2 className="mt-6 text-xl font-semibold text-ink">Coin Detail + Chart</h2>
      <p className="mt-2 text-sm text-slate-700">
        Click a coin to open details. The chart shows historical price. Use 1D, 7D, 1M, 1Y to change the time range.
      </p>

      <h2 className="mt-6 text-xl font-semibold text-ink">Portfolio</h2>
      <p className="mt-2 text-sm text-slate-700">
        After connecting a wallet, portfolio shows your native ETH and token balances. USD values are estimates using
        available token price mappings.
      </p>

      <h2 className="mt-6 text-xl font-semibold text-ink">Tuffy AI Chat</h2>
      <p className="mt-2 text-sm text-slate-700">
        Tuffy is for educational help, not investment decisions. Always verify data yourself.
      </p>
      <p className="mt-2 text-sm text-slate-700">
        The app has both a chat widget and a full chat page by design:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
        <li><b>Widget:</b> quick questions while browsing market, dashboard, or portfolio.</li>
        <li><b>Full page (/chat):</b> longer conversations and focused chat workflow.</li>
      </ul>
      <p className="mt-2 text-sm text-slate-700">
        Recommended use: start with the widget for fast checks, switch to the full page when you need deeper guidance.
      </p>
      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"><b>Reminder:</b> Not financial advice.</p>
      </div>
    </main>
  );
}
