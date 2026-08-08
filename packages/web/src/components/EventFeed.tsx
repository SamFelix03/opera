import type { ReactNode } from "react";
import type { DemoEvent } from "../types/demo";
import { ActionChip, CopyButton } from "./CopyButton";
import { shortAddr } from "../lib/format";

const EXPLORER_TX = "https://testnet.monadvision.com/tx";

export function EventFeed({
  events,
  empty = "No events yet — seed a cast to begin.",
}: {
  events: DemoEvent[];
  empty?: string;
}) {
  if (!events.length) {
    return <p className="muted feed-empty">{empty}</p>;
  }

  return (
    <ol className="event-feed">
      {events.map((ev, i) => {
        const key = String(ev.id ?? `${ev.kind}-${ev.createdAt ?? ev.ts ?? i}`);
        const when = ev.createdAt ?? ev.ts ?? "";
        const refs = extractRefs(ev);
        const summary = summarizeEvent(ev, refs);
        const txs = extractTxs(ev.payload);
        return (
          <li key={key}>
            <div className="event-meta">
              <span className="event-kind">{humanKind(ev.kind)}</span>
              {ev.step ? <span className="event-step">{ev.step}</span> : null}
              {when ? <time dateTime={when}>{formatWhen(when)}</time> : null}
            </div>
            {ev.message ? <p>{ev.message}</p> : summary ? <p>{summary}</p> : null}
            {txs.length > 0 ? (
              <div className="cast-tx-list">
                {txs.map((tx) => (
                  <a
                    key={tx.hash}
                    className="cast-tx-link mono"
                    href={`${EXPLORER_TX}/${tx.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tx.label}: {tx.hash.slice(0, 12)}…↗
                  </a>
                ))}
              </div>
            ) : null}
            {refs.actions.length > 0 ? (
              <div className="chip-row event-actions">{refs.actions}</div>
            ) : null}
            {ev.payload != null ? (
              <details className="event-details">
                <summary>Details</summary>
                <pre className="event-payload">{formatPayload(ev.payload)}</pre>
              </details>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

type Refs = {
  addresses: string[];
  lorIds: string[];
  mandateIds: string[];
  actions: ReactNode[];
};

function extractTxs(payload: unknown): { label: string; hash: string }[] {
  if (payload == null || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  const out: { label: string; hash: string }[] = [];
  if (Array.isArray(obj.txs)) {
    for (const t of obj.txs) {
      if (t && typeof t === "object" && "hash" in t) {
        const hash = String((t as { hash: string }).hash);
        if (hash.startsWith("0x")) {
          out.push({ label: String((t as { label?: string }).label ?? "tx"), hash });
        }
      }
    }
  }
  for (const key of ["tx", "listTx", "acquireTx", "distributeTx", "hash"]) {
    const h = obj[key];
    if (typeof h === "string" && h.startsWith("0x") && h.length >= 66) {
      out.push({ label: key, hash: h });
    }
  }
  return out;
}

function extractRefs(ev: DemoEvent): Refs {
  const addresses = new Set<string>();
  const lorIds = new Set<string>();
  const mandateIds = new Set<string>();
  collect(ev.payload, addresses, lorIds, mandateIds);

  const actions: ReactNode[] = [];
  for (const addr of [...addresses].slice(0, 3)) {
    actions.push(
      <CopyButton key={`c-${addr}`} value={addr} label={`Copy ${shortAddr(addr)}`} />,
    );
    actions.push(
      <ActionChip key={`m-${addr}`} to={`/owner?tab=mint&holder=${encodeURIComponent(addr)}`}>
        Mint to {shortAddr(addr)} →
      </ActionChip>,
    );
  }
  for (const id of [...lorIds].slice(0, 3)) {
    actions.push(
      <ActionChip key={`lor-${id}`} to={`/market?lorId=${id}`}>
        Market LOR #{id} →
      </ActionChip>,
    );
  }
  for (const id of [...mandateIds].slice(0, 3)) {
    actions.push(
      <ActionChip key={`man-${id}`} to={`/operator?tab=bid&mandateId=${id}`}>
        Bid mandate #{id} →
      </ActionChip>,
    );
    actions.push(
      <ActionChip key={`aw-${id}`} to={`/owner?tab=mandates&mandateId=${id}`}>
        Award mandate #{id} →
      </ActionChip>,
    );
  }

  return {
    addresses: [...addresses],
    lorIds: [...lorIds],
    mandateIds: [...mandateIds],
    actions,
  };
}

function collect(
  value: unknown,
  addresses: Set<string>,
  lorIds: Set<string>,
  mandateIds: Set<string>,
  keyHint = "",
): void {
  if (value == null) return;
  if (typeof value === "string") {
    if (/^0x[a-fA-F0-9]{40}$/.test(value)) addresses.add(value);
    else if (/^\d+$/.test(value) && /lor/i.test(keyHint)) lorIds.add(value);
    else if (/^\d+$/.test(value) && /mandate/i.test(keyHint)) mandateIds.add(value);
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const s = String(value);
    if (/lor/i.test(keyHint)) lorIds.add(s);
    if (/mandate/i.test(keyHint)) mandateIds.add(s);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, addresses, lorIds, mandateIds, keyHint);
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      collect(v, addresses, lorIds, mandateIds, k);
    }
  }
}

function humanKind(kind: string | undefined): string {
  if (!kind) return "event";
  return kind.replace(/[_-]+/g, " ");
}

function formatWhen(when: string): string {
  const d = Date.parse(when);
  if (Number.isNaN(d)) return when;
  return new Date(d).toLocaleString();
}

function summarizeEvent(ev: DemoEvent, refs: Refs): string | null {
  if (ev.message) return null;
  const bits: string[] = [];
  if (refs.lorIds.length) bits.push(`LOR #${refs.lorIds.join(", #")}`);
  if (refs.mandateIds.length) bits.push(`mandate #${refs.mandateIds.join(", #")}`);
  if (refs.addresses.length) bits.push(refs.addresses.map((a) => shortAddr(a)).join(", "));
  if (bits.length) return bits.join(" · ");
  const p = ev.payload;
  if (typeof p === "object" && p && "score" in p) return `score=${String((p as { score: unknown }).score)}`;
  return null;
}

function formatPayload(payload: unknown): string {
  if (typeof payload === "string") {
    try {
      return JSON.stringify(JSON.parse(payload), null, 2);
    } catch {
      return payload;
    }
  }
  return JSON.stringify(payload, null, 2);
}
