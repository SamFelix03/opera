import { type ReactNode, useState } from "react";
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type Config } from "wagmi";
import { monadTestnet, projectId, walletConfigured } from "./monad";
import { StuckWalletReconnectGuard } from "../components/StuckWalletReconnectGuard";

const metadata = {
  name: "Opera Protocol",
  description: "Compliance-native Living Operating Rights for RWAs on Monad",
  url: typeof window !== "undefined" ? window.location.origin : "https://opera.protocol",
  icons: ["/opera-logo.png"],
};

const networks = [monadTestnet] as [typeof monadTestnet, ...typeof monadTestnet[]];

let wagmiAdapter: WagmiAdapter | null = null;
let appKitReady = false;

if (walletConfigured) {
  wagmiAdapter = new WagmiAdapter({
    networks,
    projectId,
    ssr: false,
  });

  createAppKit({
    adapters: [wagmiAdapter],
    networks,
    projectId,
    metadata,
    themeMode: "light",
    themeVariables: {
      "--w3m-accent": "#1a2740",
      "--w3m-color-mix": "#f4f2ee",
      "--w3m-color-mix-strength": 18,
      "--w3m-border-radius-master": "2px",
      "--w3m-font-family": "Outfit, system-ui, sans-serif",
    },
    features: {
      analytics: false,
      email: false,
      socials: false,
    },
  });
  appKitReady = true;
}

export { appKitReady, walletConfigured };

export function AppKitProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  if (!wagmiAdapter || !appKitReady) {
    return <>{children}</>;
  }

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config}>
      <QueryClientProvider client={queryClient}>
        <StuckWalletReconnectGuard />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
