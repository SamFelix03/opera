/**
 * Register a Cleanverse Validator compliance pool on Monad (grant + register + SG rule).
 *
 * Pool must be an Ownable contract — Cleanverse verifies EIP-191 over
 * lowercase(chain)+lowercase(address) against on-chain owner(). EOAs fail with
 * "Invalid contract owner signature." Default pool = ScoreStore from deployment.
 *
 * On success, writes CLEANVERSE_VALIDATOR_POOL into config/.env.
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, parseAbi, getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { clientFromEnv, signOwnerMessage } from "@opera/cleanverse-client";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const envPath = resolve(root, "config/.env");
config({ path: envPath });

const CHAIN = "monad";
const deploymentPath = resolve(root, "config/deployments/monad-testnet.json");
const deployment = JSON.parse(readFileSync(deploymentPath, "utf8")) as {
  rpc: string;
  contracts: { ScoreStore: string };
};

const pk = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
if (!pk) {
  console.error("Need DEPLOYER_PRIVATE_KEY in config/.env");
  process.exit(1);
}

const signer = privateKeyToAccount(pk);
const defaultPool = deployment.contracts.ScoreStore;
const poolRaw = (process.env.CLEANVERSE_VALIDATOR_POOL ?? defaultPool).trim();
if (!poolRaw) {
  console.error("Need CLEANVERSE_VALIDATOR_POOL or ScoreStore in deployment JSON");
  process.exit(1);
}
const pool = getAddress(poolRaw);

const publicClient = createPublicClient({
  chain: {
    id: 10143,
    name: "monad",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [deployment.rpc] } },
  },
  transport: http(deployment.rpc),
});

const ownableAbi = parseAbi(["function owner() view returns (address)"]);
let onChainOwner: string;
try {
  onChainOwner = getAddress(
    await publicClient.readContract({
      address: pool,
      abi: ownableAbi,
      functionName: "owner",
    }),
  );
} catch {
  console.error(
    `Pool ${pool} has no Ownable.owner() — use ScoreStore (${defaultPool}) or another Ownable Opera contract, not an EOA.`,
  );
  process.exit(1);
}

if (onChainOwner.toLowerCase() !== signer.address.toLowerCase()) {
  console.error(
    `Signer ${signer.address} is not on-chain owner ${onChainOwner} of pool ${pool}`,
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      pool,
      owner: onChainOwner,
      signer: signer.address,
      source: process.env.CLEANVERSE_VALIDATOR_POOL ? "CLEANVERSE_VALIDATOR_POOL" : "ScoreStore",
    },
    null,
    2,
  ),
);

const cv = clientFromEnv();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

try {
  const reg = await cv.validatorIsRegister({ chain: CHAIN, contract_address: pool });
  console.log(JSON.stringify({ phase: "is_register", data: reg.data }, null, 2));
  const already =
    reg.data &&
    typeof reg.data === "object" &&
    (reg.data as { registered?: boolean }).registered === true;
  if (already) {
    upsertEnv(envPath, "CLEANVERSE_VALIDATOR_POOL", pool);
    console.log("Already registered. Set CLEANVERSE_VALIDATOR_POOL=" + pool);
    process.exit(0);
  }
} catch (e) {
  console.warn("is_register:", e instanceof Error ? e.message : e);
}

const grantSig = await signOwnerMessage(pk, CHAIN, pool);
try {
  const grant = await cv.validatorGrant({
    chain: CHAIN,
    address: pool,
    owner_signature: grantSig,
  });
  console.log(JSON.stringify({ phase: "grant", data: grant.data }, null, 2));
  // Docs: wait for previous write to confirm before another mutation
  await sleep(8_000);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  // Role may already be granted
  console.warn("grant:", msg);
  if (!/already|registered|role/i.test(msg)) {
    // continue to register — grant may already exist from a prior attempt
  }
}

const registerSig = await signOwnerMessage(pk, CHAIN, pool);
const register = await cv.validatorRegister({
  chain: CHAIN,
  contract_address: pool,
  owner_signature: registerSig,
  rule: {
    allowed_group: "",
    allowed_sub_group: "",
    min_tier: 0,
    min_sub_tier: 0,
    is_black_list: false,
    countries: ["SG"],
  },
});
console.log(JSON.stringify({ phase: "register", data: register.data }, null, 2));

upsertEnv(envPath, "CLEANVERSE_VALIDATOR_POOL", pool);
console.log("Wrote CLEANVERSE_VALIDATOR_POOL=" + pool + " to config/.env");

function upsertEnv(path: string, key: string, value: string) {
  const line = `${key}=${value}`;
  if (!existsSync(path)) {
    writeFileSync(path, line + "\n", "utf8");
    return;
  }
  const raw = readFileSync(path, "utf8");
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(raw)) {
    writeFileSync(path, raw.replace(re, line), "utf8");
  } else {
    const pad = raw.endsWith("\n") || raw.length === 0 ? "" : "\n";
    writeFileSync(path, raw + pad + line + "\n", "utf8");
  }
}
