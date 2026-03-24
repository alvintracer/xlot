// ============================================================
// RWA (Real World Asset) 자산 목록 상수
// Phase 5-B Step 1
// ============================================================

export type RWACategory = 'treasury' | 'commodity' | 'credit';

// NAV 기준가 소스
// 'issuer_fixed'  : 발행사 고정 공시 (USDY, BENJI 등 — 온체인 NAV oracle 없음)
// 'xau_spot'      : 런던 금 현물가 1oz = NAV (PAXG, XAUt)
// 'etf_nav'       : ETF NAV 연동 (OUSG ← iShares SHV)
export type NavSource = 'issuer_fixed' | 'xau_spot' | 'etf_nav';

export interface RWAAsset {
  id: string;
  symbol: string;
  name: string;
  issuer: string;
  category: RWACategory;
  contractAddress: string;
  chainId: number;
  decimals: number;
  buyWithSymbol: string;
  buyWithAddress: string;
  coingeckoId: string | null;
  fallbackApy: number;
  minInvestmentUsd: number;
  description: string;
  tags: string[];
  requiresKyc: boolean;

  // NAV (실물 시장 기준가) 관련
  navSource: NavSource;         // NAV 산출 방식
  fallbackNavUsd: number;       // API 실패 시 fallback NAV (USD)
  navLabel: string;             // UI 표시용 ("Ondo 공시 NAV", "런던 금 현물가" 등)
}

const CHAIN = { ETHEREUM: 1, POLYGON: 137, BASE: 8453 };
const USDC = {
  ETHEREUM: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  POLYGON:  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
  BASE:     '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
};

export const RWA_TREASURY: RWAAsset[] = [
  {
    id: 'usdy',
    symbol: 'USDY',
    name: 'US Dollar Yield',
    issuer: 'Ondo Finance',
    category: 'treasury',
    contractAddress: '0x96F6eF951840721AdBF46Ac996b59E0235CB985C',
    chainId: CHAIN.ETHEREUM,
    decimals: 18,
    buyWithSymbol: 'USDC',
    buyWithAddress: USDC.ETHEREUM,
    coingeckoId: 'ondo-us-dollar-yield',
    fallbackApy: 5.1,
    minInvestmentUsd: 500,
    description: '미국 단기 국채 + 은행 예금에 투자하는 토큰화 상품. 보유만 해도 매일 yield accrual.',
    tags: ['US Treasury', 'Bank Deposit', 'Daily Yield'],
    requiresKyc: true,
    navSource: 'issuer_fixed',
    fallbackNavUsd: 1.0603,
    navLabel: 'Ondo 공시 NAV',
  },
  {
    id: 'ousg',
    symbol: 'OUSG',
    name: 'Ondo Short-Term US Gov Bond',
    issuer: 'Ondo Finance',
    category: 'treasury',
    contractAddress: '0x1B19C19393e2d034D8Ff31ff34c81252FcBbee92',
    chainId: CHAIN.ETHEREUM,
    decimals: 18,
    buyWithSymbol: 'USDC',
    buyWithAddress: USDC.ETHEREUM,
    coingeckoId: 'ondo-short-term-us-government-bond',
    fallbackApy: 4.7,
    minInvestmentUsd: 5000,
    description: 'BlackRock iShares Short Treasury Bond ETF 기반 토큰화 미국 국채 펀드.',
    tags: ['US Treasury', 'BlackRock', 'ETF-backed'],
    requiresKyc: true,
    navSource: 'etf_nav',
    fallbackNavUsd: 107.82,
    navLabel: 'iShares SHV ETF NAV',
  },
  {
    id: 'benji-usd',
    symbol: 'BENJI',
    name: 'Franklin OnChain US Gov MF',
    issuer: 'Franklin Templeton',
    category: 'treasury',
    contractAddress: '0x59D9356364797B5e416F83e6fE9e8A0EC42E61Bc',
    chainId: CHAIN.POLYGON,
    decimals: 6,
    buyWithSymbol: 'USDC',
    buyWithAddress: USDC.POLYGON,
    coingeckoId: 'franklin-onchain-us-government-money-fund',
    fallbackApy: 3.9,
    minInvestmentUsd: 10,
    description: 'Franklin Templeton이 발행한 최초의 온체인 머니마켓 펀드. Polygon 기반.',
    tags: ['US Treasury', 'Franklin Templeton', 'Money Market'],
    requiresKyc: true,
    navSource: 'issuer_fixed',
    fallbackNavUsd: 1.0841,
    navLabel: 'Franklin Templeton 공시 NAV',
  },
];

export const RWA_COMMODITY: RWAAsset[] = [
  {
    id: 'paxg',
    symbol: 'PAXG',
    name: 'PAX Gold',
    issuer: 'Paxos',
    category: 'commodity',
    contractAddress: '0x45804880De22913dAFE09f4980848ECE6EcbAf78',
    chainId: CHAIN.ETHEREUM,
    decimals: 18,
    buyWithSymbol: 'USDC',
    buyWithAddress: USDC.ETHEREUM,
    coingeckoId: 'pax-gold',
    fallbackApy: 0,
    minInvestmentUsd: 50,
    description: '런던 금고 실물 금 1트로이온스를 대표하는 토큰. Paxos 규제 발행.',
    tags: ['Gold', 'Physical-backed', 'NYDFS'],
    requiresKyc: true,
    navSource: 'xau_spot',
    fallbackNavUsd: 3100.00,
    navLabel: '런던 금 현물가 (XAU/USD)',
  },
  {
    id: 'xaut',
    symbol: 'XAUt',
    name: 'Tether Gold',
    issuer: 'Tether',
    category: 'commodity',
    contractAddress: '0x68749665FF8D2d112Fa859AA293F07A622782F38',
    chainId: CHAIN.ETHEREUM,
    decimals: 6,
    buyWithSymbol: 'USDC',
    buyWithAddress: USDC.ETHEREUM,
    coingeckoId: 'tether-gold',
    fallbackApy: 0,
    minInvestmentUsd: 50,
    description: '스위스 금고 보관 실물 금을 기반으로 한 Tether 발행 골드 토큰.',
    tags: ['Gold', 'Physical-backed', 'Switzerland'],
    requiresKyc: true,
    navSource: 'xau_spot',
    fallbackNavUsd: 3100.00,
    navLabel: '런던 금 현물가 (XAU/USD)',
  },
];

export const RWA_CREDIT: RWAAsset[] = [];

export const ALL_RWA_ASSETS: RWAAsset[] = [
  ...RWA_TREASURY,
  ...RWA_COMMODITY,
  ...RWA_CREDIT,
];

export type RWACategory_t = RWACategory;

export const RWA_CATEGORY_LABELS: Record<RWACategory, string> = {
  treasury:  '국채 / 채권',
  commodity: '원자재 / 금',
  credit:    '크레딧',
};

export const RWA_CATEGORY_COLORS: Record<RWACategory, { bg: string; border: string; text: string; icon: string }> = {
  treasury:  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', icon: '🏛️' },
  commodity: { bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30',  text: 'text-yellow-400',  icon: '🏅' },
  credit:    { bg: 'bg-purple-500/10',  border: 'border-purple-500/30',  text: 'text-purple-400',  icon: '📋' },
};