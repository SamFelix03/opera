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

const SIWE_ADDR_KEY = "opera.siwe.address";
/** How long we wait for MetaMask / WC to return a signature before giving up. */
const SIGN_TIMEOUT_MS = 90_000;
/** Wait for the connect modal to settle before auto-prompting. */
const AUTO_SIGN_DELAY_MS = 1_200;

type SiwePhase = "idle" | "nonce" | "signing" | "verifying";

type SessionState = {
  address: string | null;
  authenticated: boolean;
  loading: boolean;
  phase: SiwePhase;
  error: string | null;
  signIn: () => Promise<void>;
  cancelSignIn: () => void;
};

const SiweContext = createContext<SessionState | null>(null);

/** Survives React StrictMode remounts so we don't double-prompt. */
const inFlightByAddress = new Map<string, AbortController>();
const autoAttempted = new Set<string>();

function humanizeSiweError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("rejected the request") ||
    lower.includes("denied request")
  ) {
    return "Sign-in cancelled in wallet. Click Sign in to try again.";
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return msg;
  }
  return msg || "Sign-in failed";
}

function SiweProviderInner({ children }: { children: ReactNode }) {
  const { address, isConnected, status } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [authenticated, setAuthenticated] = useState(false);
  const [phase, setPhase] = useState<SiwePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const prevAddr = useRef<string | null>(null);
  const signGen = useRef(0);

  const loading = phase !== "idle";

  const cancelSignIn = useCallback(() => {
    const lower = address?.toLowerCase();
    if (lower) {
      const ctrl = inFlightByAddress.get(lower);
      ctrl?.abort();
      inFlightByAddress.delete(lower);
    }
    signGen.current += 1;
    setPhase("idle");
    setError("Sign-in cancelled. Click Sign in when ready.");
  }, [address]);

  const signIn = useCallback(async () => {
    if (!address) return;
    const lower = address.toLowerCase();

    // Drop any prior attempt for this address (StrictMode / double-click).
    const prior = inFlightByAddress.get(lower);
    prior?.abort();
    const ctrl = new AbortController();
    inFlightByAddress.set(lower, ctrl);
    const gen = ++signGen.current;

    setPhase("nonce");
    setError(null);

    const timedOut = (ms: number, label: string) =>
      new Promise<never>((_, reject) => {
        const id = window.setTimeout(() => reject(new Error(label)), ms);
        ctrl.signal.addEventListener("abort", () => {
          window.clearTimeout(id);
          reject(new Error("Sign-in cancelled"));
        });
      });

    try {
      const { nonce } = await Promise.race([
        apiGet<{ nonce: string }>(`/auth/nonce?address=${address}`),
        timedOut(20_000, "Could not reach auth server for a nonce. Check the API and retry."),
      ]);
      if (ctrl.signal.aborted || gen !== signGen.current) return;

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

      setPhase("signing");
      const signature = await Promise.race([
        signMessageAsync({ message: prepared }),
        timedOut(
          SIGN_TIMEOUT_MS,
          "Wallet did not respond. Open MetaMask (check for a pending request), then click Sign in.",
        ),
      ]);
      if (ctrl.signal.aborted || gen !== signGen.current) return;

      setPhase("verifying");
      await Promise.race([
        apiPost("/auth/verify", { message: prepared, signature }),
        timedOut(20_000, "Auth verify timed out. Retry sign-in."),
      ]);
      if (ctrl.signal.aborted || gen !== signGen.current) return;

      setAuthenticated(true);
      sessionStorage.setItem(SIWE_ADDR_KEY, lower);
      setPhase("idle");
      setError(null);
    } catch (e) {
      if (ctrl.signal.aborted || gen !== signGen.current) return;
      setAuthenticated(false);
      sessionStorage.removeItem(SIWE_ADDR_KEY);
      setError(humanizeSiweError(e));
      setPhase("idle");
    } finally {
      if (inFlightByAddress.get(lower) === ctrl) {
        inFlightByAddress.delete(lower);
      }
    }
  }, [address, signMessageAsync]);

  // Address / connection changes
  useEffect(() => {
    if (!isConnected || !address) {
      if (prevAddr.current) {
        const old = prevAddr.current;
        inFlightByAddress.get(old)?.abort();
        inFlightByAddress.delete(old);
        sessionStorage.removeItem(SIWE_ADDR_KEY);
      }
      setAuthenticated(false);
      setPhase("idle");
      prevAddr.current = null;
      return;
    }

    // Wait out wagmi reconnect before deciding.
    if (status !== "connected") return;

    const lower = address.toLowerCase();
    if (prevAddr.current === lower) return;
    prevAddr.current = lower;

    const cached = sessionStorage.getItem(SIWE_ADDR_KEY);
    if (cached === lower) {
      // Confirm backend still has a verified session (nonce-only rows don't count).
      void apiGet<{ authenticated?: boolean }>(`/auth/session?address=${lower}`)
        .then((res) => {
          if (prevAddr.current !== lower) return;
          if (res.authenticated) {
            setAuthenticated(true);
            setError(null);
            setPhase("idle");
          } else {
            sessionStorage.removeItem(SIWE_ADDR_KEY);
            setAuthenticated(false);
            autoAttempted.delete(lower);
          }
        })
        .catch(() => {
          // Offline / API blip — keep local cache optimistic for this tab.
          setAuthenticated(true);
          setPhase("idle");
        });
      return;
    }

    setAuthenticated(false);
  }, [isConnected, address, status]);

  // Auto sign-in once per address after the connector has settled
  useEffect(() => {
    if (status !== "connected" || !isConnected || !address) return;
    if (authenticated || loading) return;
    const lower = address.toLowerCase();
    if (sessionStorage.getItem(SIWE_ADDR_KEY) === lower) return;
    if (autoAttempted.has(lower)) return;

    const timer = window.setTimeout(() => {
      if (autoAttempted.has(lower)) return;
      autoAttempted.add(lower);
      void signIn();
    }, AUTO_SIGN_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [status, isConnected, address, authenticated, loading, signIn]);

  return (
    <SiweContext.Provider
      value={{
        address: address?.toLowerCase() ?? null,
        authenticated,
        loading,
        phase,
        error,
        signIn,
        cancelSignIn,
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
          phase: "idle",
          error: null,
          signIn: async () => undefined,
          cancelSignIn: () => undefined,
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
