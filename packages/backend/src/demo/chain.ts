/**
 * Shared viem clients + ABIs for Opera demo orchestration on Monad testnet.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  toBytes,
  type Account,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");

export type Deployment = {
  chainId: number;
  rpc: string;
  assetId: number;
  settlementToken?: Hex;
  settlementSymbol?: string;
  settlementDecimals?: number;
  contracts: {
    OperaToken: Hex;
    OperaAToken?: Hex;
    AssetRegistry: Hex;
    ScoreStore: Hex;
    LORRegistry: Hex;
    MandateRegistry: Hex;
    RevenueManager: Hex;
    RightsPriceOracle: Hex;
  };
};

export const OPERA_ATOKEN = "0x6A7942B254f84822f7237c6C14aD78A00a22BC4E" as Hex;
export const PLATFORM_AUSDC = "0xaC0893567D43C3E7e6e35a72803df05416C1f20D" as Hex;

export const erc20Abi = parseAbi([
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function minters(address) view returns (bool)",
]);

export const scoreAbi = parseAbi([
  "function setScore(address operator, uint256 score, bytes32 inputsHash) external",
  "function getScore(address operator) view returns (uint256)",
]);

export const lorAbi = parseAbi([
  "function mintLOR(uint256 assetId, address holder, bytes32 scope, uint256 minScore) returns (uint256)",
  "function maybeAutoList(uint256 lorId, uint256 listPrice)",
  "function setAutoListed(uint256 lorId, uint256 listPrice)",
  "function setAutoListThreshold(uint256 t)",
  "function acquireLOR(uint256 lorId)",
  "function nextId() view returns (uint256)",
  "function autoListThreshold() view returns (uint256)",
  "function transferFeeBps(address holder) view returns (uint256)",
  "function lors(uint256) view returns (uint256 assetId, address holder, bytes32 scope, uint256 price, bool autoListed, bool active)",
  "function minScoreToHold(uint256) view returns (uint256)",
]);

export const manAbi = parseAbi([
  "function publishMandate(uint256 assetId, bytes32 scope, uint256 minScore, bytes32 jurisdictionRoot, uint256 stakeAmount, uint256 maxSpendPerTx) returns (uint256)",
  "function bid(uint256 mandateId)",
  "function award(uint256 mandateId, address winner)",
  "function nextMandateId() view returns (uint256)",
  "function principalOk(uint256 mandateId, address agent, uint256 spend) view returns (bool)",
  "function mandates(uint256) view returns (uint256 assetId, bytes32 scope, uint256 minScore, bytes32 jurisdictionRoot, uint256 stakeAmount, uint256 maxSpendPerTx, address publisher, address winner, bool open, bool awarded)",
  "function bids(uint256 mandateId, uint256 index) view returns (address bidder, uint256 stake, bool active)",
]);

export const revAbi = parseAbi([
  "function distribute(address operator, uint256 gross)",
  "function slashingPool() view returns (uint256)",
  "function escrow(address) view returns (uint256)",
]);

export const oracleAbi = parseAbi([
  "function recordPrice(bytes32 category, uint256 price) external",
  "function observationCount(bytes32 category) view returns (uint256)",
  "function twap(bytes32 category, uint256 window) view returns (uint256)",
]);

export const CATEGORY_SOLAR = keccak256(toBytes("solar"));

export function loadDeployment(): Deployment {
  return JSON.parse(
    readFileSync(resolve(root, "config/deployments/monad-testnet.json"), "utf8"),
  ) as Deployment;
}

export function loadOperaAtokenAddress(): Hex {
  try {
    const j = JSON.parse(
      readFileSync(resolve(root, "config/deployments/opera-atoken.json"), "utf8"),
    ) as { result?: { atokenAddress?: string } };
    if (j.result?.atokenAddress) return j.result.atokenAddress as Hex;
  } catch {
    /* fallback */
  }
  return OPERA_ATOKEN;
}

/** Same CREATE2 address as Ethereum; deployed on Monad testnet + mainnet. */
export const MULTICALL3_ADDRESS =
  "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

export function monadChain(rpcUrl: string) {
  return {
    id: 10143,
    name: "Monad Testnet",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    contracts: {
      multicall3: {
        address: MULTICALL3_ADDRESS,
        blockCreated: 0,
      },
    },
  } as const;
}

export type ChainCtx = {
  deployment: Deployment;
  rpcUrl: string;
  publicClient: PublicClient;
  deployer: Account;
  deployerWallet: ReturnType<typeof createWalletClient>;
  scoreWriter: Account;
  scoreWriterWallet: ReturnType<typeof createWalletClient>;
};

export function createChainCtx(env: NodeJS.ProcessEnv = process.env): ChainCtx {
  const deployment = loadDeployment();
  const rpcUrl = env.MONAD_RPC_URL ?? deployment.rpc;
  const chain = monadChain(rpcUrl);
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain, transport });

  const deployerPk = env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
  if (!deployerPk) throw new Error("DEPLOYER_PRIVATE_KEY required");
  const deployer = privateKeyToAccount(deployerPk);
  const deployerWallet = createWalletClient({ account: deployer, chain, transport });

  const writerPk =
    (env.SCORE_WRITER_PRIVATE_KEY as Hex | undefined) ?? deployerPk;
  const scoreWriter = privateKeyToAccount(writerPk);
  const scoreWriterWallet = createWalletClient({
    account: scoreWriter,
    chain,
    transport,
  });

  return {
    deployment,
    rpcUrl,
    publicClient: publicClient as PublicClient,
    deployer,
    deployerWallet,
    scoreWriter,
    scoreWriterWallet,
  };
}

export function walletFor(
  ctx: ChainCtx,
  privateKey: Hex,
): { account: Account; wallet: ReturnType<typeof createWalletClient> } {
  const account = privateKeyToAccount(privateKey);
  const chain = monadChain(ctx.rpcUrl);
  const wallet = createWalletClient({
    account,
    chain,
    transport: http(ctx.rpcUrl),
  });
  return { account, wallet };
}

export async function waitTx(ctx: ChainCtx, hash: Hex) {
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`tx reverted: ${hash}`);
  }
  return receipt;
}

/** Bypass viem WriteContractParameters chain inference on stored wallet clients */
export async function write(
  wallet: { writeContract: (args: never) => Promise<Hex> },
  args: Record<string, unknown>,
): Promise<Hex> {
  return wallet.writeContract(args as never);
}

export async function sendNative(
  wallet: {
    sendTransaction: (args: never) => Promise<Hex>;
  },
  args: { to: Hex; value: bigint },
): Promise<Hex> {
  return wallet.sendTransaction(args as never);
}

/** Scan LORRegistry for active LORs held by address */
export async function findLorsByHolder(
  ctx: ChainCtx,
  holder: Hex,
): Promise<bigint[]> {
  const lorReg = ctx.deployment.contracts.LORRegistry;
  const next = await ctx.publicClient.readContract({
    address: lorReg,
    abi: lorAbi,
    functionName: "nextId",
  });
  const out: bigint[] = [];
  const target = holder.toLowerCase();
  for (let i = 1n; i < next; i++) {
    const row = await ctx.publicClient.readContract({
      address: lorReg,
      abi: lorAbi,
      functionName: "lors",
      args: [i],
    });
    const h = (row[1] as string).toLowerCase();
    const active = row[5] as boolean;
    if (active && h === target) out.push(i);
  }
  return out;
}
