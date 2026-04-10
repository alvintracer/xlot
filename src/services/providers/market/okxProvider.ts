// ============================================================
// OKX Provider — Market Discovery + Metadata Provider
// Fetches RWA-related perpetual futures data from OKX Public API.
//
// STATUS: LIVE
// All endpoints are public, no API key required.
//
// Confirmed RWA markets:
//   XAU-USDT-SWAP — Gold perpetual swap
//   XAG-USDT-SWAP — Silver perpetual swap
// ============================================================

import type { MarketDiscoveryProvider, MetadataProvider, DiscoveredMarket, MetadataResult } from '../types';
import type { RWAInstrument } from '../../../types/rwaInstrument';

const OKX_API = 'https://www.okx.com/api/v5';
const RELAY_URL = import.meta.env.VITE_RELAY_URL || '/api/relay';

/** Proxy fetch through relay server to bypass CORS */
async function proxyFetch(url: string): Promise<Response> {
  return fetch(`${RELAY_URL}/proxy?url=${encodeURIComponent(url)}`);
}

// ─── RWA contract mapping ────────────────────────────────────
interface OKXRWAMarket {
  instId: string;       // OKX instrument ID, e.g. "XAU-USDT-SWAP"
  displayName: string;
  oracleRef: string;
  subCategory: string;
}

const RWA_MARKETS: OKXRWAMarket[] = [
  { instId: 'XAU-USDT-SWAP', displayName: 'Gold Perpetual (OKX)', oracleRef: 'XAU/USD', subCategory: 'gold' },
  { instId: 'XAG-USDT-SWAP', displayName: 'Silver Perpetual (OKX)', oracleRef: 'XAG/USD', subCategory: 'silver' },
];

// Instrument ID → OKX instId
const INST_TO_OKX: Record<string, string> = {
  'okx-xau-perp': 'XAU-USDT-SWAP',
  'okx-xag-perp': 'XAG-USDT-SWAP',
};

// ─── Types ──────────────────────────────────────────────────
interface OKXTicker {
  instId: string;
  last: string;
  askPx: string;
  bidPx: string;
  open24h: string;
  high24h: string;
  low24h: string;
  vol24h: string;     // 24h volume in base
  volCcy24h: string;  // 24h volume in quote (USDT)
  ts: string;
}

interface OKXFundingRate {
  instId: string;
  instType: string;
  fundingRate: string;
  nextFundingRate: string;
  fundingTime: string;
  nextFundingTime: string;
}

interface OKXOpenInterest {
  instId: string;
  oi: string;       // Open interest in contracts
  oiCcy: string;    // Open interest in underlying
  ts: string;
}

// ─── Cache ───────────────────────────────────────────────────
interface TickerCacheEntry {
  ticker: OKXTicker;
  funding: OKXFundingRate | null;
  oi: OKXOpenInterest | null;
}

const tickerCache = new Map<string, TickerCacheEntry>();
let cacheTs = 0;
const CACHE_TTL = 60_000; // 1 minute for CEX

// ─── API Helpers ─────────────────────────────────────────────
async function okxGet<T>(path: string): Promise<T> {
  const res = await proxyFetch(`${OKX_API}${path}`);
  if (!res.ok) throw new Error(`OKX API ${res.status}: ${path}`);
  const json = await res.json() as { code: string; msg: string; data: T };
  if (json.code !== '0') throw new Error(`OKX error: ${json.msg}`);
  return json.data;
}

async function fetchTickerData(instId: string): Promise<TickerCacheEntry | null> {
  const now = Date.now();
  const cached = tickerCache.get(instId);
  if (cached && now - cacheTs < CACHE_TTL) return cached;

  try {
    const [tickers, fundings, ois] = await Promise.allSettled([
      okxGet<OKXTicker[]>(`/market/ticker?instId=${instId}`),
      okxGet<OKXFundingRate[]>(`/public/funding-rate?instId=${instId}`),
      okxGet<OKXOpenInterest[]>(`/public/open-interest?instType=SWAP&instId=${instId}`),
    ]);

    const ticker = tickers.status === 'fulfilled' && tickers.value?.[0] ? tickers.value[0] : null;
    if (!ticker) return null;

    const funding = fundings.status === 'fulfilled' && fundings.value?.[0] ? fundings.value[0] : null;
    const oi = ois.status === 'fulfilled' && ois.value?.[0] ? ois.value[0] : null;

    const entry: TickerCacheEntry = { ticker, funding, oi };
    tickerCache.set(instId, entry);
    cacheTs = now;
    return entry;
  } catch (e) {
    // silenced — CORS expected
    return null;
  }
}

/** Annualize 8h funding rate */
function annualizeFunding(funding8h: string): number {
  return parseFloat(funding8h || '0') * 3 * 365 * 100;
}

// ─── Public: get data for a specific instrument ──────────────
export async function getOKXContractData(instId: string): Promise<{
  lastPrice: number;
  markPrice: number;            // use last as proxy
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
  const data = await fetchTickerData(instId);
  if (!data) return null;

  const { ticker, funding, oi } = data;
  const lastPrice = parseFloat(ticker.last);
  const open24h = parseFloat(ticker.open24h);
  const changePercent = open24h > 0 ? ((lastPrice - open24h) / open24h) * 100 : 0;
  const oiVal = oi ? parseFloat(oi.oiCcy) : 0;

  return {
    lastPrice,
    markPrice: lastPrice,
    bidPrice: parseFloat(ticker.bidPx),
    askPrice: parseFloat(ticker.askPx),
    high24h: parseFloat(ticker.high24h),
    low24h: parseFloat(ticker.low24h),
    volume24hUsd: parseFloat(ticker.volCcy24h),
    fundingRate: funding ? parseFloat(funding.fundingRate) : 0,
    fundingAnnualized: funding ? annualizeFunding(funding.fundingRate) : 0,
    nextFundingTime: funding ? parseInt(funding.nextFundingTime) : 0,
    openInterest: oiVal,
    openInterestUsd: oiVal * lastPrice,
    priceChangePercent: changePercent,
  };
}

// ─── MarketDiscoveryProvider ─────────────────────────────────
export const OKXMarketProvider: MarketDiscoveryProvider = {
  name: 'OKX',
  isLive: true,

  async discoverMarkets(): Promise<DiscoveredMarket[]> {
    try {
      const results = await Promise.allSettled(
        RWA_MARKETS.map(m => fetchTickerData(m.instId))
      );

      const markets: DiscoveredMarket[] = [];
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled' || !r.value) return;
        const { ticker } = r.value;
        const mkt = RWA_MARKETS[i];
        const lastPrice = parseFloat(ticker.last);

        markets.push({
          symbol: mkt.instId,
          displayName: mkt.displayName,
          marketType: 'perp',
          settlementType: 'perpetual',
          priceUsd: lastPrice,
          volume24hUsd: parseFloat(ticker.volCcy24h),
          spreadPct: null,
          oracleRef: mkt.oracleRef,
          isActive: true,
          venue: 'OKX',
        });
      });

      return markets;
    } catch (e) {
      console.error('[OKX] discoverMarkets error:', e);
      return [];
    }
  },
};

// ─── MetadataProvider ────────────────────────────────────────
export const OKXMetadataProvider: MetadataProvider = {
  name: 'OKX',
  isLive: true,

  async fetchMetadata(instrument: RWAInstrument): Promise<MetadataResult | null> {
    const instId = INST_TO_OKX[instrument.id];
    if (!instId) return null;

    const data = await getOKXContractData(instId);
    if (!data) return null;

    return {
      navUsd: null,               // CEX doesn't expose oracle/index price in public API
      priceUsd: data.lastPrice,
      apyPct: data.fundingAnnualized,
      liquidityUsd: data.openInterestUsd,
      volume24hUsd: data.volume24hUsd,
      lastUpdated: Date.now(),
      source: 'OKX',
    };
  },
};
