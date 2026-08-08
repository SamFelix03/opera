/** Highlights where Cleanverse powers Opera — CVI, CVA, A-Pass. */
export function CleanverseStrip({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="cv-strip compact" role="note">
        <span className="cv-badge">Cleanverse</span>
        <span>
          Compliance score from <strong>CVI</strong> tenure, <strong>CCP</strong> screening &amp;{" "}
          <strong>Travel Rule</strong> — gated by <strong>A-Pass</strong>, settled in{" "}
          <strong>oCVA</strong>.
        </span>
      </div>
    );
  }

  return (
    <section className="cv-panel" aria-label="Cleanverse integration">
      <div className="cv-panel-head">
        <span className="cv-badge">Powered by Cleanverse</span>
        <p>
          Opera does not invent compliance — it prices authority using Cleanverse identity and
          settlement primitives.
        </p>
      </div>
      <div className="cv-grid">
        <div className="cv-card">
          <span className="cv-tag">CVI</span>
          <h3>Verified identity</h3>
          <p>
            How long an operator has stayed continuously verified. Longer clean tenure raises their
            Opera score.
          </p>
        </div>
        <div className="cv-card">
          <span className="cv-tag">CVA / oCVA</span>
          <h3>Settlement &amp; stakes</h3>
          <p>
            Mandate bonds and LOR purchases settle in Opera&apos;s Cleanverse A-Token (oCVA). Skin in
            the game is real capital.
          </p>
        </div>
        <div className="cv-card">
          <span className="cv-tag">A-Pass</span>
          <h3>Wallet status</h3>
          <p>
            Freeze or activate an operator wallet. A frozen A-Pass collapses their score and can
            auto-list their LOR.
          </p>
        </div>
        <div className="cv-card">
          <span className="cv-tag">CCP + Travel Rule</span>
          <h3>Behaviour signals</h3>
          <p>
            Clean screening rate and Travel Rule completeness feed the live 0–100 compliance score
            that gates yield.
          </p>
        </div>
      </div>
    </section>
  );
}

export function RoleGuide({
  role,
  title,
  steps,
}: {
  role: string;
  title: string;
  steps: string[];
}) {
  return (
    <aside className="role-guide" aria-label={`${role} guide`}>
      <p className="role-guide-eyebrow">{role}</p>
      <h2 className="role-guide-title">{title}</h2>
      <ol className="role-guide-steps">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </aside>
  );
}
