// src/services/swapService.ts
// 1inch Aggregator API v6 연동
// [업데이트] CoinGecko OHLCV + 캐싱 + API 키 지원

import { CHAIN_IDS } from '../constants/tokens';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SwapQuote {
  fromToken: { symbol: string; address: string; decimals: number };
  toToken:   { symbol: string; address: string; decimals: number };
  fromAmount: string;
  toAmount: string;
  toAmountDisplay: string;
  estimatedGasUsd: number;
  priceImpact: number;
  route: RouteProtocol[];
  tx?: SwapTxData;
}

export interface RouteProtocol {
  name: string;
  part: number;
}

export interface SwapTxData {
  from: string;
  to: string;
  data: string;
  value: string;
  gas: string;
  gasPrice: string;
}

export interface PricePoint {
  timestamp: number;
  price: number;
}

// lightweight-charts 요구 포맷 (time은 초 단위 unix)
export interface OHLCPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const ONEINCH_BASE  = 'https://api.1inch.dev/swap/v6.0';
const ONEINCH_KEY   = import.meta.env.VITE_ONEINCH_API_KEY || '';
const COINGECKO_KEY = import.meta.env.VITE_COINGECKO_API_KEY || '';
const NATIVE_TOKEN  = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

export const EXPLORER: Record<number, string> = {
  [CHAIN_IDS.ETHEREUM]: 'https://etherscan.io/tx/',
  [CHAIN_IDS.POLYGON]:  'https://polygonscan.com/tx/',
  [CHAIN_IDS.BASE]:     'https://basescan.org/tx/',
  [CHAIN_IDS.SEPOLIA]:  'https://sepolia.etherscan.io/tx/',
};

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry { data: unknown; fetchedAt: number; }
const cache = new Map<string, CacheEntry>();

const CACHE_TTL: Record<number, number> = {
  1:  3  * 60_000,
  7:  10 * 60_000,
  14: 15 * 60_000,
  30: 30 * 60_000,
  90: 60 * 60_000,
};

function getCache<T>(key: string, days: number): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.fetchedAt < (CACHE_TTL[days] ?? 10 * 60_000))
    return entry.data as T;
  return null;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, fetchedAt: Date.now() });
}

// ─── Headers ─────────────────────────────────────────────────────────────────

function oneinchHeaders() {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...(ONEINCH_KEY ? { 'Authorization': `Bearer ${ONEINCH_KEY}` } : {}),
  };
}

function coingeckoHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Accept': 'application/json' };
  if (COINGECKO_KEY) h['x-cg-demo-api-key'] = COINGECKO_KEY;
  return h;
}

export const COINGECKO_IDS: Record<string, string> = {
  ETH:   'ethereum',
  BTC:   'bitcoin',
  SOL:   'solana',
  POL:   'matic-network',
  MATIC: 'matic-network',
  USDC:  'usd-coin',
  USDT:  'tether',
  TRX:   'tron',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toWei(amount: string, decimals: number): string {
  const val = parseFloat(amount);
  if (isNaN(val) || val <= 0) return '0';
  return Math.floor(val * 10 ** decimals).toString();
}

function fromWei(amount: string, decimals: number): string {
  const val = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = val / divisor;
  const remainder = val % divisor;
  const fraction = remainder.toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

// ─── 1inch Quote ──────────────────────────────────────────────────────────────

export async function getSwapQuote(
  chainId: number,
  fromAddress: string,
  toAddress: string,
  fromAmount: string,
  fromDecimals: number,
  toDecimals: number,
  walletAddress: string,
  slippagePct: number = 0.5,
): Promise<SwapQuote> {
  const amountWei = toWei(fromAmount, fromDecimals);
  if (amountWei === '0') throw new Error('입력 금액이 올바르지 않습니다.');

  const params = new URLSearchParams({
    src: fromAddress, dst: toAddress, amount: amountWei,
    from: walletAddress, slippage: slippagePct.toString(),
    disableEstimate: 'true', includeProtocols: 'true',
  });

  const res = await fetch(`${ONEINCH_BASE}/${chainId}/swap?${params}`, { headers: oneinchHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.description || `1inch API 오류 (${res.status})`);
  }

  const data = await res.json();
  const tx = data.tx;
  const toAmountWei: string = data.dstAmount || data.toAmount || '0';

  const route: RouteProtocol[] = [];
  if (data.protocols?.[0]) {
    for (const hop of data.protocols[0])
      for (const pool of hop)
        route.push({ name: pool.name, part: pool.part });
  }

  const gasUsed = parseInt(tx?.gas || '200000');
  const gasPriceGwei = parseInt(tx?.gasPrice || '30000000000') / 1e9;
  const estimatedGasUsd = (gasUsed * gasPriceGwei * 1e-9) * 3000;

  return {
    fromToken: { symbol: '', address: fromAddress, decimals: fromDecimals },
    toToken:   { symbol: '', address: toAddress,   decimals: toDecimals },
    fromAmount: amountWei,
    toAmount:   toAmountWei,
    toAmountDisplay: fromWei(toAmountWei, toDecimals),
    estimatedGasUsd: parseFloat(estimatedGasUsd.toFixed(4)),
    priceImpact: parseFloat(data.toAmountMinusFee || 0),
    route,
    tx: tx ? { from: tx.from, to: tx.to, data: tx.data, value: tx.value, gas: tx.gas, gasPrice: tx.gasPrice } : undefined,
  };
}

// ─── Execute Swap ─────────────────────────────────────────────────────────────

export async function executeSwap(quote: SwapQuote, provider: any): Promise<string> {
  if (!quote.tx) throw new Error('트랜잭션 데이터가 없습니다.');
  const txHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [{
      from:     quote.tx.from,
      to:       quote.tx.to,
      data:     quote.tx.data,
      value:    `0x${parseInt(quote.tx.value || '0').toString(16)}`,
      gas:      `0x${parseInt(quote.tx.gas).toString(16)}`,
      gasPrice: `0x${parseInt(quote.tx.gasPrice).toString(16)}`,
    }],
  });
  return txHash as string;
}

// ─── OHLCV (캔들 차트용) ──────────────────────────────────────────────────────
// CoinGecko /ohlc 엔드포인트
// days 1  → 30분봉
// days 7  → 4시간봉
// days 14 → 4시간봉
// days 30 → 일봉
// days 90 → 일봉

export async function getOHLCHistory(
  symbol: string,
  days: 1 | 7 | 14 | 30 | 90 = 30,
  vsCurrency: 'usd' | 'krw' = 'usd',
): Promise<OHLCPoint[]> {
  const id = COINGECKO_IDS[symbol.toUpperCase()];
  if (!id) return [];

  const cacheKey = `ohlc_${symbol}_${days}_${vsCurrency}`;
  const cached = getCache<OHLCPoint[]>(cacheKey, days);
  if (cached) return cached;

  try {
    const url = `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=${vsCurrency}&days=${days}`;
    const res = await fetch(url, { headers: coingeckoHeaders() });

    if (!res.ok) {
      console.warn(`[CoinGecko OHLC] ${res.status} — 캐시 반환`);
      return getCache<OHLCPoint[]>(cacheKey, 999999) || [];
    }

    const raw = await res.json() as [number, number, number, number, number][];

    // KRW 환산이 필요하면 환율 곱하기 (CoinGecko는 KRW OHLC도 직접 지원)
    const result: OHLCPoint[] = raw.map(([ts, o, h, l, c]) => ({
      time: Math.floor(ts / 1000),  // ms → 초 (lightweight-charts 요구사항)
      open: o, high: h, low: l, close: c,
    }));

    // time 중복 제거 (CoinGecko 간혹 중복 candle 반환)
    const deduped = result.filter((p, i, arr) => i === 0 || p.time !== arr[i - 1].time);

    setCache(cacheKey, deduped);
    return deduped;

  } catch (e) {
    console.warn('[CoinGecko OHLC] 오류', e);
    return getCache<OHLCPoint[]>(cacheKey, 999999) || [];
  }
}

// ─── Price History (AreaChart fallback용, 기존 유지) ─────────────────────────

export async function getPriceHistory(
  symbol: string,
  days: 1 | 7 | 30 | 90 = 7,
  vsCurrency: 'usd' | 'krw' = 'usd',
): Promise<PricePoint[]> {
  const id = COINGECKO_IDS[symbol.toUpperCase()];
  if (!id) return [];

  const cacheKey = `line_${symbol}_${days}_${vsCurrency}`;
  const cached = getCache<PricePoint[]>(cacheKey, days);
  if (cached) return cached;

  try {
    const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=${vsCurrency}&days=${days}`;
    const res = await fetch(url, { headers: coingeckoHeaders() });
    if (!res.ok) return getCache<PricePoint[]>(cacheKey, 999999) || [];

    const data = await res.json();
    const result = (data.prices as [number, number][]).map(([ts, price]) => ({ timestamp: ts, price }));
    setCache(cacheKey, result);
    return result;
  } catch {
    return getCache<PricePoint[]>(cacheKey, 999999) || [];
  }
}

// ─── Allowance & Approval ────────────────────────────────────────────────────

export async function checkAllowance(chainId: number, tokenAddress: string, walletAddress: string): Promise<bigint> {
  if (tokenAddress.toLowerCase() === NATIVE_TOKEN) return BigInt(Number.MAX_SAFE_INTEGER);
  const url = `${ONEINCH_BASE}/${chainId}/approve/allowance?tokenAddress=${tokenAddress}&walletAddress=${walletAddress}`;
  const res = await fetch(url, { headers: oneinchHeaders() });
  if (!res.ok) return 0n;
  const data = await res.json();
  return BigInt(data.allowance || '0');
}

export async function buildApprovalTx(chainId: number, tokenAddress: string, amount?: string): Promise<SwapTxData> {
  const params = new URLSearchParams({ tokenAddress });
  if (amount) params.set('amount', amount);
  const res = await fetch(`${ONEINCH_BASE}/${chainId}/approve/transaction?${params}`, { headers: oneinchHeaders() });
  if (!res.ok) throw new Error('Approval 트랜잭션 생성 실패');
  return res.json();
}