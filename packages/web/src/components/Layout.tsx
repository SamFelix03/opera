import { Link, NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { WalletBar, SetupBanner } from "./WalletBar";
import { walletConfigured } from "../config/appkit";

const platformLinks = [
  { to: "/owner", label: "Owner" },
  { to: "/operator", label: "Operator" },
  { to: "/market", label: "Market" },
  { to: "/playground", label: "Rules" },
  { to: "/audit", label: "Audit" },
] as const;

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="app-root">
      <div className="app-bg" aria-hidden />
      {!walletConfigured && <SetupBanner />}
      <header className="topnav">
        <div className="topnav-inner">
          <div className="topnav-left">
            <Link to="/" className="brand" aria-label="Opera home">
              <img src="/opera-logo.png" alt="Opera" className="brand-logo" />
            </Link>
            <nav className="nav-pill" aria-label="Primary">
              {platformLinks.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) => `nav-pill-btn${isActive ? " active" : ""}`}
                >
                  {l.label}
                </NavLink>
              ))}
              <NavLink
                to="/demo"
                className={({ isActive }) => `nav-pill-btn demo${isActive ? " active" : ""}`}
              >
                Demo
              </NavLink>
            </nav>
          </div>
          <WalletBar />
        </div>
      </header>
      <main className="main">{children}</main>
      <footer className="foot">
        <span>Built on Monad · Compliance by Cleanverse (CVI · CVA · A-Pass)</span>
        <span className="muted">Living Operating Rights</span>
      </footer>
    </div>
  );
}
