import { useState } from "react";
import { EXPLORER_TX, roleLabel, useCast } from "../hooks/useCast";

export function CastActionButton({
  action,
  args,
  role,
  label,
  className = "btn",
  disabled,
  requireRole,
}: {
  action: string;
  args?: Record<string, unknown>;
  role?: string | null;
  label: string;
  className?: string;
  disabled?: boolean;
  /** If set, must match current cast role (or pass role override) */
  requireRole?: string | string[];
}) {
  const cast = useCast();
  const [localError, setLocalError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const effectiveRole = role !== undefined ? role : cast.selectedRole;
  const required = requireRole
    ? Array.isArray(requireRole)
      ? requireRole
      : [requireRole]
    : null;
  const roleOk = !required || (effectiveRole != null && required.includes(effectiveRole));

  const busy = cast.busy === action;

  async function onClick() {
    setLocalError(null);
    setDone(false);
    if (!cast.active) {
      setLocalError("Seed a cast from Cast HQ first");
      return;
    }
    if (!roleOk) {
      setLocalError(
        `Switch cast to ${required!.map(roleLabel).join(" or ")} in the cast bar`,
      );
      return;
    }
    try {
      await cast.act(action, args, effectiveRole);
      setDone(true);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="cast-action">
      <button
        type="button"
        className={className}
        disabled={disabled || busy || !cast.active || !roleOk}
        onClick={() => void onClick()}
      >
        {busy ? "Signing as cast…" : done ? "Done" : label}
      </button>
      {cast.active ? (
        <p className="muted tiny" style={{ margin: "0.35rem 0 0" }}>
          Signed as {roleLabel(effectiveRole)} · cast
        </p>
      ) : null}
      {localError ? (
        <p style={{ color: "var(--danger)", fontSize: "0.82rem", marginTop: "0.35rem" }}>
          {localError}
        </p>
      ) : null}
      {done && cast.lastResult?.action === action ? (
        <div className="cast-tx-list">
          {cast.lastResult.txs.map((tx) => (
            <a
              key={tx.hash}
              className="cast-tx-link mono"
              href={`${EXPLORER_TX}/${tx.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              {tx.label}: {tx.hash.slice(0, 10)}…↗
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
