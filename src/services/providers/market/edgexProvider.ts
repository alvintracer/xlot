// ============================================================
// edgeXProvider — Market Discovery + Metadata Provider
// Discovers and fetches RWA commodity perpetual markets on edgeX.
//
// STATUS: LIVE
// API Base: https://pro.edgex.exchange/api/v1/public
// No API key required for public endpoints.
//
// Confirmed RWA markets:
//   PAXGUSD (10000227) — Gold via PAXG
//   XAUTUSD (10000234) — Gold via XAUt
//   SILVERUSD (10000278) — Silver
//   COPPERUSD (10000279) — Copper
// ============================================================

import type { MarketDiscoveryProvider, MetadataProvider, DiscoveredMarket, MetadataResult } from '../types';
import type { RWAInstrument } from '../../../types/rwaInstrument';

const EDGEX_API = 'https://pro.edgex.exchange/api/v1/public';
const RELAY_URL = 'http://49.247.139.241:3000';

/** Proxy fetch through relay server to bypass CORS */
async function proxyFetch(url: string): Promise<Response> {
  return fetch(`${RELAY_URL}/proxy?url=${encodeURIComponent(url)}`);
}

// ─── RWA contract mapping ────────────────────────────────────
interface EdgeXContract {
  contractId: string;
  contractName: string;
  displayName: string;
  oracleRef: string;
  assetClass: string;
  subCategory: string;
}

const RWA_CONTRACTS: EdgeXContract[] = [
  { contractId: '10000227', contractName: 'PAXGUSD', displayName: 'Gold / PAXG Perpetual (edgeX)', oracleRef: 'XAU/USD (via PAXG)', assetClass: 'commodity', subCategory: 'gold' },
  { contractId: '10000234', contractName: 'XAUTUSD', displayName: 'Gold / XAUt Perpetual (edgeX)', oracleRef: 'XAU/USD (via XAUt)', assetClass: 'commodity', subCategory: 'gold' },
  { contractId: '10000278', contractName: 'SILVERUSD', displayName: 'Silver Perpetual (edgeX)', oracleRef: 'XAG/USD', assetClass: 'commodity', subCategory: 'silver' },
  { contractId: '10000279', contractName: 'COPPERUSD', displayName: 'Copper Perpetual (edgeX)', oracleRef: 'Copper/USD', assetClass: 'commodity', subCategory: 'copper' },
];

// Instrument ID → contractId
const INST_TO_CONTRACT: Record<string, string> = {
  'edgex-paxg-perp': '10000227',
  'edgex-xaut-perp': '10000234',
  'edgex-silver-perp': '10000278',
  'edgex-copper-perp': '10000279',
};

// ─── Cache ───────────────────────────────────────────────────
interface TickerData {
  contractId: string;
  contractName: string;
  lastPrice: string;
  indexPrice: string;
  oraclePrice: string;
  markPrice: string;
  priceChange: string;
  priceChangePercent: string;
  high: string;
  low: string;
  open: string;
  close: string;
  value: string;          // 24h notional volume
  size: string;           // 24h base volume
  trades: string;
  openInterest: string;
  fundingRate: string;
  fundingTime: string;
  nextFundingTime: string;
}

interface TickerCache {
  data: Map<string, TickerData>;
  ts: number;
}

const tickerCache: TickerCache = { data: new Map(), ts: 0 };
const TICKER_TTL = 30_000; // 30s

// ─── API Helpers ─────────────────────────────────────────────
// ─── API Helpers ─────────────────────────────────────────────
async function fetchTicker(contractId: string): Promise<TickerData | null> {
  const now = Date.now();
  const cached = tickerCache.data.get(contractId);
  if (cached && now - tickerCache.ts < TICKER_TTL) return cached;

  try {
    const res = await proxyFetch(`${EDGEX_API}/quote/getTicker?contractId=${contractId}`);
    if (!res.ok) throw new Error(`edgeX API ${res.status}`);
    const json = await res.json();
    const arr = json.data as TickerData[];
    if (!arr || arr.length === 0) return null;

    const ticker = arr[0];
    tickerCache.data.set(contractId, ticker);
    tickerCache.ts = now;
    return ticker;
  } catch (e) {
    console.warn(`[edgeXProvider] fetchTicker ${contractId} error:`, e);
    return null;
  }
}

async function fetchAllRWATickers(): Promise<Map<string, TickerData>> {
  const now = Date.now();
  if (tickerCache.data.size >= RWA_CONTRACTS.length && now - tickerCache.ts < TICKER_TTL) {
    return tickerCache.data;
  }

  const results = await Promise.allSettled(
    RWA_CONTRACTS.map(c => fetchTicker(c.contractId))
  );

  const map = new Map<string, TickerData>();
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      map.set(RWA_CONTRACTS[i].contractId, r.value);
    }
  });

  return map;
}

/** Annualize 8h funding rate */
function annualizeFunding(funding8h: string): number {
  return parseFloat(funding8h) * 3 * 365 * 100;
}

// ─── Public: get data for a specific contract ────────────────
export async function getEdgeXContractData(contractId: string): Promise<{
  lastPrice: number;
  markPrice: number;
  oraclePrice: number;
  indexPrice: number;
  funding8h: number;
  fundingAnnualized: number;
  openInterest: number;
  openInterestUsd: number;
  volume24hUsd: number;
  priceChangePercent: number;
  nextFundingTime: number;
} | null> {
  const ticker = await fetchTicker(contractId);
  if (!ticker) return null;

  const lastPrice = parseFloat(ticker.lastPrice);
  const markPrice = parseFloat(ticker.markPrice);
  const oraclePrice = parseFloat(ticker.oraclePrice);

  return {
    lastPrice,
    markPrice,
    oraclePrice,
    indexPrice: parseFloat(ticker.indexPrice),
    funding8h: parseFloat(ticker.fundingRate),
    fundingAnnualized: annualizeFunding(ticker.fundingRate),
    openInterest: parseFloat(ticker.openInterest),
    openInterestUsd: parseFloat(ticker.openInterest) * markPrice,
    volume24hUsd: parseFloat(ticker.value),
    priceChangePercent: parseFloat(ticker.priceChangePercent) * 100,
    nextFundingTime: parseInt(ticker.nextFundingTime),
  };
}

/** Fetch L2 orderbook */
export async function getEdgeXOrderbook(contractId: string, level: 15 | 200 = 15): Promise<{
  bids: { price: number; size: number }[];
  asks: { price: number; size: number }[];
} | null> {
  try {
    const res = await proxyFetch(`${EDGEX_API}/quote/getDepth?contractId=${contractId}&level=${level}`);
    if (!res.ok) return null;
    const json = await res.json();
    const data = json.data as Array<{ bids: { price: string; size: string }[]; asks: { price: string; size: string }[] }>;
    if (!data || data.length === 0) return null;

    return {
      bids: data[0].bids.map(b => ({ price: parseFloat(b.price), size: parseFloat(b.size) })),
      asks: data[0].asks.map(a => ({ price: parseFloat(a.price), size: parseFloat(a.size) })),
    };
  } catch (e) {
    console.error('[edgeXProvider] getDepth error:', e);
    return null;
  }
}

/** Fetch candle data for charting */
export async function getEdgeXCandles(
  contractId: string,
  klineType: 'MINUTE_1' | 'MINUTE_5' | 'MINUTE_15' | 'HOUR_1' | 'HOUR_4' | 'DAY_1' = 'HOUR_1',
  size = 100,
): Promise<{ t: number; o: number; h: number; l: number; c: number; v: number }[]> {
  try {
    const res = await proxyFetch(
      `${EDGEX_API}/quote/getKline?contractId=${contractId}&klineType=${klineType}&size=${size}&priceType=LAST_PRICE`
    );
    if (!res.ok) return [];
    const json = await res.json();
    const dataList = json.data?.dataList || [];

    return dataList.map((c: { klineTime: string; open: string; high: string; low: string; close: string; value: string }) => ({
      t: parseInt(c.klineTime),
      o: parseFloat(c.open),
      h: parseFloat(c.high),
      l: parseFloat(c.low),
      c: parseFloat(c.close),
      v: parseFloat(c.value),
    }));
  } catch (e) {
    console.error('[edgeXProvider] getKline error:', e);
    return [];
  }
}

/** Fetch funding rate history */
export async function getEdgeXFundingHistory(contractId: string, size = 20): Promise<{
  time: number;
  rate: number;
  oraclePrice: number;
}[]> {
  try {
    const res = await proxyFetch(
      `${EDGEX_API}/funding/getFundingRatePage?contractId=${contractId}&size=${size}`
    );
    if (!res.ok) return [];
    const json = await res.json();
    const dataList = json.data?.dataList || [];

    return dataList.map((f: { fundingTime: string; fundingRate: string; oraclePrice: string }) => ({
      time: parseInt(f.fundingTime),
      rate: parseFloat(f.fundingRate),
      oraclePrice: parseFloat(f.oraclePrice),
    }));
  } catch (e) {
    console.error('[edgeXProvider] getFundingHistory error:', e);
    return [];
  }
}

// ─── MarketDiscoveryProvider ─────────────────────────────────
export const EdgeXMarketProvider: MarketDiscoveryProvider = {
  name: 'edgeX',
  isLive: true,

  async discoverMarkets(): Promise<DiscoveredMarket[]> {
    try {
      const tickers = await fetchAllRWATickers();
      const markets: DiscoveredMarket[] = [];

      for (const contract of RWA_CONTRACTS) {
        const ticker = tickers.get(contract.contractId);
        if (!ticker) continue;

        const markPrice = parseFloat(ticker.markPrice);
        const oraclePrice = parseFloat(ticker.oraclePrice);
        const spread = oraclePrice > 0 ? ((markPrice - oraclePrice) / oraclePrice) * 100 : null;

        markets.push({
          symbol: `${contract.contractName}-PERP`,
          displayName: contract.displayName,
          marketType: 'perp',
          settlementType: 'perpetual',
          priceUsd: markPrice,
          volume24hUsd: parseFloat(ticker.value),
          spreadPct: spread,
          oracleRef: contract.oracleRef,
          isActive: true,
          venue: 'edgeX',
        });
      }

      return markets;
    } catch (e) {
      console.error('[edgeXProvider] discoverMarkets error:', e);
      return [];
    }
  },
};

// ─── MetadataProvider ────────────────────────────────────────
export const EdgeXMetadataProvider: MetadataProvider = {
  name: 'edgeX',
  isLive: true,

  async fetchMetadata(instrument: RWAInstrument): Promise<MetadataResult | null> {
    const contractId = INST_TO_CONTRACT[instrument.id];
    if (!contractId) return null;

    const data = await getEdgeXContractData(contractId);
    if (!data) return null;

    return {
      navUsd: data.oraclePrice,
      priceUsd: data.markPrice,
      apyPct: data.fundingAnnualized,
      liquidityUsd: data.openInterestUsd,
      volume24hUsd: data.volume24hUsd,
      lastUpdated: Date.now(),
      source: 'edgeX',
    };
  },
};
