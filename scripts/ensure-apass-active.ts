/**
 * Ensure a demo role wallet can receive A-Token (status active).
 * Usage: pnpm exec tsx scripts/ensure-apass-active.ts 0x...
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clientFromEnv } from "@opera/cleanverse-client";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
config({ path: resolve(root, "config/.env") });

const addr = process.argv[2];
if (!addr?.startsWith("0x")) {
  console.error("usage: ensure-apass-active.ts <0xaddress>");
  process.exit(1);
}

const cv = clientFromEnv();
const q = await cv.queryApass({ chain: "monad", address: addr });
const data = q.data as { status?: number };
console.log("before", { address: addr, status: data.status });
if (data.status === 2) {
  const r = await cv.updateStatus({
    status: "1",
    wallet: { chain: "monad", address: addr },
  });
  console.log("activated", r.requestId, r.raw);
} else if (data.status === 1) {
  console.log("already active");
} else {
  console.log("unexpected status; leaving as-is", data);
}
const q2 = await cv.queryApass({ chain: "monad", address: addr });
console.log("after", { status: (q2.data as { status?: number }).status });
