export function ScoreBadge({ score, label }: { score: number | string | null; label?: string }) {
  const n = Number(score ?? 0);
  const band = n >= 95 ? "full" : n >= 80 ? "high" : n >= 70 ? "mid" : "low";
  const colors: Record<string, string> = {
    full: "var(--ok)",
    high: "var(--navy)",
    mid: "var(--warn)",
    low: "var(--danger)",
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0.2rem 0.65rem",
        borderRadius: "999px",
        border: `1.5px solid ${colors[band]}`,
        color: colors[band],
        fontSize: "0.82rem",
        fontWeight: 600,
      }}
    >
      {label ? <span style={{ fontWeight: 400, opacity: 0.7 }}>{label}</span> : null}
      {score ?? "—"}
    </span>
  );
}

export function YieldBand({ score }: { score: number | string | null }) {
  const n = Number(score ?? 0);
  if (n >= 95) return <span className="yield-band full">100% yield</span>;
  if (n >= 80) return <span className="yield-band partial">85% yield · 15% escrow</span>;
  if (n >= 70) return <span className="yield-band significant">60% yield · 40% escrow</span>;
  return <span className="yield-band suspended">Suspended · full escrow</span>;
}

export function ApassStatus({ status }: { status: number | null }) {
  const dotClass = status === 1 ? "active" : status === 2 ? "frozen" : "none";
  const label = status === 1 ? "Active" : status === 2 ? "Frozen" : "None";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: "0.82rem" }}>
      <span className={`status-dot ${dotClass}`} />
      Cleanverse A-Pass · {label}
    </span>
  );
}
