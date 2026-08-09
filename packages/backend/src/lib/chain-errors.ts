/**
 * Map opaque on-chain revert selectors (esp. Cleanverse A-Token) to demo-readable messages.
 */
export function explainChainError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  // APassNotActive(address) — seller cannot receive oCVA while frozen/inactive
  if (raw.includes("0x322fde89") || lower.includes("apassnotactive")) {
    return (
      "Acquire failed: the current LOR holder’s A-Pass is inactive/frozen, so oCVA cannot pay them. " +
      "Cast acquire temporarily reactivates the seller to settle; for wallet acquire, activate the holder’s A-Pass first (Rules / Playground), then retry."
    );
  }
  // NoAPass(address)
  if (raw.includes("0xa6725971") || lower.includes("noapass")) {
    return "Transfer failed: counterparty has no A-Pass (Cleanverse NoAPass). Ensure both wallets have an active A-Pass.";
  }
  if (lower.includes("not listed")) {
    return "Acquire failed: LOR is not auto-listed on the transfer market.";
  }
  if (lower.includes("buyer score") || lower.includes('reverted with reason "score"')) {
    return "Acquire failed: buyer score is below minScoreToHold for this LOR.";
  }
  return raw;
}
