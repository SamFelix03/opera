import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";

export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      window.setTimeout(() => setDone(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <button type="button" className="picker-chip" onClick={() => void onCopy()}>
      {done ? "Copied" : label}
    </button>
  );
}

export function ActionChip({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className="picker-chip action-chip">
      {children}
    </Link>
  );
}
