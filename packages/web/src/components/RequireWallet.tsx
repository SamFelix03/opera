import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { ConnectWalletButton } from "./ConnectWalletButton";
import { walletConfigured } from "../config/appkit";

export function RequireWallet({ children, label = "Connect your wallet to continue" }: { children: ReactNode; label?: string }) {
  if (!walletConfigured) {
    return (
      <div className="panel" style={{ textAlign: "center", padding: "2.5rem 1.5rem" }}>
        <p className="muted">{label}</p>
        <p className="muted" style={{ fontSize: "0.82rem", marginTop: "0.5rem" }}>
          Set <code>VITE_WALLETCONNECT_PROJECT_ID</code> in <code>.env.local</code>
        </p>
      </div>
    );
  }
  return <RequireWalletInner label={label}>{children}</RequireWalletInner>;
}

function RequireWalletInner({ children, label }: { children: ReactNode; label: string }) {
  const { isConnected } = useAccount();
  if (!isConnected) {
    return (
      <div className="panel" style={{ textAlign: "center", padding: "2.5rem 1.5rem" }}>
        <p style={{ marginBottom: "1rem" }}>{label}</p>
        <ConnectWalletButton />
      </div>
    );
  }
  return <>{children}</>;
}
