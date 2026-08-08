import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Account,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export type AgentConfig = {
  name: string;
  privateKey: Hex;
  rpcUrl: string;
  mandateRegistry: Hex;
  stakeToken: Hex;
  /** Required for executeRevenue */
  revenueManager?: Hex;
  maxSpendPerTx: bigint;
};

const manAbi = parseAbi([
  "function mandates(uint256) view returns (uint256 assetId, bytes32 scope, uint256 minScore, bytes32 jurisdictionRoot, uint256 stakeAmount, uint256 maxSpendPerTx, address publisher, address winner, bool open, bool awarded)",
  "function bid(uint256 mandateId)",
  "function principalOk(uint256 mandateId, address agent, uint256 spend) view returns (bool)",
  "function nextMandateId() view returns (uint256)",
]);

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

const revAbi = parseAbi([
  "function distribute(address operator, uint256 gross)",
]);

function monadChain(rpcUrl: string) {
  return {
    id: 10143,
    name: "Monad Testnet",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  } as const;
}

/**
 * Autonomous operator agent: reads open mandates, bids if eligible,
 * enforces spend/scope via on-chain principalOk before executing actions.
 */
export class OperaAgent {
  readonly account: Account;
  readonly name: string;
  private readonly cfg: AgentConfig;
  private readonly publicClient;
  private readonly wallet;

  constructor(cfg: AgentConfig) {
    this.cfg = cfg;
    this.name = cfg.name;
    this.account = privateKeyToAccount(cfg.privateKey);
    const chain = monadChain(cfg.rpcUrl);
    this.publicClient = createPublicClient({
      chain,
      transport: http(cfg.rpcUrl),
    });
    this.wallet = createWalletClient({
      account: this.account,
      chain,
      transport: http(cfg.rpcUrl),
    });
  }

  async listOpenMandates(): Promise<bigint[]> {
    const next = await this.publicClient.readContract({
      address: this.cfg.mandateRegistry,
      abi: manAbi,
      functionName: "nextMandateId",
    });
    const open: bigint[] = [];
    for (let i = 1n; i < next; i++) {
      const m = await this.publicClient.readContract({
        address: this.cfg.mandateRegistry,
        abi: manAbi,
        functionName: "mandates",
        args: [i],
      });
      if (m[8] && !m[9]) open.push(i); // open && !awarded
    }
    return open;
  }

  async bidOn(mandateId: bigint): Promise<Hex> {
    const m = await this.publicClient.readContract({
      address: this.cfg.mandateRegistry,
      abi: manAbi,
      functionName: "mandates",
      args: [mandateId],
    });
    const stake = m[4];
    const approveHash = await this.wallet.writeContract({
      address: this.cfg.stakeToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [this.cfg.mandateRegistry, stake],
    });
    await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
    const bidHash = await this.wallet.writeContract({
      address: this.cfg.mandateRegistry,
      abi: manAbi,
      functionName: "bid",
      args: [mandateId],
    });
    await this.publicClient.waitForTransactionReceipt({ hash: bidHash });
    return bidHash;
  }

  /** Enforce principal + spend ceiling before any operational action */
  async executeScoped(
    mandateId: bigint,
    spend: bigint,
    action: () => Promise<Hex>,
  ): Promise<Hex> {
    if (spend > this.cfg.maxSpendPerTx) {
      throw new Error(`agent spend ${spend} exceeds local max ${this.cfg.maxSpendPerTx}`);
    }
    const ok = await this.publicClient.readContract({
      address: this.cfg.mandateRegistry,
      abi: manAbi,
      functionName: "principalOk",
      args: [mandateId, this.account.address, spend],
    });
    if (!ok) throw new Error("principalOk=false — refusing action");
    const hash = await action();
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * Check principalOk then pull `amount` of stakeToken into RevenueManager.distribute
   * for this agent as operator (yield bonding by on-chain score).
   */
  async executeRevenue(mandateId: bigint, amount: bigint): Promise<Hex> {
    const revenue = this.cfg.revenueManager;
    if (!revenue) {
      throw new Error("revenueManager not configured on agent");
    }
    return this.executeScoped(mandateId, amount, async () => {
      const approveHash = await this.wallet.writeContract({
        address: this.cfg.stakeToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [revenue, amount],
      });
      await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
      return this.wallet.writeContract({
        address: revenue,
        abi: revAbi,
        functionName: "distribute",
        args: [this.account.address, amount],
      });
    });
  }

  /**
   * Maintenance / inspection action: principalOk-gated CVA micro-transfer that
   * leaves an on-chain receipt (Travel Rule attachable via Cleanverse for A-Token txs).
   * `reportHash` is logged by the caller; spend is the inspection fee to treasury.
   */
  async executeInspection(
    mandateId: bigint,
    fee: bigint,
    treasury: Hex,
  ): Promise<Hex> {
    return this.executeScoped(mandateId, fee, async () => {
      return this.wallet.writeContract({
        address: this.cfg.stakeToken,
        abi: parseAbi([
          "function transfer(address to, uint256 amount) returns (bool)",
        ]),
        functionName: "transfer",
        args: [treasury, fee],
      });
    });
  }
}
