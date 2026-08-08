import { roleLabel, useCast } from "../hooks/useCast";
import { shortAddr } from "../lib/format";

/** Cue on Owner/Operator when cast mode is active. */
export function ActingAsCue({ role }: { role: "Owner" | "Operator" }) {
  const cast = useCast();

  if (cast.active && cast.selectedRole) {
    return (
      <div className="acting-as-cue cast-aware" role="status">
        <span className="acting-as-label">Acting as</span>
        <strong>{roleLabel(cast.selectedRole)}</strong>
        {cast.selectedAddress ? (
          <span className="mono">{shortAddr(cast.selectedAddress)}</span>
        ) : null}
        <span className="cast-signed-pill">cast-signed</span>
        <span className="muted">
          Desk: {role}. Actions use the cast wallet — not your MetaMask account.
        </span>
      </div>
    );
  }

  return (
    <div className="acting-as-cue" role="status">
      <span className="acting-as-label">Acting as</span>
      <strong>{role}</strong>
      <span className="muted">
        Same wallet can use both desks — this page is the {role.toLowerCase()} workflow.
        Seed a cast for multi-role demo signing.
      </span>
    </div>
  );
}
