import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { OperaAgent } from "./agent.js";

describe("OperaAgent", () => {
  it("constructs with unique keypair identity", () => {
    const pk = generatePrivateKey();
    const agent = new OperaAgent({
      name: "test",
      privateKey: pk,
      rpcUrl: "https://testnet-rpc.monad.xyz",
      mandateRegistry: "0x0000000000000000000000000000000000000001",
      stakeToken: "0x0000000000000000000000000000000000000002",
      maxSpendPerTx: 1000n,
    });
    expect(agent.account.address).toBe(privateKeyToAccount(pk).address);
  });

  it("refuses over-spend locally before chain call", async () => {
    const agent = new OperaAgent({
      name: "test",
      privateKey: generatePrivateKey(),
      rpcUrl: "https://testnet-rpc.monad.xyz",
      mandateRegistry: "0x0000000000000000000000000000000000000001",
      stakeToken: "0x0000000000000000000000000000000000000002",
      maxSpendPerTx: 100n,
    });
    await expect(
      agent.executeScoped(1n, 101n, async () => "0x" as `0x${string}`),
    ).rejects.toThrow(/exceeds local max/);
  });

  it("executeRevenue requires revenueManager config", async () => {
    const agent = new OperaAgent({
      name: "test",
      privateKey: generatePrivateKey(),
      rpcUrl: "https://testnet-rpc.monad.xyz",
      mandateRegistry: "0x0000000000000000000000000000000000000001",
      stakeToken: "0x0000000000000000000000000000000000000002",
      maxSpendPerTx: 1000n,
    });
    await expect(agent.executeRevenue(1n, 10n)).rejects.toThrow(
      /revenueManager not configured/,
    );
  });
});
