import { useAccount, useBalance, useReadContract } from "wagmi";
import { FAUCET_URL, REOWN_CLOUD_URL, WC_CLOUD_URL } from "../config/monad";
import { walletConfigured, appKitReady } from "../config/appkit";
import { addresses, erc20Abi } from "../lib/contracts";
import { deployments } from "../api";
import { formatMon, formatUnits6 } from "../lib/format";
import { useSiweSession } from "../hooks/useSiweSession";

export function SetupBanner() {
  return (
    <div className="setup-banner" role="status">
      <div>
        <strong>WalletConnect project ID missing</strong>
        <p>
          Set <code>VITE_WALLETCONNECT_PROJECT_ID</code> to enable MetaMask and WalletConnect.
          Create a free project at{" "}
          <a href={REOWN_CLOUD_URL} target="_blank" rel="noreferrer">
            cloud.reown.com
          </a>{" "}
          or{" "}
          <a href={WC_CLOUD_URL} target="_blank" rel="noreferrer">
            cloud.walletconnect.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function WalletBalances() {
  const { address, isConnected } = useAccount();
  const { data: mon, isLoading: monLoading } = useBalance({
    address,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });
  const { data: ocva, isLoading: ocvaLoading } = useReadContract({
    address: addresses.OperaAToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });
  const siwe = useSiweSession();

  if (!isConnected || !address) return null;

  return (
    <div className="balance-row" title={address}>
      <div className="balance-chip">
        <span className="balance-chip-label">MON</span>
        <span className="balance-chip-value">
          {monLoading && mon == null ? "…" : formatMon(mon?.value)}
        </span>
        <span className="balance-chip-hint">gas</span>
      </div>
      <div className="balance-chip accent">
        <span className="balance-chip-label">oCVA</span>
        <span className="balance-chip-value">
          {ocvaLoading && ocva == null ? "…" : formatUnits6(ocva)}
        </span>
        <span className="balance-chip-hint">Cleanverse CVA</span>
      </div>
      {siwe.loading ? (
        <span className="balance-chip-hint-alone">Signing…</span>
      ) : !siwe.authenticated ? (
        <button type="button" className="balance-chip-hint-alone linkish" onClick={() => void siwe.signIn()}>
          Sign in
        </button>
      ) : null}
      <a className="balance-fund" href={FAUCET_URL} target="_blank" rel="noreferrer">
        Fund
      </a>
    </div>
  );
}

function ConnectedWalletBar() {
  const { isConnected } = useAccount();

  return (
    <div className="wallet-bar">
      {isConnected ? <WalletBalances /> : (
        <a className="btn secondary btn-sm" href={FAUCET_URL} target="_blank" rel="noreferrer">
          Fund
        </a>
      )}
      <appkit-button balance="hide" />
    </div>
  );
}

export function WalletBar() {
  if (!walletConfigured || !appKitReady) {
    return (
      <div className="wallet-bar readonly">
        <a className="btn secondary" href={FAUCET_URL} target="_blank" rel="noreferrer">
          Fund
        </a>
        <span className="pill muted-pill">Read-only</span>
      </div>
    );
  }

  return <ConnectedWalletBar />;
}
