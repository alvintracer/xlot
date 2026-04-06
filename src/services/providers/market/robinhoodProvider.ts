// ============================================================
// RobinhoodEquityAccessProvider — Market Discovery Provider
//
// STATUS: SCAFFOLD — Adapter only
//
// IMPORTANT RULES:
// - Do NOT use undocumented private Robinhood APIs
// - Do NOT assume shareholder rights for stock tokens
// - Do NOT assume onchain DEX executability
// - Only use official public API endpoints if/when available
//
// Current state:
// - Metadata layer with tracked-only status
// - Clear TODO markers for future official integration
// ============================================================

import type { MarketDiscoveryProvider, DiscoveredMarket } from '../types';

// TODO: Replace when official Robinhood stock-token API becomes available
const ROBINHOOD_API_BASE = import.meta.env.VITE_ROBINHOOD_EQUITY_API_BASE || '';
const ROBINHOOD_API_KEY = import.meta.env.VITE_ROBINHOOD_EQUITY_API_KEY || '';

export const RobinhoodEquityAccessProvider: MarketDiscoveryProvider = {
  name: 'Robinhood (scaffold)',
  isLive: false,

  async discoverMarkets(): Promise<DiscoveredMarket[]> {
    // No official public API for stock-token-specific data
    // Return static tracked entries only
    if (!ROBINHOOD_API_BASE) {
      return getStaticRobinhoodMarkets();
    }

    // TODO: If official endpoints become available:
    // const res = await fetch(`${ROBINHOOD_API_BASE}/v1/tokens`, {
    //   headers: { 'Authorization': `Bearer ${ROBINHOOD_API_KEY}` }
    // });
    // const data = await res.json();
    // return mapRobinhoodMarkets(data);

    return getStaticRobinhoodMarkets();
  },
};

function getStaticRobinhoodMarkets(): DiscoveredMarket[] {
  // Conservative defaults:
  // - platform_only execution
  // - no price data (tracked only)
  // - indirect_claim or economic_exposure_only
  return [
    {
      symbol: 'TSLA',
      displayName: 'Tesla Inc. (Platform)',
      marketType: 'spot',
      settlementType: 'platform_internal',
      priceUsd: null,
      volume24hUsd: null,
      spreadPct: null,
      oracleRef: 'NASDAQ: TSLA',
      isActive: true,
      venue: 'Robinhood',
    },
    {
      symbol: 'AAPL',
      displayName: 'Apple Inc. (Platform)',
      marketType: 'spot',
      settlementType: 'platform_internal',
      priceUsd: null,
      volume24hUsd: null,
      spreadPct: null,
      oracleRef: 'NASDAQ: AAPL',
      isActive: true,
      venue: 'Robinhood',
    },
  ];
}
