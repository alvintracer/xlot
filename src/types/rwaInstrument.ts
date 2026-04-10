// ============================================================
// RWA Instrument — Normalized Data Model
// 
// This is the canonical type system for all RWA products.
// It separates "what is the exposure" (asset class)
// from "what kind of claim / market access is this" (structure).
// ============================================================

// ─── Asset Class (Primary taxonomy) ──────────────────────────
export type AssetClass =
  | 'treasury'
  | 'credit'
  | 'commodity'
  | 'equity'
  | 'real_estate';

// ─── Structure Type ──────────────────────────────────────────
export type StructureType =
  | 'asset_backed'          // Direct 1:1 backing (PAXG, USDY)
  | 'regulated_tokenized'   // SEC/MAS etc registered (OUSG, xStocks)
  | 'platform_issued'       // Platform-minted representation (Robinhood stock tokens)
  | 'synthetic';            // No backing, oracle-settled (Injective iAssets)

// ─── Ownership Claim ─────────────────────────────────────────
export type OwnershipClaim =
  | 'direct_claim'              // Holder owns the underlying (PAXG → gold)
  | 'issuer_linked_claim'       // Issuer-redeemable (USDY → Ondo)
  | 'indirect_claim'            // Beneficial ownership via intermediary
  | 'economic_exposure_only';   // No ownership rights, just price exposure

// ─── Settlement Model ────────────────────────────────────────
export type SettlementModel =
  | 'spot'                // Immediate settlement
  | 'redeemable'          // Can be redeemed with issuer
  | 'cash_settled'        // Settled in stablecoin at expiry/close
  | 'perpetual'           // No expiry, continuous settlement
  | 'platform_internal';  // Settled only within provider platform

// ─── Permission Model ────────────────────────────────────────
export type PermissionModel =
  | 'public'              // Anyone can trade
  | 'kyc_gated'           // Requires KYC
  | 'issuer_permissioned' // Whitelisted by issuer
  | 'platform_only';      // Only on provider's platform

// ─── Execution Availability ──────────────────────────────────
export type ExecutionAvailability =
  | 'swappable_now'       // Can execute via integrated DEX routes
  | 'quote_only'          // Can get quote but no execution path
  | 'tracked_only'        // Market data tracked, no execution
  | 'platform_only';      // Execute only on provider's own platform

// ─── Venue Category (Platform / Venue axis) ─────────────────
export type VenueCategory =
  | 'dex_spot'         // Onchain spot (PAXG, USDY, XAUt)
  | 'onchain_perps'    // Onchain perpetual DEX (Hyperliquid, edgeX, Injective)
  | 'cex_perps'        // CEX perpetual (OKX, Bitget)
  | 'platform_access'; // Platform-issued / tokenized access (BUIDL, Kraken, RealT)

export interface VenueCategoryMeta {
  id: VenueCategory;
  label: string;
  labelKr: string;
  icon: string;
  color: { bg: string; border: string; text: string };
  description: string;
}

export const VENUE_CATEGORY_META: Record<VenueCategory, VenueCategoryMeta> = {
  dex_spot: {
    id: 'dex_spot',
    label: 'DEX Spot',
    labelKr: 'DEX 현물',
    icon: '💎',
    color: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400' },
    description: 'Onchain spot tokens with direct asset backing or issuer redemption',
  },
  onchain_perps: {
    id: 'onchain_perps',
    label: 'Onchain Perps',
    labelKr: '온체인 선물',
    icon: '⚡',
    color: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
    description: 'Onchain perpetual futures — price exposure without asset ownership',
  },
  cex_perps: {
    id: 'cex_perps',
    label: 'CEX Perps',
    labelKr: 'CEX 선물',
    icon: '🏢',
    color: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
    description: 'Centralized exchange perpetual contracts — tracked or deeplinked',
  },
  platform_access: {
    id: 'platform_access',
    label: 'Platform',
    labelKr: '플랫폼',
    icon: '🔗',
    color: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
    description: 'Platform-issued tokens or access — execution via provider only',
  },
};

// ─── NAV / Reference Support ─────────────────────────────────
export type NavSupport = 'official' | 'estimated' | 'none';
export type ReferenceValueType = 'nav' | 'oracle_reference' | 'platform_price' | 'market_price';
export type TradabilityScope = 'dex' | 'venue_only' | 'platform_only' | 'tracked_only';

// ─── Source Attribution ──────────────────────────────────────
export type SourceType =
  | 'official_issuer'
  | 'official_venue_api'
  | 'onchain_executable'
  | 'oracle_feed'
  | 'estimated'
  | 'fallback'
  | 'tracked_only';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown';

export interface SourceAttribution {
  sourceType: SourceType;
  sourceName: string;
  lastUpdated: number | null;   // epoch ms
  confidence: ConfidenceLevel;
}

// ─── Market Data (live or fallback) ──────────────────────────
export interface InstrumentMarketData {
  priceUsd: number | null;
  priceKrw: number | null;
  change24h: number | null;
  navUsd: number | null;
  spreadPct: number | null;       // (price - nav) / nav × 100
  isDiscount: boolean | null;
  apyPct: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  source: SourceAttribution;
}

// ─── Chain / Venue / Router info ─────────────────────────────
export interface ChainDeployment {
  chainId: number;
  chainName: string;
  contractAddress: string;
  decimals: number;
  buyWithSymbol: string;
  buyWithAddress: string;
}

export interface VenueInfo {
  name: string;
  type: 'dex_aggregator' | 'dex_pool' | 'cex' | 'platform' | 'otc';
  chainId: number;
  isExecutable: boolean;
}

export interface RouterInfo {
  name: string;            // "1inch", "Odos", "Jupiter", etc
  chainIds: number[];
  isLive: boolean;
}

// ─── Core Instrument ─────────────────────────────────────────
export interface RWAInstrument {
  id: string;
  canonicalId: string;           // Groups multi-chain deployments
  displayName: string;
  symbol: string;
  issuer: string;

  // Primary taxonomy
  assetClass: AssetClass;
  subCategory?: string;          // "t-bill", "gold", "tech_stock", etc
  underlyingReference: string;   // "US Treasuries", "Gold 1oz", "AAPL", etc

  // Structure taxonomy
  structureType: StructureType;
  ownershipClaim: OwnershipClaim;
  settlementModel: SettlementModel;
  permissionModel: PermissionModel;
  executionAvailability: ExecutionAvailability;

  // Venue classification
  venueCategory: VenueCategory;

  // Reference value
  navSupport: NavSupport;
  referenceValueType: ReferenceValueType;
  tradabilityScope: TradabilityScope;

  // Deployment
  chains: ChainDeployment[];
  venues: VenueInfo[];
  routers: RouterInfo[];

  // Market data (populated at runtime)
  marketData: InstrumentMarketData | null;

  // Compliance & Disclosure
  requiresKyc: boolean;
  complianceNotes: string;
  disclaimerShort: string;
  disclaimerLong: string;

  // Display
  description: string;
  tags: string[];
  imageUrl?: string;

  // Metadata
  coingeckoId: string | null;
  fallbackNavUsd: number;
  fallbackApy: number;
  minInvestmentUsd: number;
  navLabel: string;

  sourceAttribution: SourceAttribution;
}

// ─── Instrument Group ────────────────────────────────────────
export interface RWAInstrumentGroup {
  canonicalId: string;
  displayName: string;
  assetClass: AssetClass;
  issuerFamily: string;
  structureType: StructureType;
  members: RWAInstrument[];
}

// ─── Asset Class UI Metadata ─────────────────────────────────
export interface AssetClassMeta {
  id: AssetClass;
  label: string;
  labelKr: string;
  icon: string;
  color: { bg: string; border: string; text: string };
  description: string;
}

export const ASSET_CLASS_META: Record<AssetClass, AssetClassMeta> = {
  treasury: {
    id: 'treasury',
    label: 'Treasuries',
    labelKr: '국채 / 채권',
    icon: '🏛️',
    color: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400' },
    description: 'Tokenized government bonds, T-bills, money market funds',
  },
  credit: {
    id: 'credit',
    label: 'Credit',
    labelKr: '크레딧',
    icon: '📋',
    color: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
    description: 'Private credit, yield-bearing debt, structured products',
  },
  commodity: {
    id: 'commodity',
    label: 'Commodities',
    labelKr: '원자재',
    icon: '🏅',
    color: { bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-400' },
    description: 'Gold, silver, and other physical commodity-backed tokens',
  },
  equity: {
    id: 'equity',
    label: 'Equities',
    labelKr: '주식',
    icon: '📈',
    color: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
    description: 'Tokenized stocks, synthetic equity exposure, platform-issued stock access',
  },
  real_estate: {
    id: 'real_estate',
    label: 'Real Estate',
    labelKr: '부동산',
    icon: '🏠',
    color: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
    description: 'Tokenized real estate, REITs, property-backed instruments',
  },
};

// ─── Structure Badge Labels ──────────────────────────────────
export const STRUCTURE_LABELS: Record<StructureType, { label: string; color: string }> = {
  asset_backed:         { label: 'Asset-Backed',         color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  regulated_tokenized:  { label: 'Regulated Tokenized',  color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  platform_issued:      { label: 'Platform-Issued',      color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  synthetic:            { label: 'Synthetic',             color: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/30' },
};

export const EXECUTION_LABELS: Record<ExecutionAvailability, { label: string; color: string; icon: string }> = {
  swappable_now:  { label: 'Executable Now',     color: 'text-emerald-400 bg-emerald-500/10', icon: '⚡' },
  quote_only:     { label: 'Quote Only',         color: 'text-amber-400 bg-amber-500/10',     icon: '💬' },
  tracked_only:   { label: 'Tracked Market',     color: 'text-slate-400 bg-slate-500/10',     icon: '📊' },
  platform_only:  { label: 'Platform Access',    color: 'text-blue-400 bg-blue-500/10',       icon: '🔗' },
};
