import { useEffect, useRef } from "react";
import { useAccount, useDisconnect } from "wagmi";

const STUCK_MS = 8_000;

/** Keys AppKit / wagmi / WalletConnect leave in this origin's storage. */
function clearWalletCaches() {
  const keep = (k: string) =>
    k.startsWith("opera.demo.") || k.startsWith("opera.cast.");
  for (const store of [localStorage, sessionStorage]) {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k) keys.push(k);
    }
    for (const k of keys) {
      if (keep(k)) continue;
      const lower = k.toLowerCase();
      if (
        lower.includes("wagmi") ||
        lower.includes("w3m") ||
        lower.includes("appkit") ||
        lower.includes("walletconnect") ||
        lower.includes("@reown") ||
        lower.includes("wc@") ||
        lower.startsWith("opera.siwe")
      ) {
        store.removeItem(k);
      }
    }
  }
}

/**
 * AppKit's <appkit-button> shows a broken/loading shell when wagmi is stuck
 * "reconnecting" to a dead WalletConnect session (common after SIWE hangs,
 * tab sleep, or a previous 504). Incognito works because storage is empty.
 * After STUCK_MS, drop the stale session so Connect renders again.
 */
export function StuckWalletReconnectGuard() {
  const { status, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const since = useRef<number | null>(null);

  useEffect(() => {
    const pending = status === "reconnecting" || (status === "connecting" && !isConnected);
    if (!pending) {
      since.current = null;
      return;
    }
    if (since.current == null) since.current = Date.now();
    const left = STUCK_MS - (Date.now() - since.current);
    const id = window.setTimeout(() => {
      try {
        disconnect();
      } catch {
        /* ignore */
      }
      clearWalletCaches();
    }, Math.max(0, left));
    return () => window.clearTimeout(id);
  }, [status, isConnected, disconnect]);

  return null;
}

export function resetWalletConnection() {
  clearWalletCaches();
  window.location.reload();
}
