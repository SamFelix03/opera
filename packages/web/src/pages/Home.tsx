import { Link } from "react-router-dom";
import { ConnectWalletButton } from "../components/ConnectWalletButton";
import { CleanverseStrip } from "../components/CleanverseStrip";
import { FAUCET_URL } from "../config/monad";
import { deployments } from "../api";

export function HomePage() {
  return (
    <section className="hero-page">
      <img className="hero-wordmark" src="/opera-logo.png" alt="" />
      <p className="eyebrow">Compliance-native RWA lifecycle · Monad testnet</p>
      <h1 className="hero-headline">Opera Protocol</h1>
      <p className="hero-sub">
        A solar farm (or any RWA) doesn&apos;t just need an owner — it needs trustworthy operators.
        Opera decides who may run the asset, and reprices that authority when Cleanverse compliance
        changes.
      </p>
      <div className="hero-cta">
        <ConnectWalletButton />
        <Link className="btn secondary" to="/owner">
          I own an asset
        </Link>
        <Link className="btn secondary" to="/operator">
          I want to operate
        </Link>
        <a className="btn ghost" href={FAUCET_URL} target="_blank" rel="noreferrer">
          Fund wallet
        </a>
      </div>

      <div className="feature-cards">
        <Link to="/owner" className="feature-card">
          <span className="feature-icon" aria-hidden>
            1
          </span>
          <h3>Owner — issue rights</h3>
          <p>
            You mint operating licences (LORs) and run auctions so Cleanverse-verified operators can
            compete for the job.
          </p>
        </Link>
        <Link to="/operator" className="feature-card">
          <span className="feature-icon" aria-hidden>
            2
          </span>
          <h3>Operator — win &amp; earn</h3>
          <p>
            Stake oCVA (Cleanverse CVA), hold an LOR, and earn yield that shrinks if your A-Pass or
            score degrades.
          </p>
        </Link>
        <Link to="/market" className="feature-card">
          <span className="feature-icon" aria-hidden>
            3
          </span>
          <h3>Market — buy distressed rights</h3>
          <p>
            When scores fall, LORs auto-list here. The oracle TWAP shows what the market pays for
            compliance quality.
          </p>
        </Link>
      </div>

      <CleanverseStrip />

      <p className="hero-meta muted">
        Chain {deployments.chainId} · Settlement in Cleanverse oCVA ({deployments.settlementSymbol})
      </p>
    </section>
  );
}
