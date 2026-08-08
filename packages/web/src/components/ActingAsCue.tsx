/** Cue when the same connected wallet can act as either role. */
export function ActingAsCue({ role }: { role: "Owner" | "Operator" }) {
  return (
    <div className="acting-as-cue" role="status">
      <span className="acting-as-label">Acting as</span>
      <strong>{role}</strong>
      <span className="muted">
        Same wallet can use both desks — this page is the {role.toLowerCase()} workflow.
      </span>
    </div>
  );
}
