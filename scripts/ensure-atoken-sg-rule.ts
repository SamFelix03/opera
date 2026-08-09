/**
 * Ensure Opera A-Token has an SG country whitelist rule (Cleanverse POST /atoken/add_rule).
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { clientFromEnv } from "@opera/cleanverse-client";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
config({ path: resolve(root, "config/.env") });

const d = JSON.parse(
  readFileSync(resolve(root, "config/deployments/monad-testnet.json"), "utf8"),
);
const atoken = d.settlementToken ?? d.contracts.OperaAToken;
const cv = clientFromEnv();

const existing = await cv.atokenRules({ chain: "monad", atoken_address: atoken });
const rules =
  (existing.data as { rules?: Array<{ countries?: string[]; is_black_list?: boolean }> })?.rules ??
  [];
const hasSg = rules.some(
  (r) => !r.is_black_list && (r.countries ?? []).map((c) => c.toUpperCase()).includes("SG"),
);
if (hasSg) {
  console.log(JSON.stringify({ ok: true, added: false, atoken, rules }, null, 2));
  process.exit(0);
}

try {
  await cv.addAtokenRule({
    chain: "monad",
    atoken_address: atoken,
    rule: {
      allowed_group: "",
      allowed_sub_group: "",
      min_tier: 0,
      min_sub_tier: 0,
      is_black_list: false,
      countries: ["SG"],
    },
  });
  const after = await cv.atokenRules({ chain: "monad", atoken_address: atoken });
  console.log(JSON.stringify({ ok: true, added: true, atoken, data: after.data }, null, 2));
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
}
