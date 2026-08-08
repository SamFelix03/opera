import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAccount, useSignMessage } from "wagmi";
import { SiweMessage } from "siwe";
import { apiGet, apiPost } from "../api";
import { CHAIN_ID } from "../lib/contracts";
import { appKitReady, walletConfigured } from "../config/appkit";

type SessionState = {
  address: string | null;
  authenticated: boolean;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
};

const SiweContext = createContext<SessionState | null>(null);

function SiweProviderInner({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevAddr = useRef<string | null>(null);
  const autoTried = useRef<string | null>(null);

  const signIn = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const { nonce } = await apiGet<{ nonce: string }>(`/auth/nonce?address=${address}`);
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
      const signature = await signMessageAsync({ message: prepared });
      await apiPost("/auth/verify", { message: prepared, signature });
      setAuthenticated(true);
      sessionStorage.setItem("opera.siwe.address", address.toLowerCase());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, [address, signMessageAsync]);

  useEffect(() => {
    if (!isConnected || !address) {
      if (prevAddr.current) {
        sessionStorage.removeItem("opera.siwe.address");
      }
      setAuthenticated(false);
      prevAddr.current = null;
      autoTried.current = null;
      return;
    }

    const lower = address.toLowerCase();
    if (prevAddr.current === lower) return;
    prevAddr.current = lower;

    const cached = sessionStorage.getItem("opera.siwe.address");
    if (cached === lower) {
      setAuthenticated(true);
      return;
    }

    setAuthenticated(false);
  }, [isConnected, address]);

  useEffect(() => {
    if (!isConnected || !address || authenticated || loading) return;
    const lower = address.toLowerCase();
    if (autoTried.current === lower) return;
    if (sessionStorage.getItem("opera.siwe.address") === lower) return;
    autoTried.current = lower;
    void signIn();
  }, [isConnected, address, authenticated, loading, signIn]);

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
