import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost } from "../api";
import { useSiweSession } from "../hooks/useSiweSession";
import { SubTabs } from "../components/SubTabs";
import { SiweStatus } from "../components/SiweGate";
import { RequireWallet } from "../components/RequireWallet";
import { CopyButton } from "../components/CopyButton";
import { CastActionButton } from "../components/CastActionButton";
import { useCast } from "../hooks/useCast";

type PlayTab = "simulate" | "config";

type YieldBand = { min: number; paidBps: number; escrowBps: number };

type PlayConfig = {
  chainId: number;
  lorRegistry: string;
  autoListThreshold: number;
  yieldBands: YieldBand[];
  freezeMultiplier: number;
  settlementDecimals: number;
};

/** Fixed synthetic address used by the local score simulator (not a live wallet). */
const SIM_OPERATOR = "0xSimulatedOperator00000000000000000001";

const TABS = [
  { id: "simulate" as const, label: "Simulate" },
  { id: "config" as const, label: "On-chain config" },
];

export function PlaygroundPage() {
  const [tab, setTab] = useState<PlayTab>("simulate");
  const [frozen, setFrozen] = useState(false);
  const [editThreshold, setEditThreshold] = useState(72);
  const [tenureDays, setTenureDays] = useState(365);
  const [sim, setSim] = useState<{
    score: number;
    band: string;
    wouldAutoList: boolean;
    yieldPaidBps: number;
    yieldEscrowBps: number;
  } | null>(null);
  const [cfg, setCfg] = useState<PlayConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushTx, setPushTx] = useState<string | null>(null);
  const [liveTarget, setLiveTarget] = useState("");
  const siwe = useSiweSession();
  const cast = useCast();

  // Prefill from selected cast role when available.
  useEffect(() => {
    if (!cast.active) return;
    const addr =
      cast.selectedAddress ??
      cast.roles.find((r) => r.role === "maintOp")?.address ??
      "";
    if (addr) setLiveTarget(addr);
  }, [cast.active, cast.selectedAddress, cast.roles]);

  const liveThreshold = cfg?.autoListThreshold ?? null;
  const targetOk = /^0x[a-fA-F0-9]{40}$/.test(liveTarget.trim());
  const liveArgs = { target: liveTarget.trim() };

  async function loadConfig() {
    try {
      const c = await apiGet<PlayConfig>("/playground/config");
      setCfg(c);
      setEditThreshold(c.autoListThreshold);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void loadConfig();
  }, []);

  async function simulate() {
    setError(null);
    if (liveThreshold == null) {
      setError("Load on-chain config before simulating.");
      return;
    }
    const res = await apiPost<{
      score: number;
      band: string;
      yieldPaidBps: number;
      yieldEscrowBps: number;
    }>("/scores/compute", {
      address: SIM_OPERATOR,
      tenureDays,
      cleanScreeningEvents: 10,
      totalScreeningEvents: 10,
      travelRuleCompleteTransfers: 2,
      crossBorderTransfers: 5,
      frozen,
      requestIds: ["playground-sim"],
    });
    setSim({
      score: res.score,
      band: res.band,
      wouldAutoList: res.score < liveThreshold,
      yieldPaidBps: res.yieldPaidBps,
      yieldEscrowBps: res.yieldEscrowBps,
    });
  }

  async function pushOnChain() {
    setBusy(true);
    setError(null);
    setPushTx(null);
    try {
      const res = await apiPost<{ ok: boolean; tx: string }>("/playground/config", {
        autoListThreshold: editThreshold,
      });
      setPushTx(res.tx);
      await loadConfig();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <p className="eyebrow">Rule engine</p>
          <h1>Playground</h1>
          <p className="lede">
            Simulate freeze cascades against the live auto-list threshold, then push threshold
            changes on-chain from Config.
          </p>
        </div>
      </header>

      <SubTabs tabs={TABS} active={tab} onChange={setTab} />

      {error ? <div className="alert error">{error}</div> : null}

      {tab === "simulate" ? (
        <div className="stack-sections">
          <section className="panel">
            <h2>Simulate score cascade</h2>
            <div className="kv-grid" style={{ marginBottom: "1rem" }}>
              <div className="kv-item full">
                <span className="kv-label">Simulated operator</span>
                <span className="kv-value mono" style={{ fontSize: "0.82rem", wordBreak: "break-all" }}>
                  {SIM_OPERATOR}
                </span>
                <div style={{ marginTop: "0.45rem" }}>
                  <CopyButton value={SIM_OPERATOR} label="Copy address" />
                </div>
              </div>
              <div className="kv-item">
                <span className="kv-label">Live auto-list threshold</span>
                <span className="kv-value">{liveThreshold ?? "…"}</span>
              </div>
            </div>
            <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
              Threshold is read from chain. Edit it under On-chain config — not here.
            </p>
            <label htmlFor="tenure">CVI tenure (days)</label>
            <input
              id="tenure"
              type="number"
              value={tenureDays}
              onChange={(e) => setTenureDays(Number(e.target.value))}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={frozen}
                onChange={(e) => setFrozen(e.target.checked)}
              />
              A-Pass frozen (sanctions)
            </label>
            <div className="row-actions">
              <button
                type="button"
                className="btn"
                disabled={liveThreshold == null}
                onClick={() => void simulate()}
              >
                Run simulation
              </button>
              <Link className="btn secondary" to="/demo">
                Live freeze demo →
              </Link>
            </div>
          </section>

          {sim ? (
            <section className="panel accent-top">
              <h2>Result</h2>
              <div className="kv-grid">
                <div className="kv-item">
                  <span className="kv-label">Score</span>
                  <span className="kv-value">{sim.score}</span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Band</span>
                  <span className="kv-value">{sim.band}</span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Yield paid</span>
                  <span className="kv-value">{(sim.yieldPaidBps / 100).toFixed(0)}%</span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Escrowed</span>
                  <span className="kv-value">{(sim.yieldEscrowBps / 100).toFixed(0)}%</span>
                </div>
                <div className="kv-item full">
                  <span className="kv-label">Would auto-list (vs live {liveThreshold})</span>
                  <span className="kv-value">
                    {sim.wouldAutoList ? "Yes — LOR listed for transfer" : "No"}
                  </span>
                </div>
              </div>
              <ul className="plain-list" style={{ marginTop: "1rem" }}>
                <li>Healthy inputs → score ~88</li>
                <li>Frozen ×0.35 → score ~31 → full escrow</li>
                <li>Below live threshold → auto-list triggers</li>
              </ul>
            </section>
          ) : null}

          {cast.active ? (
            <section className="panel">
              <h2>Live compliance actions</h2>
              <p className="muted">
                Freeze / push score / activate against any address. After a low score push, LORs
                held by that wallet are auto-listed when score &lt; threshold ({liveThreshold ?? "…"}).
              </p>
              <label htmlFor="live-target">Operator address</label>
              <input
                id="live-target"
                value={liveTarget}
                onChange={(e) => setLiveTarget(e.target.value.trim())}
                placeholder="0x…"
                spellCheck={false}
              />
              <div className="chip-row" style={{ margin: "0.5rem 0 0.85rem" }}>
                {cast.roles
                  .filter((r) => /op|replacement/i.test(r.role) && r.address)
                  .map((r) => (
                    <button
                      key={r.role}
                      type="button"
                      className={`picker-chip${liveTarget.toLowerCase() === r.address.toLowerCase() ? " active" : ""}`}
                      onClick={() => setLiveTarget(r.address)}
                    >
                      {r.label ?? r.role}
                    </button>
                  ))}
              </div>
              <div className="row-actions">
                <CastActionButton
                  action="freeze"
                  role="regulator"
                  requireRole="regulator"
                  args={liveArgs}
                  label="Freeze A-Pass"
                  className="btn secondary"
                  disabled={!targetOk}
                />
                <CastActionButton
                  action="pushScore"
                  role="regulator"
                  args={liveArgs}
                  label="Push score (+ auto-list if low)"
                  disabled={!targetOk}
                />
                <CastActionButton
                  action="activate"
                  role="regulator"
                  requireRole="regulator"
                  args={liveArgs}
                  label="Activate A-Pass"
                  className="btn ghost"
                  disabled={!targetOk}
                />
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="stack-sections">
          <RequireWallet label="Connect to push threshold on-chain">
            <SiweStatus />
            <section className="panel">
              <h2>Update auto-list threshold</h2>
              <p className="muted">
                Current on-chain value: <strong>{liveThreshold ?? "…"}</strong>. Changing this
                affects Market auto-list and Playground simulations after push.
              </p>
              <label htmlFor="push-threshold">New threshold (0–100)</label>
              <input
                id="push-threshold"
                type="number"
                min={0}
                max={100}
                value={editThreshold}
                onChange={(e) => setEditThreshold(Number(e.target.value))}
              />
              <div className="row-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !siwe.authenticated}
                  onClick={() => void pushOnChain()}
                >
                  {busy ? "Writing…" : "Push on-chain"}
                </button>
              </div>
              {pushTx ? (
                <div className="alert success">Updated — tx {pushTx.slice(0, 18)}…</div>
              ) : null}
            </section>
          </RequireWallet>

          <section className="panel">
            <h2>Live config</h2>
            {cfg ? (
              <div className="kv-grid">
                <div className="kv-item">
                  <span className="kv-label">Chain</span>
                  <span className="kv-value">{cfg.chainId}</span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Auto-list threshold</span>
                  <span className="kv-value">{cfg.autoListThreshold}</span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Freeze multiplier</span>
                  <span className="kv-value">{cfg.freezeMultiplier}</span>
                </div>
                <div className="kv-item full">
                  <span className="kv-label">LOR Registry</span>
                  <span className="kv-value mono" style={{ fontSize: "0.8rem" }}>
                    {cfg.lorRegistry}
                  </span>
                </div>
              </div>
            ) : (
              <p className="muted">Loading…</p>
            )}

            {cfg?.yieldBands ? (
              <>
                <h3 className="subhead">Yield bands</h3>
                <div className="card-list">
                  {cfg.yieldBands.map((b) => (
                    <div className="lor-card" key={b.min}>
                      <div className="lor-card-header">
                        <strong>Score ≥ {b.min}</strong>
                      </div>
                      <div className="lor-card-meta">
                        <span>Paid {(b.paidBps / 100).toFixed(0)}%</span>
                        <span>Escrow {(b.escrowBps / 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
