import { cfg } from "./config.js";
import { tryParseClobSignatureLabel } from "./clobSignature.js";

const PLACEHOLDER_VALUES = new Set([
  "your_private_key",
  "your_clob_api_key",
  "your_clob_secret",
  "your_clob_passphrase"
]);

function isPlaceholder(v: string): boolean {
  return PLACEHOLDER_VALUES.has(v.trim().toLowerCase());
}

function validPrivateKey(pk: string): boolean {
  const hex = pk.trim().replace(/^0x/i, "");
  return /^[0-9a-fA-F]{64}$/.test(hex);
}

function validHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validEthAddress(a: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(a.trim());
}


export function validateBotEnv(): void {
  const errors: string[] = [];
  const pk = (process.env.PRIVATE_KEY ?? "").trim();
  const key = (process.env.CLOB_API_KEY ?? "").trim();
  const secret = (process.env.CLOB_SECRET ?? "").trim();
  const pass = (process.env.CLOB_PASS_PHRASE ?? "").trim();

  if (!pk) errors.push("PRIVATE_KEY is missing.");
  else if (!validPrivateKey(pk)) errors.push("PRIVATE_KEY must be 64 hex chars (optional 0x prefix).");
  else if (isPlaceholder(pk)) errors.push("PRIVATE_KEY is still the example placeholder — set your real key.");

  const clobSet = [key, secret, pass].filter(Boolean).length;
  if (clobSet > 0 && clobSet < 3) {
    errors.push("Either omit CLOB_API_KEY, CLOB_SECRET, CLOB_PASS_PHRASE (auto-derive) or set all three.");
  } else if (clobSet === 3) {
    if (isPlaceholder(key)) errors.push("CLOB_API_KEY is still a placeholder.");
    if (isPlaceholder(secret)) errors.push("CLOB_SECRET is still a placeholder.");
    if (isPlaceholder(pass)) errors.push("CLOB_PASS_PHRASE is still a placeholder.");
  }

  if (!validHttpUrl(cfg.polymarketRestBase)) {
    errors.push(`POLYMARKET_REST_BASE must be http(s): got "${cfg.polymarketRestBase}"`);
  }
  if (!validHttpUrl(cfg.polymarketDataApiBase)) {
    errors.push(`POLYMARKET_DATA_API_BASE must be http(s): got "${cfg.polymarketDataApiBase}"`);
  }
  if (!validHttpUrl(cfg.clobApiUrl)) {
    errors.push(`CLOB_API_URL must be http(s): got "${cfg.clobApiUrl}"`);
  }

  const sigNorm = tryParseClobSignatureLabel(cfg.clobSignatureType);
  if (!sigNorm) {
    errors.push(
      `CLOB_SIGNATURE_TYPE must be one of: EOA, POLY_PROXY, POLY_GNOSIS_SAFE, POLY_1271 (got "${cfg.clobSignatureType}")`
    );
  }
  if (sigNorm && sigNorm !== "EOA") {
    const f = cfg.clobFunderAddress?.trim() ?? "";
    if (!f) {
      errors.push(
        `CLOB_FUNDER_ADDRESS is required when CLOB_SIGNATURE_TYPE is ${sigNorm} (Polymarket proxy/safe trading).`
      );
    } else if (!validEthAddress(f)) {
      errors.push(`CLOB_FUNDER_ADDRESS must be a 0x-prefixed 40-hex address (got "${f}").`);
    }
  } else if (cfg.clobFunderAddress?.trim() && !validEthAddress(cfg.clobFunderAddress)) {
    errors.push(`CLOB_FUNDER_ADDRESS must be a valid 0x address when set (got "${cfg.clobFunderAddress}").`);
  }
  const bc = cfg.clobBuilderCode?.trim() ?? "";
  if (bc && !/^0x[a-fA-F0-9]{64}$/.test(bc)) {
    errors.push(`CLOB_BUILDER_CODE must be empty or a 0x-prefixed 32-byte hex string (bytes32).`);
  }

  if (!Number.isFinite(cfg.loopSeconds) || cfg.loopSeconds < 1 || cfg.loopSeconds > 3600) {
    errors.push(`LOOP_SECONDS must be 1–3600 (got ${cfg.loopSeconds}).`);
  }
  if (!Number.isFinite(cfg.maxPositionUsd) || cfg.maxPositionUsd <= 0 || cfg.maxPositionUsd > 1e7) {
    errors.push(`MAX_POSITION_USD must be > 0 and ≤ 10M (got ${cfg.maxPositionUsd}).`);
  }
  if (!Number.isFinite(cfg.edgeThreshold) || cfg.edgeThreshold <= 0 || cfg.edgeThreshold >= 0.5) {
    errors.push(`EDGE_THRESHOLD must be between 0 and 0.5 (got ${cfg.edgeThreshold}).`);
  }
  if (!Number.isFinite(cfg.confidenceThreshold) || cfg.confidenceThreshold <= 0 || cfg.confidenceThreshold > 1) {
    errors.push(`CONFIDENCE_THRESHOLD must be in (0, 1] (got ${cfg.confidenceThreshold}).`);
  }
  if (!Number.isFinite(cfg.forceExitSeconds) || cfg.forceExitSeconds < 1 || cfg.forceExitSeconds >= 120) {
    errors.push(`FORCE_EXIT_SECONDS must be in [1, 119] (got ${cfg.forceExitSeconds}).`);
  }
  if (!Number.isFinite(cfg.emaFast) || !Number.isInteger(cfg.emaFast) || cfg.emaFast < 2 || cfg.emaFast > 100) {
    errors.push(`EMA_FAST must be an integer in [2, 100] (got ${cfg.emaFast}).`);
  }
  if (!Number.isFinite(cfg.emaSlow) || !Number.isInteger(cfg.emaSlow) || cfg.emaSlow < 3 || cfg.emaSlow > 200) {
    errors.push(`EMA_SLOW must be an integer in [3, 200] (got ${cfg.emaSlow}).`);
  }
  if (cfg.emaFast >= cfg.emaSlow) {
    errors.push(`EMA_FAST must be smaller than EMA_SLOW (got ${cfg.emaFast} >= ${cfg.emaSlow}).`);
  }
  if (!Number.isFinite(cfg.rsiPeriod) || !Number.isInteger(cfg.rsiPeriod) || cfg.rsiPeriod < 2 || cfg.rsiPeriod > 100) {
    errors.push(`RSI_PERIOD must be an integer in [2, 100] (got ${cfg.rsiPeriod}).`);
  }
  if (!Number.isFinite(cfg.whaleMinWinrate) || cfg.whaleMinWinrate <= 0 || cfg.whaleMinWinrate > 1) {
    errors.push(`WHALE_MIN_WINRATE must be in (0, 1] (got ${cfg.whaleMinWinrate}).`);
  }
  if (!Number.isFinite(cfg.whaleMinNotional) || cfg.whaleMinNotional < 0) {
    errors.push(`WHALE_MIN_NOTIONAL must be >= 0 (got ${cfg.whaleMinNotional}).`);
  }
  if (!Number.isFinite(cfg.walletWinrateTimeoutMs) || cfg.walletWinrateTimeoutMs < 500 || cfg.walletWinrateTimeoutMs > 20000) {
    errors.push(`WALLET_WINRATE_TIMEOUT_MS must be in [500, 20000] (got ${cfg.walletWinrateTimeoutMs}).`);
  }
  if (!Number.isFinite(cfg.walletWinrateCacheTtlSec) || cfg.walletWinrateCacheTtlSec < 10 || cfg.walletWinrateCacheTtlSec > 86400) {
    errors.push(`WALLET_WINRATE_CACHE_TTL_SEC must be in [10, 86400] (got ${cfg.walletWinrateCacheTtlSec}).`);
  }
  if (!Number.isFinite(cfg.clobChainId) || !Number.isInteger(cfg.clobChainId) || cfg.clobChainId < 1) {
    errors.push(`CLOB_CHAIN_ID must be a positive integer (got ${cfg.clobChainId}).`);
  }
  if (!Number.isFinite(cfg.closeAfterSeconds) || cfg.closeAfterSeconds < 0) {
    errors.push(`CLOSE_AFTER_SECONDS must be ≥ 0 (got ${cfg.closeAfterSeconds}).`);
  }

  const openaiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (openaiKey && !validHttpUrl(cfg.openaiBaseUrl)) {
    errors.push("OPENAI_BASE_URL must be a valid http(s) URL when OPENAI_API_KEY is set.");
  }
  if (cfg.walletWinrateApiUrl.trim() && !validHttpUrl(cfg.walletWinrateApiUrl)) {
    errors.push("WALLET_WINRATE_API_URL must be a valid http(s) URL.");
  }

  if (errors.length) {
    console.error(
      "Environment check failed. Fix .env and try again:\n\n  • " + errors.join("\n  • ")
    );
    process.exit(1);
  }

  if (cfg.clobChainId !== 137 && cfg.clobChainId !== 80002) {
    console.warn(
      `CLOB_CHAIN_ID is ${cfg.clobChainId} (use 137 for Polygon mainnet or 80002 for Amoy testnet).`
    );
  }

  console.log("Environment OK — starting bot.");
}

export function validateUiEnv(): void {
  const errors: string[] = [];

  if (!validHttpUrl(cfg.polymarketRestBase)) {
    errors.push(`POLYMARKET_REST_BASE must be a valid http(s) URL.`);
  }
  if (!validHttpUrl(cfg.polymarketDataApiBase)) {
    errors.push(`POLYMARKET_DATA_API_BASE must be a valid http(s) URL.`);
  }

  const openaiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (openaiKey && !validHttpUrl(cfg.openaiBaseUrl)) {
    errors.push("OPENAI_BASE_URL must be a valid http(s) URL when OPENAI_API_KEY is set.");
  }

  if (errors.length) {
    console.error("UI environment check failed:\n\n  • " + errors.join("\n  • "));
    process.exit(1);
  }
}
