# Polymarket Short-Horizon Bot (TypeScript)

TS skeleton bot for 5m prediction markets using:
- Whale flow proxy (recent large trades)
- Market microstructure (price momentum/volatility)
- Optional LLM context scorer
- Paper-trading risk engine

## Quick start

```bash
cd polymarket-shorthorizon-bot
npm i
cp .env.example .env
npm run dev
```

## Compare UI (before full trading)

```bash
npm run ui
# open http://localhost:8787
```

The UI lets you:
- fetch the latest bot prediction snapshot,
- enter actual YES price after 5 minutes,
- compare predicted side vs actual,
- track running accuracy.

## Live order execution (optional)

Set in `.env` for real orders (otherwise paper-only):

- `PRIVATE_KEY` — wallet private key (hex)
- `CLOB_API_KEY`, `CLOB_SECRET`, `CLOB_PASS_PHRASE` — from [Polymarket CLOB](https://docs.polymarket.com/developers/CLOB/quickstart) `createOrDeriveApiKey()`
- Optional: `CLOB_API_URL`, `CLOB_CHAIN_ID` (default 137)

The bot exposes `placeOrder`, `buy`, and `sell` in `src/connectors/orderExecution.ts`. When live credentials are set, the main loop will submit market BUY orders when the paper trader would open YES/NO.

## Notes

- This is **paper-trading by default**.
- Connector now pulls real market snapshots from Polymarket Gamma API (active BTC up/down market auto-select).
- You can pin a market with `POLYMARKET_MARKET_SLUG` or `POLYMARKET_MARKET_ID`.
- Whale-flow is currently a proxy signal derived from volume/price-change metadata (not wallet-level fills yet).
- No strategy guarantees profits.
