"use client";
import { useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect } from 'wagmi';

function shortAddress(addr: string) {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

export function WalletConnectButton() {
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const [connectError, setConnectError] = useState<string | null>(null);

  // Only Ethereum mainnet supported
  const isWrongNetwork = Boolean(chainId && chainId !== 1);

  if (isConnected) {
    return (
      <div className="flex items-center gap-2">
        {isWrongNetwork && (
          <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Wrong network</span>
        )}
        <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{shortAddress(address!)}</span>
        <button
          onClick={() => {
            disconnect();
            setConnectError(null);
          }}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
        >
          Disconnect
        </button>
      </div>
    );
  }

  async function handleConnect(connectorId?: string) {
    const connector = connectorId
      ? connectors.find((c) => c.id === connectorId)
      : connectors?.find((c) => c.id === "injected") || connectors?.[0];

    if (!connector) {
      setConnectError("No wallet connector is configured.");
      return;
    }

    setConnectError(null);
    try {
      await connectAsync({ connector });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Wallet connection failed.";
      const msg = /provider not found/i.test(raw)
        ? "No injected wallet found in this browser. Use WalletConnect/Coinbase option below or install MetaMask."
        : raw;
      setConnectError(msg);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => handleConnect()}
        disabled={isPending}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Connecting...' : 'Connect Wallet'}
      </button>
      {connectors?.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {connectors.map((c) => (
            <button
              key={c.id}
              onClick={() => handleConnect(c.id)}
              disabled={isPending}
              className="rounded-md border border-border bg-white px-2 py-1 text-xs text-ink hover:bg-slate-50 disabled:opacity-60"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {connectError && (
        <p className="max-w-md text-xs text-rose-700">{connectError}</p>
      )}
    </div>
  );
}
