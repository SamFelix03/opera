import type { ReactNode } from "react";
import { useSiweSession } from "../hooks/useSiweSession";

/** Soft banner while SIWE is in progress / failed. Children still render. */
export function SiweStatus() {
  const siwe = useSiweSession();
  if (!siwe.address) return null;
  if (siwe.authenticated) return null;

  return (
    <div className="alert" style={{ marginBottom: "1rem" }}>
      {siwe.loading ? (
        <p style={{ margin: 0 }}>Confirm the sign-in request in your wallet…</p>
      ) : (
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <p style={{ margin: 0, flex: 1 }}>
            Sign in with Ethereum is required for protocol actions.
            {siwe.error ? (
              <span style={{ color: "var(--danger)", display: "block", marginTop: "0.25rem" }}>
                {siwe.error}
              </span>
            ) : null}
          </p>
          <button type="button" className="btn" onClick={() => void siwe.signIn()}>
            Retry sign-in
          </button>
        </div>
      )}
    </div>
  );
}

export function RequireSiwe({ children }: { children: ReactNode }) {
  const siwe = useSiweSession();
  if (siwe.authenticated) return <>{children}</>;
  return <SiweStatus />;
}
