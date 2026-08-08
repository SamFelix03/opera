import { useAppKit } from "@reown/appkit/react";
import { walletConfigured, appKitReady } from "../config/appkit";

export function ConnectWalletButton({ label = "Connect wallet" }: { label?: string }) {
  if (!walletConfigured || !appKitReady) {
    return (
      <button type="button" className="btn" disabled title="Set VITE_WALLETCONNECT_PROJECT_ID first">
        {label}
      </button>
    );
  }
  return <ConnectInner label={label} />;
}

function ConnectInner({ label }: { label: string }) {
  const { open } = useAppKit();
  return (
    <button type="button" className="btn" onClick={() => void open()}>
      {label}
    </button>
  );
}
