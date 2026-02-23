"use client";
import { ReactNode } from "react";
import { createConfig, http, injected, WagmiProvider as WagmiRootProvider } from "wagmi";
import { coinbaseWallet, walletConnect } from "wagmi/connectors";
import { mainnet } from "viem/chains";

const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

const connectors = [injected(), coinbaseWallet({ appName: "CryptoTracker" })];
if (WALLETCONNECT_PROJECT_ID) {
  connectors.push(
    walletConnect({
      projectId: WALLETCONNECT_PROJECT_ID,
      showQrModal: true,
    }),
  );
}

const config = createConfig({
  chains: [mainnet],
  connectors,
  transports: {
    [mainnet.id]: http(),
  },
});

export function WagmiProvider({ children }: { children: ReactNode }) {
  return <WagmiRootProvider config={config}>{children}</WagmiRootProvider>;
}
