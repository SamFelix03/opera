import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  downloadDemoExport,
  getAuditEvents,
  getDemoEvents,
  getDemoRun,
  getDemoStatus,
  normalizeRoles,
} from "../api";
import { EventFeed } from "../components/EventFeed";
import { CastActionButton } from "../components/CastActionButton";
import { SubTabs } from "../components/SubTabs";
import { useCast } from "../hooks/useCast";
import type { DemoEvent } from "../types/demo";
import { shortAddr } from "../lib/format";

const RUN_KEY = "opera.demo.runId";

type AuditTab = "lifecycle" | "records";

type AuditRow = {
  id?: number;
  kind?: string;
  request_id?: string | null;
  created_at?: string;
  payload?: string;
};

const TABS = [
  { id: "lifecycle" as const, label: "Lifecycle" },
  { id: "records" as const, label: "Audit records" },
];

export function AuditPage() {
  const { address } = useAccount();
  const cast = useCast();
  const [tab, setTab] = useState<AuditTab>("lifecycle");
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [raw, setRaw] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filterAddr, setFilterAddr] = useState(address ?? "");
  const [demoRoleChips, setDemoRoleChips] = useState<{ label: string; value: string }[]>([]);
  const runId = cast.runId ?? localStorage.getItem(RUN_KEY);

  useEffect(() => {
    if (!runId) {
      setDemoRoleChips([]);
      return;
    }
    void getDemoRun(runId)
      .then((run) => {
        setDemoRoleChips(
          normalizeRoles(run.roles)
            .filter((r) => r.address)
            .map((r) => ({ label: r.label ?? r.role, value: r.address }))
            .slice(0, 8),
        );
      })
      .catch(() => setDemoRoleChips([]));
  }, [runId]);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (runId) {
        const ev = await getDemoEvents(runId);
        setEvents(ev.events ?? []);
      } else {
        const status = await getDemoStatus();
        setEvents((status.events as DemoEvent[]) ?? []);
      }
      const audit = await getAuditEvents(200);
      setRaw((audit.events as AuditRow[]) ?? []);
    } catch (e) {
      setError(String(e));
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (address && !filterAddr) setFilterAddr(address);
  }, [address, filterAddr]);

  async function onExport() {
    if (!runId) {
      setError("No demo run yet — bootstrap on Demo first.");
      return;
    }
    setBusy(true);
    try {
      await downloadDemoExport(runId);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const filtered = filterAddr
    ? raw.filter((ev) => JSON.stringify(ev).toLowerCase().includes(filterAddr.toLowerCase()))
    : raw;

  const kinds = new Set(raw.map((e) => e.kind ?? "unknown"));

  return (
    <div>
      <header className="page-head">
        <div>
          <p className="eyebrow">Regulator</p>
          <h1>Audit</h1>
          <p className="lede">
            Timestamped trail of score changes, freezes, listings, and distributions.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn secondary" onClick={() => void load()}>
            Refresh
          </button>
          {cast.active ? (
            <CastActionButton action="export" role="regulator" label="Build export (cast)" />
          ) : null}
          <button
            type="button"
            className="btn"
            disabled={busy || !runId}
            onClick={() => void onExport()}
          >
            {busy ? "Downloading…" : "Signed export"}
          </button>
        </div>
      </header>

      <SubTabs tabs={TABS} active={tab} onChange={setTab} />

      {error ? <div className="alert error">{error}</div> : null}

      <section className="panel accent-top" style={{ marginBottom: "1rem" }}>
        <div className="stat-row">
          <div className="stat-item">
            <span className="stat-value">{events.length}</span>
            <span className="stat-label">Lifecycle</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{raw.length}</span>
            <span className="stat-label">Records</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{kinds.size}</span>
            <span className="stat-label">Types</span>
          </div>
        </div>
      </section>

      {tab === "lifecycle" ? (
        <section className="panel feed-panel">
          <EventFeed
            events={cast.active && cast.events.length ? cast.events : events}
            empty="No lifecycle events yet. Seed a cast or execute platform actions."
          />
        </section>
      ) : (
        <div className="stack-sections">
          <div>
            <label htmlFor="audit-filter">Filter by address</label>
            <div className="chip-row" style={{ margin: "0.35rem 0 0.55rem" }}>
              {address ? (
                <button
                  type="button"
                  className={`picker-chip${filterAddr.toLowerCase() === address.toLowerCase() ? " active" : ""}`}
                  onClick={() => setFilterAddr(address)}
                >
                  My wallet · {shortAddr(address)}
                </button>
              ) : null}
              {demoRoleChips.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`picker-chip${filterAddr.toLowerCase() === c.value.toLowerCase() ? " active" : ""}`}
                  onClick={() => setFilterAddr(c.value)}
                  title={c.value}
                >
                  {c.label} · {shortAddr(c.value)}
                </button>
              ))}
              {filterAddr ? (
                <button type="button" className="picker-chip" onClick={() => setFilterAddr("")}>
                  Clear
                </button>
              ) : null}
            </div>
            <input
              id="audit-filter"
              value={filterAddr}
              onChange={(e) => setFilterAddr(e.target.value)}
              placeholder="Select a chip or paste 0x…"
              spellCheck={false}
            />
          </div>
          <section className="panel">
            {filtered.length === 0 ? (
              <div className="empty-state">
                <p>No matching records.</p>
              </div>
            ) : (
              <div className="card-list">
                {filtered.slice(0, 50).map((ev, i) => (
                  <div className="lor-card" key={ev.id ?? i}>
                    <div className="lor-card-header">
                      <strong>{ev.kind ?? "event"}</strong>
                      <span className="muted" style={{ fontSize: "0.75rem" }}>
                        {ev.created_at ?? ""}
                      </span>
                    </div>
                    <div className="lor-card-meta">
                      {ev.request_id ? (
                        <span className="mono">{shortAddr(String(ev.request_id), 6)}</span>
                      ) : null}
                    </div>
                    {ev.payload ? (
                      <details className="event-details" style={{ marginTop: "0.5rem" }}>
                        <summary>Details</summary>
                        <pre className="event-payload">
                          {(() => {
                            try {
                              return JSON.stringify(
                                typeof ev.payload === "string" ? JSON.parse(ev.payload) : ev.payload,
                                null,
                                2,
                              );
                            } catch {
                              return String(ev.payload);
                            }
                          })()}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
