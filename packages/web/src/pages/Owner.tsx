import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RequireWallet } from "../components/RequireWallet";
import { SiweStatus } from "../components/SiweGate";
import { SubTabs } from "../components/SubTabs";
import { TxButton } from "../components/TxButton";
import { ScoreBadge, YieldBand, ApassStatus } from "../components/ScoreBadge";
import { NotificationList } from "../components/NotificationList";
import { CleanverseStrip, RoleGuide } from "../components/CleanverseStrip";
import { Dialog } from "../components/Dialog";
import { ActingAsCue } from "../components/ActingAsCue";
import { CastActionButton } from "../components/CastActionButton";
import { useCast } from "../hooks/useCast";
import { useActingWallet } from "../hooks/useActingWallet";
import { usePublishMandate, useAwardMandate } from "../hooks/useOperaWrites";
import { useSiweSession } from "../hooks/useSiweSession";
import { useReadContract } from "wagmi";
import { keccak256, parseUnits, toBytes, type Hex } from "viem";
import { addresses, lorAbi, revenueAbi } from "../lib/contracts";
import {
  apiGet,
  getMe,
  getWalletProfile,
  mintLor,
  deployments,
  getDemoRun,
  normalizeRoles,
} from "../api";
import { formatUnits6, shortAddr } from "../lib/format";

type OwnerTab = "overview" | "mint" | "mandates" | "alerts";

type MandateRow = {
  mandateId: string;
  assetId: string;
  scope: string;
  minScore: string;
  stakeAmount: string;
  publisher: string;
  winner: string;
  open: boolean;
  awarded: boolean;
};

type BidRow = {
  index: number;
  bidder: string;
  stake: string;
  active: boolean;
};

const TABS = [
  { id: "overview" as const, label: "Overview" },
  { id: "mint" as const, label: "Mint LOR" },
  { id: "mandates" as const, label: "Mandates" },
  { id: "alerts" as const, label: "Alerts" },
];

function isOwnerTab(v: string | null): v is OwnerTab {
  return v === "overview" || v === "mint" || v === "mandates" || v === "alerts";
}

export function OwnerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const cast = useCast();
  const tabParam = searchParams.get("tab");
  const tab: OwnerTab = isOwnerTab(tabParam) ? tabParam : "overview";

  function setTab(next: OwnerTab) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", next);
    if (next !== "mint") nextParams.delete("holder");
    if (next !== "mandates") nextParams.delete("mandateId");
    setSearchParams(nextParams, { replace: true });
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <p className="eyebrow">Asset owner</p>
          <h1>Owner</h1>
          <p className="lede">
            You own a tokenized real-world asset (e.g. a solar farm). Your job is to decide who is
            allowed to run day-to-day operations — and to hire them through on-chain mandates.
          </p>
        </div>
      </header>

      <ActingAsCue role="Owner" />

      <RoleGuide
        role="What you do here"
        title="Hand out authority, then hire operators"
        steps={[
          "Mint a Living Operating Right (LOR) — a licence for a specific job, like collecting energy revenue.",
          "Publish a mandate auction — operators compete by staking Cleanverse oCVA.",
          "Award the winner — they get to operate under that LOR while their Cleanverse A-Pass stays clean.",
        ]}
      />

      <SubTabs tabs={TABS} active={tab} onChange={setTab} />

      {cast.active ? (
        <OwnerBody tab={tab} />
      ) : (
        <RequireWallet label="Connect your owner wallet to continue">
          <SiweStatus />
          <OwnerBody tab={tab} />
        </RequireWallet>
      )}
    </div>
  );
}

function OwnerBody({ tab }: { tab: OwnerTab }) {
  const { viewer, castActive, cast } = useActingWallet();
  const siwe = useSiweSession();
  const [searchParams] = useSearchParams();
  const holderParam = searchParams.get("holder");
  const mandateParam = searchParams.get("mandateId");
  const [me, setMe] = useState<{
    onChainScore?: string | null;
    apass?: { status: number | null };
  } | null>(null);
  const [mandates, setMandates] = useState<MandateRow[] | null>(null);
  const [mintScope, setMintScope] = useState("energy-revenue");
  const [mintHolder, setMintHolder] = useState(holderParam ?? "");
  const [operatorCandidates, setOperatorCandidates] = useState<
    { address: string; label: string }[]
  >([]);
  const [mintResult, setMintResult] = useState<string | null>(null);
  const [mintBusy, setMintBusy] = useState(false);
  const [awardOpen, setAwardOpen] = useState(false);
  const [selectedMandate, setSelectedMandate] = useState<MandateRow | null>(null);
  const [bids, setBids] = useState<BidRow[] | null>(null);
  const [bidsLoading, setBidsLoading] = useState(false);
  const [selectedBidder, setSelectedBidder] = useState<string>("");
  const [publishScope, setPublishScope] = useState("energy-revenue");
  const [publishStake, setPublishStake] = useState("5000");
  const publish = usePublishMandate();
  const award = useAwardMandate();

  const reloadMandates = () => {
    const pub = castActive
      ? (cast.roles.find((r) => r.role === "owner")?.address ?? viewer)
      : viewer;
    const q = pub
      ? `/mandates?publisher=${encodeURIComponent(pub)}&limit=100`
      : "/mandates?limit=100";
    return apiGet<{ mandates: MandateRow[] }>(q)
      .then((res) => setMandates(res.mandates ?? []))
      .catch(() => setMandates([]));
  };

  const { data: nextLorId } = useReadContract({
    address: addresses.LORRegistry,
    abi: lorAbi,
    functionName: "nextId",
  });

  const { data: escrowBalance } = useReadContract({
    address: addresses.RevenueManager,
    abi: revenueAbi,
    functionName: "escrow",
    args: viewer ? [viewer] : undefined,
    query: { enabled: Boolean(viewer) },
  });

  useEffect(() => {
    if (!viewer) {
      setMe(null);
      return;
    }
    if (castActive) {
      void getWalletProfile(viewer)
        .then(setMe)
        .catch(() => setMe(null));
      return;
    }
    if (!siwe.authenticated) return;
    void getMe()
      .then(setMe)
      .catch(() => undefined);
  }, [viewer, castActive, siwe.authenticated, cast.lastResult]);

  useEffect(() => {
    void reloadMandates();
  }, [publish.isConfirmed, award.isConfirmed, cast.lastResult, viewer, castActive, tab]);

  useEffect(() => {
    if (holderParam) setMintHolder(holderParam);
  }, [holderParam]);

  useEffect(() => {
    const map = new Map<string, string>();
    const runId = localStorage.getItem("opera.demo.runId");
    void (async () => {
      try {
        const lors = await apiGet<{ lors: { holder: string }[] }>("/lors");
        for (const l of lors.lors ?? []) {
          if (l.holder) map.set(l.holder.toLowerCase(), "LOR holder");
        }
      } catch {
        /* ignore */
      }
      try {
        const mans = await apiGet<{ mandates: MandateRow[] }>("/mandates");
        const list = mans.mandates ?? [];
        for (const m of list) {
          if (m.winner && m.winner !== "0x0000000000000000000000000000000000000000") {
            map.set(m.winner.toLowerCase(), `Winner · mandate #${m.mandateId}`);
          }
        }
        const openIds = list.filter((m) => m.open && !m.awarded).map((m) => m.mandateId).slice(0, 12);
        await Promise.all(
          openIds.map(async (id) => {
            try {
              const res = await apiGet<{ bids: BidRow[] }>(`/mandates/${id}/bids`);
              for (const b of res.bids ?? []) {
                if (b.bidder && b.active !== false) {
                  map.set(b.bidder.toLowerCase(), `Bidder · mandate #${id}`);
                }
              }
            } catch {
              /* ignore */
            }
          }),
        );
      } catch {
        /* ignore */
      }
      if (runId) {
        try {
          const run = await getDemoRun(runId);
          for (const r of normalizeRoles(run.roles)) {
            if (!r.address) continue;
            const label = r.label ?? r.role;
            if (/operator|maint|energy|replacement/i.test(r.role)) {
              map.set(r.address.toLowerCase(), label);
            } else {
              map.set(r.address.toLowerCase(), map.get(r.address.toLowerCase()) ?? label);
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (castActive) {
        for (const r of cast.roles) {
          if (!r.address) continue;
          if (/operator|maint|energy|replacement/i.test(r.role)) {
            map.set(r.address.toLowerCase(), r.label ?? r.role);
          }
        }
      }
      setOperatorCandidates(
        [...map.entries()].map(([addr, label]) => ({ address: addr, label })).slice(0, 32),
      );
    })();
  }, [publish.isConfirmed, award.isConfirmed, castActive, cast.roles, cast.lastResult]);

  useEffect(() => {
    if (tab !== "mandates" || !mandateParam || !mandates) return;
    const match = mandates.find((m) => m.mandateId === mandateParam && m.open && !m.awarded);
    if (match) {
      setSelectedMandate(match);
      setAwardOpen(true);
    }
  }, [tab, mandateParam, mandates]);

  useEffect(() => {
    if (!awardOpen || !selectedMandate) return;
    setBids(null);
    setSelectedBidder("");
    setBidsLoading(true);
    void apiGet<{ bids: BidRow[] }>(`/mandates/${selectedMandate.mandateId}/bids`)
      .then((res) => setBids(res.bids ?? []))
      .catch(() => setBids([]))
      .finally(() => setBidsLoading(false));
  }, [awardOpen, selectedMandate]);

  useEffect(() => {
    if (award.isConfirmed) {
      setAwardOpen(false);
      setSelectedMandate(null);
      void reloadMandates();
    }
  }, [award.isConfirmed]);

  async function onMintLor() {
    if (!mintHolder || !siwe.authenticated) return;
    setMintBusy(true);
    setMintResult(null);
    try {
      const res = await mintLor(mintHolder, mintScope);
      setMintResult(`LOR #${res.lorId} minted`);
    } catch (e) {
      setMintResult(String(e));
    } finally {
      setMintBusy(false);
    }
  }

  const viewerForMandates = castActive
    ? (cast.roles.find((r) => r.role === "owner")?.address ?? viewer)
    : viewer;
  // When filtered by publisher on the API, the list is already "mine".
  const mine = mandates ?? [];
  const openMine = mine.filter((m) => m.open && !m.awarded);

  if (tab === "overview") {
    return (
      <div className="stack-sections">
        <section className="panel accent-top">
          <div className="overview-grid">
            <div>
              <p className="mono muted" style={{ fontSize: "0.8rem" }}>
                {viewer ?? "—"}
              </p>
              <div className="chip-row">
                <ScoreBadge score={me?.onChainScore ?? null} label="Score" />
                <YieldBand score={me?.onChainScore ?? null} />
                <ApassStatus status={me?.apass?.status ?? null} />
              </div>
            </div>
            <div className="stat-row">
              <div className="stat-item">
                <span className="stat-value">
                  {nextLorId != null ? String(Number(nextLorId) - 1) : "—"}
                </span>
                <span className="stat-label">LORs issued</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{formatUnits6(escrowBalance)}</span>
                <span className="stat-label">Escrow</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{deployments.assetId ?? "—"}</span>
                <span className="stat-label">Asset</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{openMine.length}</span>
                <span className="stat-label">Open mandates</span>
              </div>
            </div>
          </div>
          <p className="muted flow-hint">
            Next: open the Mint LOR tab, then Mandates to hire an operator.
          </p>
        </section>
        <CleanverseStrip compact />
      </div>
    );
  }

  if (tab === "mint") {
    return (
      <section className="panel">
        <h2>Mint Living Operating Right</h2>
        <p className="muted">
          Grant an operator on-chain authority for a specific scope (e.g. energy-revenue, maintenance).
        </p>

        <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.35rem" }}>
          Select an operator (LOR holders, mandate bidders/winners, demo roles)
        </p>
        {operatorCandidates.length === 0 ? (
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            Loading known operators… If none appear, paste an address below.
          </p>
        ) : (
          <div className="chip-row" style={{ marginBottom: "0.85rem" }}>
            {operatorCandidates.map((c) => (
              <button
                key={c.address}
                type="button"
                className={`picker-chip${mintHolder.toLowerCase() === c.address ? " active" : ""}`}
                onClick={() => setMintHolder(c.address)}
                title={c.address}
              >
                {c.label} · {shortAddr(c.address)}
              </button>
            ))}
          </div>
        )}

        <label htmlFor="mint-holder">Selected operator</label>
        <input
          id="mint-holder"
          value={mintHolder}
          onChange={(e) => setMintHolder(e.target.value)}
          placeholder="0x…"
          spellCheck={false}
        />
        <label htmlFor="mint-scope">Scope</label>
        <select id="mint-scope" value={mintScope} onChange={(e) => setMintScope(e.target.value)}>
          <option value="energy-revenue">energy-revenue</option>
          <option value="maintenance">maintenance</option>
        </select>
        <div className="row-actions">
          {castActive ? (
            <CastActionButton
              action="mintLor"
              role="owner"
              requireRole="owner"
              args={{ holder: mintHolder, scope: mintScope }}
              label="Mint LOR (cast)"
              disabled={!mintHolder}
            />
          ) : (
            <button
              type="button"
              className="btn"
              disabled={mintBusy || !mintHolder || !siwe.authenticated}
              onClick={() => void onMintLor()}
            >
              {mintBusy ? "Minting…" : "Mint LOR"}
            </button>
          )}
        </div>
        {mintResult ? (
          <div className={`alert ${mintResult.startsWith("LOR #") ? "success" : "error"}`}>
            {mintResult}
          </div>
        ) : null}
      </section>
    );
  }

  if (tab === "mandates") {
    return (
      <div className="split-workspace">
        <div className="split-workspace-actions">
          <section className="panel">
            <h2>Publish mandate</h2>
            <p className="muted">Open an auction. Operators stake oCVA to bid.</p>
            <label htmlFor="pub-scope">Scope</label>
            <select
              id="pub-scope"
              value={publishScope}
              onChange={(e) => setPublishScope(e.target.value)}
            >
              <option value="energy-revenue">energy-revenue</option>
              <option value="maintenance">maintenance</option>
            </select>
            <label htmlFor="pub-stake">Required stake (oCVA)</label>
            <input
              id="pub-stake"
              value={publishStake}
              onChange={(e) => setPublishStake(e.target.value)}
            />
            <div className="row-actions">
              {castActive ? (
                <CastActionButton
                  action="publishMandate"
                  role="owner"
                  requireRole="owner"
                  args={{ scope: publishScope, stake: publishStake }}
                  label="Publish (cast)"
                />
              ) : (
                <TxButton
                  label="Publish"
                  onClick={() =>
                    publish.publish({
                      assetId: BigInt(deployments.assetId ?? 1),
                      scope: keccak256(toBytes(publishScope)),
                      minScore: 80n,
                      jurisdictionRoot: keccak256(toBytes("SG")),
                      stakeAmount: parseUnits(publishStake, 6),
                      maxSpendPerTx: parseUnits("200000", 6),
                    })
                  }
                  isPending={publish.isPending}
                  isConfirming={publish.isConfirming}
                  isConfirmed={publish.isConfirmed}
                  hash={publish.hash}
                  error={publish.error}
                />
              )}
            </div>
          </section>

          <div className="section-callout" role="note">
            <strong>Award from the list</strong>
            <p>
              When operators bid, open a mandate on the right and pick a winner from the bidder list —
              no IDs to type.
            </p>
          </div>
        </div>

        <section className="panel split-workspace-list">
          <div className="split-list-head">
            <h2>Your mandates</h2>
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              {mine.length} total
            </span>
          </div>
          <div className="split-list-scroll">
            {mandates === null ? (
              <p className="muted">Loading…</p>
            ) : mine.length === 0 ? (
              <div className="empty-state">
                <p>No mandates from this wallet yet.</p>
                <p style={{ fontSize: "0.85rem" }}>Publish one on the left to get started.</p>
              </div>
            ) : (
              <div className="card-list">
                {mine.map((m) => {
                  const canAward = m.open && !m.awarded;
                  const isSelected =
                    awardOpen && selectedMandate?.mandateId === m.mandateId;
                  return (
                    <button
                      type="button"
                      className={`lor-card selectable${isSelected ? " selected" : ""}${canAward ? "" : " readonly-card"}`}
                      key={m.mandateId}
                      disabled={!canAward}
                      onClick={() => {
                        if (!canAward) return;
                        setSelectedMandate(m);
                        setAwardOpen(true);
                      }}
                    >
                      <div className="lor-card-header">
                        <strong>Mandate #{m.mandateId}</strong>
                        <span
                          className={`yield-band ${m.awarded ? "partial" : m.open ? "full" : "suspended"}`}
                        >
                          {m.awarded ? "Awarded" : m.open ? "Open" : "Closed"}
                        </span>
                      </div>
                      <div className="lor-card-meta">
                        <span>{m.scope}</span>
                        <span>Min score {m.minScore}</span>
                        <span>Stake {formatUnits6(m.stakeAmount)}</span>
                      </div>
                      {m.awarded && m.winner ? (
                        <p className="mono muted" style={{ fontSize: "0.75rem", margin: "0.35rem 0 0" }}>
                          Winner {shortAddr(m.winner)}
                        </p>
                      ) : canAward ? (
                        <p className="muted" style={{ fontSize: "0.75rem", margin: "0.35rem 0 0" }}>
                          Select to award →
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <Dialog
          open={awardOpen}
          title={`Award mandate #${selectedMandate?.mandateId ?? ""}`}
          onClose={() => {
            setAwardOpen(false);
            setSelectedMandate(null);
          }}
        >
          {selectedMandate ? (
            <>
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
              </div>

              <h3 className="subhead" style={{ marginTop: "1rem" }}>
                Bidders
              </h3>
              {bidsLoading ? (
                <p className="muted">Loading bidders…</p>
              ) : bids === null || bids.length === 0 ? (
                <div className="empty-state">
                  <p>No bids yet.</p>
                  <p style={{ fontSize: "0.85rem" }}>
                    Wait for operators to bid on the Operator → Bid tab.
                  </p>
                </div>
              ) : (
                <div className="card-list">
                  {bids.map((b) => (
                    <button
                      type="button"
                      key={`${b.index}-${b.bidder}`}
                      className={`lor-card selectable${selectedBidder.toLowerCase() === b.bidder.toLowerCase() ? " selected" : ""}`}
                      onClick={() => setSelectedBidder(b.bidder)}
                    >
                      <div className="lor-card-header">
                        <strong className="mono">{shortAddr(b.bidder, 6)}</strong>
                        <span>{formatUnits6(b.stake)} oCVA</span>
                      </div>
                      <p className="mono muted" style={{ fontSize: "0.72rem", margin: "0.25rem 0 0" }}>
                        {b.bidder}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              <div className="row-actions" style={{ marginTop: "1rem" }}>
                {castActive ? (
                  <CastActionButton
                    action="award"
                    role="owner"
                    requireRole="owner"
                    args={{
                      mandateId: selectedMandate.mandateId,
                      winner: selectedBidder,
                    }}
                    label={
                      selectedBidder ? `Award to ${shortAddr(selectedBidder)} (cast)` : "Select a bidder"
                    }
                    disabled={!selectedBidder}
                  />
                ) : (
                  <TxButton
                    label={selectedBidder ? `Award to ${shortAddr(selectedBidder)}` : "Select a bidder"}
                    onClick={() =>
                      award.award(BigInt(selectedMandate.mandateId), selectedBidder as Hex)
                    }
                    isPending={award.isPending}
                    isConfirming={award.isConfirming}
                    isConfirmed={award.isConfirmed}
                    hash={award.hash}
                    error={award.error}
                    disabled={!selectedBidder}
                  />
                )}
              </div>
            </>
          ) : null}
        </Dialog>
      </div>
    );
  }

  return (
    <section className="panel">
      <h2>Compliance alerts</h2>
      <p className="muted">Auto-listings, score moves, and mandate updates for your address.</p>
      <NotificationList address={viewerForMandates?.toLowerCase() ?? viewer?.toLowerCase() ?? null} />
    </section>
  );
}
