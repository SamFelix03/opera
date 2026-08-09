import type { ReactNode } from "react";
import { useSiweSession } from "../hooks/useSiweSession";

/** Soft banner while SIWE is needed. Children still render. */
export function SiweStatus() {
  const siwe = useSiweSession();
  if (!siwe.address) return null;
  if (siwe.authenticated) return null;

  return (
    <div className="alert" style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <p style={{ margin: 0, flex: 1 }}>
          {siwe.loading
            ? "Check MetaMask for the Sign-In with Ethereum prompt…"
            : "Sign in with Ethereum to use protocol actions (one click after connecting)."}
          {siwe.error ? (
            <span style={{ color: "var(--danger)", display: "block", marginTop: "0.25rem" }}>
              {siwe.error}
            </span>
          ) : null}
        </p>
        <button
          type="button"
          className="btn"
          disabled={siwe.loading}
          onClick={() => void siwe.signIn()}
        >
          {siwe.loading ? "Waiting for wallet…" : "Sign in"}
        </button>
      </div>
    </div>
  );
}

export function RequireSiwe({ children }: { children: ReactNode }) {
  const siwe = useSiweSession();
  if (siwe.authenticated) return <>{children}</>;
  return <SiweStatus />;
}
