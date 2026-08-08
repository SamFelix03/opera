import deployments from "../../../../config/deployments/monad-testnet.json";
import { parseAbi, type Hex } from "viem";

export const CHAIN_ID = 10143;

export const addresses = {
  LORRegistry: deployments.contracts.LORRegistry as Hex,
  MandateRegistry: deployments.contracts.MandateRegistry as Hex,
  RevenueManager: deployments.contracts.RevenueManager as Hex,
  ScoreStore: deployments.contracts.ScoreStore as Hex,
  OperaAToken: (deployments as { settlementToken?: string }).settlementToken as Hex,
  RightsPriceOracle: deployments.contracts.RightsPriceOracle as Hex,
};

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

export const lorAbi = parseAbi([
  "function acquireLOR(uint256 lorId)",
  "function nextId() view returns (uint256)",
  "function autoListThreshold() view returns (uint256)",
  "function lors(uint256) view returns (uint256 assetId, address holder, bytes32 scope, uint256 price, bool autoListed, bool active)",
  "function minScoreToHold(uint256) view returns (uint256)",
  "function transferFeeBps(address holder) view returns (uint256)",
]);

export const mandateAbi = parseAbi([
  "function publishMandate(uint256 assetId, bytes32 scope, uint256 minScore, bytes32 jurisdictionRoot, uint256 stakeAmount, uint256 maxSpendPerTx) returns (uint256)",
  "function bid(uint256 mandateId)",
  "function award(uint256 mandateId, address winner)",
  "function nextMandateId() view returns (uint256)",
  "function principalOk(uint256 mandateId, address agent, uint256 spend) view returns (bool)",
  "function mandates(uint256) view returns (uint256 assetId, bytes32 scope, uint256 minScore, bytes32 jurisdictionRoot, uint256 stakeAmount, uint256 maxSpendPerTx, address publisher, address winner, bool open, bool awarded)",
]);

export const revenueAbi = parseAbi([
  "function distribute(address operator, uint256 gross)",
  "function escrow(address) view returns (uint256)",
]);

export const scoreAbi = parseAbi([
  "function getScore(address operator) view returns (uint256)",
]);
