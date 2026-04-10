// ============================================================
// LighterProvider — Market Discovery + Metadata Provider
// Discovers and fetches RWA-related perpetual markets on lighter.xyz.
//
// STATUS: LIVE
// API Base: https://mainnet.zklighter.elliot.ai
// No API key required for public endpoints.
// Zero-fee DEX running on ZK L2 (Ethereum L2).
//
// Confirmed RWA markets (active):
//   XAU   (92)  — Gold         $303M daily vol
//   XAG   (93)  — Silver        $21M daily vol
//   PAXG  (48)  — Gold/PAXG     $2.3M daily vol
//   BRENTOIL    — Brent Oil     $37M daily vol
//   NATGAS      — Natural Gas  $511K daily vol
//   XCU         — Copper       $662K daily vol
//   XPT         — Platinum      $2M daily vol
//   XPD         — Palladium     $2M daily vol
//   ONDO  (38)  — Ondo Finance $113K daily vol
// ============================================================

import type { MarketDiscoveryProvider, MetadataProvider, DiscoveredMarket, MetadataResult } from '../types';
import type { RWAInstrument } from '../../../types/rwaInstrument';

const LIGHTER_API = 'https://mainnet.zklighter.elliot.ai/api/v1';
const RELAY_URL = 'http://49.247.139.241:3000';
const LIGHTER_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  'Accept': 'application/json',
  'Origin': 'https://app.lighter.xyz',
};

// ─── RWA market definitions ──────────────────────────────────
interface LighterRWAMarket {
  symbol: string;
  marketId: number;
  displayName: string;
  oracleRef: string;
  assetClass: string;
  subCategory: string;
}

const RWA_MARKETS: LighterRWAMarket[] = [
  { symbol: 'XAU',       marketId: 92,  displayName: 'Gold Perpetual (lighter.xyz)',           oracleRef: 'XAU/USD',   assetClass: 'commodity', subCategory: 'gold' },
  { symbol: 'XAG',       marketId: 93,  displayName: 'Silver Perpetual (lighter.xyz)',         oracleRef: 'XAG/USD',   assetClass: 'commodity', subCategory: 'silver' },
  { symbol: 'PAXG',      marketId: 48,  displayName: 'Gold / PAXG Perpetual (lighter.xyz)',    oracleRef: 'XAU/USD (PAXG)', assetClass: 'commodity', subCategory: 'gold' },
  { symbol: 'BRENTOIL',  marketId: 0,   displayName: 'Brent Crude Oil Perpetual (lighter.xyz)',oracleRef: 'Brent Oil/USD', assetClass: 'commodity', subCategory: 'oil' },
  { symbol: 'NATGAS',    marketId: 0,   displayName: 'Natural Gas Perpetual (lighter.xyz)',    oracleRef: 'Natural Gas/USD', assetClass: 'commodity', subCategory: 'energy' },
  { symbol: 'XCU',       marketId: 0,   displayName: 'Copper Perpetual (lighter.xyz)',         oracleRef: 'Copper/USD', assetClass: 'commodity', subCategory: 'copper' },
  { symbol: 'XPT',       marketId: 0,   displayName: 'Platinum Perpetual (lighter.xyz)',       oracleRef: 'XPT/USD',   assetClass: 'commodity', subCategory: 'platinum' },
  { symbol: 'XPD',       marketId: 0,   displayName: 'Palladium Perpetual (lighter.xyz)',      oracleRef: 'XPD/USD',   assetClass: 'commodity', subCategory: 'palladium' },
  { symbol: 'ONDO',      marketId: 38,  displayName: 'Ondo Finance Perpetual (lighter.xyz)',   oracleRef: 'ONDO/USD',  assetClass: 'treasury',  subCategory: 'rwa-token' },
];

// instrument ID → lighter symbol
const INST_TO_SYMBOL: Record<string, string> = {
  'lighter-xau-perp':  'XAU',
  'lighter-xag-perp':  'XAG',
  'lighter-paxg-perp': 'PAXG',
  'lighter-oil-perp':  'BRENTOIL',
};

// ─── Response types ───────────────────────────────────────────
interface LighterOrderBookStat {
  symbol: string;
  last_trade_price: number;
  daily_trades_count: number;
  daily_base_token_volume: number;
  daily_quote_token_volume: number;
  daily_price_change: number;
}

interface LighterOrderBookDetail {
  symbol: string;
  market_id: number;
  market_type: string;
  status: string;
  last_trade_price: number;
  daily_trades_count: number;
  daily_base_token_volume: number;
  daily_quote_token_volume: number;
  daily_price_low: number;
  daily_price_high: number;
  daily_price_change: number;
  open_interest: number;
  default_initial_margin_fraction: number;  // 500 = 2% = 50x max leverage
  maintenance_margin_fraction: number;
}

// ─── Cache ────────────────────────────────────────────────────
let statsCache: { data: Map<string, LighterOrderBookStat>; ts: number } = { data: new Map(), ts: 0 };
let orderBooksCache: { data: Map<string, { market_id: number; status: string }>; ts: number } = { data: new Map(), ts: 0 };
const CACHE_TTL = 30_000;

/** Proxy fetch through relay server to bypass CORS */
async function proxyFetch(url: string): Promise<Response> {
  return fetch(`${RELAY_URL}/proxy?url=${encodeURIComponent(url)}`);
}

// ─── Fetch all exchange stats ──────────────────────────────────────────
async function fetchExchangeStats(): Promise<Map<string, LighterOrderBookStat>> {
  const now = Date.now();
  if (statsCache.data.size > 0 && now - statsCache.ts < CACHE_TTL) return statsCache.data;

  const res = await proxyFetch(`${LIGHTER_API}/exchangeStats`);
  if (!res.ok) throw new Error(`lighter.xyz exchangeStats ${res.status}`);
  const json = await res.json();

  const map = new Map<string, LighterOrderBookStat>();
  for (const s of (json.order_book_stats || [])) {
    map.set(s.symbol, s);
  }
  statsCache = { data: map, ts: now };
  return map;
}

// ─── Fetch orderbook list (for market_id mapping) ─────────────
async function fetchOrderBooks(): Promise<Map<string, { market_id: number; status: string }>> {
  const now = Date.now();
  if (orderBooksCache.data.size > 0 && now - orderBooksCache.ts < CACHE_TTL * 10) return orderBooksCache.data;

  const res = await proxyFetch(`${LIGHTER_API}/orderBooks`);
  if (!res.ok) throw new Error(`lighter.xyz orderBooks ${res.status}`);
  const json = await res.json();

  const map = new Map<string, { market_id: number; status: string }>();
  for (const b of (json.order_books || [])) {
    map.set(b.symbol, { market_id: b.market_id, status: b.status });
  }
  orderBooksCache = { data: map, ts: now };
  return map;
}

// ─── Fetch orderbook detail by market_id ──────────────────────
async function fetchOrderBookDetail(marketId: number): Promise<LighterOrderBookDetail | null> {
  try {
    const res = await proxyFetch(`${LIGHTER_API}/orderBookDetails?market_id=${marketId}`);
    if (!res.ok) return null;
    const json = await res.json();
    const details = json.order_book_details;
    return details?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Max leverage from margin fraction (500 → 2% → 50x) */
function calcMaxLeverage(marginFraction: number): number {
  return Math.round(10000 / marginFraction);
}

// ─── Public: get data for a specific symbol ───────────────────
export async function getLighterMarketData(symbol: string): Promise<{
  lastPrice: number;
  change24h: number;
  volume24hUsd: number;
  openInterest: number;
  openInterestUsd: number;
  high24h: number;
  low24h: number;
  maxLeverage: number;
  marketId: number;
} | null> {
  try {
    const [stats, books] = await Promise.all([fetchExchangeStats(), fetchOrderBooks()]);

    const stat = stats.get(symbol);
    const book = books.get(symbol);
    if (!stat || !book) return null;

    // Get detail for more info
    const detail = await fetchOrderBookDetail(book.market_id);

    return {
      lastPrice: stat.last_trade_price,
      change24h: stat.daily_price_change,
      volume24hUsd: stat.daily_quote_token_volume,
      openInterest: detail?.open_interest ?? 0,
      openInterestUsd: (detail?.open_interest ?? 0) * stat.last_trade_price,
      high24h: detail?.daily_price_high ?? stat.last_trade_price,
      low24h: detail?.daily_price_low ?? stat.last_trade_price,
      maxLeverage: detail ? calcMaxLeverage(detail.default_initial_margin_fraction) : 20,
      marketId: book.market_id,
    };
  } catch (e) {
    // silenced — CORS expected
    return null;
  }
}

/** Fetch candles via recentTrades aggregation (lighter doesn't have dedicated kline endpoint) */
export async function getLighterOrderbook(marketId: number): Promise<{
  bids: { price: number; size: number }[];
  asks: { price: number; size: number }[];
} | null> {
  try {
    const res = await proxyFetch(`${LIGHTER_API}/orderBookOrders?market_id=${marketId}&limit=10`);
    if (!res.ok) return null;
    const json = await res.json();

    const bids = (json.bids || []).map((b: { price: string; amount: string }) => ({
      price: parseFloat(b.price), size: parseFloat(b.amount),
    }));
    const asks = (json.asks || []).map((a: { price: string; amount: string }) => ({
      price: parseFloat(a.price), size: parseFloat(a.amount),
    }));

    return { bids, asks };
  } catch (e) {
    // silenced — CORS expected
    return null;
  }
}

// ─── MarketDiscoveryProvider ──────────────────────────────────
export const LighterMarketProvider: MarketDiscoveryProvider = {
  name: 'lighter.xyz',
  isLive: true,

  async discoverMarkets(): Promise<DiscoveredMarket[]> {
    try {
      const stats = await fetchExchangeStats();
      const markets: DiscoveredMarket[] = [];

      for (const mkt of RWA_MARKETS) {
        const stat = stats.get(mkt.symbol);
        if (!stat) continue;

        markets.push({
          symbol: `${mkt.symbol}-PERP`,
          displayName: mkt.displayName,
          marketType: 'perp',
          settlementType: 'perpetual',
          priceUsd: stat.last_trade_price,
          volume24hUsd: stat.daily_quote_token_volume,
          spreadPct: null,   // no oracle/mark split in exchangeStats
          oracleRef: mkt.oracleRef,
          isActive: true,
          venue: 'lighter.xyz',
        });
      }

      return markets;
    } catch (e) {
      console.error('[lighterProvider] discoverMarkets error:', e);
      return [];
    }
  },
};

// ─── MetadataProvider ─────────────────────────────────────────
export const LighterMetadataProvider: MetadataProvider = {
  name: 'lighter.xyz',
  isLive: true,

  async fetchMetadata(instrument: RWAInstrument): Promise<MetadataResult | null> {
    const symbol = INST_TO_SYMBOL[instrument.id];
    if (!symbol) return null;

    const data = await getLighterMarketData(symbol);
    if (!data) return null;

    return {
      navUsd: null,          // lighter doesn't expose separate oracle price in public stats
      priceUsd: data.lastPrice,
      apyPct: null,          // funding rate endpoint params not yet determined
      liquidityUsd: data.openInterestUsd,
      volume24hUsd: data.volume24hUsd,
      lastUpdated: Date.now(),
      source: 'lighter.xyz',
    };
  },
};
