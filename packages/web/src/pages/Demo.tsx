import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  bootstrapDemo,
  downloadDemoExport,
  getDemoEvents,
  getDemoRun,
  normalizeRoles,
  runDemoAll,
  runDemoStep,
  ApiError,
  demoIdsSummary,
} from "../api";
import { EventFeed } from "../components/EventFeed";
import { ActionChip, CopyButton } from "../components/CopyButton";
import { FAUCET_URL } from "../config/monad";
import {
  ROLE_LABELS,
  WIZARD_PHASES,
  type DemoEvent,
  type DemoRole,
  type DemoRun,
  type DemoStepName,
} from "../types/demo";

const RUN_KEY = "opera.demo.runId";

export function DemoPage() {
  const [runId, setRunId] = useState<string | null>(() => localStorage.getItem(RUN_KEY));
  const [run, setRun] = useState<DemoRun | null>(null);
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string>("");
  const [fundHint, setFundHint] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const roles = useMemo(() => normalizeRoles(run?.roles), [run]);
  const ids = useMemo(() => (run ? demoIdsSummary(run) : null), [run]);

  const refresh = useCallback(async (id: string) => {
    const [r, ev] = await Promise.all([getDemoRun(id), getDemoEvents(id)]);
    setRun(r);
    setEvents(ev.events ?? []);
  }, []);

  useEffect(() => {
    if (!runId) return;
    localStorage.setItem(RUN_KEY, runId);
    void refresh(runId).catch((e) => setError(String(e)));

    pollRef.current = window.setInterval(() => {
      void refresh(runId).catch(() => undefined);
    }, 4000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [runId, refresh]);

  async function onBootstrap() {
    setBusy("bootstrap");
    setError(null);
    try {
      const res = await bootstrapDemo({});
      setRunId(res.runId);
      setFundHint(res.fundHint ?? res.fundInstructions ?? null);
      setLog(JSON.stringify(res, null, 2));
      await refresh(res.runId);
    } catch (e) {
      setError(formatErr(e));
    } finally {
      setBusy(null);
    }
  }

  async function onPhase(steps: DemoStepName[], phaseId: string) {
    if (!runId) {
      setError("Bootstrap a run first.");
      return;
    }
    setBusy(phaseId);
    setError(null);
    try {
      const results = [];
      for (const step of steps) {
        const res = await runDemoStep(runId, step);
        results.push(res);
        await refresh(runId);
      }
      setLog(JSON.stringify(results, null, 2));
    } catch (e) {
      setError(formatErr(e));
      if (runId) void refresh(runId);
    } finally {
      setBusy(null);
    }
  }

  async function onRunAll() {
    if (!runId) {
      setError("Bootstrap a run first.");
      return;
    }
    setBusy("run-all");
    setError(null);
    try {
      const res = await runDemoAll(runId);
      setLog(JSON.stringify(res, null, 2));
      await refresh(runId);
    } catch (e) {
      setError(formatErr(e));
      if (runId) void refresh(runId);
    } finally {
      setBusy(null);
    }
  }

  async function onExport() {
    if (!runId) return;
    setBusy("export");
    setError(null);
    try {
      await downloadDemoExport(runId);
    } catch (e) {
      setError(formatErr(e));
    } finally {
      setBusy(null);
    }
  }

  function clearRun() {
    localStorage.removeItem(RUN_KEY);
    setRunId(null);
    setRun(null);
    setEvents([]);
    setLog("");
    setFundHint(null);
    setError(null);
  }

  const lor = (ids?.lorIds ?? {}) as { energy?: string | number; maintenance?: string | number };
  const man = (ids?.mandateIds ?? {}) as { energy?: string | number; maintenance?: string | number };

  return (
    <div className="demo-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">PRD §8 · Solar farm</p>
          <h1>Demo wizard</h1>
          <p className="lede">
            Tokenized Malaysian solar farm — Singapore family office. Drive the full lifecycle:
            setup → normal ops → sanctions freeze → auto-list / acquire → regulator export.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" disabled={!!busy} onClick={() => void onBootstrap()}>
            {busy === "bootstrap" ? "Bootstrapping…" : "Bootstrap run"}
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={!runId || !!busy}
            onClick={() => void onRunAll()}
          >
            {busy === "run-all" ? "Running…" : "Run all"}
          </button>
          {runId ? (
            <button type="button" className="btn ghost" onClick={clearRun}>
              New run
            </button>
          ) : null}
        </div>
      </header>

      {error ? <div className="alert error">{error}</div> : null}

      <div className="demo-grid">
        <section className="panel">
          <h2>Run</h2>
          {runId ? (
            <p className="mono run-id">
              {runId}
              {run?.status ? <span className="pill">{run.status}</span> : null}
            </p>
          ) : (
            <p className="muted">No active run. Bootstrap to allocate role wallets.</p>
          )}

          <h3 className="subhead">Role wallets</h3>
          {roles.length === 0 ? (
            <p className="muted">Wallets appear after bootstrap.</p>
          ) : (
            <div className="card-list">
              {roles.map((r) => {
                const label = ROLE_LABELS[r.role as DemoRole] ?? r.role;
                const isOwner = /owner/i.test(r.role);
                const isOp = /operator|maint|energy|replacement/i.test(r.role);
                return (
                  <div className="lor-card" key={r.role}>
                    <div className="lor-card-header">
                      <strong>{label}</strong>
                    </div>
                    <p className="mono" style={{ fontSize: "0.8rem", margin: "0.35rem 0" }}>
                      {r.address}
                    </p>
                    <div className="chip-row">
                      <CopyButton value={r.address} label="Copy" />
                      {isOwner ? (
                        <ActionChip to="/owner">Open Owner →</ActionChip>
                      ) : null}
                      {isOp ? (
                        <>
                          <ActionChip to={`/owner?tab=mint&holder=${encodeURIComponent(r.address)}`}>
                            Mint LOR →
                          </ActionChip>
                          <ActionChip to="/operator">Open Operator →</ActionChip>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="fund-box">
            <p>
              {fundHint ??
                "Fund role wallets with MON for gas, then continue the wizard. Backend also mints settlement tokens during Setup."}
            </p>
            <a className="btn secondary" href={FAUCET_URL} target="_blank" rel="noreferrer">
              Open Monad faucet
            </a>
          </div>

          {ids ? (
            <>
              <h3 className="subhead">On-chain ids</h3>
              <div className="card-list">
                <IdCard
                  title="Asset"
                  value={ids.assetId != null ? String(ids.assetId) : null}
                />
                <IdCard
                  title="Energy LOR"
                  value={lor.energy != null ? String(lor.energy) : null}
                  actions={
                    lor.energy != null ? (
                      <ActionChip to={`/market?lorId=${lor.energy}`}>Market →</ActionChip>
                    ) : null
                  }
                />
                <IdCard
                  title="Maint LOR"
                  value={lor.maintenance != null ? String(lor.maintenance) : null}
                  actions={
                    lor.maintenance != null ? (
                      <ActionChip to={`/market?lorId=${lor.maintenance}`}>Market →</ActionChip>
                    ) : null
                  }
                />
                <IdCard
                  title="Energy mandate"
                  value={man.energy != null ? String(man.energy) : null}
                  actions={
                    man.energy != null ? (
                      <>
                        <ActionChip to={`/operator?tab=bid&mandateId=${man.energy}`}>
                          Bid →
                        </ActionChip>
                        <ActionChip to={`/owner?tab=mandates&mandateId=${man.energy}`}>
                          Award →
                        </ActionChip>
                      </>
                    ) : null
                  }
                />
                <IdCard
                  title="Maint mandate"
                  value={man.maintenance != null ? String(man.maintenance) : null}
                  actions={
                    man.maintenance != null ? (
                      <>
                        <ActionChip to={`/operator?tab=bid&mandateId=${man.maintenance}`}>
                          Bid →
                        </ActionChip>
                        <ActionChip to={`/owner?tab=mandates&mandateId=${man.maintenance}`}>
                          Award →
                        </ActionChip>
                      </>
                    ) : null
                  }
                />
              </div>
            </>
          ) : null}
        </section>

        <section className="panel">
          <h2>Steps</h2>
          <ol className="wizard-steps">
            {WIZARD_PHASES.map((phase, idx) => (
              <li key={phase.id}>
                <div className="wizard-copy">
                  <span className="step-num">{idx + 1}</span>
                  <div>
                    <strong>{phase.title}</strong>
                    <p className="muted">{phase.description}</p>
                    <p className="mono tiny">{phase.steps.join(" → ")}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={!runId || !!busy}
                  onClick={() => void onPhase(phase.steps, phase.id)}
                >
                  {busy === phase.id ? "Working…" : "Run"}
                </button>
              </li>
            ))}
          </ol>
          <div className="wizard-foot">
            <button
              type="button"
              className="btn"
              disabled={!runId || !!busy}
              onClick={() => void onExport()}
            >
              {busy === "export" ? "Downloading…" : "Download audit export"}
            </button>
            <Link className="text-link" to="/playground">
              Simulate freeze in Playground →
            </Link>
          </div>
        </section>

        <section className="panel feed-panel">
          <h2>Live event feed</h2>
          <EventFeed events={events} />
        </section>
      </div>

      {log ? (
        <section className="panel" style={{ marginTop: "1.25rem" }}>
          <h2>Last response</h2>
          <details className="event-details">
            <summary>API payload</summary>
            <pre>{log}</pre>
          </details>
        </section>
      ) : null}
    </div>
  );
}

function IdCard({
  title,
  value,
  actions,
}: {
  title: string;
  value: string | null;
  actions?: ReactNode;
}) {
  return (
    <div className="lor-card">
      <div className="lor-card-header">
        <strong>{title}</strong>
        <span className="kv-value">{value != null ? `#${value}` : "—"}</span>
      </div>
      {value != null ? (
        <div className="chip-row" style={{ marginTop: "0.45rem" }}>
          <CopyButton value={value} label="Copy id" />
          {actions}
        </div>
      ) : null}
    </div>
  );
}

function formatErr(e: unknown): string {
  if (e instanceof ApiError) {
    return `API ${e.status}: ${e.body || e.message}`;
  }
  return e instanceof Error ? e.message : String(e);
}
