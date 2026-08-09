import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAccount, useWalletClient } from "wagmi";
import { SiweMessage } from "siwe";
import { apiGet, apiPost } from "../api";
import { CHAIN_ID } from "../lib/contracts";
import { appKitReady, walletConfigured } from "../config/appkit";

const SIWE_ADDR_KEY = "opera.siwe.address";

type SessionState = {
  address: string | null;
  authenticated: boolean;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
};

const SiweContext = createContext<SessionState | null>(null);

function humanize(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("rejected the request")
  ) {
    return "Sign-in cancelled in wallet.";
  }
  return msg || "Sign-in failed";
}

function SiweProviderInner({ children }: { children: ReactNode }) {
  const { address, isConnected, connector, status } = useAccount();
  const { data: walletClient, refetch: refetchWalletClient } = useWalletClient();
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevAddr = useRef<string | null>(null);

  const signIn = useCallback(async () => {
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    if (status !== "connected") {
      setError("Wallet is still connecting — try Sign in again in a moment.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // 1) Nonce first — UI used to say "confirm in wallet" while this hung.
      const { nonce } = await apiGet<{ nonce: string }>(
        `/auth/nonce?address=${address}`,
      );

      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to Opera Protocol",
        uri: window.location.origin,
        version: "1",
        chainId: CHAIN_ID,
        nonce,
      });
      const prepared = message.prepareMessage();

      // 2) Sign via the active wallet client (not a fire-and-forget useEffect).
      // Auto-sign on connect often never opens MetaMask with AppKit — the request
      // is dropped while the connect modal is still tearing down.
      let client = walletClient;
      if (!client) {
        const refreshed = await refetchWalletClient();
        client = refreshed.data ?? undefined;
      }
      if (!client) {
        throw new Error(
          `No wallet client ready${connector?.name ? ` (${connector.name})` : ""}. Disconnect, reconnect, then click Sign in.`,
        );
      }

      const signature = await client.signMessage({
        account: address as `0x${string}`,
        message: prepared,
      });

      await apiPost("/auth/verify", { message: prepared, signature });
      setAuthenticated(true);
      sessionStorage.setItem(SIWE_ADDR_KEY, address.toLowerCase());
    } catch (e) {
      setAuthenticated(false);
      sessionStorage.removeItem(SIWE_ADDR_KEY);
      setError(humanize(e));
    } finally {
      setLoading(false);
    }
  }, [address, status, walletClient, refetchWalletClient, connector?.name]);

  useEffect(() => {
    if (!isConnected || !address) {
      if (prevAddr.current) {
        sessionStorage.removeItem(SIWE_ADDR_KEY);
      }
      setAuthenticated(false);
      setLoading(false);
      prevAddr.current = null;
      return;
    }

    const lower = address.toLowerCase();
    if (prevAddr.current === lower) return;
    prevAddr.current = lower;

    const cached = sessionStorage.getItem(SIWE_ADDR_KEY);
    if (cached === lower) {
      setAuthenticated(true);
      setError(null);
      return;
    }

    setAuthenticated(false);
    // Do NOT auto-call signIn here. MetaMask/AppKit frequently swallow
    // personal_sign when it is not triggered by a user click after connect.
  }, [isConnected, address]);

  return (
    <SiweContext.Provider
      value={{
        address: address?.toLowerCase() ?? null,
        authenticated,
        loading,
        error,
        signIn,
      }}
    >
      {children}
    </SiweContext.Provider>
  );
}

export function SiweProvider({ children }: { children: ReactNode }) {
  if (!walletConfigured || !appKitReady) {
    return (
      <SiweContext.Provider
        value={{
          address: null,
          authenticated: false,
          loading: false,
          error: null,
          signIn: async () => undefined,
        }}
      >
        {children}
      </SiweContext.Provider>
    );
  }
  return <SiweProviderInner>{children}</SiweProviderInner>;
}

export function useSiweSession(): SessionState {
  const ctx = useContext(SiweContext);
  if (!ctx) {
    throw new Error("useSiweSession must be used within SiweProvider");
  }
  return ctx;
}
