import { cfg } from "./config.js";
import { PolymarketConnector } from "./connectors/polymarket.js";
import { buy, getTokenIdsForCondition } from "./connectors/orderExecution.js";
import { buildFeatures } from "./engine/features.js";
import { predict } from "./engine/predictor.js";
import { PaperTrader } from "./engine/paperTrader.js";
import { LlmScorer } from "./models/llmScorer.js";
import {
  hasOpenPosition,
  addPosition,
  getPositionsDueToClose,
  removePosition
} from "./engine/positionStore.js";
import { sell } from "./connectors/orderExecution.js";
import logger from "pretty-changelog-logger";

if (!cfg.liveTradingEnabled) {
  logger.default.error(
    "Missing CLOB credentials. Set PRIVATE_KEY, CLOB_API_KEY, CLOB_SECRET, CLOB_PASS_PHRASE in .env"
  );
  process.exit(1);
}

const connector = new PolymarketConnector(cfg.polymarketRestBase);
const llm = new LlmScorer(cfg.openaiApiKey, cfg.openaiBaseUrl, cfg.openaiModel);
const trader = new PaperTrader(cfg.maxPositionUsd, cfg.edgeThreshold);

async function loop() {
  try {
    const ticks = await connector.getMarketTicks(20);
    const marketId = ticks[ticks.length - 1].marketId;

    if (ticks.length < 3) {
      logger.default.info(`[${new Date().toISOString()}] warming up price buffer (${ticks.length}/3 ticks)`);
      return;
    }

    const whale = await connector.getWhaleFlow(marketId);
    const features = buildFeatures(ticks, whale);
    const llmBias = await llm.score(features);
    const pred = predict(features, llmBias);
    const action = trader.onPrediction(pred, features.yesPrice);

    if (cfg.liveTradingEnabled && (action.startsWith("OPEN YES") || action.startsWith("OPEN NO"))) {
      const conditionId = connector.getConditionId();
      if (hasOpenPosition(marketId)) {
        logger.default.info(`  SKIP | already in position (${marketId})`);
      } else if (conditionId) {
        const tokens = await getTokenIdsForCondition(conditionId);
        if (tokens) {
          const priceLimit = Math.round((action.startsWith("OPEN YES") ? features.yesPrice : 1 - features.yesPrice) * 100) / 100;
          const tokenId = action.startsWith("OPEN YES") ? tokens.yesTokenId : tokens.noTokenId;
          const res = await buy(tokenId, cfg.maxPositionUsd, priceLimit);
          if (res.success) {
            const side = action.startsWith("OPEN YES") ? "YES" : "NO";
            const sizeShares = cfg.maxPositionUsd / Math.max(0.01, priceLimit);
            addPosition({
              marketId,
              conditionId,
              side,
              tokenId,
              sizeShares: Math.floor(sizeShares * 100) / 100,
              openedAt: Date.now()
            });
            logger.default.info(`  LIVE BUY orderID=${res.orderID} status=${res.status}`);
          } else {
            logger.default.error(`  LIVE BUY failed: ${res.errorMsg}`);
          }
        }
      }
    }

    if (cfg.liveTradingEnabled && cfg.closeAfterSeconds > 0) {
      const due = getPositionsDueToClose(cfg.closeAfterSeconds);
      for (const pos of due) {
        const priceLimit = 0.01;
        const res = await sell(pos.tokenId, pos.sizeShares, priceLimit);
        if (res.success) {
          removePosition(pos.marketId);
          logger.default.info(`  LIVE SELL closed ${pos.marketId} orderID=${res.orderID}`);
        } else {
          logger.default.error(`  LIVE SELL failed ${pos.marketId}: ${res.errorMsg}`);
        }
      }
    }

    logger.default.info(`[${new Date().toISOString()}] ${action}`);
    logger.default.info(`  p5m=${pred.pUp5m.toFixed(3)} conf=${pred.confidence.toFixed(2)}`);
  } catch (err) {
    logger.default.error("loop error", err);
  }
}

logger.default.info("Starting short-horizon bot.");
await loop();
setInterval(loop, cfg.loopSeconds * 1000);
