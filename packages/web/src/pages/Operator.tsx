import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAccount, useReadContract } from "wagmi";
import type { Hex } from "viem";
import { RequireWallet } from "../components/RequireWallet";
import { SiweStatus } from "../components/SiweGate";
import { SubTabs } from "../components/SubTabs";
import { TxButton } from "../components/TxButton";
import { ScoreBadge, YieldBand, ApassStatus } from "../components/ScoreBadge";
import { CleanverseStrip, RoleGuide } from "../components/CleanverseStrip";
import { Dialog } from "../components/Dialog";
import { ActingAsCue } from "../components/ActingAsCue";
import {
  useBidMandate,
  useDistributeRevenue,
  useApproveToken,
} from "../hooks/useOperaWrites";
import { useSiweSession } from "../hooks/useSiweSession";
import { addresses, scoreAbi, revenueAbi, erc20Abi } from "../lib/contracts";
import { apiGet, getMe, deployments, ensureApass, pushScore } from "../api";
import { formatUnits6, shortAddr } from "../lib/format";

type OpTab = "overview" | "bid" | "portfolio" | "revenue";

type MandateRow = {
  mandateId: string;
  assetId: string;
  scope: string;
  minScore: string;
  stakeAmount: string;
  publisher: string;
  open: boolean;
  awarded: boolean;
};

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

const GROSS_PRESETS = ["50000", "100000", "180000", "250000"] as const;

function yieldSplit(score: number | null): { paidBps: number; escrowBps: number; label: string } {
  if (score == null) return { paidBps: 0, escrowBps: 10000, label: "Unknown score" };
  if (score >= 95) return { paidBps: 10000, escrowBps: 0, label: "100% to you" };
  if (score >= 80) return { paidBps: 8500, escrowBps: 1500, label: "85% yield · 15% escrow" };
  if (score >= 70) return { paidBps: 6000, escrowBps: 4000, label: "60% yield · 40% escrow" };
  return { paidBps: 0, escrowBps: 10000, label: "Suspended · full escrow" };
}

const TABS = [
  { id: "overview" as const, label: "Overview" },
  { id: "bid" as const, label: "Bid" },
  { id: "portfolio" as const, label: "Portfolio" },
  { id: "revenue" as const, label: "Revenue" },
];

function isOpTab(v: string | null): v is OpTab {
  return v === "overview" || v === "bid" || v === "portfolio" || v === "revenue";
}

export function OperatorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: OpTab = isOpTab(tabParam) ? tabParam : "overview";

  function setTab(next: OpTab) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", next);
    if (next !== "bid") nextParams.delete("mandateId");
    setSearchParams(nextParams, { replace: true });
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <p className="eyebrow">Operator</p>
          <h1>Operator</h1>
          <p className="lede">
            You want to run operations on someone else&apos;s asset. You stake Cleanverse oCVA to
            win the job — and your live compliance score decides how much yield you actually keep.
          </p>
        </div>
      </header>

      <ActingAsCue role="Operator" />

      <RoleGuide
        role="What you do here"
        title="Compete for work, stay compliant, earn yield"
        steps={[
          "Keep your Cleanverse A-Pass active — a freeze tanks your score and can auto-list your LOR.",
          "Bid on open mandates with an oCVA stake (your compliance bond).",
          "Hold LORs and distribute revenue — payout splits follow your Cleanverse-backed score.",
        ]}
      />

      <SubTabs tabs={TABS} active={tab} onChange={setTab} />

      <RequireWallet label="Connect your operator wallet to continue">
        <SiweStatus />
        <OperatorBody tab={tab} />
      </RequireWallet>
    </div>
  );
}

function OperatorBody({ tab }: { tab: OpTab }) {
  const { address } = useAccount();
  const siwe = useSiweSession();
  const [searchParams] = useSearchParams();
  const mandateParam = searchParams.get("mandateId");
  const [me, setMe] = useState<Awaited<ReturnType<typeof getMe>> | null>(null);
  const [openMandates, setOpenMandates] = useState<MandateRow[] | null>(null);
  const [heldLors, setHeldLors] = useState<LorRow[] | null>(null);
  const [bidId, setBidId] = useState("");
  const [bidOpen, setBidOpen] = useState(false);
  const [selectedMandate, setSelectedMandate] = useState<MandateRow | null>(null);
  const [distGross, setDistGross] = useState("180000");
  const [apassBusy, setApassBusy] = useState(false);
  const [scoreBusy, setScoreBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState(true);
  const bid = useBidMandate();
  const approve = useApproveToken();
  const distribute = useDistributeRevenue();

  async function onEnsureApass() {
    setApassBusy(true);
    setActionMsg(null);
    try {
      const res = await ensureApass();
      setActionOk(true);
      setActionMsg(`A-Pass ensured for ${shortAddr(res.address)}`);
      setMe(await getMe());
    } catch (e) {
      setActionOk(false);
      setActionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setApassBusy(false);
    }
  }

  async function onPushScore() {
    setScoreBusy(true);
    setActionMsg(null);
    try {
      const res = await pushScore();
      setActionOk(true);
      setActionMsg(`Score pushed: ${res.score} (tx ${shortAddr(res.tx)})`);
      setMe(await getMe());
    } catch (e) {
      setActionOk(false);
      setActionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setScoreBusy(false);
    }
  }

  const { data: onChainScore } = useReadContract({
    address: addresses.ScoreStore,
    abi: scoreAbi,
    functionName: "getScore",
    args: address ? [address] : undefined,
  });

  const { data: escrowBalance } = useReadContract({
    address: addresses.RevenueManager,
    abi: revenueAbi,
    functionName: "escrow",
    args: address ? [address] : undefined,
  });

  const { data: tokenBalance } = useReadContract({
    address: addresses.OperaAToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  useEffect(() => {
    if (!siwe.authenticated) return;
    void getMe()
      .then(setMe)
      .catch(() => undefined);
  }, [siwe.authenticated]);

  useEffect(() => {
    void apiGet<{ mandates: MandateRow[] }>("/mandates?open=1")
      .then((res) => setOpenMandates(res.mandates ?? []))
      .catch(() => setOpenMandates([]));
  }, [bid.isConfirmed]);

  useEffect(() => {
    if (!address) return;
    void apiGet<{ lors: LorRow[] }>("/lors")
      .then((res) => {
        const all = res.lors ?? [];
        setHeldLors(all.filter((l) => l.holder?.toLowerCase() === address.toLowerCase()));
      })
      .catch(() => setHeldLors([]));
  }, [address]);

  const score =
    onChainScore != null
      ? Number(onChainScore)
      : me?.onChainScore != null
        ? Number(me.onChainScore)
        : null;

  const stakeApproveAmount = (() => {
    const raw = selectedMandate?.stakeAmount;
    if (!raw || !/^\d+$/.test(raw)) return null;
    const n = BigInt(raw);
    return n > 0n ? n : null;
  })();

  const split = yieldSplit(score);
  const grossUnits = (() => {
    if (!/^\d+$/.test(distGross || "")) return 0n;
    return BigInt(distGross) * 1_000_000n;
  })();
  const paidPreview = (grossUnits * BigInt(split.paidBps)) / 10000n;
  const escrowPreview = (grossUnits * BigInt(split.escrowBps)) / 10000n;

  useEffect(() => {
    if (tab !== "bid" || !mandateParam || !openMandates) return;
    const match = openMandates.find((m) => m.mandateId === mandateParam);
    if (!match) return;
    setBidId(match.mandateId);
    setSelectedMandate(match);
    setBidOpen(true);
  }, [tab, mandateParam, openMandates]);

  if (tab === "overview") {
    return (
      <div className="stack-sections">
        <section className="panel accent-top">
          <div className="overview-grid">
            <div>
              <p className="mono muted" style={{ fontSize: "0.8rem" }}>
                {address}
              </p>
              <div className="chip-row">
                <ScoreBadge score={score} label="Score" />
                <YieldBand score={score} />
                {me?.apass ? <ApassStatus status={me.apass.status} /> : null}
              </div>
            </div>
            <div className="stat-row">
              <div className="stat-item">
                <span className="stat-value">{formatUnits6(tokenBalance)}</span>
                <span className="stat-label">oCVA (Cleanverse)</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{formatUnits6(escrowBalance)}</span>
                <span className="stat-label">Escrowed</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{heldLors?.length ?? "—"}</span>
                <span className="stat-label">LORs held</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{openMandates?.length ?? "—"}</span>
                <span className="stat-label">Open mandates</span>
              </div>
            </div>
          </div>
          <p className="muted flow-hint">
            Next: open Bid to stake oCVA on a mandate, or check Portfolio for LORs you already hold.
          </p>
          <div className="row-actions" style={{ marginTop: "0.85rem" }}>
            <button
              type="button"
              className="btn secondary"
              disabled={apassBusy || !siwe.authenticated}
              onClick={() => void onEnsureApass()}
            >
              {apassBusy ? "Ensuring…" : "Ensure A-Pass"}
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={scoreBusy || !siwe.authenticated}
              onClick={() => void onPushScore()}
            >
              {scoreBusy ? "Pushing…" : "Push score on-chain"}
            </button>
          </div>
          {actionMsg ? (
            <div
              className={`alert ${actionOk ? "success" : "error"}`}
              style={{ marginTop: "0.75rem" }}
            >
              {actionMsg}
            </div>
          ) : null}
        </section>
        <CleanverseStrip compact />
      </div>
    );
  }

  if (tab === "bid") {
    return (
      <div className="stack-sections">
        <div className="section-callout" role="note">
          <strong>Bidding on mandates</strong>
          <p>
            This list shows open jobs from asset owners. Pick one to stake Cleanverse oCVA and compete
            for the operating right — your bond is at risk if your compliance score collapses later.
          </p>
        </div>

        <section className="panel">
          <div className="split-list-head">
            <h2>Open mandates</h2>
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              {openMandates?.length ?? 0} available · click to bid
            </span>
          </div>

          {openMandates === null ? (
            <p className="muted">Loading…</p>
          ) : openMandates.length === 0 ? (
            <div className="empty-state">
              <p>No open mandates right now.</p>
              <p style={{ fontSize: "0.85rem" }}>
                When an owner publishes a mandate auction, it will appear here.
              </p>
            </div>
          ) : (
            <div className="card-list bid-mandate-list">
              {openMandates.map((m) => (
                <button
                  type="button"
                  key={m.mandateId}
                  className="lor-card selectable"
                  onClick={() => {
                    setBidId(m.mandateId);
                    setSelectedMandate(m);
                    setBidOpen(true);
                  }}
                >
                  <div className="lor-card-header">
                    <strong>Mandate #{m.mandateId}</strong>
                    <span className="yield-band full">Open</span>
                  </div>
                  <div className="lor-card-meta">
                    <span>{m.scope}</span>
                    <span>Min score {m.minScore}</span>
                    <span>Stake {formatUnits6(m.stakeAmount)} oCVA</span>
                    <span className="mono">Owner {shortAddr(m.publisher)}</span>
                  </div>
                  <p className="muted" style={{ fontSize: "0.75rem", margin: "0.4rem 0 0" }}>
                    Select to place bid →
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <Dialog
          open={bidOpen}
          title={`Bid on mandate #${selectedMandate?.mandateId ?? bidId}`}
          onClose={() => setBidOpen(false)}
        >
          {selectedMandate ? (
            <div className="dialog-summary">
              <div className="kv-grid">
                <div className="kv-item">
                  <span className="kv-label">Scope</span>
                  <span className="kv-value">{selectedMandate.scope}</span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Required stake</span>
                  <span className="kv-value">{formatUnits6(selectedMandate.stakeAmount)} oCVA</span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Min score</span>
                  <span className="kv-value">{selectedMandate.minScore}</span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Publisher</span>
                  <span className="kv-value mono" style={{ fontSize: "0.85rem" }}>
                    {shortAddr(selectedMandate.publisher)}
                  </span>
                </div>
              </div>
              <p className="muted" style={{ margin: "0.85rem 0 0", fontSize: "0.88rem" }}>
                Approve the Mandate Registry to spend your oCVA stake, then submit the bid
                transaction.
              </p>
            </div>
          ) : null}
          <div className="row-actions" style={{ marginTop: "1rem" }}>
            <TxButton
              label={
                stakeApproveAmount != null
                  ? `Approve ${formatUnits6(stakeApproveAmount)} oCVA`
                  : "Approve (no stake)"
              }
              onClick={() => {
                if (stakeApproveAmount == null) return;
                approve.approve(addresses.MandateRegistry, stakeApproveAmount);
              }}
              isPending={approve.isPending}
              isConfirming={approve.isConfirming}
              isConfirmed={approve.isConfirmed}
              hash={approve.hash}
              error={approve.error}
              className="btn secondary"
              disabled={stakeApproveAmount == null}
            />
            <TxButton
              label="Submit bid"
              onClick={() => bid.bid(BigInt(bidId))}
              isPending={bid.isPending}
              isConfirming={bid.isConfirming}
              isConfirmed={bid.isConfirmed}
              hash={bid.hash}
              error={bid.error}
              disabled={!bidId || stakeApproveAmount == null}
            />
          </div>
          {bid.isConfirmed ? (
            <div className="alert success" style={{ marginTop: "0.85rem" }}>
              Bid submitted. You can close this dialog.
            </div>
          ) : null}
        </Dialog>
      </div>
    );
  }

  if (tab === "portfolio") {
    return (
      <section className="panel">
        <h2>Your LOR portfolio</h2>
        {heldLors === null ? (
          <p className="muted">Loading…</p>
        ) : heldLors.length === 0 ? (
          <div className="empty-state">
            <p>No LORs held by this wallet.</p>
            <p style={{ fontSize: "0.85rem" }}>Acquire listed rights on the Market, or receive a mint from an owner.</p>
          </div>
        ) : (
          <div className="card-list">
            {heldLors.map((lor) => (
              <div className="lor-card" key={lor.lorId}>
                <div className="lor-card-header">
                  <strong>LOR #{lor.lorId}</strong>
                  {lor.autoListed ? (
                    <span className="yield-band suspended">Auto-listed</span>
                  ) : (
                    <span className="yield-band full">Active</span>
                  )}
                </div>
                <div className="lor-card-meta">
                  <span>{lor.scope}</span>
                  <span>Asset {lor.assetId}</span>
                  <span>Min score {lor.minScoreToHold}</span>
                  {lor.autoListed ? (
                    <span>Price {formatUnits6(lor.price)} oCVA</span>
                  ) : null}
                </div>
                {lor.autoListed ? (
                  <div className="row-actions" style={{ marginTop: "0.65rem" }}>
                    <Link className="btn secondary" to={`/market?lorId=${lor.lorId}`}>
                      View on Market →
                    </Link>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Distribute revenue</h2>
      <p className="muted">
        Yield bonding splits payouts by the operator&apos;s live compliance score.
      </p>
      <label htmlFor="dist-gross">Gross amount ({deployments.settlementSymbol})</label>
      <input id="dist-gross" value={distGross} onChange={(e) => setDistGross(e.target.value)} />
      <div className="chip-row" style={{ marginTop: "0.5rem", marginBottom: "0.75rem" }}>
        {GROSS_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className={`picker-chip${distGross === p ? " active" : ""}`}
            onClick={() => setDistGross(p)}
          >
            {Number(p).toLocaleString()}
          </button>
        ))}
      </div>
      <div className="kv-grid" style={{ marginBottom: "1rem" }}>
        <div className="kv-item">
          <span className="kv-label">Your score</span>
          <span className="kv-value">{score ?? "—"}</span>
        </div>
        <div className="kv-item">
          <span className="kv-label">Split</span>
          <span className="kv-value" style={{ fontSize: "0.85rem" }}>
            {split.label}
          </span>
        </div>
        <div className="kv-item">
          <span className="kv-label">You receive</span>
          <span className="kv-value">{formatUnits6(paidPreview)}</span>
        </div>
        <div className="kv-item">
          <span className="kv-label">Escrowed</span>
          <span className="kv-value">{formatUnits6(escrowPreview)}</span>
        </div>
      </div>
      <div className="row-actions">
        <TxButton
          label="Distribute"
          onClick={() => {
            if (!address || !/^\d+$/.test(distGross)) return;
            distribute.distribute(address as Hex, BigInt(distGross) * 1_000_000n);
          }}
          isPending={distribute.isPending}
          isConfirming={distribute.isConfirming}
          isConfirmed={distribute.isConfirmed}
          hash={distribute.hash}
          error={distribute.error}
          disabled={!address || !/^\d+$/.test(distGross) || BigInt(distGross) === 0n}
        />
      </div>
    </section>
  );
}
