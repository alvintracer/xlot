// ============================================================
// RWA 시세 서비스 — Phase 5-B Step 1
// ============================================================

import { ALL_RWA_ASSETS } from '../constants/rwaAssets';
import type { RWAAsset } from '../constants/rwaAssets';

export interface RWAPrice {
  assetId: string;
  priceUsd: number;
  priceKrw: number;
  change24h: number;
  apy: number;
  marketCapUsd: number;
  lastUpdated: number;
}

export interface RWAPriceMap {
  [assetId: string]: RWAPrice;
}

let priceCache: RWAPriceMap | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 2 * 60 * 1000;

function buildFallback(exchangeRate = 1450): RWAPriceMap {
  const fallbackPrices: Record<string, { usd: number; change: number; mcap: number }> = {
    'usdy':      { usd: 1.06,    change: 0,    mcap: 500_000_000 },
    'ousg':      { usd: 107.50,  change: 0,    mcap: 300_000_000 },
    'benji-usd': { usd: 1.08,    change: 0,    mcap: 100_000_000 },
    'paxg':      { usd: 3100.00, change: 0.3,  mcap: 700_000_000 },
    'xaut':      { usd: 3090.00, change: 0.25, mcap: 500_000_000 },
  };

  const map: RWAPriceMap = {};
  ALL_RWA_ASSETS.forEach((asset: RWAAsset) => {
    const fb = fallbackPrices[asset.id] || { usd: 1, change: 0, mcap: 0 };
    map[asset.id] = {
      assetId: asset.id,
      priceUsd: fb.usd,
      priceKrw: fb.usd * exchangeRate,
      change24h: fb.change,
      apy: asset.fallbackApy,
      marketCapUsd: fb.mcap,
      lastUpdated: Date.now(),
    };
  });
  return map;
}

export async function fetchRWAPrices(): Promise<RWAPriceMap> {
  const now = Date.now();
  if (priceCache && now - lastFetchTime < CACHE_DURATION) return priceCache;

  const assetsWithId = ALL_RWA_ASSETS.filter(a => a.coingeckoId !== null);
  const ids = assetsWithId.map(a => a.coingeckoId).join(',');

  try {
    const apiKey = (import.meta as unknown as { env: { VITE_COINGECKO_API_KEY?: string } }).env?.VITE_COINGECKO_API_KEY;
    const headers: HeadersInit = { 'Accept': 'application/json' };
    if (apiKey) (headers as Record<string, string>)['x-cg-demo-api-key'] = apiKey;

    const [marketRes, fxRes] = await Promise.all([
      fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h`,
        { headers }
      ),
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=krw', { headers }),
    ]);

    if (!marketRes.ok) throw new Error(`CoinGecko ${marketRes.status}`);

    const marketData: Array<{ id: string; current_price: number; price_change_percentage_24h: number; market_cap: number }> = await marketRes.json();
    const fxData = fxRes.ok ? await fxRes.json() : null;
    const exchangeRate: number = fxData?.tether?.krw || 1450;

    const cgMap: Record<string, { current_price: number; price_change_percentage_24h: number; market_cap: number }> = {};
    marketData.forEach(d => { cgMap[d.id] = d; });

    const result: RWAPriceMap = {};
    ALL_RWA_ASSETS.forEach((asset: RWAAsset) => {
      const cg = asset.coingeckoId ? cgMap[asset.coingeckoId] : null;
      if (cg) {
        result[asset.id] = {
          assetId: asset.id,
          priceUsd: cg.current_price || 1,
          priceKrw: (cg.current_price || 1) * exchangeRate,
          change24h: cg.price_change_percentage_24h || 0,
          apy: asset.fallbackApy,
          marketCapUsd: cg.market_cap || 0,
          lastUpdated: now,
        };
      } else {
        result[asset.id] = buildFallback(exchangeRate)[asset.id];
      }
    });

    priceCache = result;
    lastFetchTime = now;
    return result;

  } catch (err) {
    console.warn('[rwaService] fallback 사용:', err);
    const fallback = buildFallback();
    priceCache = fallback;
    lastFetchTime = now - CACHE_DURATION + 30_000;
    return fallback;
  }
}

export function formatApy(apy: number): string {
  if (apy === 0) return '가격 상승';
  return `${apy.toFixed(1)}% APY`;
}

export function getChainName(chainId: number): string {
  switch (chainId) {
    case 1:    return 'Ethereum';
    case 137:  return 'Polygon';
    case 8453: return 'Base';
    default:   return `Chain ${chainId}`;
  }
}

// ============================================================
// NAV (실물 시장 기준가) + 괴리율 계산
// ============================================================

export interface NAVData {
  assetId: string;
  navUsd: number;           // 실물 시장 기준가 (USD)
  navSource: string;        // 출처 레이블
  dexPriceUsd: number;      // DEX 시장가 (CoinGecko)
  spreadPct: number;        // 괴리율 % = (DEX - NAV) / NAV * 100
                            //   음수 = 디스카운트 (DEX가 더 저렴 → 유리)
                            //   양수 = 프리미엄  (DEX가 더 비쌈 → 불리)
  isDiscount: boolean;      // 디스카운트 여부
  savingPer10k: number;     // $10,000 투자 시 절약 금액 (USD)
  lastUpdated: number;
}

export type NAVMap = Record<string, NAVData>;

// ============================================================
// 역사적 시세 (꺾은선 차트용)
// ============================================================

export interface HistoricalDataPoint {
  timestamp: number;
  dateStr: string;
  dexPrice: number;
  navPrice: number;
}

const historicalCache = new Map<string, { data: HistoricalDataPoint[], fetchedAt: number }>();

export async function fetchHistoricalData(
  asset: import('../constants/rwaAssets').RWAAsset,
  currentNav: number,
  days: number = 30
): Promise<HistoricalDataPoint[]> {
  const now = Date.now();
  const CACHE_TTL = 1000 * 60 * 60; // 1시간 캐시

  const cacheKey = `${asset.id}-${days}`;
  const cached = historicalCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const result: HistoricalDataPoint[] = [];

  // 1. DEX 가격 시계열 (CoinGecko)
  let dexPrices: [number, number][] = [];
  try {
    if (asset.coingeckoId) {
      const apiKey = (import.meta as unknown as { env: { VITE_COINGECKO_API_KEY?: string } }).env?.VITE_COINGECKO_API_KEY;
      const headers: HeadersInit = { 'Accept': 'application/json' };
      if (apiKey) (headers as Record<string, string>)['x-cg-demo-api-key'] = apiKey;

      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${asset.coingeckoId}/market_chart?vs_currency=usd&days=${days}&interval=daily`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        dexPrices = data.prices || [];
      }
    }
  } catch (e) {
    console.warn('[rwaService] Historical fetch failed', e);
  }

  // API 실패 시 혹은 지원 안하는 코인일 경우 가상 트렌드 생성
  if (dexPrices.length === 0) {
    const endPrice = asset.fallbackNavUsd * 1.001; // 약간의 프리미엄 부여
    for (let i = days; i >= 0; i--) {
      const t = now - i * dayMs;
      const noise = (Math.random() - 0.45) * 0.002 * endPrice;
      const bp = endPrice * (1 - (i / days) * 0.005) + noise; // 우상향 트렌드
      dexPrices.push([t, bp]);
    }
  }

  const dailyMap = new Map<string, number>();
  dexPrices.forEach(([t, p]) => {
    const isoStr = new Date(t).toISOString().split('T')[0];
    dailyMap.set(isoStr, p);
  });

  // 2. NAV 역사 수학적 역산 및 결합
  for (let i = days; i >= 0; i--) {
    const targetDate = new Date(now - i * dayMs);
    const dateStr = targetDate.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    const isoStr = targetDate.toISOString().split('T')[0];
    
    // 타겟 날짜의 DEX 가격 찾기 (없으면 이전 값 혹은 현재 NAV)
    let dexP = dailyMap.get(isoStr);
    if (!dexP) {
      dexP = result.length > 0 ? result[result.length - 1].dexPrice : currentNav;
    }

    let navP = currentNav;
    if (asset.fallbackApy > 0) {
       // 꾸준히 상승하는 채권형 (복리 역산)
       const dailyRate = Math.pow(1 + (asset.fallbackApy / 100), 1 / 365) - 1;
       navP = currentNav / Math.pow(1 + dailyRate, i);
    } else if (asset.navSource === 'xau_spot') {
       // 금과 같이 이자가 없는 실물 자산의 경우 DEX와 거의 동기화된 가상 NAV 생성
       navP = dexP * 0.9995;
    }

    result.push({
      timestamp: targetDate.getTime(),
      dateStr,
      dexPrice: dexP,
      navPrice: navP,
    });
  }

  historicalCache.set(cacheKey, { data: result, fetchedAt: now });
  return result;
}

// XAU/USD 현물가 캐시
let xauCache: { price: number; fetchedAt: number } | null = null;
const XAU_CACHE_TTL = 5 * 60_000; // 5분

// 금 현물가 fetch (Metals API 무료 fallback → frankfurter)
async function fetchXauUsd(): Promise<number> {
  const now = Date.now();
  if (xauCache && now - xauCache.fetchedAt < XAU_CACHE_TTL) return xauCache.price;

  try {
    // CoinGecko에서 PAXG(금 1oz)를 USD로 직접 가져오는 게 가장 안정적
    const apiKey = (import.meta as unknown as { env: { VITE_COINGECKO_API_KEY?: string } }).env?.VITE_COINGECKO_API_KEY;
    const headers: HeadersInit = { Accept: 'application/json' };
    if (apiKey) (headers as Record<string, string>)['x-cg-demo-api-key'] = apiKey;

    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd',
      { headers }
    );
    if (!res.ok) throw new Error('CoinGecko XAU fetch 실패');
    const data = await res.json();
    const price = data['pax-gold']?.usd || 3100;
    xauCache = { price, fetchedAt: now };
    return price;
  } catch {
    return xauCache?.price || 3100;
  }
}

// NAV 계산 (자산별 소스에 따라)
async function resolveNav(asset: import('../constants/rwaAssets').RWAAsset): Promise<number> {
  switch (asset.navSource) {
    case 'xau_spot':
      return fetchXauUsd();
    case 'issuer_fixed':
    case 'etf_nav':
    default:
      // 현재는 fallback 상수 사용
      // 향후: Ondo NAV oracle 온체인 호출 or Franklin API
      return asset.fallbackNavUsd;
  }
}

// 괴리율 계산 메인 함수
export async function fetchNAVData(priceMap: RWAPriceMap): Promise<NAVMap> {
  const { ALL_RWA_ASSETS } = await import('../constants/rwaAssets');
  const result: NAVMap = {};

  await Promise.all(
    ALL_RWA_ASSETS.map(async (asset) => {
      const dexPrice = priceMap[asset.id]?.priceUsd ?? asset.fallbackNavUsd;
      const nav = await resolveNav(asset);

      // 괴리율: DEX가 NAV보다 낮으면 음수(디스카운트) → 유리
      const spreadPct = nav > 0 ? ((dexPrice - nav) / nav) * 100 : 0;
      const isDiscount = spreadPct < 0;

      // $10,000 투자 시 절약 금액
      // 디스카운트면 더 많이 사게 되므로: savings = |spread| / 100 * 10000
      const savingPer10k = isDiscount ? Math.abs(spreadPct / 100) * 10_000 : 0;

      result[asset.id] = {
        assetId: asset.id,
        navUsd: nav,
        navSource: asset.navLabel,
        dexPriceUsd: dexPrice,
        spreadPct,
        isDiscount,
        savingPer10k,
        lastUpdated: Date.now(),
      };
    })
  );

  return result;
}

// 괴리율 표시 텍스트
export function formatSpread(spreadPct: number): string {
  const abs = Math.abs(spreadPct);
  const sign = spreadPct <= 0 ? '-' : '+';
  return `${sign}${abs.toFixed(2)}%`;
}

// 괴리율 색상
export function getSpreadColor(spreadPct: number): string {
  if (spreadPct <= -0.1) return 'text-emerald-400'; // 디스카운트 → 초록
  if (spreadPct >= 0.1)  return 'text-red-400';     // 프리미엄  → 빨강
  return 'text-slate-400';                           // 거의 동일
}

// ============================================================
// 자산별 유동성 수준 상수 (fallback — Subgraph 미연동 시 사용)
// Uniswap V3 주요 풀 TVL 기준 (2025년 3월 기준 추정치)
// ============================================================
export const RWA_LIQUIDITY_FALLBACK: Record<string, {
  liquidityUsd: number;
  volume24hUsd: number;
  source: string;
}> = {
  'usdy':      { liquidityUsd: 4_200_000,  volume24hUsd: 890_000,  source: 'Uniswap V3' },
  'ousg':      { liquidityUsd: 800_000,    volume24hUsd: 120_000,  source: 'OTC 위주'   },
  'benji-usd': { liquidityUsd: 500_000,    volume24hUsd: 80_000,   source: 'Polygon DEX' },
  'paxg':      { liquidityUsd: 28_000_000, volume24hUsd: 5_200_000, source: 'Uniswap V3' },
  'xaut':      { liquidityUsd: 12_000_000, volume24hUsd: 2_100_000, source: 'Uniswap V3' },
};