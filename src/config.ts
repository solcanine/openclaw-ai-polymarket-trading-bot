import "dotenv/config";

export const cfg = {
  polymarketRestBase: process.env.POLYMARKET_REST_BASE ?? "https://gamma-api.polymarket.com",
  binanceRestBase: process.env.BINANCE_REST_BASE ?? "https://fapi.binance.com",
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  loopSeconds: Number(process.env.LOOP_SECONDS ?? 15),
  maxPositionUsd: Number(process.env.MAX_POSITION_USD ?? 100),
  edgeThreshold: Number(process.env.EDGE_THRESHOLD ?? 0.03),
  polymarketMarketSlug: process.env.POLYMARKET_MARKET_SLUG,
  polymarketMarketId: process.env.POLYMARKET_MARKET_ID
};
