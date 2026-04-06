// ============================================================
// RWA Instruments Catalog
// Full normalized instrument definitions across all asset classes.
//
// Each instrument uses the RWAInstrument schema from types/.
// Existing sector-1 assets (treasury, commodity) are preserved
// and enhanced with structure metadata.
// New asset classes (equity, credit, real_estate) are added as
// tracked-only or platform-only with proper disclosure.
// ============================================================

import type {
  RWAInstrument,
  RWAInstrumentGroup,
  AssetClass,
} from '../types/rwaInstrument';

// ─── Chain constants ─────────────────────────────────────────
const CHAIN = {
  ETHEREUM: 1,
  POLYGON: 137,
  BASE: 8453,
  ARBITRUM: 42161,
  SOLANA: 101,
  INJECTIVE: 888,    // Injective uses cosmos, we use a placeholder chainId
};

const USDC: Record<string, string> = {
  ETHEREUM: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  POLYGON:  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
  BASE:     '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  SOLANA:   'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

// ============================================================
// TREASURIES / MONEY MARKET — Executable
// ============================================================
const TREASURY_INSTRUMENTS: RWAInstrument[] = [
  {
    id: 'usdy',
    canonicalId: 'usdy',
    displayName: 'US Dollar Yield',
    symbol: 'USDY',
    issuer: 'Ondo Finance',
    assetClass: 'treasury',
    subCategory: 'money-market',
    underlyingReference: 'US Treasuries + Bank Deposits',
    structureType: 'asset_backed',
    ownershipClaim: 'issuer_linked_claim',
    settlementModel: 'redeemable',
    permissionModel: 'kyc_gated',
    executionAvailability: 'swappable_now',
    navSupport: 'official',
    referenceValueType: 'nav',
    tradabilityScope: 'dex',
    chains: [
      { chainId: CHAIN.ETHEREUM, chainName: 'Ethereum', contractAddress: '0x96F6eF951840721AdBF46Ac996b59E0235CB985C', decimals: 18, buyWithSymbol: 'USDC', buyWithAddress: USDC.ETHEREUM },
    ],
    venues: [
      { name: 'Uniswap V3', type: 'dex_pool', chainId: CHAIN.ETHEREUM, isExecutable: true },
    ],
    routers: [
      { name: '1inch', chainIds: [CHAIN.ETHEREUM], isLive: true },
      { name: 'Odos', chainIds: [CHAIN.ETHEREUM], isLive: true },
      { name: '0x', chainIds: [CHAIN.ETHEREUM], isLive: true },
    ],
    marketData: null,
    requiresKyc: true,
    complianceNotes: 'KYC required per Ondo compliance. Non-US only for direct minting.',
    disclaimerShort: 'Issuer-redeemable yield-bearing token backed by US Treasuries.',
    disclaimerLong: 'USDY is a tokenized note issued by Ondo Finance backed by short-duration US Treasuries and bank deposits. Yields accrue daily. Redemption is via Ondo portal with KYC. DEX trading is available but subject to liquidity.',
    description: '미국 단기 국채 + 은행 예금에 투자하는 토큰화 상품. 보유만 해도 매일 yield accrual.',
    tags: ['US Treasury', 'Bank Deposit', 'Daily Yield', 'Redeemable'],
    icon: '🏛️',
    coingeckoId: 'ondo-us-dollar-yield',
    fallbackNavUsd: 1.0603,
    fallbackApy: 5.1,
    minInvestmentUsd: 500,
    navLabel: 'Ondo 공시 NAV',
    sourceAttribution: { sourceType: 'official_issuer', sourceName: 'Ondo Finance', lastUpdated: null, confidence: 'high' },
  },
  {
    id: 'ousg',
    canonicalId: 'ousg',
    displayName: 'Ondo Short-Term US Gov Bond',
    symbol: 'OUSG',
    issuer: 'Ondo Finance',
    assetClass: 'treasury',
    subCategory: 'government-bond',
    underlyingReference: 'iShares Short Treasury Bond ETF (SHV)',
    structureType: 'regulated_tokenized',
    ownershipClaim: 'issuer_linked_claim',
    settlementModel: 'redeemable',
    permissionModel: 'kyc_gated',
    executionAvailability: 'swappable_now',
    navSupport: 'official',
    referenceValueType: 'nav',
    tradabilityScope: 'dex',
    chains: [
      { chainId: CHAIN.ETHEREUM, chainName: 'Ethereum', contractAddress: '0x1B19C19393e2d034D8Ff31ff34c81252FcBbee92', decimals: 18, buyWithSymbol: 'USDC', buyWithAddress: USDC.ETHEREUM },
    ],
    venues: [
      { name: 'Flux Finance', type: 'dex_pool', chainId: CHAIN.ETHEREUM, isExecutable: true },
    ],
    routers: [
      { name: '1inch', chainIds: [CHAIN.ETHEREUM], isLive: true },
      { name: '0x', chainIds: [CHAIN.ETHEREUM], isLive: true },
    ],
    marketData: null,
    requiresKyc: true,
    complianceNotes: 'Qualified purchasers only. KYC required.',
    disclaimerShort: 'Tokenized US Treasury ETF fund.',
    disclaimerLong: 'OUSG is a tokenized fund backed by iShares Short Treasury Bond ETF (SHV). Managed by Ondo Finance.',
    description: 'BlackRock iShares Short Treasury Bond ETF 기반 토큰화 미국 국채 펀드.',
    tags: ['US Treasury', 'BlackRock', 'ETF-backed', 'Redeemable'],
    icon: '🏛️',
    coingeckoId: 'ondo-short-term-us-government-bond',
    fallbackNavUsd: 107.82,
    fallbackApy: 4.7,
    minInvestmentUsd: 5000,
    navLabel: 'iShares SHV ETF NAV',
    sourceAttribution: { sourceType: 'official_issuer', sourceName: 'Ondo Finance', lastUpdated: null, confidence: 'high' },
  },
  {
    id: 'benji-usd',
    canonicalId: 'benji',
    displayName: 'Franklin OnChain US Gov MF',
    symbol: 'BENJI',
    issuer: 'Franklin Templeton',
    assetClass: 'treasury',
    subCategory: 'money-market',
    underlyingReference: 'US Govt Money Market Fund',
    structureType: 'regulated_tokenized',
    ownershipClaim: 'direct_claim',
    settlementModel: 'redeemable',
    permissionModel: 'kyc_gated',
    executionAvailability: 'swappable_now',
    navSupport: 'official',
    referenceValueType: 'nav',
    tradabilityScope: 'dex',
    chains: [
      { chainId: CHAIN.POLYGON, chainName: 'Polygon', contractAddress: '0x59D9356364797B5e416F83e6fE9e8A0EC42E61Bc', decimals: 6, buyWithSymbol: 'USDC', buyWithAddress: USDC.POLYGON },
    ],
    venues: [
      { name: 'QuickSwap', type: 'dex_pool', chainId: CHAIN.POLYGON, isExecutable: true },
    ],
    routers: [
      { name: '1inch', chainIds: [CHAIN.POLYGON], isLive: true },
    ],
    marketData: null,
    requiresKyc: true,
    complianceNotes: 'SEC-registered fund. US + international investors with KYC.',
    disclaimerShort: 'SEC-registered onchain money market fund by Franklin Templeton.',
    disclaimerLong: 'BENJI (FOBXX) is the first SEC-registered onchain money market fund. Shares represent direct ownership in a US government money market fund.',
    description: 'Franklin Templeton이 발행한 최초의 온체인 머니마켓 펀드. Polygon 기반.',
    tags: ['US Treasury', 'Franklin Templeton', 'Money Market', 'SEC-Registered'],
    icon: '🏛️',
    coingeckoId: 'franklin-onchain-us-government-money-fund',
    fallbackNavUsd: 1.0841,
    fallbackApy: 3.9,
    minInvestmentUsd: 10,
    navLabel: 'Franklin Templeton 공시 NAV',
    sourceAttribution: { sourceType: 'official_issuer', sourceName: 'Franklin Templeton', lastUpdated: null, confidence: 'high' },
  },
];

// ============================================================
// COMMODITIES — Executable
// ============================================================
const COMMODITY_INSTRUMENTS: RWAInstrument[] = [
  {
    id: 'paxg',
    canonicalId: 'paxg',
    displayName: 'PAX Gold',
    symbol: 'PAXG',
    issuer: 'Paxos',
    assetClass: 'commodity',
    subCategory: 'gold',
    underlyingReference: 'Gold 1 Troy Oz (London Good Delivery)',
    structureType: 'asset_backed',
    ownershipClaim: 'direct_claim',
    settlementModel: 'redeemable',
    permissionModel: 'kyc_gated',
    executionAvailability: 'swappable_now',
    navSupport: 'official',
    referenceValueType: 'oracle_reference',
    tradabilityScope: 'dex',
    chains: [
      { chainId: CHAIN.ETHEREUM, chainName: 'Ethereum', contractAddress: '0x45804880De22913dAFE09f4980848ECE6EcbAf78', decimals: 18, buyWithSymbol: 'USDC', buyWithAddress: USDC.ETHEREUM },
    ],
    venues: [
      { name: 'Uniswap V3', type: 'dex_pool', chainId: CHAIN.ETHEREUM, isExecutable: true },
      { name: 'Curve', type: 'dex_pool', chainId: CHAIN.ETHEREUM, isExecutable: true },
    ],
    routers: [
      { name: '1inch', chainIds: [CHAIN.ETHEREUM], isLive: true },
      { name: 'Odos', chainIds: [CHAIN.ETHEREUM], isLive: true },
      { name: '0x', chainIds: [CHAIN.ETHEREUM], isLive: true },
    ],
    marketData: null,
    requiresKyc: true,
    complianceNotes: 'NYDFS regulated. Physical gold stored in London vaults.',
    disclaimerShort: '1:1 physical gold-backed token. Redeemable for physical gold bars.',
    disclaimerLong: 'PAXG tokens represent one fine troy ounce of gold stored in LBMA vaults. Regulated by NYDFS. Fully audited reserves.',
    description: '런던 금고 실물 금 1트로이온스를 대표하는 토큰. Paxos 규제 발행.',
    tags: ['Gold', 'Physical-backed', 'NYDFS', 'Redeemable'],
    icon: '🏅',
    coingeckoId: 'pax-gold',
    fallbackNavUsd: 3100.00,
    fallbackApy: 0,
    minInvestmentUsd: 50,
    navLabel: '런던 금 현물가 (XAU/USD)',
    sourceAttribution: { sourceType: 'official_issuer', sourceName: 'Paxos', lastUpdated: null, confidence: 'high' },
  },
  {
    id: 'xaut',
    canonicalId: 'xaut',
    displayName: 'Tether Gold',
    symbol: 'XAUt',
    issuer: 'Tether',
    assetClass: 'commodity',
    subCategory: 'gold',
    underlyingReference: 'Gold 1 Troy Oz (Swiss Vaults)',
    structureType: 'asset_backed',
    ownershipClaim: 'direct_claim',
    settlementModel: 'redeemable',
    permissionModel: 'kyc_gated',
    executionAvailability: 'swappable_now',
    navSupport: 'official',
    referenceValueType: 'oracle_reference',
    tradabilityScope: 'dex',
    chains: [
      { chainId: CHAIN.ETHEREUM, chainName: 'Ethereum', contractAddress: '0x68749665FF8D2d112Fa859AA293F07A622782F38', decimals: 6, buyWithSymbol: 'USDC', buyWithAddress: USDC.ETHEREUM },
    ],
    venues: [
      { name: 'Uniswap V3', type: 'dex_pool', chainId: CHAIN.ETHEREUM, isExecutable: true },
    ],
    routers: [
      { name: '1inch', chainIds: [CHAIN.ETHEREUM], isLive: true },
      { name: '0x', chainIds: [CHAIN.ETHEREUM], isLive: true },
    ],
    marketData: null,
    requiresKyc: true,
    complianceNotes: 'Swiss vault allocation. Verified by third-party audits.',
    disclaimerShort: 'Physical gold-backed token stored in Swiss vaults.',
    disclaimerLong: 'XAUt represents ownership of gold stored in Swiss vaults. Each token represents one troy ounce.',
    description: '스위스 금고 보관 실물 금을 기반으로 한 Tether 발행 골드 토큰.',
    tags: ['Gold', 'Physical-backed', 'Switzerland', 'Redeemable'],
    icon: '🏅',
    coingeckoId: 'tether-gold',
    fallbackNavUsd: 3100.00,
    fallbackApy: 0,
    minInvestmentUsd: 50,
    navLabel: '런던 금 현물가 (XAU/USD)',
    sourceAttribution: { sourceType: 'official_issuer', sourceName: 'Tether', lastUpdated: null, confidence: 'medium' },
  },
];

// ============================================================
// EQUITIES — Mixed structure types
// ============================================================
const EQUITY_INSTRUMENTS: RWAInstrument[] = [
  // --- Injective Synthetic Markets ---
  {
    id: 'inj-aapl',
    canonicalId: 'inj-aapl',
    displayName: 'Apple Inc. (Synthetic)',
    symbol: 'iAAPL',
    issuer: 'Injective Protocol',
    assetClass: 'equity',
    subCategory: 'tech_stock',
    underlyingReference: 'AAPL (Apple Inc.)',
    structureType: 'synthetic',
    ownershipClaim: 'economic_exposure_only',
    settlementModel: 'perpetual',
    permissionModel: 'public',
    executionAvailability: 'swappable_now',
    navSupport: 'none',
    referenceValueType: 'oracle_reference',
    tradabilityScope: 'venue_only',
    chains: [
      { chainId: CHAIN.INJECTIVE, chainName: 'Injective', contractAddress: '0x0db9bd22e4c6d4ef0a504f85708944056f5ecf82d753b9154c7be88b8c2ec5e9', decimals: 18, buyWithSymbol: 'USDT', buyWithAddress: 'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7' },
    ],
    venues: [
      { name: 'Injective DEX', type: 'dex_pool', chainId: CHAIN.INJECTIVE, isExecutable: true },
    ],
    routers: [
      { name: 'Injective DEX', chainIds: [CHAIN.INJECTIVE], isLive: true },
    ],
    marketData: null,
    requiresKyc: false,
    complianceNotes: 'Synthetic exposure only. No ownership of underlying Apple shares.',
    disclaimerShort: 'Synthetic market providing economic exposure to AAPL price movement.',
    disclaimerLong: 'This is a synthetic perpetual market on Injective. It tracks AAPL price via oracle but provides zero ownership rights in Apple Inc. Settled in USDT.',
    description: 'Injective 기반 AAPL 합성 마켓. 실제 주식 소유권 없이 가격 노출만 제공.',
    tags: ['Synthetic', 'Perpetual', 'Oracle-based', 'No Ownership'],
    icon: '📈',
    coingeckoId: null,
    fallbackNavUsd: 195.0,
    fallbackApy: 0,
    minInvestmentUsd: 10,
    navLabel: 'AAPL Oracle Reference',
    sourceAttribution: { sourceType: 'oracle_feed', sourceName: 'Injective Oracle', lastUpdated: null, confidence: 'medium' },
  },
  {
    id: 'inj-goog',
    canonicalId: 'inj-goog',
    displayName: 'Alphabet Inc. (Synthetic)',
    symbol: 'iGOOG',
    issuer: 'Injective Protocol',
    assetClass: 'equity',
    subCategory: 'tech_stock',
    underlyingReference: 'GOOG (Alphabet Inc.)',
    structureType: 'synthetic',
    ownershipClaim: 'economic_exposure_only',
    settlementModel: 'perpetual',
    permissionModel: 'public',
    executionAvailability: 'swappable_now',
    navSupport: 'none',
    referenceValueType: 'oracle_reference',
    tradabilityScope: 'venue_only',
    chains: [
      { chainId: CHAIN.INJECTIVE, chainName: 'Injective', contractAddress: '0x96408895e808e45d95de88784092683963f415985823b8336605e6fc6de97668', decimals: 18, buyWithSymbol: 'USDT', buyWithAddress: 'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7' },
    ],
    venues: [
      { name: 'Injective DEX', type: 'dex_pool', chainId: CHAIN.INJECTIVE, isExecutable: true },
    ],
    routers: [
      { name: 'Injective DEX', chainIds: [CHAIN.INJECTIVE], isLive: true },
    ],
    marketData: null,
    requiresKyc: false,
    complianceNotes: 'Synthetic exposure only. No ownership of underlying Alphabet shares.',
    disclaimerShort: 'Synthetic market providing economic exposure to GOOG price movement.',
    disclaimerLong: 'This is a synthetic perpetual market on Injective. It tracks GOOG price via oracle.',
    description: 'Injective 기반 GOOG 합성 마켓.',
    tags: ['Synthetic', 'Perpetual', 'Oracle-based', 'No Ownership'],
    icon: '📈',
    coingeckoId: null,
    fallbackNavUsd: 172.0,
    fallbackApy: 0,
    minInvestmentUsd: 10,
    navLabel: 'GOOG Oracle Reference',
    sourceAttribution: { sourceType: 'oracle_feed', sourceName: 'Injective Oracle', lastUpdated: null, confidence: 'medium' },
  },
  // --- Platform-issued equity (Robinhood scaffold) ---
  {
    id: 'rh-tsla-tracked',
    canonicalId: 'rh-tsla',
    displayName: 'Tesla Inc. (Platform)',
    symbol: 'TSLA',
    issuer: 'Robinhood',
    assetClass: 'equity',
    subCategory: 'tech_stock',
    underlyingReference: 'TSLA (Tesla Inc.)',
    structureType: 'platform_issued',
    ownershipClaim: 'indirect_claim',
    settlementModel: 'platform_internal',
    permissionModel: 'platform_only',
    executionAvailability: 'tracked_only',
    navSupport: 'none',
    referenceValueType: 'market_price',
    tradabilityScope: 'tracked_only',
    chains: [],
    venues: [
      { name: 'Robinhood', type: 'platform', chainId: 0, isExecutable: false },
    ],
    routers: [],
    marketData: null,
    requiresKyc: true,
    complianceNotes: 'Platform-only access. Not directly tradable via DEX. Ownership rights depend on Robinhood terms.',
    disclaimerShort: 'Platform-issued stock access. Execution not currently integrated.',
    disclaimerLong: 'This represents tracked data for a Robinhood stock-token product. No official public API integration exists. Do not assume direct shareholder rights. Execution is platform-only.',
    description: 'Robinhood 플랫폼 주식 토큰. 현재 추적 전용.',
    tags: ['Platform-Only', 'Tracked', 'No DEX', 'Indirect Claim'],
    icon: '📈',
    coingeckoId: null,
    fallbackNavUsd: 175.0,
    fallbackApy: 0,
    minInvestmentUsd: 0,
    navLabel: 'Market Price Reference',
    sourceAttribution: { sourceType: 'tracked_only', sourceName: 'Robinhood (scaffold)', lastUpdated: null, confidence: 'low' },
  },
];

// ============================================================
// CREDIT — Tracked / Scaffold
// ============================================================
const CREDIT_INSTRUMENTS: RWAInstrument[] = [
  {
    id: 'maple-lending',
    canonicalId: 'maple-lending',
    displayName: 'Maple Finance Lending Pool',
    symbol: 'MPL-LEND',
    issuer: 'Maple Finance',
    assetClass: 'credit',
    subCategory: 'private-credit',
    underlyingReference: 'Institutional Lending Pool',
    structureType: 'platform_issued',
    ownershipClaim: 'issuer_linked_claim',
    settlementModel: 'redeemable',
    permissionModel: 'kyc_gated',
    executionAvailability: 'platform_only',
    navSupport: 'estimated',
    referenceValueType: 'platform_price',
    tradabilityScope: 'platform_only',
    chains: [
      { chainId: CHAIN.ETHEREUM, chainName: 'Ethereum', contractAddress: '0x...maple', decimals: 18, buyWithSymbol: 'USDC', buyWithAddress: USDC.ETHEREUM },
    ],
    venues: [
      { name: 'Maple Finance', type: 'platform', chainId: CHAIN.ETHEREUM, isExecutable: false },
    ],
    routers: [],
    marketData: null,
    requiresKyc: true,
    complianceNotes: 'Accredited investors. Platform-only lending pool.',
    disclaimerShort: 'Institutional credit pool. Platform access required.',
    disclaimerLong: 'Maple Finance lending pools provide yield from institutional borrowers. Access and redemption are via the Maple platform.',
    description: 'Maple Finance 기관 대출 풀. 플랫폼 접근 필요.',
    tags: ['Private Credit', 'Institutional', 'Yield', 'Platform-Only'],
    icon: '📋',
    coingeckoId: null,
    fallbackNavUsd: 1.0,
    fallbackApy: 8.5,
    minInvestmentUsd: 0,
    navLabel: 'Estimated Pool Value',
    sourceAttribution: { sourceType: 'estimated', sourceName: 'Maple Finance', lastUpdated: null, confidence: 'medium' },
  },
];

// ============================================================
// REAL ESTATE — Tracked only
// ============================================================
const REAL_ESTATE_INSTRUMENTS: RWAInstrument[] = [
  {
    id: 'realt-tracked',
    canonicalId: 'realt',
    displayName: 'RealT Tokenized Property',
    symbol: 'REALT',
    issuer: 'RealT',
    assetClass: 'real_estate',
    subCategory: 'residential',
    underlyingReference: 'US Residential Properties Portfolio',
    structureType: 'regulated_tokenized',
    ownershipClaim: 'direct_claim',
    settlementModel: 'redeemable',
    permissionModel: 'kyc_gated',
    executionAvailability: 'tracked_only',
    navSupport: 'estimated',
    referenceValueType: 'platform_price',
    tradabilityScope: 'tracked_only',
    chains: [
      { chainId: CHAIN.ETHEREUM, chainName: 'Ethereum', contractAddress: '0x...realt', decimals: 18, buyWithSymbol: 'USDC', buyWithAddress: USDC.ETHEREUM },
    ],
    venues: [
      { name: 'RealT Marketplace', type: 'platform', chainId: CHAIN.ETHEREUM, isExecutable: false },
    ],
    routers: [],
    marketData: null,
    requiresKyc: true,
    complianceNotes: 'SEC Reg D exempt. US accredited investors via RealT platform.',
    disclaimerShort: 'Tokenized US residential property. Tracked only.',
    disclaimerLong: 'RealT tokens represent fractional ownership in US residential properties. Trading is via the RealT secondary marketplace.',
    description: '미국 주거용 부동산 토큰화 상품. 현재 추적 전용.',
    tags: ['Residential', 'Tokenized', 'Tracked', 'SEC Reg D'],
    icon: '🏠',
    coingeckoId: null,
    fallbackNavUsd: 50.0,
    fallbackApy: 9.2,
    minInvestmentUsd: 0,
    navLabel: 'Estimated Property Value',
    sourceAttribution: { sourceType: 'estimated', sourceName: 'RealT', lastUpdated: null, confidence: 'low' },
  },
];


// ============================================================
// EXPORTS
// ============================================================
export const ALL_INSTRUMENTS: RWAInstrument[] = [
  ...TREASURY_INSTRUMENTS,
  ...COMMODITY_INSTRUMENTS,
  ...EQUITY_INSTRUMENTS,
  ...CREDIT_INSTRUMENTS,
  ...REAL_ESTATE_INSTRUMENTS,
];

// Build instrument groups
function buildGroups(instruments: RWAInstrument[]): RWAInstrumentGroup[] {
  const map = new Map<string, RWAInstrumentGroup>();
  instruments.forEach(inst => {
    if (!map.has(inst.canonicalId)) {
      map.set(inst.canonicalId, {
        canonicalId: inst.canonicalId,
        displayName: inst.displayName,
        assetClass: inst.assetClass,
        issuerFamily: inst.issuer,
        structureType: inst.structureType,
        members: [],
      });
    }
    map.get(inst.canonicalId)!.members.push(inst);
  });
  return Array.from(map.values());
}

export const ALL_INSTRUMENT_GROUPS = buildGroups(ALL_INSTRUMENTS);

// Filter helpers
export function getInstrumentsByClass(ac: AssetClass): RWAInstrument[] {
  return ALL_INSTRUMENTS.filter(i => i.assetClass === ac);
}

export function getExecutableInstruments(): RWAInstrument[] {
  return ALL_INSTRUMENTS.filter(i => i.executionAvailability === 'swappable_now');
}

export function getTrackedOnlyInstruments(): RWAInstrument[] {
  return ALL_INSTRUMENTS.filter(i => i.executionAvailability === 'tracked_only' || i.executionAvailability === 'platform_only');
}

// Backward compat: map RWAInstrument → old RWAAsset shape
export function instrumentToLegacyAsset(inst: RWAInstrument) {
  const chain = inst.chains[0];
  if (!chain) return null;
  return {
    id: inst.id,
    symbol: inst.symbol,
    name: inst.displayName,
    issuer: inst.issuer,
    category: inst.assetClass === 'equity' ? 'credit' as const : inst.assetClass === 'real_estate' ? 'credit' as const : inst.assetClass as 'treasury' | 'commodity' | 'credit',
    contractAddress: chain.contractAddress,
    chainId: chain.chainId,
    decimals: chain.decimals,
    buyWithSymbol: chain.buyWithSymbol,
    buyWithAddress: chain.buyWithAddress,
    coingeckoId: inst.coingeckoId,
    fallbackApy: inst.fallbackApy,
    minInvestmentUsd: inst.minInvestmentUsd,
    description: inst.description,
    tags: inst.tags,
    requiresKyc: inst.requiresKyc,
    navSource: 'issuer_fixed' as const,
    fallbackNavUsd: inst.fallbackNavUsd,
    navLabel: inst.navLabel,
  };
}
