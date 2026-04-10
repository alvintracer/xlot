// ============================================================
// Bitget Provider — Market Discovery + Metadata Provider
// Fetches RWA-related perpetual futures data from Bitget Public API.
//
// STATUS: LIVE
// All endpoints are public, no API key required.
//
// Confirmed RWA markets:
//   XAUUSDT — Gold perpetual (USDT-M)
//   XAGUSDT — Silver perpetual (USDT-M)
// ============================================================

import type { MarketDiscoveryProvider, MetadataProvider, DiscoveredMarket, MetadataResult } from '../types';
import type { RWAInstrument } from '../../../types/rwaInstrument';

const BITGET_API = 'https://api.bitget.com/api/v2/mix';
const RELAY_URL = import.meta.env.VITE_RELAY_URL || '/api/relay';

/** Proxy fetch through relay server to bypass CORS */
async function proxyFetch(url: string): Promise<Response> {
  return fetch(`${RELAY_URL}/proxy?url=${encodeURIComponent(url)}`);
}

// ─── RWA market definitions ─────────────────────────────────
interface BitgetRWAMarket {
  symbol: string;        // Bitget symbol, e.g. "XAUUSDT"
  productType: string;   // "USDT-FUTURES"
  displayName: string;
  oracleRef: string;
  subCategory: string;
}

const RWA_MARKETS: BitgetRWAMarket[] = [
  { symbol: 'XAUUSDT', productType: 'USDT-FUTURES', displayName: 'Gold Perpetual (Bitget)', oracleRef: 'XAU/USD', subCategory: 'gold' },
  { symbol: 'XAGUSDT', productType: 'USDT-FUTURES', displayName: 'Silver Perpetual (Bitget)', oracleRef: 'XAG/USD', subCategory: 'silver' },
];

// Instrument ID → Bitget symbol
const INST_TO_BITGET: Record<string, { symbol: string; productType: string }> = {
  'bitget-xau-perp': { symbol: 'XAUUSDT', productType: 'USDT-FUTURES' },
  'bitget-xag-perp': { symbol: 'XAGUSDT', productType: 'USDT-FUTURES' },
};

// ─── Types ──────────────────────────────────────────────────
interface BitgetTicker {
  symbol: string;
  lastPr: string;
  bidPr: string;
  askPr: string;
  high24h: string;
  low24h: string;
  open24h: string;
  quoteVolume: string;    // 24h volume in USDT
  baseVolume: string;     // 24h volume in base
  ts: string;
  change24h: string;      // 24h change ratio
  openUtc: string;
  changeUtc24h: string;
}

interface BitgetFundingRate {
  symbol: string;
  fundingRate: string;
  nextFundingTime: string;
}

interface BitgetOpenInterest {
  symbol: string;
  amount: string;         // OI in contracts
  amountCoin: string;     // OI in base coin
}

// ─── Cache ───────────────────────────────────────────────────
interface CacheEntry {
  ticker: BitgetTicker;
  funding: BitgetFundingRate | null;
  oi: BitgetOpenInterest | null;
}

const cache = new Map<string, CacheEntry>();
let cacheTs = 0;
const CACHE_TTL = 60_000; // 1 minute

// ─── API Helpers ─────────────────────────────────────────────
async function bitgetGet<T>(path: string): Promise<T> {
  const res = await proxyFetch(`${BITGET_API}${path}`);
  if (!res.ok) throw new Error(`Bitget API ${res.status}: ${path}`);
  const json = await res.json() as { code: string; msg: string; data: T };
  if (json.code !== '00000') throw new Error(`Bitget error: ${json.msg}`);
  return json.data;
}

async function fetchData(symbol: string, productType: string): Promise<CacheEntry | null> {
  const now = Date.now();
  const cached = cache.get(symbol);
  if (cached && now - cacheTs < CACHE_TTL) return cached;

  try {
    const [tickers, fundings, ois] = await Promise.allSettled([
      bitgetGet<BitgetTicker[]>(`/market/ticker?symbol=${symbol}&productType=${productType}`),
      bitgetGet<BitgetFundingRate[]>(`/market/current-fund-rate?symbol=${symbol}&productType=${productType}`),
      bitgetGet<BitgetOpenInterest[]>(`/market/open-interest?symbol=${symbol}&productType=${productType}`),
    ]);

    const ticker = tickers.status === 'fulfilled' && tickers.value?.[0] ? tickers.value[0] : null;
    if (!ticker) return null;

    const funding = fundings.status === 'fulfilled' && fundings.value?.[0] ? fundings.value[0] : null;
    const oi = ois.status === 'fulfilled' && ois.value?.[0] ? ois.value[0] : null;

    const entry: CacheEntry = { ticker, funding, oi };
    cache.set(symbol, entry);
    cacheTs = now;
    return entry;
  } catch (e) {
    console.warn(`[Bitget] fetchData ${symbol} skipped (CORS)`);
    return null;
  }
}

/** Annualize 8h funding rate */
function annualizeFunding(rate: string): number {
  return parseFloat(rate || '0') * 3 * 365 * 100;
}

// ─── Public: get data for a specific symbol ──────────────────
export async function getBitgetContractData(symbol: string, productType: string = 'USDT-FUTURES'): Promise<{
  lastPrice: number;
  markPrice: number;
  bidPrice: number;
  askPrice: number;
  high24h: number;
  low24h: number;
  volume24hUsd: number;
  fundingRate: number;
  fundingAnnualized: number;
  nextFundingTime: number;
  openInterest: number;
  openInterestUsd: number;
  priceChangePercent: number;
} | null> {
  const data = await fetchData(symbol, productType);
  if (!data) return null;

  const { ticker, funding, oi } = data;
  const lastPrice = parseFloat(ticker.lastPr);
  const changePercent = parseFloat(ticker.change24h || '0') * 100;
  const oiAmount = oi ? parseFloat(oi.amountCoin || oi.amount) : 0;

  return {
    lastPrice,
    markPrice: lastPrice,
    bidPrice: parseFloat(ticker.bidPr),
    askPrice: parseFloat(ticker.askPr),
    high24h: parseFloat(ticker.high24h),
    low24h: parseFloat(ticker.low24h),
    volume24hUsd: parseFloat(ticker.quoteVolume),
    fundingRate: funding ? parseFloat(funding.fundingRate) : 0,
    fundingAnnualized: funding ? annualizeFunding(funding.fundingRate) : 0,
    nextFundingTime: funding ? parseInt(funding.nextFundingTime) : 0,
    openInterest: oiAmount,
    openInterestUsd: oiAmount * lastPrice,
    priceChangePercent: changePercent,
  };
}

// ─── MarketDiscoveryProvider ─────────────────────────────────
export const BitgetMarketProvider: MarketDiscoveryProvider = {
  name: 'Bitget',
  isLive: true,

  async discoverMarkets(): Promise<DiscoveredMarket[]> {
    try {
      const results = await Promise.allSettled(
        RWA_MARKETS.map(m => fetchData(m.symbol, m.productType))
      );

      const markets: DiscoveredMarket[] = [];
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled' || !r.value) return;
        const { ticker } = r.value;
        const mkt = RWA_MARKETS[i];
        const lastPrice = parseFloat(ticker.lastPr);

        markets.push({
          symbol: mkt.symbol,
          displayName: mkt.displayName,
          marketType: 'perp',
          settlementType: 'perpetual',
          priceUsd: lastPrice,
          volume24hUsd: parseFloat(ticker.quoteVolume),
          spreadPct: null,
          oracleRef: mkt.oracleRef,
          isActive: true,
          venue: 'Bitget',
        });
      });

      return markets;
    } catch (e) {
      console.error('[Bitget] discoverMarkets error:', e);
      return [];
    }
  },
};

// ─── MetadataProvider ────────────────────────────────────────
export const BitgetMetadataProvider: MetadataProvider = {
  name: 'Bitget',
  isLive: true,

  async fetchMetadata(instrument: RWAInstrument): Promise<MetadataResult | null> {
    const config = INST_TO_BITGET[instrument.id];
    if (!config) return null;

    const data = await getBitgetContractData(config.symbol, config.productType);
    if (!data) return null;

    return {
      navUsd: null,
      priceUsd: data.lastPrice,
      apyPct: data.fundingAnnualized,
      liquidityUsd: data.openInterestUsd,
      volume24hUsd: data.volume24hUsd,
      lastUpdated: Date.now(),
      source: 'Bitget',
    };
  },
};
