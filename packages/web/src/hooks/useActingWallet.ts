import { useAccount } from "wagmi";
import { useCast } from "./useCast";

/**
 * Address whose stats/listings the desks should display.
 * In cast mode: the selected cast role wallet.
 * Otherwise: the connected MetaMask wallet.
 */
export function useActingWallet() {
  const { address } = useAccount();
  const cast = useCast();
  const viewer =
    cast.active && cast.selectedAddress
      ? (cast.selectedAddress as `0x${string}`)
      : address ?? undefined;

  return {
    viewer,
    connectedAddress: address,
    castActive: cast.active,
    role: cast.selectedRole,
    cast,
  };
}
