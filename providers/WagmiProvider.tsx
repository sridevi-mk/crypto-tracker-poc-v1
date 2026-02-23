"use client";
import { ReactNode } from "react";
import { createConfig, http, injected, WagmiProvider as WagmiRootProvider } from "wagmi";
import { mainnet } from "viem/chains";

const config = createConfig({
  chains: [mainnet],
  connectors: [
    injected(),
  ],
  transports: {
    [mainnet.id]: http(),
  },
});

export function WagmiProvider({ children }: { children: ReactNode }) {
  return <WagmiRootProvider config={config}>{children}</WagmiRootProvider>;
}
