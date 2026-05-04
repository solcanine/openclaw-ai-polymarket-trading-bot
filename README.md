# 🤖 Polymarket Short-Horizon Bot

> **🦞 Openclaw AI** Polymarket Trading Bot — TypeScript bot built with the Openclaw AI agent. Predicts crypto price direction on Polymarket’s 5-minute BTC Up/Down markets and places real orders.

A **TypeScript bot** that predicts whether Polymarket’s **5-minute Bitcoin Up/Down** markets will move up (YES) or down (NO) over the next 5 minutes and **places real CLOB orders**. You need a valid `PRIVATE_KEY` in `.env`; CLOB API key / secret / passphrase are optional (auto-derived if omitted).

---

## 📋 What does this bot do?

1. **📍 Picks a market**  
   It finds the current active “BTC up or down in 5 minutes” market on Polymarket (Gamma API + time bucket, with fallbacks via Data API and active-market scan).

2. **📊 Collects data every 15 seconds**  
   - Latest YES price from the order book  
   - Recent trader/whale participation on that market  
   - External wallet winrates for participating wallets  

3. **🔮 Makes a prediction**  
   It combines:  
   - **EMA trend** (fast vs slow EMA)  
   - **RSI trend pressure**  
   - **Winrate-filtered whale pressure** (wallets with winrate >= configured threshold)  
   - **Optional LLM bias** (if you set an OpenAI API key)  

   Into a single number: **probability that YES goes up in 5 minutes** (`pUp5m`).

4. **⚖️ Decides an action**  
   - If confidence >= `CONFIDENCE_THRESHOLD` and time is safe → **OPEN predicted side** ✅  
   - Otherwise → **HOLD** ⏸️

5. **💰 Executes**  
   The bot places real **market BUY** orders when the signal is OPEN YES/NO. It keeps one trade per market and force-exits near settlement (`FORCE_EXIT_SECONDS`, default 3s) to avoid final-second flips.

---

## 🔄 How the loop works (step by step)

Each run of the loop (every `LOOP_SECONDS` seconds, default 15):

```
1. Fetch market ticks (last 20 price snapshots) from Polymarket
2. If fewer than 3 ticks, wait (warm up)
3. Fetch whale flow for this market (recent large trades)
4. Compute wallet winrates locally from recent BTC 5m market trade history
5. Build features: EMA fast/slow, RSI, trend score, winrate-filtered whale pressure
5. (Optional) Call LLM scorer with features → get a bias in [-1, 1]
6. Run predictor: combine trend + whale pressure + LLM → pUp5m, confidence, side
7. Strategy: confidence gate + time gate → HOLD / OPEN YES / OPEN NO
8. Check open-positions.json; if already in this market → SKIP
9. If OPEN YES/NO → place FOK buy, record position, log result
10. If remaining time <= FORCE_EXIT_SECONDS → force sell and remove position
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

Edit `.env`: set at least `PRIVATE_KEY` (see [Environment variables](#environment-variables)).

### 2. 🚀 Run the bot

```bash
npm run dev
```

Or after a build: `npm run build && npm start` (runs `dist/main.js`).

The bot places real orders when confidence and timing gates pass. It logs `LIVE BUY orderID=...`, records positions in `open-positions.json`, and force-closes near expiry (default 3s before settlement).

### 3. 📊 (Optional) Run the Compare UI

In another terminal:

```bash
npm run ui
```

Open **http://localhost:8787** in your browser.

![Compare UI — 5m Prediction Lab](assets/Screenshot.png)

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
| `POLYMARKET_DATA_API_BASE` | Data API base (trades / whale flow) | `https://data-api.polymarket.com` |
| `BINANCE_REST_BASE` | Binance Futures REST URL | `https://fapi.binance.com` |
| **CLOB (V2 SDK)** | | |
| `PRIVATE_KEY` | Wallet private key (hex, 64 chars) | (required) |
| `CLOB_API_KEY` | L2 API key | (optional — derived from `PRIVATE_KEY` if omitted) |
| `CLOB_SECRET` | L2 secret | (optional — set all three or omit all three) |
| `CLOB_PASS_PHRASE` | L2 passphrase | (optional) |
| `CLOB_API_URL` | CLOB API base | `https://clob.polymarket.com` |
| `CLOB_CHAIN_ID` | Chain ID (Polygon mainnet) | `137` |
| `CLOB_SIGNATURE_TYPE` | `EOA` (default), `POLY_PROXY`, `POLY_GNOSIS_SAFE`, or `POLY_1271` | `EOA` |
| `CLOB_FUNDER_ADDRESS` | Required when not EOA: address that holds collateral | (empty) |
| `CLOB_BUILDER_CODE` | Optional `bytes32` builder attribution | (empty) |
| `CLOB_USE_SERVER_TIME` | Use server time for L2 signing (`true` / `false`) | `false` |
| `CLOSE_AFTER_SECONDS` | Optional timed close from open time (0 = disabled) | `0` |
| **Optional LLM** | | |
| `OPENAI_API_KEY` | If set, features are sent to the LLM for an extra bias signal | (empty = no LLM) |
| `OPENAI_BASE_URL` | OpenAI-compatible API base | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | Model name | `gpt-4o-mini` |
| **Runtime** | | |
| `LOOP_SECONDS` | Seconds between each loop run | `15` |
| `MAX_POSITION_USD` | Size in USD per position | `100` |
| `EDGE_THRESHOLD` | Legacy paper strategy threshold (kept for compatibility) | `0.03` |
| `CONFIDENCE_THRESHOLD` | Open only if model confidence >= this | `0.80` |
| `FORCE_EXIT_SECONDS` | Force-close position this many seconds before expiry | `3` |
| `EMA_FAST` | Fast EMA period | `5` |
| `EMA_SLOW` | Slow EMA period | `13` |
| `RSI_PERIOD` | RSI period | `14` |
| `WHALE_MIN_WINRATE` | Wallet winrate filter threshold for whale set | `0.70` |
| `WHALE_MIN_NOTIONAL` | Min wallet notional to consider a whale participant | `200` |
| `WALLET_WINRATE_API_URL` | Optional external API endpoint override (local compute works without it) | (empty) |
| `WALLET_WINRATE_API_KEY` | Optional bearer token for external winrate API | (empty) |
| `WALLET_WINRATE_TIMEOUT_MS` | Wallet API timeout | `3000` |
| `WALLET_WINRATE_CACHE_TTL_SEC` | Winrate cache TTL | `600` |

**Startup:** `validateBotEnv` checks `PRIVATE_KEY`, strategy ranges, URLs, and CLOB signing options. If `CLOB_API_KEY` / `CLOB_SECRET` / `CLOB_PASS_PHRASE` are **all omitted**, the bot calls Polymarket’s **`createOrDeriveApiKey()`** on first order. Open positions: `open-positions.json` (gitignored).

**CLOB smoke test:** `npm run clob:verify` (optional condition id as `0x` + 64 hex) hits `getOk` / `version` and can resolve YES/NO token ids via `getClobMarketInfo`.

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

1. **🔑 Wallet**  
   Set `PRIVATE_KEY` (the wallet that trades on Polymarket CLOB). See [Polymarket CLOB Quickstart](https://docs.polymarket.com/developers/CLOB/quickstart).

2. **🧠 Strategy data mode**  
   By default wallet winrate is computed locally from recent BTC 5m market trades. `WALLET_WINRATE_API_URL` is optional if you want to override with external data.

3. **🚀 Run the bot**  
   `npm run dev`. When the signal is OPEN YES or OPEN NO (and no position in that market yet), the bot will:
   - Compute EMA/RSI trend plus winrate-filtered whale pressure  
   - Open only when confidence >= `CONFIDENCE_THRESHOLD`  
   - Record one position per market and force-exit at `FORCE_EXIT_SECONDS` before settlement.

**Code:** Live logic is in `src/main.ts`. Position store: `src/engine/positionStore.ts`. Order placement: `src/connectors/orderExecution.ts` (`placeOrder`, `buy`, `sell`).

---

## 📁 Project structure (high level)

| Path | Role |
|------|------|
| `src/main.ts` | Entry point: loop every N seconds, fetch data → features → predict → place orders |
| `src/config.ts` | Reads `.env`, exposes `cfg` |
| `src/envCheck.ts` | Startup validation for bot (`validateBotEnv`) and UI (`validateUiEnv`) |
| `src/types/index.ts` | Shared types: `MarketTick`, `WhaleFlow`, `FeatureVector`, `Prediction`, `LivePosition`, etc. |
| `src/connectors/polymarket.ts` | Gamma API (market resolution, YES price) + Data API (whale flow). `getConditionId()` for CLOB orders |
| `src/connectors/orderExecution.ts` | CLOB V2 client: `placeOrder`, `buy`, `sell`, `getTokenIdsForCondition`, `verifyClobReadiness` |
| `src/clobSignature.ts` | Maps `CLOB_SIGNATURE_TYPE` → Polymarket `SignatureTypeV2` |
| `src/clobVerify.ts` | `npm run clob:verify` — read-only CLOB smoke test |
| `src/connectors/walletPerformance.ts` | External wallet winrate lookup (batch + cache + normalize) |
| `src/engine/features.ts` | Builds EMA/RSI + winrate-filtered whale pressure features |
| `src/engine/predictor.ts` | Combines trend + whale pressure + LLM bias → pUp5m, confidence, side |
| `src/engine/paperTrader.ts` | Legacy strategy helper (not primary live gate) |
| `src/engine/positionStore.ts` | Persisted live positions (`open-positions.json`): add, remove, check due-to-close for timed sell |
| `src/models/llmScorer.ts` | Optional: calls OpenAI (or compatible) API with features, returns bias in [-1, 1] |
| `src/uiServer.ts` | Serves the Compare UI and `/api/prediction` |
| `ui/` | Static Compare UI (HTML, JS, CSS) |

---

## ⚠️ Important notes

- **🔑 Credentials**  
   A valid `PRIVATE_KEY` is required. CLOB API key / secret / passphrase are **optional** in `.env`; if missing, they are obtained automatically via `createOrDeriveApiKey()` when the first order runs.

- **📍 Market selection**  
   The bot always picks the current 5-minute BTC up/down market (by time bucket or recent trades).

- **🐋 Whale flow + winrate**  
   Whale side-pressure is built from current-market participants and filtered by wallet winrate (computed locally by default).

- **⚠️ No guarantees**  
   This is a heuristic/experimental strategy. Past results do not guarantee future results. Trade at your own risk and only with money you can afford to lose.

- **🔄 Selling / closing**  
   Primary close rule is force-exit before settlement via `FORCE_EXIT_SECONDS` (default 3). Optional `CLOSE_AFTER_SECONDS` remains available as secondary timer.

---

## 🛠️ Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | 🚀 Run the bot with tsx (requires `PRIVATE_KEY` in `.env`) |
| `npm run ui` | 📊 Start the Compare UI server on port 8787 |
| `npm run build` | 📦 Compile TypeScript to `dist/` |
| `npm start` | ▶️ Run compiled bot: `node dist/main.js` |
| `npm run clob:verify` | 🔌 Read-only CLOB check (`getOk`, `version`, optional token resolution) |

---

*Built with [Openclaw 🦞](https://github.com/openclaw) AI agent.*
