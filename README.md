# 🤖 Polymarket Short-Horizon Bot

> **🦞 Openclaw AI** Polymarket Trading Bot — TypeScript bot built with the Openclaw AI agent. Predicts crypto price direction on Polymarket’s 5-minute BTC Up/Down markets and places real orders.

A **TypeScript bot** that predicts whether Polymarket’s **5-minute Bitcoin Up/Down** markets will move up (YES) or down (NO) over the next 5 minutes and **places real CLOB orders**. You must set CLOB API credentials in `.env` to run.

---

## 📋 What does this bot do?

1. **📍 Picks a market**  
   It finds the current active “BTC up or down in 5 minutes” market on Polymarket (or uses a market you pin in config).

2. **📊 Collects data every 15 seconds**  
   - Latest YES price from the order book  
   - Short-term price moves (e.g. last ~30 seconds, ~2 minutes)  
   - Recent “whale” 🐋 flow (large trades) on that market  

3. **🔮 Makes a prediction**  
   It combines:  
   - **Momentum** (recent returns)  
   - **Volatility** (recent price range)  
   - **Whale bias** (whether big traders are buying YES or NO)  
   - **Optional LLM bias** (if you set an OpenAI API key)  

   Into a single number: **probability that YES goes up in 5 minutes** (`pUp5m`).

4. **⚖️ Decides an action**  
   - If `pUp5m` is clearly above 0.5 (e.g. &gt; 0.53) → **OPEN YES** ✅  
   - If clearly below 0.5 (e.g. &lt; 0.47) → **OPEN NO** ❌  
   - Otherwise → **HOLD** ⏸️  
   The thresholds are set by `EDGE_THRESHOLD` in `.env`.

5. **💰 Executes**  
   The bot places real **market BUY** orders when the signal is OPEN YES/NO. It records open positions in `open-positions.json` to avoid double-opening and can optionally close after `CLOSE_AFTER_SECONDS` (timed market sell).

---

## 🔄 How the loop works (step by step)

Each run of the loop (every `LOOP_SECONDS` seconds, default 15):

```
1. Fetch market ticks (last 20 price snapshots) from Polymarket
2. If fewer than 3 ticks, wait (warm up)
3. Fetch whale flow for this market (recent large trades)
4. Build features: returns 30s, returns 2m, volatility 2m, whale bias, whale intensity
5. (Optional) Call LLM scorer with features → get a bias in [-1, 1]
6. Run predictor: linear combo + sigmoid → pUp5m, confidence
7. Strategy: compare pUp5m to 0.5 ± EDGE_THRESHOLD → HOLD / OPEN YES / OPEN NO
8. Check open-positions.json; if already in this market → SKIP
9. If OPEN YES/NO → place FOK buy, record position, log result
10. If CLOSE_AFTER_SECONDS > 0 → for positions due to close, market sell and remove from store
11. Log action and p5m/confidence to console
```

So: **data → features → prediction → decision → real order and position lifecycle**.

---

## ⚡ Quick start

### 1. 📦 Install and config

```bash
cd polymarket-shorthorizon-bot
npm install
cp .env.example .env
```

Edit `.env` and set CLOB credentials (see [Environment variables](#environment-variables) below).

### 2. 🚀 Run the bot

```bash
npm run dev
```

The bot places real orders when the signal is OPEN YES/NO. It logs e.g. `LIVE BUY orderID=...` and records positions in `open-positions.json`. If `CLOSE_AFTER_SECONDS` is set (e.g. 300), positions are closed with a market sell after that many seconds.

### 3. 📊 (Optional) Run the Compare UI

In another terminal:

```bash
npm run ui
```

Open **http://localhost:8787** in your browser.

- **Get Prediction** 🔍 — fetches the same snapshot the bot uses (market, current YES price, prediction, whale stats).  
- **Auto Compare** ⏱️ — you set “Entry YES price” and “Auto settle delay (sec)” (e.g. 300 for 5 min). The UI waits that long, then fetches the new YES price and records whether the bot’s predicted side (YES/NO) would have been correct.  
- **History** 📜 — table of past comparisons and **accuracy** (e.g. “Total: 10 | Correct: 6 | Accuracy: 60%”).

The Compare UI helps you review prediction vs outcome and track accuracy.

---

## 🔧 Environment variables

Copy `.env.example` to `.env` and adjust as needed.

| Variable | Description | Default |
|----------|-------------|--------|
| **Data sources** | | |
| `POLYMARKET_REST_BASE` | Gamma API base URL | `https://gamma-api.polymarket.com` |
| **CLOB (required)** | | |
| `PRIVATE_KEY` | Wallet private key (hex) | (required) |
| `CLOB_API_KEY` | From Polymarket CLOB “create or derive API key” | (required) |
| `CLOB_SECRET` | Same | (required) |
| `CLOB_PASS_PHRASE` | Same | (required) |
| `CLOB_API_URL` | CLOB API base | `https://clob.polymarket.com` |
| `CLOB_CHAIN_ID` | Chain ID (Polygon mainnet) | `137` |
| `CLOSE_AFTER_SECONDS` | Close positions with market sell after N seconds (0 = hold to resolution) | `0` |
| **Optional LLM** | | |
| `OPENAI_API_KEY` | If set, features are sent to the LLM for an extra bias signal | (empty = no LLM) |
| `OPENAI_BASE_URL` | OpenAI-compatible API base | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | Model name | `gpt-4o-mini` |
| **Runtime** | | |
| `LOOP_SECONDS` | Seconds between each loop run | `15` |
| `MAX_POSITION_USD` | Size in USD per position | `100` |
| `EDGE_THRESHOLD` | Min edge to open: \|pUp5m - 0.5\| &gt; this (e.g. 0.03 → open if pUp5m &gt; 0.53 or &lt; 0.47) | `0.03` |

**Startup:** The bot requires all four CLOB credentials; it exits if any are missing. Open positions are stored in `open-positions.json` (gitignored) to avoid double-opening; set `CLOSE_AFTER_SECONDS` to auto-close with a market sell.

---

## 📊 Compare UI in detail

- **Get Prediction** 🔍  
  Calls the same backend as the bot (`/api/prediction`): current market, YES price, 5m prediction (pUp5m, side), confidence, whale stats. Good for a quick sanity check.

- **Auto Compare (5m)** ⏱️  
  1. Click “Get Prediction” once so the snapshot is loaded.  
  2. “Entry YES price” is pre-filled with current YES; you can change it.  
  3. Set “Auto settle delay” to 300 (5 minutes) or another value.  
  4. Click “Start Auto Compare.”  
  5. The UI waits that many seconds, then fetches the current YES price again and records: predicted side vs actual (YES if exit price ≥ entry, else NO). It appends one row to History and updates accuracy.

- **Whale Panel** 🐋  
  Shows the same whale breakdown as in the snapshot (top wallets, net YES, gross, bias).

- **History** 📜  
  Stored in `localStorage`. Columns: Time, Market, Pred Side, Entry YES, Exit YES, Actual (YES/NO), Correct (✅/❌). Below: total count, correct count, accuracy %.

---

## 💰 Order execution

The bot **places real orders** when the signal is OPEN YES or OPEN NO:

1. **🔑 Get CLOB API credentials**  
   See [Polymarket CLOB Quickstart](https://docs.polymarket.com/developers/CLOB/quickstart). You’ll use your wallet to create or derive API keys (L2 auth).

2. **📝 Put them in `.env`**  
   Set `PRIVATE_KEY`, `CLOB_API_KEY`, `CLOB_SECRET`, `CLOB_PASS_PHRASE`. Optionally `CLOB_API_URL`, `CLOB_CHAIN_ID`.

3. **🚀 Run the bot**  
   `npm run dev`. When the signal is OPEN YES or OPEN NO (and no position in that market yet), the bot will:
   - Resolve the market’s condition ID and YES/NO token IDs via the CLOB API  
   - Call `buy(tokenId, MAX_POSITION_USD, priceLimit)` (FOK market buy) and record the position in `open-positions.json`  
   - Log success (order ID, status) or failure (error message). If `CLOSE_AFTER_SECONDS` is set (e.g. 300), positions are closed with a market sell after that many seconds.

**Code:** Live logic is in `src/main.ts`. Position store: `src/engine/positionStore.ts`. Order placement: `src/connectors/orderExecution.ts` (`placeOrder`, `buy`, `sell`).

---

## 📁 Project structure (high level)

| Path | Role |
|------|------|
| `src/main.ts` | Entry point: loop every N seconds, fetch data → features → predict → place orders |
| `src/config.ts` | Reads `.env`, exposes `cfg` (URLs, keys, `liveTradingEnabled`, `closeAfterSeconds`) |
| `src/connectors/polymarket.ts` | Talks to Gamma API (market, ticks) and Data API (trades for whale flow). Exposes `getConditionId()` for live orders |
| `src/connectors/orderExecution.ts` | CLOB client wrapper: `placeOrder`, `buy`, `sell`, `getTokenIdsForCondition` |
| `src/engine/features.ts` | Builds feature vector from ticks + whale (returns, vol, whale bias/intensity) |
| `src/engine/predictor.ts` | Combines features + LLM bias → pUp5m, confidence |
| `src/engine/paperTrader.ts` | Strategy: given prediction + current price → HOLD / OPEN YES / OPEN NO |
| `src/engine/positionStore.ts` | Persisted live positions (`open-positions.json`): add, remove, check due-to-close for timed sell |
| `src/models/llmScorer.ts` | Optional: calls OpenAI (or compatible) API with features, returns bias in [-1, 1] |
| `src/uiServer.ts` | Serves the Compare UI and `/api/prediction` |
| `ui/` | Static Compare UI (HTML, JS, CSS) |

---

## ⚠️ Important notes

- **🔑 Credentials**  
   The bot requires `PRIVATE_KEY`, `CLOB_API_KEY`, `CLOB_SECRET`, and `CLOB_PASS_PHRASE`; it exits at startup if any are missing.

- **📍 Market selection**  
   The bot always picks the current 5-minute BTC up/down market (by time bucket or recent trades).

- **🐋 Whale flow**  
   Built from public trade data (e.g. Data API). “Whales” here = wallets with ≥ $200 notional in the sampled window. It’s a proxy, not full wallet-level history.

- **⚠️ No guarantees**  
   This is a heuristic/experimental strategy. Past results do not guarantee future results. Trade at your own risk and only with money you can afford to lose.

- **🔄 Selling / closing**  
   Set `CLOSE_AFTER_SECONDS` (e.g. 300) to auto-close positions with a market sell after N seconds. If 0, positions are held to market resolution.

---

## 🛠️ Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | 🚀 Run the bot with tsx (requires CLOB credentials in `.env`) |
| `npm run ui` | 📊 Start the Compare UI server on port 8787 |
| `npm run build` | 📦 Compile TypeScript to `dist/` |
| `npm start` | ▶️ Run compiled bot: `node dist/main.js` |

---

*Built with [Openclaw 🦞](https://github.com/openclaw) AI agent.*
