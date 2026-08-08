export function shortAddr(addr: string | null | undefined, chars = 4): string {
  if (!addr) return "—";
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 2 + chars)}…${addr.slice(-chars)}`;
}

export function formatUnits6(value: bigint | number | string | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isFinite(n)) return "—";
  return (n / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatMon(value: bigint | null | undefined): string {
  if (value == null) return "—";
  return (Number(value) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 });
}
