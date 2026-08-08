import { Link } from "react-router-dom";
import { EXPLORER_TX, roleLabel, useCast } from "../hooks/useCast";
import { shortAddr } from "../lib/format";

export function CastBar() {
  const cast = useCast();
  if (!cast.active || !cast.cast) return null;

  return (
    <div className="cast-bar" role="region" aria-label="Demo cast">
      <div className="cast-bar-inner">
        <div className="cast-bar-lead">
          <span className="cast-bar-kicker">Demo cast</span>
          <strong className="cast-bar-acting">
            Acting as {roleLabel(cast.selectedRole)}
          </strong>
          {cast.selectedAddress ? (
            <span className="mono cast-bar-addr">{shortAddr(cast.selectedAddress, 5)}</span>
          ) : (
            <span className="muted">Select a role</span>
          )}
          <span className="cast-signed-pill">cast-signed</span>
        </div>

        <div className="cast-role-chips">
          {cast.roles.map((r) => (
            <button
              key={r.role}
              type="button"
              className={`picker-chip cast-role-chip${cast.selectedRole === r.role ? " active" : ""}`}
              onClick={() => cast.setSelectedRole(r.role)}
              title={r.address}
            >
              {roleLabel(r.role)}
            </button>
          ))}
        </div>

        <div className="cast-bar-trail">
          {cast.recentTxs.slice(0, 2).map((tx) => (
            <a
              key={tx.hash}
              className="cast-tx-link mono"
              href={`${EXPLORER_TX}/${tx.hash}`}
              target="_blank"
              rel="noreferrer"
              title={tx.label}
            >
              {tx.label.slice(0, 14)} ↗
            </a>
          ))}
          <Link className="text-link" to="/demo">
            Cast HQ
          </Link>
        </div>
      </div>
      {cast.error ? (
        <div className="cast-bar-error">
          {cast.error}
          <button type="button" className="btn ghost" onClick={cast.clearError}>
            Dismiss
          </button>
        </div>
      ) : null}
      {cast.lastResult ? (
        <div className="cast-bar-last">
          <span>{cast.lastResult.summary}</span>
          {cast.lastResult.txs.map((tx) => (
            <a
              key={tx.hash}
              className="cast-tx-link mono"
              href={`${EXPLORER_TX}/${tx.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              {tx.label} ↗
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
