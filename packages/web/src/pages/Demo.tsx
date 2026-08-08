import { Link } from "react-router-dom";
import { EventFeed } from "../components/EventFeed";
import { ActionChip, CopyButton } from "../components/CopyButton";
import { CastActionButton } from "../components/CastActionButton";
import { EXPLORER_TX, ROLE_LABELS, roleLabel, useCast } from "../hooks/useCast";
import { shortAddr } from "../lib/format";
import { FAUCET_URL } from "../config/monad";

/** Plain-language cast for the solar-farm story */
const CAST_PLAYERS = [
  {
    role: "owner",
    title: "Asset owner",
    where: "Singapore family office",
    job: "Owns the solar farm. Hires operators and decides who gets the job.",
  },
  {
    role: "energyOp",
    title: "Energy operator",
    where: "Day-to-day ops",
    job: "Collects and distributes electricity revenue from the farm.",
  },
  {
    role: "maintOp",
    title: "Maintenance operator",
    where: "Day-to-day ops",
    job: "Keeps panels and equipment running. This is who gets flagged in the freeze story.",
  },
  {
    role: "replacement",
    title: "Replacement operator",
    where: "Standby",
    job: "Steps in when maintenance fails compliance and buys the operating right on the market.",
  },
  {
    role: "regulator",
    title: "Regulator",
    where: "MAS examiner lens",
    job: "Can freeze a bad actor and download the audit trail at the end.",
  },
  {
    role: "investor",
    title: "Investor",
    where: "Capital side",
    job: "Cares that operators stay compliant so the asset keeps paying.",
  },
] as const;

const STAGES: {
  id: string;
  title: string;
  role: string;
  desk: string;
  to: string;
  hint: string;
}[] = [
  {
    id: "seed",
    title: "1. Seed cast",
    role: "system",
    desk: "Cast HQ",
    to: "/demo",
    hint: "Bootstrap wallets, mint LORs, publish mandates, fund oCVA stakes",
  },
  {
    id: "hire",
    title: "2. Hire",
    role: "owner",
    desk: "Owner",
    to: "/owner?tab=mandates",
    hint: "Mint LORs, publish auctions, award bidders",
  },
  {
    id: "operate",
    title: "3. Operate",
    role: "energyOp",
    desk: "Operator",
    to: "/operator?tab=revenue",
    hint: "Bid (if needed) and distribute revenue under yield bonding",
  },
  {
    id: "freeze",
    title: "4. Freeze",
    role: "regulator",
    desk: "Rules",
    to: "/playground",
    hint: "Freeze maint A-Pass and push collapsed score on-chain",
  },
  {
    id: "autolist",
    title: "5. Auto-list",
    role: "system",
    desk: "Operator",
    to: "/operator?tab=portfolio",
    hint: "Force-list the distressed maintenance LOR onto Market",
  },
  {
    id: "acquire",
    title: "6. Acquire",
    role: "replacement",
    desk: "Market",
    to: "/market",
    hint: "Replacement operator buys the listed LOR with oCVA",
  },
  {
    id: "export",
    title: "7. Export",
    role: "regulator",
    desk: "Audit",
    to: "/audit",
    hint: "Download the signed regulator audit pack",
  },
];

function stageStatus(
  suggested: string,
  stageId: string,
  steps: Array<{ step: string; status: string }>,
): "done" | "ready" | "pending" {
  const done = new Set(steps.filter((s) => s.status === "done").map((s) => s.step));
  if (stageId === "seed") {
    return done.has("fundAndStake") || done.has("setupAsset") ? "done" : suggested === "seed" ? "ready" : "pending";
  }
  if (stageId === "hire") {
    return done.has("fundAndStake") ? "done" : done.has("setupAsset") ? "ready" : "pending";
  }
  if (stageId === "operate") {
    return done.has("normalOps") ? "done" : done.has("fundAndStake") ? "ready" : "pending";
  }
  if (stageId === "freeze" || stageId === "autolist") {
    return done.has("sanctionsEvent") ? "done" : done.has("normalOps") || done.has("fundAndStake") ? "ready" : "pending";
  }
  if (stageId === "acquire") {
    return done.has("replacementAcquire") ? "done" : done.has("sanctionsEvent") ? "ready" : "pending";
  }
  if (stageId === "export") {
    return done.has("regulatorExport") ? "done" : "ready";
  }
  return suggested === stageId ? "ready" : "pending";
}

export function DemoPage() {
  const cast = useCast();
  const steps = cast.cast?.steps ?? [];
  const suggested = cast.cast?.suggestedStage ?? "seed";
  const ids = cast.cast?.ids;

  return (
    <div className="demo-page cast-hq">
      <header className="page-head">
        <div>
          <p className="eyebrow">PRD §8 · Solar farm</p>
          <h1>Cast HQ</h1>
          <p className="lede">
            Seed the cast, pick who you are acting as, then run the story from Owner, Operator,
            Market, Rules, and Audit.
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn"
            disabled={!!cast.busy}
            onClick={() => void cast.seedCast()}
          >
            {cast.busy === "seed" ? "Seeding…" : cast.active ? "Re-seed cast" : "Seed cast"}
          </button>
          {cast.active ? (
            <button type="button" className="btn ghost" onClick={cast.clearCast}>
              Clear cast
            </button>
          ) : null}
          <a className="btn secondary" href={FAUCET_URL} target="_blank" rel="noreferrer">
            Monad faucet
          </a>
        </div>
      </header>

      <section className="section-callout cast-story" role="note">
        <strong>The story</strong>
        <p>
          A Singapore family office owns a <em>Malaysian solar farm</em>. They hire two operators:
          one to handle energy revenue, one to handle maintenance. If the maintenance operator gets
          sanctioned, their licence is forced onto the market and a clean replacement can buy it.
          The regulator can pull a signed paper trail at the end.
        </p>
      </section>

      <section className="panel cast-players-panel" aria-label="Who is who">
        <h2>Who is who</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          These are the people in this demo. Use the cast bar (or Act as) to sign as one of them.
        </p>
        <div className="cast-players-grid">
          {CAST_PLAYERS.map((p) => (
            <div className="cast-player-card" key={p.role}>
              <strong>{p.title}</strong>
              <span className="cast-player-where">{p.where}</span>
              <p className="muted">{p.job}</p>
              {cast.active ? (
                <button
                  type="button"
                  className={`picker-chip${cast.selectedRole === p.role ? " active" : ""}`}
                  onClick={() => cast.setSelectedRole(p.role)}
                >
                  {cast.selectedRole === p.role ? "Acting" : "Act as"}
                </button>
              ) : (
                <span className="tiny muted">Seed cast to activate</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {cast.error ? <div className="alert error">{cast.error}</div> : null}
      {cast.lastResult ? (
        <section className="panel accent-top cast-result-panel">
          <h2>Last cast action</h2>
          <p>{cast.lastResult.summary}</p>
          <div className="chip-row">
            {cast.lastResult.actors.map((a) => (
              <span key={`${a.role}-${a.address}`} className="picker-chip active">
                {roleLabel(a.role)} · {shortAddr(a.address)}
              </span>
            ))}
          </div>
          <div className="cast-tx-list" style={{ marginTop: "0.75rem" }}>
            {cast.lastResult.txs.length === 0 ? (
              <p className="muted">No on-chain txs for this action (off-chain / Cleanverse only).</p>
            ) : (
              cast.lastResult.txs.map((tx) => (
                <a
                  key={tx.hash}
                  className="cast-tx-link mono"
                  href={`${EXPLORER_TX}/${tx.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {tx.label}: {tx.hash} ↗
                </a>
              ))
            )}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <h2>Lifecycle board</h2>
        <p className="muted">
          Follow the stages in order. Each stage names the cast role that should be selected in the
          bar, then open that desk.
        </p>
        <ol className="cast-stage-board">
          {STAGES.map((stage) => {
            const status = stageStatus(suggested, stage.id, steps);
            return (
              <li key={stage.id} className={`cast-stage cast-stage-${status}`}>
                <div className="cast-stage-head">
                  <strong>{stage.title}</strong>
                  <span className={`cast-stage-badge ${status}`}>{status}</span>
                </div>
                <p className="muted">{stage.hint}</p>
                <p className="tiny">
                  Act as <strong>{stage.role === "system" ? "any / system" : roleLabel(stage.role)}</strong>
                </p>
                <div className="chip-row">
                  {stage.role !== "system" ? (
                    <button
                      type="button"
                      className="picker-chip"
                      disabled={!cast.active}
                      onClick={() => cast.setSelectedRole(stage.role)}
                    >
                      Select {roleLabel(stage.role)}
                    </button>
                  ) : null}
                  <Link className="picker-chip action-chip" to={stage.to}>
                    Open {stage.desk} →
                  </Link>
                </div>
                {stage.id === "seed" ? (
                  <div style={{ marginTop: "0.65rem" }}>
                    <button
                      type="button"
                      className="btn"
                      disabled={!!cast.busy}
                      onClick={() => void cast.seedCast()}
                    >
                      {cast.busy === "seed" ? "Seeding…" : "Run seed"}
                    </button>
                  </div>
                ) : null}
                {stage.id === "freeze" ? (
                  <div className="row-actions" style={{ marginTop: "0.65rem" }}>
                    <CastActionButton
                      action="freeze"
                      role="regulator"
                      requireRole="regulator"
                      args={{ targetRole: "maintOp" }}
                      label="Freeze maint A-Pass"
                      className="btn secondary"
                    />
                    <CastActionButton
                      action="pushScore"
                      role="regulator"
                      args={{ targetRole: "maintOp" }}
                      label="Push frozen score"
                      className="btn"
                    />
                  </div>
                ) : null}
                {stage.id === "autolist" ? (
                  <div style={{ marginTop: "0.65rem" }}>
                    <CastActionButton
                      action="autoList"
                      args={ids?.maintLorId != null ? { lorId: String(ids.maintLorId) } : {}}
                      label="Auto-list maint LOR"
                    />
                  </div>
                ) : null}
                {stage.id === "export" ? (
                  <div style={{ marginTop: "0.65rem" }}>
                    <CastActionButton action="export" role="regulator" label="Build audit export" />
                    {cast.runId ? (
                      <Link className="btn secondary" to="/audit" style={{ marginLeft: "0.5rem" }}>
                        Open Audit →
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="demo-grid" style={{ marginTop: "1.25rem" }}>
        <section className="panel">
          <h2>Cast roster</h2>
          {!cast.active ? (
            <p className="muted">Seed a cast to allocate role wallets.</p>
          ) : (
            <div className="card-list">
              {cast.roles.map((r) => (
                <div
                  className={`lor-card${cast.selectedRole === r.role ? " selected" : ""}`}
                  key={r.role}
                >
                  <div className="lor-card-header">
                    <strong>{ROLE_LABELS[r.role] ?? r.role}</strong>
                    {cast.selectedRole === r.role ? (
                      <span className="cast-signed-pill">acting</span>
                    ) : null}
                  </div>
                  <p className="mono" style={{ fontSize: "0.8rem", margin: "0.35rem 0" }}>
                    {r.address}
                  </p>
                  <div className="chip-row">
                    <CopyButton value={r.address} label="Copy" />
                    <button
                      type="button"
                      className="picker-chip"
                      onClick={() => cast.setSelectedRole(r.role)}
                    >
                      Act as
                    </button>
                    {/owner/i.test(r.role) ? (
                      <ActionChip to="/owner">Owner →</ActionChip>
                    ) : null}
                    {/op|replacement|maint|energy/i.test(r.role) ? (
                      <ActionChip to="/operator">Operator →</ActionChip>
                    ) : null}
                    {/regulator/i.test(r.role) ? (
                      <ActionChip to="/audit">Audit →</ActionChip>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          {ids ? (
            <>
              <h3 className="subhead">On-chain ids</h3>
              <div className="kv-grid">
                {Object.entries(ids)
                  .filter(([, v]) => v != null && v !== "")
                  .map(([k, v]) => (
                    <div className="kv-item" key={k}>
                      <span className="kv-label">{k}</span>
                      <span className="kv-value mono" style={{ fontSize: "0.85rem" }}>
                        {String(v)}
                      </span>
                    </div>
                  ))}
              </div>
            </>
          ) : null}
        </section>

        <section className="panel feed-panel">
          <h2>Activity</h2>
          <EventFeed events={cast.events} empty="Seed the cast to start the event trail." />
        </section>
      </div>
    </div>
  );
}
