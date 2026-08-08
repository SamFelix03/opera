import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseUnits, type Hex } from "viem";
import { OperaAgent } from "./agent.js";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
config({ path: resolve(root, "config/.env") });

const d = JSON.parse(
  readFileSync(resolve(root, "config/deployments/monad-testnet.json"), "utf8"),
) as {
  settlementToken?: string;
  settlementDecimals?: number;
  contracts: {
    MandateRegistry: Hex;
    OperaToken: Hex;
    OperaAToken?: Hex;
    RevenueManager: Hex;
  };
};

const name = process.env.AGENT_NAME ?? "operator";
const pk = process.env.AGENT_PRIVATE_KEY as Hex;
if (!pk) {
  console.error("AGENT_PRIVATE_KEY required");
  process.exit(1);
}

const decimals = d.settlementDecimals ?? 6;
const stakeToken = (d.settlementToken ??
  d.contracts.OperaAToken ??
  d.contracts.OperaToken) as Hex;

const agent = new OperaAgent({
  name,
  privateKey: pk,
  rpcUrl: process.env.MONAD_RPC_URL!,
  mandateRegistry: d.contracts.MandateRegistry,
  stakeToken,
  revenueManager: d.contracts.RevenueManager,
  maxSpendPerTx: parseUnits(process.env.AGENT_MAX_SPEND ?? "1000", decimals),
});

const open = await agent.listOpenMandates();
console.log(
  JSON.stringify({
    agent: name,
    address: agent.account.address,
    stakeToken,
    open: open.map(String),
  }),
);

if (process.env.AGENT_BID_MANDATE) {
  const id = BigInt(process.env.AGENT_BID_MANDATE);
  const hash = await agent.bidOn(id);
  console.log(JSON.stringify({ bid: hash, mandateId: id.toString() }));
}

if (process.env.AGENT_EXECUTE_REVENUE && process.env.AGENT_REVENUE_AMOUNT) {
  const id = BigInt(process.env.AGENT_EXECUTE_REVENUE);
  const amount = parseUnits(process.env.AGENT_REVENUE_AMOUNT, decimals);
  const hash = await agent.executeRevenue(id, amount);
  console.log(JSON.stringify({ revenue: hash, mandateId: id.toString(), amount: amount.toString() }));
}
