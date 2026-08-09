import { defineChain } from "@reown/appkit/networks";

/** Monad Testnet — chainId 10143 */
export const monadTestnet = defineChain({
  id: 10143,
  caipNetworkId: "eip155:10143",
  chainNamespace: "eip155",
  name: "Monad Testnet",
  nativeCurrency: {
    name: "MON",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://testnet-rpc.monad.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "MonadVision",
      url: "https://testnet.monadvision.com",
    },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 0,
    },
  },
});

export const FAUCET_URL = "https://faucet.monad.xyz/";
export const WC_CLOUD_URL = "https://cloud.walletconnect.com";
export const REOWN_CLOUD_URL = "https://cloud.reown.com";

export const projectId = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "").trim();
export const walletConfigured = projectId.length > 0;
