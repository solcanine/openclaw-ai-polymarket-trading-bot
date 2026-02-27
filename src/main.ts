import { cfg } from "./config.js";
import { PolymarketConnector } from "./connectors/polymarket.js";
import { buildFeatures } from "./engine/features.js";
import { predict } from "./engine/predictor.js";
import { PaperTrader } from "./engine/paperTrader.js";
import { LlmScorer } from "./models/llmScorer.js";

const connector = new PolymarketConnector(
  cfg.polymarketRestBase,
  cfg.polymarketMarketSlug,
  cfg.polymarketMarketId
);
const llm = new LlmScorer(cfg.openaiApiKey, cfg.openaiBaseUrl, cfg.openaiModel);
const trader = new PaperTrader(cfg.maxPositionUsd, cfg.edgeThreshold);

async function loop() {
  try {
    const ticks = await connector.getMarketTicks(20);
    const marketId = ticks[ticks.length - 1].marketId;

    if (ticks.length < 3) {
      console.log(`[${new Date().toISOString()}] warming up price buffer (${ticks.length}/3 ticks)`);
      return;
    }

    const whale = await connector.getWhaleFlow(marketId);
    const features = buildFeatures(ticks, whale);
    const llmBias = await llm.score(features);
    const pred = predict(features, llmBias);
    const action = trader.onPrediction(pred, features.yesPrice);

    console.log(`[${new Date().toISOString()}] ${action}`);
    console.log(`  p2.5m=${pred.pUp2m30s.toFixed(3)} p5m=${pred.pUp5m.toFixed(3)} conf=${pred.confidence.toFixed(2)}`);
  } catch (err) {
    console.error("loop error", err);
  }
}

console.log("Starting short-horizon paper bot...");
await loop();
setInterval(loop, cfg.loopSeconds * 1000);
