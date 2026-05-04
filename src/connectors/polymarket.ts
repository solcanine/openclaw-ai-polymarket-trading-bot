import { MarketTick, WhaleFlow } from "../types/index.js";
import { cfg } from "../config.js";

type GammaMarket = {
  id: string;
  slug?: string;
  question?: string;
  endDate?: string;
  closed?: boolean;
  active?: boolean;
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
  outcomes?: string;
  outcomePrices?: string;
  condition_id?: string;
  conditionId?: string;
};

type DataTrade = {
  proxyWallet?: string;
  side?: "BUY" | "SELL";
  size?: number;
  price?: number;
  timestamp?: number;
  slug?: string;
  eventSlug?: string;
  title?: string;
  outcome?: string;
};

export class PolymarketConnector {
  private selectedMarket: GammaMarket | null = null;
  private selectedSlug: string | null = null;
  private history: MarketTick[] = [];
  private lastMarketRefreshMs = 0;

  constructor(private readonly baseUrl: string) {}

  async getMarketTicks(limit = 15): Promise<MarketTick[]> {
    const market = await this.resolveMarket();
    const yes = this.deriveYesPrice(market);

    this.history.push({
      marketId: market.slug || market.id,
      yesPrice: yes,
      noPrice: clamp01(1 - yes),
      ts: Date.now()
    });

    if (this.history.length > 300) this.history.shift();
    return this.history.slice(-limit);
  }

  async getWhaleFlow(marketId: string): Promise<WhaleFlow> {
    const slug = this.selectedSlug ?? marketId;
    const trades = await this.fetchRecentTrades(400);
    const marketTrades = trades.filter((t) => (t.eventSlug || t.slug) === slug);

    const byWallet = new Map<string, { yesNotional: number; noNotional: number; gross: number; joinedAt: number }>();

    for (const t of marketTrades) {
      const wallet = (t.proxyWallet || "anon").toLowerCase();
      const notional = Math.max(0, Number(t.size ?? 0) * Number(t.price ?? 0));
      if (!notional) continue;

      const outcome = (t.outcome || "").toLowerCase();
      const side = (t.side || "BUY").toUpperCase();
      const isYesOutcome = outcome === "up" || outcome === "yes";

      const prev = byWallet.get(wallet) || { yesNotional: 0, noNotional: 0, gross: 0, joinedAt: Number(t.timestamp ?? Date.now()) };
      const yesSigned = isYesOutcome ? (side === "BUY" ? notional : -notional) : (side === "BUY" ? -notional : notional);
      if (yesSigned >= 0) prev.yesNotional += yesSigned;
      else prev.noNotional += Math.abs(yesSigned);
      prev.gross += notional;
      prev.joinedAt = Math.min(prev.joinedAt, Number(t.timestamp ?? Date.now()));
      byWallet.set(wallet, prev);
    }

    const participants = [...byWallet.entries()]
      .map(([wallet, w]) => ({ wallet, ...w }))
      .filter((w) => w.gross >= cfg.whaleMinNotional)
      .sort((a, b) => b.gross - a.gross);

    const yesNotional = participants.reduce((s, w) => s + w.yesNotional, 0);
    const noNotional = participants.reduce((s, w) => s + w.noNotional, 0);
    const netYesNotional = yesNotional - noNotional;
    const grossNotional = participants.reduce((s, w) => s + w.gross, 0);

    return {
      marketId,
      netYesNotional,
      grossNotional,
      yesNotional,
      noNotional,
      tradeCount: marketTrades.length,
      ts: Date.now(),
      participants: participants.slice(0, 30).map((w) => ({
        wallet: w.wallet,
        yesNotional: w.yesNotional,
        noNotional: w.noNotional,
        netYes: w.yesNotional - w.noNotional,
        gross: w.gross,
        joinedAt: w.joinedAt
      })),
      topWallets: participants.slice(0, 8).map((w) => ({
        wallet: w.wallet,
        netYes: w.yesNotional - w.noNotional,
        gross: w.gross
      }))
    };
  }

  getConditionId(): string | null {
    return this.selectedMarket?.condition_id ?? this.selectedMarket?.conditionId ?? null;
  }

  async getCurrentMarketInfo(): Promise<{ slug: string; endDate?: string; remainingSec: number; question?: string }> {
    const m = await this.resolveMarket();
    const slug = m.slug || m.id;

    const startSec = parse5mStartFromSlug(slug);
    let remainingSec = -1;
    if (startSec) {
      remainingSec = Math.max(0, startSec + 300 - Math.floor(Date.now() / 1000));
    } else {
      const endMs = m.endDate ? new Date(m.endDate).getTime() : 0;
      remainingSec = endMs ? Math.max(0, Math.floor((endMs - Date.now()) / 1000)) : -1;
    }

    return {
      slug,
      endDate: m.endDate,
      remainingSec,
      question: m.question
    };
  }

  private async resolveMarket(): Promise<GammaMarket> {
    const now = Date.now();
    const shouldRefresh = !this.selectedMarket || this.selectedMarket.closed || (now - this.lastMarketRefreshMs > 5000);
    if (!shouldRefresh && this.selectedMarket) return this.selectedMarket;

    const nowSec = Math.floor(now / 1000);
    const bucketStart = Math.floor(nowSec / 300) * 300;
    const expectedSlug = `btc-updown-5m-${bucketStart}`;
    const expected = await this.fetchJson<GammaMarket[]>(`${this.baseUrl}/markets?slug=${encodeURIComponent(expectedSlug)}`);
    if (expected.length) {
      this.selectedMarket = expected[0];
      this.selectedSlug = expected[0].slug || expectedSlug;
      this.lastMarketRefreshMs = now;
      return expected[0];
    }

    const recentTrades = await this.fetchRecentTrades(400);
    const btc5mTrades = recentTrades
      .filter((t) => (t.eventSlug || "").startsWith("btc-updown-5m-"))
      .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
    const btc5m = btc5mTrades[0];
    if (btc5m?.eventSlug) {
      const arr = await this.fetchJson<GammaMarket[]>(`${this.baseUrl}/markets?slug=${encodeURIComponent(btc5m.eventSlug)}`);
      if (arr.length) {
        this.selectedMarket = arr[0];
        this.selectedSlug = arr[0].slug || btc5m.eventSlug;
        this.lastMarketRefreshMs = now;
        return arr[0];
      }
    }

    const all = await this.fetchJson<GammaMarket[]>(
      `${this.baseUrl}/markets?closed=false&active=true&limit=500&offset=0`
    );
    const candidates = all.filter((m) => {
      const q = `${m.question || ""} ${m.slug || ""}`.toLowerCase();
      return (q.includes("bitcoin") || q.includes("btc")) && q.includes("up or down");
    });

    if (!candidates.length) {
      throw new Error("No active BTC up/down market found.");
    }

    candidates.sort((a, b) => new Date(a.endDate || 0).getTime() - new Date(b.endDate || 0).getTime());
    this.selectedMarket = candidates[0];
    this.selectedSlug = candidates[0].slug || null;
    this.lastMarketRefreshMs = now;
    return candidates[0];
  }

  private deriveYesPrice(m: GammaMarket): number {
    const outcomes = parseJsonArray(m.outcomes);
    const prices = parseJsonArray(m.outcomePrices).map(Number);
    if (outcomes.length === prices.length && outcomes.length >= 2) {
      const idx = outcomes.findIndex((o) => `${o}`.toLowerCase() === "up" || `${o}`.toLowerCase() === "yes");
      if (idx >= 0 && Number.isFinite(prices[idx])) return clamp01(prices[idx]);
    }

    const last = Number(m.lastTradePrice ?? NaN);
    const bid = Number(m.bestBid ?? NaN);
    const ask = Number(m.bestAsk ?? NaN);

    if (Number.isFinite(bid) && Number.isFinite(ask) && bid >= 0 && ask <= 1 && ask >= bid) {
      return clamp01((bid + ask) / 2);
    }
    if (Number.isFinite(last) && last > 0 && last < 1) return clamp01(last);
    return 0.5;
  }

  private async fetchRecentTrades(limit = 200): Promise<DataTrade[]> {
    const cap = Math.min(Math.max(1, limit), 500);
    const base = cfg.polymarketDataApiBase.replace(/\/$/, "");
    const res = await fetch(`${base}/trades?limit=${cap}`);
    if (!res.ok) return [];
    return (await res.json()) as DataTrade[];
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Gamma API error ${res.status}: ${url}`);
    return (await res.json()) as T;
  }
}

function parseJsonArray(v?: string): any[] {
  if (!v) return [];
  try {
    const out = JSON.parse(v);
    return Array.isArray(out) ? out : [];
  } catch {
    return [];
  }
}

function parse5mStartFromSlug(slug: string): number | null {
  const m = slug.match(/btc-updown-5m-(\d{9,12})/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function clamp01(v: number) {
  return Math.max(0.01, Math.min(0.99, v));
}
