import "dotenv/config";
import { cfg } from "./config.js";
import { getTokenIdsForCondition, verifyClobReadiness } from "./connectors/orderExecution.js";

async function main() {
  const conditionArg = process.argv.slice(2).find((a) => /^0x[a-fA-F0-9]{64}$/.test(a));

  console.log(`CLOB host: ${cfg.clobApiUrl}`);
  console.log(`Chain id:  ${cfg.clobChainId}`);

  const probe = await verifyClobReadiness(conditionArg);
  if (!probe.ok) {
    console.error("CLOB readiness failed:", probe.error);
    process.exit(1);
  }
  console.log("GET /ok: OK");
  console.log("CLOB API version:", probe.version ?? "(unknown)");

  if (conditionArg) {
    console.log(`\nResolving tokens for condition ${conditionArg} …`);
    const ids = probe.tokenProbe ?? (await getTokenIdsForCondition(conditionArg));
    if (!ids) {
      console.error("Could not resolve YES/NO token ids (check condition id).");
      process.exit(1);
    }
    console.log("YES token:", ids.yesTokenId);
    console.log("NO token: ", ids.noTokenId);
  } else {
    console.log("\nTip: pass a condition id (0x + 64 hex) to verify token resolution.");
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
