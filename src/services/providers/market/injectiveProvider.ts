// ============================================================
// InjectiveSyntheticProvider — Market Discovery Provider
// Discovers synthetic markets on Injective chain.
//
// STATUS: LIVE
// Fetches real-time derivative market data from Injective
// Indexer API. Falls back to static data on failure.
// ============================================================

import type { MarketDiscoveryProvider, DiscoveredMarket } from '../types';

const INJECTIVE_INDEXER_BASE = import.meta.env.VITE_INJECTIVE_INDEXER_BASE || 'https://sentry.exchange.grpc-web.injective.network';

// Injective mainnet derivative market IDs (verified from Indexer API)
const TRACKED_MARKETS: Record<string, { symbol: string; displayName: string; oracleRef: string }> = {
  '0x0db9bd22e4c6d4ef0a504f85708944056f5ecf82d753b9154c7be88b8c2ec5e9': {
    symbol: 'iAAPL',
    displayName: 'Apple Inc. (Synthetic)',
    oracleRef: 'AAPL/USDT InjectiveLabs',
  },
  '0x96408895e808e45d95de88784092683963f415985823b8336605e6fc6de97668': {
    symbol: 'iGOOG',
    displayName: 'Alphabet Inc. (Synthetic)',
    oracleRef: 'GOOGL/USDT InjectiveLabs',
  },
  '0x0160a0c8ecbf5716465b9fc22bceeedf6e92dcdc688e823bbe1af3b22a84e5b5': {
    symbol: 'iGLD',
    displayName: 'Gold (Synthetic)',
    oracleRef: 'XAU/USDT Pyth',
  },
  '0x36374ac84498d300f99010e2ea693bea12479be910570fc49e986c5f899dccf6': {
    symbol: 'iTSLA',
    displayName: 'Tesla Inc. (Synthetic)',
    oracleRef: 'TSLA/USDT InjectiveLabs',
  },
  '0x1e8369b298705c468c1a313a729bae0dbd4410587465cc69276bf8ba4e0231c1': {
    symbol: 'iNVDA',
    displayName: 'NVIDIA Corp. (Synthetic)',
    oracleRef: 'NVDA/USDT InjectiveLabs',
  },
};

export const InjectiveSyntheticProvider: MarketDiscoveryProvider = {
  name: 'Injective',
  isLive: true,

  async discoverMarkets(): Promise<DiscoveredMarket[]> {
    try {
      const res = await fetch(`${INJECTIVE_INDEXER_BASE}/api/chronos/v1/derivative/market_summary_all`);
      if (!res.ok) throw new Error(`Indexer HTTP ${res.status}`);
      const data = await res.json();
      const summaries: any[] = Array.isArray(data) ? data : [];

      const markets: DiscoveredMarket[] = [];

      for (const summary of summaries) {
        const marketId: string = summary.marketId || '';
        const tracked = TRACKED_MARKETS[marketId];
        if (!tracked) continue;

        markets.push({
          symbol: tracked.symbol,
          displayName: tracked.displayName,
          marketType: 'perp',
          settlementType: 'cash_settled',
          priceUsd: summary.price ? parseFloat(summary.price) : null,
          volume24hUsd: summary.volume ? parseFloat(summary.volume) : null,
          spreadPct: null, // Spread requires orderbook query
          oracleRef: tracked.oracleRef,
          isActive: true,
          venue: 'Injective DEX',
        });
      }

      // Include static entries for any tracked markets not found in API response
      for (const [, info] of Object.entries(TRACKED_MARKETS)) {
        if (!markets.find(m => m.symbol === info.symbol)) {
          markets.push({
            symbol: info.symbol,
            displayName: info.displayName,
            marketType: 'perp',
            settlementType: 'cash_settled',
            priceUsd: null,
            volume24hUsd: null,
            spreadPct: null,
            oracleRef: info.oracleRef,
            isActive: true,
            venue: 'Injective DEX',
          });
        }
      }

      return markets;
    } catch (e) {
      console.warn('[InjectiveSyntheticProvider] API failed, using static data:', e);
      return getStaticInjectiveMarkets();
    }
  },
};

// Exported for external use (e.g., execution provider needs market IDs)
export const INJ_MARKET_IDS = Object.fromEntries(
  Object.entries(TRACKED_MARKETS).map(([id, info]) => [info.symbol, id])
);

function getStaticInjectiveMarkets(): DiscoveredMarket[] {
  return Object.values(TRACKED_MARKETS).map(info => ({
    symbol: info.symbol,
    displayName: info.displayName,
    marketType: 'perp' as const,
    settlementType: 'cash_settled',
    priceUsd: null,
    volume24hUsd: null,
    spreadPct: null,
    oracleRef: info.oracleRef,
    isActive: true,
    venue: 'Injective DEX',
  }));
}
