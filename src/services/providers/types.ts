// ============================================================
// Provider Types — Unified interfaces for all data providers
// ============================================================

import type { RWAInstrument } from '../../types/rwaInstrument';

// ─── Execution Provider ──────────────────────────────────────
export interface ExecutionQuote {
  provider: string;
  toAmount: string;
  toAmountDisplay: string;
  estimatedGasUsd: number;
  priceImpact: number;
  route: { name: string; part: number }[];
  score: number;
  tx?: {
    from: string;
    to: string;
    data: string;
    value: string;
    gas: string;
  };
}

export interface PlaceOrderRequest {
  instrument: RWAInstrument;
  walletAddress: string;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit';
  size: string;
  price?: string;
  reduceOnly?: boolean;
  timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'ALO' | 'POST_ONLY';
  clientOrderId?: string;
  leverage?: number;
  slippagePct?: number;
  extras?: Record<string, unknown>;
}

export interface OrderPlacementResult {
  status: 'submitted' | 'requires_signature' | 'unsupported';
  venue: string;
  orderId?: string | null;
  request?: unknown;
  response?: unknown;
  error?: string;
}

export interface ExecutionProvider {
  name: string;
  supportedChainIds: number[];
  isLive: boolean;
  getQuote(params: {
    instrument: RWAInstrument;
    chainId: number;
    fromAddress: string;
    toAddress: string;
    amountWei: string;
    fromDecimals: number;
    toDecimals: number;
    walletAddress: string;
    slippagePct: number;
  }): Promise<ExecutionQuote>;
  placeOrder?(params: PlaceOrderRequest): Promise<OrderPlacementResult>;
}

// ─── Metadata Provider ───────────────────────────────────────
export interface MetadataResult {
  navUsd: number | null;
  priceUsd: number | null;
  apyPct: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  lastUpdated: number;
  source: string;
}

export interface MetadataProvider {
  name: string;
  isLive: boolean;
  fetchMetadata(instrument: RWAInstrument): Promise<MetadataResult | null>;
}

// ─── Market Discovery Provider ───────────────────────────────
export interface DiscoveredMarket {
  symbol: string;
  displayName: string;
  marketType: 'spot' | 'perp' | 'futures';
  settlementType: string;
  priceUsd: number | null;
  volume24hUsd: number | null;
  spreadPct: number | null;
  oracleRef: string | null;
  isActive: boolean;
  venue: string;
}

export interface MarketDiscoveryProvider {
  name: string;
  isLive: boolean;
  discoverMarkets(): Promise<DiscoveredMarket[]>;
}

// ─── Provider Registry ───────────────────────────────────────
export interface ProviderStatus {
  name: string;
  type: 'execution' | 'metadata' | 'market';
  status: 'live' | 'partial' | 'scaffold';
  description: string;
  requiredEnvVars: string[];
}

export const PROVIDER_REGISTRY: ProviderStatus[] = [
  // Execution
  { name: '1inch', type: 'execution', status: 'live', description: 'EVM DEX aggregator', requiredEnvVars: ['VITE_1INCH_API_KEY'] },
  { name: '0x', type: 'execution', status: 'live', description: 'EVM DEX aggregator', requiredEnvVars: ['VITE_ZEROEX_API_KEY'] },
  { name: 'Odos', type: 'execution', status: 'live', description: 'EVM DEX aggregator', requiredEnvVars: [] },
  { name: 'Jupiter', type: 'execution', status: 'live', description: 'Solana DEX aggregator', requiredEnvVars: [] },
  { name: 'OpenOcean', type: 'execution', status: 'scaffold', description: 'Multi-chain DEX aggregator', requiredEnvVars: ['VITE_OPENOCEAN_API_KEY'] },

  // Metadata
  { name: 'CoinGecko', type: 'metadata', status: 'live', description: 'Price and market data', requiredEnvVars: ['VITE_COINGECKO_API_KEY'] },
  { name: 'Birdeye', type: 'metadata', status: 'scaffold', description: 'Solana token analytics', requiredEnvVars: ['VITE_BIRDEYE_API_KEY'] },

  // Hyperliquid
  { name: 'Hyperliquid', type: 'execution', status: 'live', description: 'Onchain perp DEX (Arbitrum L2)', requiredEnvVars: [] },
  { name: 'Hyperliquid', type: 'market', status: 'live', description: 'RWA perp market discovery (PAXG, ONDO)', requiredEnvVars: [] },
  { name: 'Hyperliquid', type: 'metadata', status: 'live', description: 'Perp price, funding rate, OI data', requiredEnvVars: [] },

  // lighter.xyz
  { name: 'lighter.xyz', type: 'market',   status: 'live', description: 'ZK L2 RWA perps (XAU, XAG, PAXG, BRENTOIL) — zero fee', requiredEnvVars: [] },
  { name: 'lighter.xyz', type: 'metadata', status: 'live', description: 'Price, OI, 24h volume data', requiredEnvVars: [] },

  // edgeX
  { name: 'edgeX', type: 'market', status: 'live', description: 'RWA commodity perps (PAXG, XAUt, Silver, Copper)', requiredEnvVars: [] },
  { name: 'edgeX', type: 'metadata', status: 'live', description: 'Perp price, funding rate, OI data', requiredEnvVars: [] },

  // OKX (CEX)
  { name: 'OKX', type: 'market', status: 'live', description: 'CEX RWA perps (XAU, XAG) — public API', requiredEnvVars: [] },
  { name: 'OKX', type: 'metadata', status: 'live', description: 'CEX price, funding rate, OI data', requiredEnvVars: [] },

  // Bitget (CEX)
  { name: 'Bitget', type: 'market', status: 'live', description: 'CEX RWA perps (XAU, XAG) — public API', requiredEnvVars: [] },
  { name: 'Bitget', type: 'metadata', status: 'live', description: 'CEX price, funding rate, OI data', requiredEnvVars: [] },

  // Market Discovery
  { name: 'Injective DEX', type: 'execution', status: 'live', description: 'Injective synthetic perps execution', requiredEnvVars: ['VITE_INJECTIVE_INDEXER_BASE'] },
  { name: 'Injective', type: 'market', status: 'live', description: 'Synthetic markets on Injective chain', requiredEnvVars: ['VITE_INJECTIVE_INDEXER_BASE'] },
  { name: 'xStocks', type: 'market', status: 'scaffold', description: 'Tokenized equity provider', requiredEnvVars: ['VITE_XSTOCKS_API_BASE'] },
  { name: 'Robinhood (scaffold)', type: 'market', status: 'scaffold', description: 'Equity access provider — no official API', requiredEnvVars: [] },
];
