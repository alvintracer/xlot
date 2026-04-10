// ============================================================
// RWA 시세 서비스 — Phase 5-B Step 1
// ============================================================

import { ALL_RWA_ASSETS } from '../constants/rwaAssets';
import type { RWAAsset } from '../constants/rwaAssets';
import { ALL_INSTRUMENTS } from '../constants/rwaInstruments';
import { getHyperliquidCoinData } from './providers/market/hyperliquidProvider';
import { getEdgeXContractData } from './providers/market/edgexProvider';
import { getLighterMarketData } from './providers/market/lighterProvider';
import { getOKXContractData } from './providers/market/okxProvider';
import { getBitgetContractData } from './providers/market/bitgetProvider';
import { bybitProvider } from './providers/market/bybitProvider';

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

function getCoinGeckoApiKey(): string {
  const envKey = (import.meta as unknown as { env: { VITE_COINGECKO_API_KEY?: string } }).env?.VITE_COINGECKO_API_KEY;
  if (!envKey) return '';
  const keys = envKey.split(',').map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) return '';
  return keys[Math.floor(Math.random() * keys.length)];
}

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
    const apiKey = getCoinGeckoApiKey();
    const authParam = apiKey ? `&x_cg_demo_api_key=${apiKey}` : '';

    const [marketRes, fxRes] = await Promise.all([
      fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h${authParam}`
      ),
      fetch(`https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=krw${authParam}`),
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

    // ── Hyperliquid perp prices (parallel, non-blocking) ──
    try {
      const hlInstruments = ALL_INSTRUMENTS.filter(i => i.id.startsWith('hl-'));
      const hlCoinMap: Record<string, string> = { 'hl-paxg-perp': 'PAXG', 'hl-ondo-perp': 'ONDO' };

      const hlResults = await Promise.allSettled(
        hlInstruments.map(async (inst) => {
          const coin = hlCoinMap[inst.id];
          if (!coin) return null;
          const data = await getHyperliquidCoinData(coin);
          if (!data) return null;
          return { id: inst.id, data, inst };
        })
      );

      for (const r of hlResults) {
        if (r.status === 'fulfilled' && r.value) {
          const { id, data, inst } = r.value;
          const prevDayPx = data.markPx / (1 + (data.markPx - data.oraclePx) / data.oraclePx); // approx
          const change24h = data.oraclePx > 0 ? ((data.markPx - data.oraclePx) / data.oraclePx) * 100 : 0;
          result[id] = {
            assetId: id,
            priceUsd: data.markPx,
            priceKrw: data.markPx * exchangeRate,
            change24h: change24h,
            apy: data.fundingAnnualized,
            marketCapUsd: data.openInterestUsd,
            lastUpdated: now,
          };
        }
      }
    } catch (hlErr) {
      console.warn('[rwaService] Hyperliquid fetch skipped:', hlErr);
    }

    // ── edgeX perp prices (parallel, non-blocking) ──
    try {
      const edgexMap: Record<string, string> = {
        'edgex-paxg-perp': '10000227',
        'edgex-xaut-perp': '10000234',
        'edgex-silver-perp': '10000278',
        'edgex-copper-perp': '10000279',
      };
      const edgexInstruments = ALL_INSTRUMENTS.filter(i => i.id in edgexMap);

      const edgexResults = await Promise.allSettled(
        edgexInstruments.map(async (inst) => {
          const contractId = edgexMap[inst.id];
          const data = await getEdgeXContractData(contractId);
          if (!data) return null;
          return { id: inst.id, data };
        })
      );

      for (const r of edgexResults) {
        if (r.status === 'fulfilled' && r.value) {
          const { id, data } = r.value;
          result[id] = {
            assetId: id,
            priceUsd: data.markPrice,
            priceKrw: data.markPrice * exchangeRate,
            change24h: data.priceChangePercent,
            apy: data.fundingAnnualized,
            marketCapUsd: data.openInterestUsd,
            lastUpdated: now,
          };
        }
      }
    } catch (edgexErr) {
      console.warn('[rwaService] edgeX fetch skipped:', edgexErr);
    }

    // ── lighter.xyz perp prices (parallel, non-blocking) ──
    try {
      const lighterMap: Record<string, string> = {
        'lighter-xau-perp':  'XAU',
        'lighter-xag-perp':  'XAG',
        'lighter-paxg-perp': 'PAXG',
        'lighter-oil-perp':  'BRENTOIL',
      };
      const lighterInstruments = ALL_INSTRUMENTS.filter(i => i.id in lighterMap);

      const lighterResults = await Promise.allSettled(
        lighterInstruments.map(async (inst) => {
          const symbol = lighterMap[inst.id];
          const data = await getLighterMarketData(symbol);
          if (!data) return null;
          return { id: inst.id, data };
        })
      );

      for (const r of lighterResults) {
        if (r.status === 'fulfilled' && r.value) {
          const { id, data } = r.value;
          result[id] = {
            assetId: id,
            priceUsd: data.lastPrice,
            priceKrw: data.lastPrice * exchangeRate,
            change24h: data.change24h,
            apy: 0,
            marketCapUsd: data.openInterestUsd,
            lastUpdated: now,
          };
        }
      }
    } catch (lighterErr) {
      console.warn('[rwaService] lighter.xyz fetch skipped:', lighterErr);
    }

    // ── OKX CEX perp prices (parallel, non-blocking) ──
    try {
      const okxMap: Record<string, string> = {
        'okx-xau-perp': 'XAU-USDT-SWAP',
        'okx-xag-perp': 'XAG-USDT-SWAP',
      };
      const okxInstruments = ALL_INSTRUMENTS.filter(i => i.id in okxMap);

      const okxResults = await Promise.allSettled(
        okxInstruments.map(async (inst) => {
          const instId = okxMap[inst.id];
          const data = await getOKXContractData(instId);
          if (!data) return null;
          return { id: inst.id, data };
        })
      );

      for (const r of okxResults) {
        if (r.status === 'fulfilled' && r.value) {
          const { id, data } = r.value;
          result[id] = {
            assetId: id,
            priceUsd: data.lastPrice,
            priceKrw: data.lastPrice * exchangeRate,
            change24h: data.priceChangePercent,
            apy: data.fundingAnnualized,
            marketCapUsd: data.openInterestUsd,
            lastUpdated: now,
          };
        }
      }
    } catch (okxErr) {
      console.warn('[rwaService] OKX fetch skipped:', okxErr);
    }

    // ── Bybit CEX perp prices (parallel, non-blocking) ──
    try {
      const bybitMap: Record<string, string> = {
        'bybit-xau-perp': 'XAUUSDT',
        'bybit-xag-perp': 'XAGUSDT',
      };
      const bybitInstruments = ALL_INSTRUMENTS.filter(i => i.id in bybitMap);

      const bybitResults = await Promise.allSettled(
        bybitInstruments.map(async (inst) => {
          const instId = bybitMap[inst.id];
          const data = await bybitProvider.getBybitContractData(instId);
          if (!data) return null;
          return { id: inst.id, data };
        })
      );

      for (const r of bybitResults) {
        if (r.status === 'fulfilled' && r.value) {
          const { id, data } = r.value;
          const lastPx = parseFloat(data.lastPrice);
          result[id] = {
            assetId: id,
            priceUsd: lastPx,
            priceKrw: lastPx * exchangeRate,
            change24h: parseFloat(data.price24hPcnt) * 100,
            apy: parseFloat(data.fundingRate) * 3 * 365 * 100, // Annualized
            marketCapUsd: parseFloat(data.openInterest) * lastPx,
            lastUpdated: now,
          };
        }
      }
    } catch (bybitErr) {
      console.warn('[rwaService] Bybit fetch skipped:', bybitErr);
    }

    // ── Bitget CEX perp prices (parallel, non-blocking) ──
    try {
      const bitgetMap: Record<string, { symbol: string; productType: string }> = {
        'bitget-xau-perp': { symbol: 'XAUUSDT', productType: 'USDT-FUTURES' },
        'bitget-xag-perp': { symbol: 'XAGUSDT', productType: 'USDT-FUTURES' },
      };
      const bitgetInstruments = ALL_INSTRUMENTS.filter(i => i.id in bitgetMap);

      const bitgetResults = await Promise.allSettled(
        bitgetInstruments.map(async (inst) => {
          const cfg = bitgetMap[inst.id];
          const data = await getBitgetContractData(cfg.symbol, cfg.productType);
          if (!data) return null;
          return { id: inst.id, data };
        })
      );

      for (const r of bitgetResults) {
        if (r.status === 'fulfilled' && r.value) {
          const { id, data } = r.value;
          result[id] = {
            assetId: id,
            priceUsd: data.lastPrice,
            priceKrw: data.lastPrice * exchangeRate,
            change24h: data.priceChangePercent,
            apy: data.fundingAnnualized,
            marketCapUsd: data.openInterestUsd,
            lastUpdated: now,
          };
        }
      }
    } catch (bitgetErr) {
      console.warn('[rwaService] Bitget fetch skipped:', bitgetErr);
    }

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
    case 8453:  return 'Base';
    case 42161: return 'Arbitrum';
    default:    return `Chain ${chainId}`;
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
      const apiKey = getCoinGeckoApiKey();
      const authParam = apiKey ? `&x_cg_demo_api_key=${apiKey}` : '';

      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${asset.coingeckoId}/market_chart?vs_currency=usd&days=${days}&interval=daily${authParam}`
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
    const apiKey = getCoinGeckoApiKey();
    const authParam = apiKey ? `&x_cg_demo_api_key=${apiKey}` : '';

    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd${authParam}`
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
  'hl-paxg-perp': { liquidityUsd: 45_000_000, volume24hUsd: 17_500_000, source: 'Hyperliquid' },
  'hl-ondo-perp': { liquidityUsd: 3_500_000,  volume24hUsd: 1_000_000,  source: 'Hyperliquid' },
  'lighter-xau-perp':  { liquidityUsd: 16_000_000, volume24hUsd: 303_000_000, source: 'lighter.xyz' },
  'lighter-xag-perp':  { liquidityUsd: 5_000_000,  volume24hUsd: 21_000_000,  source: 'lighter.xyz' },
  'lighter-paxg-perp': { liquidityUsd: 2_000_000,  volume24hUsd: 2_300_000,   source: 'lighter.xyz' },
  'lighter-oil-perp':  { liquidityUsd: 8_000_000,  volume24hUsd: 37_000_000,  source: 'lighter.xyz' },
  'edgex-paxg-perp':   { liquidityUsd: 5_000_000, volume24hUsd: 4_800_000, source: 'edgeX' },
  'edgex-xaut-perp':   { liquidityUsd: 35_000_000, volume24hUsd: 3_000_000, source: 'edgeX' },
  'edgex-silver-perp': { liquidityUsd: 38_500_000, volume24hUsd: 2_000_000, source: 'edgeX' },
  'edgex-copper-perp': { liquidityUsd: 11_500_000, volume24hUsd: 1_500_000, source: 'edgeX' },
  'okx-xau-perp':     { liquidityUsd: 120_000_000, volume24hUsd: 85_000_000,  source: 'OKX' },
  'okx-xag-perp':     { liquidityUsd: 30_000_000,  volume24hUsd: 18_000_000,  source: 'OKX' },
  'bitget-xau-perp':  { liquidityUsd: 60_000_000,  volume24hUsd: 42_000_000,  source: 'Bitget' },
  'bitget-xag-perp':  { liquidityUsd: 15_000_000,  volume24hUsd: 9_000_000,   source: 'Bitget' },
};
export function getInstrumentImageUrl(inst: import('../types/rwaInstrument').RWAInstrument): string {
  if (inst.imageUrl) return inst.imageUrl;
  
  const s = inst.symbol.toLowerCase();
  const rawId = inst.id.toLowerCase();
  
  if (s.includes('gold') || s === 'xauusdt' || s === 'paxg' || s === 'xaut') {
    return 'https://s2.coinmarketcap.com/static/img/coins/64x64/4705.png'; // PAXG
  }
  if (s.includes('silver') || s === 'xagusdt') {
    return 'https://s2.coinmarketcap.com/static/img/coins/64x64/23932.png'; // KAG
  }
  if (s === 'usdy' || rawId.includes('usdy')) return 'https://s2.coinmarketcap.com/static/img/coins/64x64/29255.png';
  if (s === 'ousg' || rawId.includes('ousg')) return 'https://s2.coinmarketcap.com/static/img/coins/64x64/28669.png'; // Ondo
  if (s === 'benji' || rawId.includes('benji')) return 'https://s2.coinmarketcap.com/static/img/coins/64x64/30252.png'; // Benji
  if (s.includes('fbnd')) return 'https://s2.coinmarketcap.com/static/img/coins/64x64/36257.png';
  
  if (inst.issuer.toLowerCase().includes('injective')) {
    return 'https://cryptologos.cc/logos/injective-inj-logo.svg';
  }
  
  if (inst.structureType === 'asset_backed' || inst.assetClass === 'commodity') {
    return 'https://s2.coinmarketcap.com/static/img/coins/64x64/4705.png';
  }

  // default realistic looking fallback
  if (inst.assetClass === 'treasury' || inst.assetClass === 'credit') {
    return 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg';
  }

  return 'https://cryptologos.cc/logos/tether-usdt-logo.svg';
}
