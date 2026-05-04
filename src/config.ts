import "dotenv/config";

function envBool(v: string | undefined, defaultVal = false): boolean {
  if (v === undefined) return defaultVal;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

export const cfg = {
  polymarketRestBase: process.env.POLYMARKET_REST_BASE ?? "https://gamma-api.polymarket.com",
  polymarketDataApiBase: process.env.POLYMARKET_DATA_API_BASE ?? "https://data-api.polymarket.com",
  binanceRestBase: process.env.BINANCE_REST_BASE ?? "https://fapi.binance.com",
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  loopSeconds: Number(process.env.LOOP_SECONDS ?? 15),
  maxPositionUsd: Number(process.env.MAX_POSITION_USD ?? 100),
  edgeThreshold: Number(process.env.EDGE_THRESHOLD ?? 0.03),
  confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD ?? 0.8),
  forceExitSeconds: Number(process.env.FORCE_EXIT_SECONDS ?? 3),
  emaFast: Number(process.env.EMA_FAST ?? 5),
  emaSlow: Number(process.env.EMA_SLOW ?? 13),
  rsiPeriod: Number(process.env.RSI_PERIOD ?? 14),
  whaleMinWinrate: Number(process.env.WHALE_MIN_WINRATE ?? 0.7),
  whaleMinNotional: Number(process.env.WHALE_MIN_NOTIONAL ?? 200),
  walletWinrateApiUrl: process.env.WALLET_WINRATE_API_URL ?? "",
  walletWinrateApiKey: process.env.WALLET_WINRATE_API_KEY ?? "",
  walletWinrateTimeoutMs: Number(process.env.WALLET_WINRATE_TIMEOUT_MS ?? 3000),
  walletWinrateCacheTtlSec: Number(process.env.WALLET_WINRATE_CACHE_TTL_SEC ?? 600),
  clobApiUrl: process.env.CLOB_API_URL ?? "https://clob.polymarket.com",
  clobChainId: Number(process.env.CLOB_CHAIN_ID ?? 137),
  clobSignatureType: (process.env.CLOB_SIGNATURE_TYPE ?? "EOA").trim(),
  clobFunderAddress: (process.env.CLOB_FUNDER_ADDRESS ?? "").trim() || undefined,
  clobBuilderCode: (process.env.CLOB_BUILDER_CODE ?? "").trim() || undefined,
  clobUseServerTime: envBool(process.env.CLOB_USE_SERVER_TIME, false),
  privateKey: process.env.PRIVATE_KEY,
  clobApiKey: process.env.CLOB_API_KEY,
  clobSecret: process.env.CLOB_SECRET,
  clobPassphrase: process.env.CLOB_PASS_PHRASE,
  liveTradingEnabled: Boolean(process.env.PRIVATE_KEY?.trim()),
  closeAfterSeconds: Number(process.env.CLOSE_AFTER_SECONDS ?? 0)
};
