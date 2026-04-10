// ============================================================
// HyperliquidProvider — Market Discovery + Metadata Provider
// Discovers and fetches RWA-related perpetual markets on Hyperliquid.
//
// STATUS: LIVE
// Uses Hyperliquid Info API (POST https://api.hyperliquid.xyz/info)
// No API key required for read operations.
// ============================================================

import type { MarketDiscoveryProvider, MetadataProvider, DiscoveredMarket, MetadataResult } from '../types';
import type { RWAInstrument } from '../../../types/rwaInstrument';

const HL_API = 'https://api.hyperliquid.xyz/info';

// RWA-relevant coins on Hyperliquid
// PAXG tracks gold price, ONDO is the Ondo Finance token
const RWA_COINS: Record<string, { displayName: string; oracleRef: string; assetClass: string }> = {
  PAXG: { displayName: 'Gold Perpetual (Hyperliquid)', oracleRef: 'XAU/USD (via PAXG)', assetClass: 'commodity' },
  ONDO: { displayName: 'Ondo Finance Perpetual', oracleRef: 'ONDO/USD', assetClass: 'treasury' },
};

// ─── Cache ───────────────────────────────────────────────────
interface HLCache {
  meta: { universe: HLAssetMeta[]; ctxs: HLAssetCtx[] } | null;
  metaTs: number;
  mids: Record<string, string> | null;
  midsTs: number;
}

interface HLAssetMeta {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  marginTableId?: number;
  isDelisted?: boolean;
}

interface HLAssetCtx {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  oraclePx: string;
  markPx: string;
  midPx: string;
  impactPxs: [string, string];
  dayBaseVlm: string;
}

const cache: HLCache = { meta: null, metaTs: 0, mids: null, midsTs: 0 };
const META_TTL = 30_000;   // 30s for perp data
const MIDS_TTL = 15_000;   // 15s for prices

// ─── API Helpers ─────────────────────────────────────────────
async function hlPost<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Hyperliquid API ${res.status}`);
  return res.json();
}

async function fetchMetaAndCtxs(): Promise<{ universe: HLAssetMeta[]; ctxs: HLAssetCtx[] }> {
  const now = Date.now();
  if (cache.meta && now - cache.metaTs < META_TTL) return cache.meta;

  const [metaArr, ctxsArr] = await hlPost<[{ universe: HLAssetMeta[] }, HLAssetCtx[]]>({ type: 'metaAndAssetCtxs' });
  const result = { universe: metaArr.universe, ctxs: ctxsArr };
  cache.meta = result;
  cache.metaTs = now;
  return result;
}

async function fetchAllMids(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cache.mids && now - cache.midsTs < MIDS_TTL) return cache.mids;

  const mids = await hlPost<Record<string, string>>({ type: 'allMids' });
  cache.mids = mids;
  cache.midsTs = now;
  return mids;
}

// ─── Helpers ─────────────────────────────────────────────────
function findAssetIndex(universe: HLAssetMeta[], coin: string): number {
  return universe.findIndex(a => a.name === coin);
}

export async function getHyperliquidAssetIndex(coin: string): Promise<number | null> {
  try {
    const { universe } = await fetchMetaAndCtxs();
    const idx = findAssetIndex(universe, coin);
    return idx === -1 ? null : idx;
  } catch (e) {
    console.error('[HyperliquidProvider] getAssetIndex error:', e);
    return null;
  }
}

/** Annualized funding rate from 8h rate string */
function annualizeFunding(funding8h: string): number {
  return parseFloat(funding8h) * 3 * 365 * 100; // → percentage
}

// ─── Public: get full context for a specific coin ────────────
export async function getHyperliquidCoinData(coin: string): Promise<{
  midPx: number;
  markPx: number;
  oraclePx: number;
  funding8h: number;
  fundingAnnualized: number;
  openInterestUsd: number;
  volume24hUsd: number;
  premium: number;
  maxLeverage: number;
  szDecimals: number;
} | null> {
  try {
    const { universe, ctxs } = await fetchMetaAndCtxs();
    const idx = findAssetIndex(universe, coin);
    if (idx === -1) return null;

    const meta = universe[idx];
    const ctx = ctxs[idx];
    const markPx = parseFloat(ctx.markPx);
    const oraclePx = parseFloat(ctx.oraclePx);

    return {
      midPx: parseFloat(ctx.midPx),
      markPx,
      oraclePx,
      funding8h: parseFloat(ctx.funding),
      fundingAnnualized: annualizeFunding(ctx.funding),
      openInterestUsd: parseFloat(ctx.openInterest) * markPx,
      volume24hUsd: parseFloat(ctx.dayNtlVlm),
      premium: parseFloat(ctx.premium),
      maxLeverage: meta.maxLeverage,
      szDecimals: meta.szDecimals,
    };
  } catch (e) {
    console.error('[HyperliquidProvider] getCoinData error:', e);
    return null;
  }
}

/** Fetch candle data for charting */
export async function getHyperliquidCandles(
  coin: string,
  interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d',
  startTime: number,
  endTime: number,
): Promise<{ t: number; o: number; h: number; l: number; c: number; v: number }[]> {
  try {
    const data = await hlPost<{ t: number; o: string; h: string; l: string; c: string; V: string }[]>({
      type: 'candleSnapshot',
      req: { coin, interval, startTime, endTime },
    });
    return (data || []).map(c => ({
      t: c.t,
      o: parseFloat(c.o),
      h: parseFloat(c.h),
      l: parseFloat(c.l),
      c: parseFloat(c.c),
      v: parseFloat(c.V),
    }));
  } catch (e) {
    console.error('[HyperliquidProvider] candles error:', e);
    return [];
  }
}

/** Fetch L2 orderbook for quote estimation */
export async function getHyperliquidL2(coin: string, nLevels = 5): Promise<{
  bids: [number, number][];
  asks: [number, number][];
} | null> {
  try {
    const data = await hlPost<{ levels: [[string, string][], [string, string][]] }>({
      type: 'l2Book',
      coin,
      nSigFigs: 5,
    });
    return {
      bids: data.levels[0].slice(0, nLevels).map(([px, sz]) => [parseFloat(px), parseFloat(sz)]),
      asks: data.levels[1].slice(0, nLevels).map(([px, sz]) => [parseFloat(px), parseFloat(sz)]),
    };
  } catch (e) {
    console.error('[HyperliquidProvider] l2Book error:', e);
    return null;
  }
}

// ─── MarketDiscoveryProvider ─────────────────────────────────
export const HyperliquidMarketProvider: MarketDiscoveryProvider = {
  name: 'Hyperliquid',
  isLive: true,

  async discoverMarkets(): Promise<DiscoveredMarket[]> {
    try {
      const { universe, ctxs } = await fetchMetaAndCtxs();
      const markets: DiscoveredMarket[] = [];

      for (const [coin, info] of Object.entries(RWA_COINS)) {
        const idx = findAssetIndex(universe, coin);
        if (idx === -1) continue;

        const meta = universe[idx];
        if (meta.isDelisted) continue;

        const ctx = ctxs[idx];
        const markPx = parseFloat(ctx.markPx);
        const oraclePx = parseFloat(ctx.oraclePx);
        const spread = oraclePx > 0 ? ((markPx - oraclePx) / oraclePx) * 100 : null;

        markets.push({
          symbol: `${coin}-PERP`,
          displayName: info.displayName,
          marketType: 'perp',
          settlementType: 'perpetual',
          priceUsd: markPx,
          volume24hUsd: parseFloat(ctx.dayNtlVlm),
          spreadPct: spread,
          oracleRef: info.oracleRef,
          isActive: true,
          venue: 'Hyperliquid',
        });
      }

      return markets;
    } catch (e) {
      console.error('[HyperliquidProvider] discoverMarkets error:', e);
      return [];
    }
  },
};

// ─── MetadataProvider ────────────────────────────────────────
export const HyperliquidMetadataProvider: MetadataProvider = {
  name: 'Hyperliquid',
  isLive: true,

  async fetchMetadata(instrument: RWAInstrument): Promise<MetadataResult | null> {
    // Map instrument ID to Hyperliquid coin name
    const coinMap: Record<string, string> = {
      'hl-paxg-perp': 'PAXG',
      'hl-ondo-perp': 'ONDO',
    };
    const coin = coinMap[instrument.id];
    if (!coin) return null;

    const data = await getHyperliquidCoinData(coin);
    if (!data) return null;

    return {
      navUsd: data.oraclePx,        // oracle = reference price
      priceUsd: data.markPx,         // mark = trading price
      apyPct: data.fundingAnnualized,
      liquidityUsd: data.openInterestUsd,
      volume24hUsd: data.volume24hUsd,
      lastUpdated: Date.now(),
      source: 'Hyperliquid',
    };
  },
};
