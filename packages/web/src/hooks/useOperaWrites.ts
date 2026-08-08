import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { addresses, erc20Abi, lorAbi, mandateAbi, revenueAbi } from "../lib/contracts";
import type { Hex } from "viem";

export function useApproveToken() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  return {
    approve: (spender: Hex, amount: bigint) =>
      writeContract({
        address: addresses.OperaAToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, amount],
      }),
    hash,
    isPending,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    error: error ?? receipt.error,
  };
}

export function useAcquireLOR() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  return {
    acquire: (lorId: bigint) =>
      writeContract({
        address: addresses.LORRegistry,
        abi: lorAbi,
        functionName: "acquireLOR",
        args: [lorId],
      }),
    hash,
    isPending,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    error: error ?? receipt.error,
  };
}

export function useBidMandate() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  return {
    bid: (mandateId: bigint) =>
      writeContract({
        address: addresses.MandateRegistry,
        abi: mandateAbi,
        functionName: "bid",
        args: [mandateId],
      }),
    hash,
    isPending,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    error: error ?? receipt.error,
  };
}

export function usePublishMandate() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  return {
    publish: (args: {
      assetId: bigint;
      scope: Hex;
      minScore: bigint;
      jurisdictionRoot: Hex;
      stakeAmount: bigint;
      maxSpendPerTx: bigint;
    }) =>
      writeContract({
        address: addresses.MandateRegistry,
        abi: mandateAbi,
        functionName: "publishMandate",
        args: [args.assetId, args.scope, args.minScore, args.jurisdictionRoot, args.stakeAmount, args.maxSpendPerTx],
      }),
    hash,
    isPending,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    error: error ?? receipt.error,
  };
}

export function useAwardMandate() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  return {
    award: (mandateId: bigint, winner: Hex) =>
      writeContract({
        address: addresses.MandateRegistry,
        abi: mandateAbi,
        functionName: "award",
        args: [mandateId, winner],
      }),
    hash,
    isPending,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    error: error ?? receipt.error,
  };
}

export function useDistributeRevenue() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  return {
    distribute: (operator: Hex, gross: bigint) =>
      writeContract({
        address: addresses.RevenueManager,
        abi: revenueAbi,
        functionName: "distribute",
        args: [operator, gross],
      }),
    hash,
    isPending,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    error: error ?? receipt.error,
  };
}
