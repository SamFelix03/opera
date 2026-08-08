export function TxButton({
  label,
  onClick,
  isPending,
  isConfirming,
  isConfirmed,
  hash,
  error,
  disabled,
  className = "btn",
}: {
  label: string;
  onClick: () => void;
  isPending?: boolean;
  isConfirming?: boolean;
  isConfirmed?: boolean;
  hash?: string;
  error?: Error | null;
  disabled?: boolean;
  className?: string;
}) {
  const busy = isPending || isConfirming;
  const text = isPending ? "Confirm in wallet…" : isConfirming ? "Confirming…" : isConfirmed ? "Confirmed" : label;
  return (
    <div>
      <button
        type="button"
        className={className}
        disabled={disabled || busy}
        onClick={onClick}
      >
        {text}
      </button>
      {hash ? (
        <p className="mono tiny" style={{ marginTop: "0.35rem" }}>
          tx{" "}
          <a href={`https://testnet.monadvision.com/tx/${hash}`} target="_blank" rel="noreferrer">
            {hash.slice(0, 10)}…{hash.slice(-6)}
          </a>
        </p>
      ) : null}
      {error ? <p style={{ color: "var(--danger)", fontSize: "0.82rem", marginTop: "0.35rem" }}>{error.message?.slice(0, 200)}</p> : null}
    </div>
  );
}
