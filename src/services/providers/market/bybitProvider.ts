// ============================================================
// Bybit Provider — Market Discovery + Metadata Provider
// Fetches RWA-related perpetual futures data from Bybit Public API.
//
// STATUS: LIVE
// All endpoints are public, no API key required.
//
// Confirmed RWA markets:
//   XAUUSDT — Gold perpetual swap
//   XAGUSDT — Silver perpetual swap
// ============================================================

import type { MarketDiscoveryProvider, MetadataProvider, DiscoveredMarket, MetadataResult } from '../types';
import type { RWAInstrument } from '../../../types/rwaInstrument';

const BYBIT_API = 'https://api.bybit.com/v5';
const RELAY_URL = 'http://49.247.139.241:3000';

/** Proxy fetch through relay server to bypass CORS */
async function proxyFetch(url: string): Promise<Response> {
  return fetch(`${RELAY_URL}/proxy?url=${encodeURIComponent(url)}`);
}

// ─── RWA contract mapping ────────────────────────────────────
interface BybitRWAMarket {
  instId: string;       // Bybit symbol, e.g. "XAUUSDT"
  displayName: string;
  oracleRef: string;
  subCategory: string;
}

const RWA_MARKETS: BybitRWAMarket[] = [
  { instId: 'XAUUSDT', displayName: 'Gold Perpetual (Bybit)', oracleRef: 'XAU/USD', subCategory: 'gold' },
  { instId: 'XAGUSDT', displayName: 'Silver Perpetual (Bybit)', oracleRef: 'XAG/USD', subCategory: 'silver' },
];

// Instrument ID → Bybit instId
const INST_TO_BYBIT: Record<string, string> = {
  'bybit-xau-perp': 'XAUUSDT',
  'bybit-xag-perp': 'XAGUSDT',
};

// ─── Types ──────────────────────────────────────────────────
interface BybitTicker {
  symbol: string;
  lastPrice: string;
  highPrice24h: string;
  lowPrice24h: string;
  price24hPcnt: string;
  volume24h: string;
  turnover24h: string;
  fundingRate: string;
  nextFundingTime: string;
  openInterest: string;
}

// ─── Provider Implementation ─────────────────────────────────
class BybitProviderImpl implements MarketDiscoveryProvider, MetadataProvider {
  name = 'Bybit';
  isLive = true;

  // ── 1. Market Discovery ──
  async discoverMarkets(): Promise<DiscoveredMarket[]> {
    if (!this.isLive) return [];
    
    try {
      const markets: DiscoveredMarket[] = [];
      const res = await proxyFetch(`${BYBIT_API}/market/tickers?category=linear&baseCoin=XAU,XAG`);
      const json = await res.json();
      
      if (json.retCode !== 0 || !json.result || !json.result.list) {
        return [];
      }

      const list: BybitTicker[] = json.result.list;

      for (const t of list) {
        const mapping = RWA_MARKETS.find(m => m.instId === t.symbol);
        if (mapping) {
          markets.push({
            symbol: mapping.instId,
            displayName: mapping.displayName,
            marketType: 'perp',
            settlementType: 'perpetual',
            priceUsd: parseFloat(t.lastPrice),
            volume24hUsd: parseFloat(t.turnover24h),
            spreadPct: null,
            oracleRef: mapping.oracleRef,
            isActive: true,
            venue: 'Bybit',
          });
        }
      }
      return markets;
    } catch (e) {
      console.error('[BybitProvider] discovery error:', e);
      return [];
    }
  }

  // ── 2. Metadata (Pricing & Funding) ──
  async fetchMetadata(instrument: RWAInstrument): Promise<MetadataResult | null> {
    if (!this.isLive) return null;

    const bybitId = INST_TO_BYBIT[instrument.id];
    if (!bybitId) return null;

    try {
      const res = await proxyFetch(`${BYBIT_API}/market/tickers?category=linear&symbol=${bybitId}`);
      const json = await res.json();
      
      if (json.retCode !== 0 || !json.result || !json.result.list || json.result.list.length === 0) {
        return null;
      }

      const t: BybitTicker = json.result.list[0];
      const lastPrice = parseFloat(t.lastPrice);
      const fundingRate = parseFloat(t.fundingRate || '0');
      
      return {
        navUsd: null,
        priceUsd: lastPrice,
        apyPct: fundingRate * 3 * 365 * 100, // Annualize 8h funding
        liquidityUsd: parseFloat(t.openInterest || '0') * lastPrice,
        volume24hUsd: parseFloat(t.turnover24h || '0'),
        lastUpdated: Date.now(),
        source: 'Bybit',
      };
    } catch (e) {
      console.error(`[BybitProvider] metadata error for ${instrument.id}:`, e);
      return null;
    }
  }

  // Custom data fetching for generic uses (like OKX has)
  async getBybitContractData(instId: string) {
    try {
      const res = await proxyFetch(`${BYBIT_API}/market/tickers?category=linear&symbol=${instId}`);
      const json = await res.json();
      if (json.retCode !== 0 || !json.result || !json.result.list || json.result.list.length === 0) return null;
      const t: BybitTicker = json.result.list[0];
      return t;
    } catch {
      return null;
    }
  }
}

export const bybitProvider = new BybitProviderImpl();
