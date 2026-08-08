import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccount, useReadContract } from "wagmi";
import { RequireWallet } from "../components/RequireWallet";
import { SubTabs } from "../components/SubTabs";
import { TxButton } from "../components/TxButton";
import { ScoreBadge } from "../components/ScoreBadge";
import { CleanverseStrip, RoleGuide } from "../components/CleanverseStrip";
import { Dialog } from "../components/Dialog";
import { CastActionButton } from "../components/CastActionButton";
import { useCast, roleLabel } from "../hooks/useCast";
import { useAcquireLOR, useApproveToken } from "../hooks/useOperaWrites";
import { addresses, lorAbi, scoreAbi } from "../lib/contracts";
import { apiGet, deployments } from "../api";
import { formatUnits6, shortAddr } from "../lib/format";

type MarketTab = "browse" | "oracle";

type LorRow = {
  lorId: string;
  assetId: string;
  holder: string;
  scope: string;
  price: string;
  autoListed: boolean;
  active: boolean;
  minScoreToHold: string;
};

type OracleData = {
  category: string;
  observationCount: string;
  twap7d: string | null;
  twapError: string | null;
  oracle: string;
};

const TABS = [
  { id: "browse" as const, label: "Browse" },
  { id: "oracle" as const, label: "Oracle" },
];

export function MarketPage() {
  const [tab, setTab] = useState<MarketTab>("browse");
  const [listed, setListed] = useState<LorRow[] | null>(null);
  const [oracle, setOracle] = useState<OracleData | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLor, setSelectedLor] = useState<LorRow | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const acquire = useAcquireLOR();
  const approve = useApproveToken();
  const { address } = useAccount();
  const cast = useCast();

  const { data: buyerScore } = useReadContract({
    address: addresses.ScoreStore,
    abi: scoreAbi,
    functionName: "getScore",
    args: address ? [address] : undefined,
  });

  const { data: nextLorId } = useReadContract({
    address: addresses.LORRegistry,
    abi: lorAbi,
    functionName: "nextId",
  });

  useEffect(() => {
    void apiGet<{ lors: LorRow[]; autoListThreshold: number }>("/lors?listed=1")
      .then((res) => {
        setListed(res.lors ?? []);
        setThreshold(res.autoListThreshold ?? null);
      })
      .catch(() => setListed([]));

    void apiGet<OracleData>("/oracle/prices")
      .then(setOracle)
      .catch(() => setOracle(null));
  }, [acquire.isConfirmed]);

  const deepLorId = searchParams.get("lorId");

  useEffect(() => {
    if (!listed || !deepLorId) return;
    const match = listed.find((l) => l.lorId === deepLorId);
    if (!match) return;
    setSelectedLor(match);
    setDialogOpen(true);
    setTab("browse");
  }, [listed, deepLorId]);

  const approveAmount = useMemo(() => {
    const raw = selectedLor?.price;
    if (!raw || !/^\d+$/.test(raw)) return null;
    const n = BigInt(raw);
    return n > 0n ? n : null;
  }, [selectedLor]);

  function openAcquire(lor: LorRow) {
    setSelectedLor(lor);
    setDialogOpen(true);
    setSearchParams({ lorId: lor.lorId }, { replace: true });
  }

  function closeDialog() {
    setDialogOpen(false);
    if (searchParams.has("lorId")) {
      const next = new URLSearchParams(searchParams);
      next.delete("lorId");
      setSearchParams(next, { replace: true });
    }
  }

  const scoreOk =
    buyerScore == null || selectedLor == null
      ? true
      : Number(buyerScore) >= Number(selectedLor.minScoreToHold);

  return (
    <div>
      <header className="page-head">
        <div>
          <p className="eyebrow">Rights market</p>
          <h1>Market</h1>
          <p className="lede">
            When an operator&apos;s Cleanverse-backed score drops too low, their operating licence
            (LOR) is forced onto this market. Buy it with oCVA if your score qualifies.
          </p>
        </div>
      </header>

      <RoleGuide
        role="What you do here"
        title="Pick up rights that fell out of compliance"
        steps={[
          "Browse LORs auto-listed when an operator's score crossed the threshold.",
          "Acquire with Cleanverse oCVA — you must meet the LOR's minimum score.",
          "Watch the oracle TWAP: it prices how the market values compliance quality.",
        ]}
      />

      <SubTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "browse" ? (
        <>
          <section className="panel accent-top" style={{ marginBottom: "1rem" }}>
            <div className="stat-row">
              <div className="stat-item">
                <span className="stat-value">{threshold ?? "—"}</span>
                <span className="stat-label">Auto-list threshold</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{listed?.length ?? "—"}</span>
                <span className="stat-label">Listed</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">
                  {nextLorId != null ? String(Number(nextLorId) - 1) : "—"}
                </span>
                <span className="stat-label">Total LORs</span>
              </div>
              {address && buyerScore != null ? (
                <div className="stat-item">
                  <span className="stat-value">{Number(buyerScore)}</span>
                  <span className="stat-label">Your score</span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel">
            <h2>Listed LORs</h2>
            <p className="muted" style={{ marginBottom: "0.5rem" }}>
              Select a listing to review price, score gate, then Approve and Acquire.
            </p>
            {listed === null ? (
              <p className="muted">Loading…</p>
            ) : listed.length === 0 ? (
              <div className="empty-state">
                <p>No listed LORs.</p>
                <p style={{ fontSize: "0.85rem" }}>
                  Rights auto-list when an operator&apos;s score falls below the threshold
                  {threshold != null ? ` (${threshold})` : ""}.
                </p>
              </div>
            ) : (
              <div className="card-list">
                {listed.map((lor) => (
                  <button
                    type="button"
                    key={lor.lorId}
                    className={`lor-card selectable${selectedLor?.lorId === lor.lorId && dialogOpen ? " selected" : ""}`}
                    onClick={() => openAcquire(lor)}
                  >
                    <div className="lor-card-header">
                      <div>
                        <strong>LOR #{lor.lorId}</strong>
                        <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.78rem" }}>
                          Asset {lor.assetId}
                        </span>
                      </div>
                      <span style={{ fontWeight: 600 }}>{formatUnits6(lor.price)} oCVA</span>
                    </div>
                    <div className="lor-card-meta">
                      <span>{lor.scope}</span>
                      <span>Min score {lor.minScoreToHold}</span>
                      <span className="mono">{shortAddr(lor.holder)}</span>
                    </div>
                    <p className="muted" style={{ fontSize: "0.75rem", margin: "0.35rem 0 0" }}>
                      Select to acquire →
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {tab === "oracle" ? (
        <div className="stack-sections">
          <section className="panel oracle-hero">
            <p className="eyebrow">Rights Price Oracle</p>
            <h2>Compliance quality index</h2>
            <p className="muted" style={{ maxWidth: "36rem" }}>
              Every time a Living Operating Right changes hands, the price is recorded. The 7-day
              average is a live market signal for how valuable clean operators are in this asset class.
            </p>

            {oracle ? (
              <>
                <div className="oracle-twap">
                  <span className="oracle-twap-value">
                    {oracle.twap7d != null ? formatUnits6(oracle.twap7d) : "—"}
                  </span>
                  <span className="oracle-twap-unit">
                    oCVA <em>7-day TWAP</em>
                  </span>
                </div>
                {oracle.twapError ? (
                  <p className="muted" style={{ color: "var(--warn)" }}>
                    TWAP unavailable: {oracle.twapError}
                  </p>
                ) : null}
                <div className="oracle-meta">
                  <div>
                    <span className="kv-label">Asset class</span>
                    <span className="oracle-meta-value">{oracle.category}</span>
                  </div>
                  <div>
                    <span className="kv-label">Price observations</span>
                    <span className="oracle-meta-value">{oracle.observationCount}</span>
                  </div>
                  <div>
                    <span className="kv-label">Settlement</span>
                    <span className="oracle-meta-value">{deployments.settlementSymbol}</span>
                  </div>
                </div>
                <p className="oracle-footnote mono">Contract {oracle.oracle}</p>
              </>
            ) : (
              <p className="muted">Loading oracle…</p>
            )}
          </section>
          <CleanverseStrip compact />
        </div>
      ) : null}

      <Dialog
        open={dialogOpen}
        title={selectedLor ? `Acquire LOR #${selectedLor.lorId}` : "Acquire LOR"}
        onClose={closeDialog}
      >
        {selectedLor ? (
          <>
            <div className="kv-grid">
              <div className="kv-item">
                <span className="kv-label">Price</span>
                <span className="kv-value">{formatUnits6(selectedLor.price)} oCVA</span>
              </div>
              <div className="kv-item">
                <span className="kv-label">Min score</span>
                <span className="kv-value">{selectedLor.minScoreToHold}</span>
              </div>
              <div className="kv-item">
                <span className="kv-label">Scope</span>
                <span className="kv-value">{selectedLor.scope}</span>
              </div>
              <div className="kv-item">
                <span className="kv-label">Current holder</span>
                <span className="kv-value mono" style={{ fontSize: "0.85rem" }}>
                  {shortAddr(selectedLor.holder)}
                </span>
              </div>
            </div>
            {cast.active ? (
              <div style={{ marginTop: "0.85rem" }}>
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  Cast acquire signs as {roleLabel(cast.selectedRole)}. Select{" "}
                  <strong>Replacement operator</strong> in the cast bar.
                </p>
                <CastActionButton
                  action="acquire"
                  requireRole="replacement"
                  args={{ lorId: selectedLor.lorId }}
                  label={`Acquire LOR #${selectedLor.lorId} (cast)`}
                />
              </div>
            ) : (
              <RequireWallet label="Connect wallet to acquire">
                <>
                  {buyerScore != null ? (
                    <div className="chip-row" style={{ margin: "0.85rem 0" }}>
                      <ScoreBadge score={Number(buyerScore)} label="Your score" />
                      {!scoreOk ? (
                        <span className="muted" style={{ fontSize: "0.85rem", color: "var(--warn)" }}>
                          Below minimum — acquire may revert
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="row-actions">
                    <TxButton
                      label={
                        approveAmount != null
                          ? `Approve ${formatUnits6(approveAmount)} oCVA`
                          : "Approve (no price)"
                      }
                      onClick={() => {
                        if (approveAmount == null) return;
                        approve.approve(addresses.LORRegistry, approveAmount);
                      }}
                      isPending={approve.isPending}
                      isConfirming={approve.isConfirming}
                      isConfirmed={approve.isConfirmed}
                      hash={approve.hash}
                      error={approve.error}
                      className="btn secondary"
                      disabled={approveAmount == null}
                    />
                    <TxButton
                      label="Acquire"
                      onClick={() => acquire.acquire(BigInt(selectedLor.lorId))}
                      isPending={acquire.isPending}
                      isConfirming={acquire.isConfirming}
                      isConfirmed={acquire.isConfirmed}
                      hash={acquire.hash}
                      error={acquire.error}
                      disabled={approveAmount == null}
                    />
                  </div>
                </>
              </RequireWallet>
            )}
            {acquire.isConfirmed ? (
              <div className="alert success" style={{ marginTop: "0.85rem" }}>
                Acquired. You can close this dialog.
              </div>
            ) : null}
          </>
        ) : null}
      </Dialog>
    </div>
  );
}
