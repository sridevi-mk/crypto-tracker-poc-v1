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

  const defaultConnector =
    connectors?.find((c) => c.id === "injected") || connectors?.[0];
  const noWalletDetected = !defaultConnector;

  async function handleConnect() {
    if (!defaultConnector) {
      setConnectError("No browser wallet detected. Install MetaMask or open in a wallet browser.");
      return;
    }
    setConnectError(null);
    try {
      await connectAsync({ connector: defaultConnector });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Wallet connection failed.";
      setConnectError(msg);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleConnect}
        disabled={isPending}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Connecting...' : 'Connect Wallet'}
      </button>
      {noWalletDetected && (
        <p className="text-xs text-amber-700">No injected wallet detected in this browser.</p>
      )}
      {connectError && (
        <p className="max-w-md text-xs text-rose-700">{connectError}</p>
      )}
    </div>
  );
}
