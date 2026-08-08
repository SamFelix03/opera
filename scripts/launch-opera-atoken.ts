/**
 * Launch Opera A-Token on Monad via Cleanverse, poll until ISSUED.
 * Wrapped launches fail on Monad in this sandbox — use standard LAUNCH.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { clientFromEnv } from "@opera/cleanverse-client";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
config({ path: resolve(root, "config/.env") });

const client = clientFromEnv();
const admin = process.env.DEPLOYER_ADDRESS!;
const symbol = `OPRACVA${Date.now().toString().slice(-4)}`;

const launch = await client.launchAtoken({
  chain: "monad",
  token_name: "Opera Protocol CVA",
  token_symbol: symbol,
  decimals: 6,
  admin_address: admin,
  rule: {
    allowed_group: "",
    allowed_sub_group: "",
    min_tier: 0,
    min_sub_tier: 0,
    is_black_list: false,
    countries: [],
  },
  icon: "https://images.cleanverse.com/app/token_icon/USDC.svg",
  callback_url: process.env.WEBHOOK_BASE_URL
    ? `${process.env.WEBHOOK_BASE_URL.replace(/\/$/, "")}/webhooks/atoken-apply`
    : undefined,
});

const requestId =
  (launch.data as { requestId?: string })?.requestId ??
  (launch.data as { request_id?: string })?.request_id;

console.log(
  JSON.stringify(
    { phase: "submitted", requestId, launchRequestId: launch.requestId, data: launch.data },
    null,
    2,
  ),
);

if (!requestId) {
  console.error("No requestId in launch response");
  process.exit(1);
}

let terminal: unknown = null;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const st = await client.queryApplyStatus(requestId);
  const data = st.data as { applyStatus?: string; atokenAddress?: string };
  console.log(
    JSON.stringify({
      poll: i + 1,
      applyStatus: data?.applyStatus,
      atokenAddress: data?.atokenAddress,
      requestId: st.requestId,
    }),
  );
  if (
    data?.applyStatus === "ISSUED" ||
    data?.applyStatus === "REJECTED" ||
    data?.applyStatus === "ISSUE_FAILED"
  ) {
    terminal = data;
    break;
  }
}

const outPath = resolve(root, "config/deployments/opera-atoken.json");
writeFileSync(
  outPath,
  JSON.stringify(
    {
      chain: "monad",
      flowType: "LAUNCH",
      requestId,
      admin,
      symbol,
      result: terminal,
      platformAusdc: {
        address: "0xaC0893567D43C3E7e6e35a72803df05416C1f20D",
        accessCore: "0x8F118338a1fa41E7Fa86Be19A4e8B99Ed58A6EcC",
        apass: "0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9",
        originUsdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
      },
      note: "Wrapped A-Token launches ISSUE_FAILED on Monad in this sandbox; standard LAUNCH is supported.",
    },
    null,
    2,
  ),
);

const status = (terminal as { applyStatus?: string })?.applyStatus;
console.log(JSON.stringify({ phase: "done", status, saved: outPath, terminal }, null, 2));
process.exit(status === "ISSUED" ? 0 : 2);
