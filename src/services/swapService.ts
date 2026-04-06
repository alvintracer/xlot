// src/services/swapService.ts
// 1inch Aggregator API v6 연동
// [업데이트] CoinGecko OHLCV + 캐싱 + API 키 지원

import { CHAIN_IDS } from '../constants/tokens';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SwapQuote {
  provider: '1INCH' | '0X';
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

const ZEROX_KEY = import.meta.env.VITE_ZEROEX_API_KEY || '';

function get0xBaseUrl(chainId: number) {
    if (chainId === CHAIN_IDS.ETHEREUM) return 'https://api.0x.org/swap/v1/quote';
    if (chainId === CHAIN_IDS.POLYGON) return 'https://polygon.api.0x.org/swap/v1/quote';
    if (chainId === CHAIN_IDS.BASE) return 'https://base.api.0x.org/swap/v1/quote';
    return 'https://api.0x.org/swap/v1/quote';
}

function zeroXHeaders() {
    const h: Record<string, string> = { 'Accept': 'application/json' };
    if (ZEROX_KEY) h['0x-api-key'] = ZEROX_KEY;
    return h;
}

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

export async function get1inchQuote(
  chainId: number,
  fromAddress: string,
  toAddress: string,
  amountWei: string,
  fromDecimals: number,
  toDecimals: number,
  walletAddress: string,
  slippagePct: number = 0.5,
): Promise<SwapQuote> {
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
    provider: '1INCH',
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

export async function get0xQuote(
  chainId: number,
  fromAddress: string,
  toAddress: string,
  amountWei: string,
  fromDecimals: number,
  toDecimals: number,
  walletAddress: string,
  slippagePct: number = 0.5,
): Promise<SwapQuote> {
  const url = get0xBaseUrl(chainId);
  const slipObj = slippagePct / 100;
  const params = new URLSearchParams({
      sellToken: fromAddress,
      buyToken: toAddress,
      sellAmount: amountWei,
      takerAddress: walletAddress,
      slippagePercentage: slipObj.toString(),
  });

  const res = await fetch(`${url}?${params}`, { headers: zeroXHeaders() });
  if (!res.ok) {
      throw new Error(`0x API 오류 (${res.status})`);
  }
  const data = await res.json();
  
  const toAmountWei = data.buyAmount || '0';
  const gasUsed = parseInt(data.estimatedGas || '200000');
  const gasPriceGwei = parseInt(data.gasPrice || '30000000000') / 1e9;
  const estimatedGasUsd = (gasUsed * gasPriceGwei * 1e-9) * 3000;

  const route: RouteProtocol[] = [];
  if (data.sources) {
      for (const src of data.sources) {
          if (parseFloat(src.proportion) > 0) {
              route.push({ name: src.name.toUpperCase(), part: Math.round(parseFloat(src.proportion) * 100) });
          }
      }
  }
  route.sort((a,b) => b.part - a.part);

  return {
      provider: '0X',
      fromToken: { symbol: '', address: fromAddress, decimals: fromDecimals },
      toToken:   { symbol: '', address: toAddress,   decimals: toDecimals },
      fromAmount: amountWei,
      toAmount:   toAmountWei,
      toAmountDisplay: fromWei(toAmountWei, toDecimals),
      estimatedGasUsd: parseFloat(estimatedGasUsd.toFixed(4)),
      priceImpact: parseFloat(data.estimatedPriceImpact || '0'), 
      route,
      tx: { from: walletAddress, to: data.to, data: data.data, value: data.value, gas: data.estimatedGas || '200000', gasPrice: data.gasPrice || '30000000000' },
  };
}

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

  const promises = [
    get1inchQuote(chainId, fromAddress, toAddress, amountWei, fromDecimals, toDecimals, walletAddress, slippagePct)
  ];

  // 0x API 지원 체인이면 동시 호출
  if ([CHAIN_IDS.ETHEREUM, CHAIN_IDS.POLYGON, CHAIN_IDS.BASE].includes(chainId)) {
    promises.push(get0xQuote(chainId, fromAddress, toAddress, amountWei, fromDecimals, toDecimals, walletAddress, slippagePct));
  }

  const results = await Promise.allSettled(promises);
  const validQuotes = results
    .filter((r): r is PromiseFulfilledResult<SwapQuote> => r.status === 'fulfilled')
    .map(r => r.value);

  if (validQuotes.length === 0) {
    const err = results[0].status === 'rejected' ? results[0].reason : new Error('견적 조회 실패');
    throw err;
  }

  // toAmount(출력량)가 가장 큰 것을 선택
  validQuotes.sort((a, b) => (BigInt(b.toAmount) > BigInt(a.toAmount) ? 1 : -1));

  return validQuotes[0];
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

// ─── DEX Route (tx 없이 빠른 경로 조회) ──────────────────────────────────────
// /quote 엔드포인트 사용 — InputStep 실시간 표시용
// getSwapQuote와 달리 tx 데이터 없음 → 빠름

export interface DEXRouteResult {
  chainId: number;
  fromSymbol: string;
  toSymbol: string;
  fromAmountDisplay: string;
  toAmountDisplay: string;
  estimatedGasUsd: number;
  routes: RouteProtocol[];     // DEX별 비중 (part 합계 = 100)
  fetchedAt: number;
  // Feature 5: 유동성
  liquidityUsd: number | null;    // 주요 풀 TVL (USD)
  volume24hUsd: number | null;    // 24h 거래량 (USD)
  priceImpactPct: number | null;  // 내 금액 기준 price impact %
}

// DEX 이름 → 사람이 읽기 좋은 레이블
const DEX_LABELS: Record<string, string> = {
  UNISWAP_V3:          'Uniswap V3',
  UNISWAP_V2:          'Uniswap V2',
  CURVE:               'Curve',
  CURVE_V2:            'Curve V2',
  BALANCER_V2:         'Balancer V2',
  BALANCER:            'Balancer',
  SUSHI:               'SushiSwap',
  PMM2:                'PMM2',
  PMM4:                'PMM4',
  PMM7:                'PMM7',
  PMM13:               'PMM13',
  PMM14:               '1inch PMM',
  ONE_INCH_LIMIT_ORDER:'1inch LO',
  DODO:                'DODO',
  DODO_V2:             'DODO V2',
  PANCAKESWAP:         'PancakeSwap',
  KYBERSWAP_ELASTIC:   'KyberSwap',
  MAVERICK_V1:         'Maverick V1',
};

export function getDexLabel(name: string): string {
  return DEX_LABELS[name] || name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// DEX별 색상 (비중 바 색상용)
export function getDexColor(name: string): string {
  if (name.includes('UNISWAP'))  return '#FF007A';
  if (name.includes('CURVE'))    return '#3466AA';
  if (name.includes('BALANCER')) return '#1E1E1E';
  if (name.includes('SUSHI'))    return '#0993EC';
  if (name.includes('PMM') || name.includes('ONE_INCH')) return '#1B314E';
  if (name.includes('DODO'))     return '#FFE804';
  return '#6B7280';
}

export async function getSwapRoute(
  chainId: number,
  fromAddress: string,
  toAddress: string,
  fromAmount: string,
  fromDecimals: number,
  toDecimals: number,
  fromSymbol: string,
  toSymbol: string,
): Promise<DEXRouteResult | null> {
  const amountWei = toWei(fromAmount, fromDecimals);
  if (amountWei === '0') return null;

  try {
    const params = new URLSearchParams({
      src: fromAddress,
      dst: toAddress,
      amount: amountWei,
      includeProtocols: 'true',
      includeGas: 'true',
    });

    const res = await fetch(
      `${ONEINCH_BASE}/${chainId}/quote?${params}`,
      { headers: oneinchHeaders() }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const toAmountWei: string = data.dstAmount || data.toAmount || '0';

    // protocols 파싱 — 1inch는 [[[ ]]] 3중 배열
    const routes: RouteProtocol[] = [];
    if (data.protocols?.[0]) {
      for (const hop of data.protocols[0]) {
        for (const pool of hop) {
          const existing = routes.find(r => r.name === pool.name);
          if (existing) {
            existing.part += pool.part;
          } else {
            routes.push({ name: pool.name, part: pool.part });
          }
        }
      }
    }

    // part 합계 100으로 정규화
    const totalPart = routes.reduce((s, r) => s + r.part, 0);
    if (totalPart > 0 && totalPart !== 100) {
      routes.forEach(r => { r.part = Math.round((r.part / totalPart) * 100); });
    }

    // part 내림차순 정렬
    routes.sort((a, b) => b.part - a.part);

    const gasUsd = data.estimatedGas
      ? (data.estimatedGas * 30e-9 * 3000)
      : 0;

    // Feature 5: 유동성 데이터 병렬 fetch
    const poolAddr = getPoolAddress(toAddress);
    const liquidityData = poolAddr
      ? await fetchPoolLiquidity(poolAddr).catch(() => null)
      : null;

    // price impact 계산
    const fromAmountNum = parseFloat(fromAmount) || 0;
    const toAmountNum   = parseFloat(fromWei(toAmountWei, toDecimals)) || 0;
    // toAddress가 RWA 토큰이므로 output 기준으로 계산
    const priceImpact   = data.toAmountMinusFee
      ? calcPriceImpact(
          fromAmountNum,
          toAmountNum,
          toAmountNum > 0 ? fromAmountNum / toAmountNum : 1,
        )
      : null;

    return {
      chainId,
      fromSymbol,
      toSymbol,
      fromAmountDisplay: fromAmount,
      toAmountDisplay: fromWei(toAmountWei, toDecimals),
      estimatedGasUsd: parseFloat(gasUsd.toFixed(4)),
      routes,
      fetchedAt: Date.now(),
      liquidityUsd:   liquidityData?.liquidityUsd   ?? null,
      volume24hUsd:   liquidityData?.volume24hUsd   ?? null,
      priceImpactPct: priceImpact,
    };
  } catch (e) {
    console.warn('[swapService] getSwapRoute 실패:', e);
    return null;
  }
}

// ─── Feature 5: 유동성 / 풀 깊이 ────────────────────────────────────────────
// Uniswap V3 Subgraph (무료, API key 불필요)
// 풀 주소: RWA 자산별 주요 USDC 페어 풀

const UNISWAP_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3';
const UNISWAP_SUBGRAPH_BASE = 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-base';

// RWA 토큰별 Uniswap V3 USDC 페어 풀 주소 (Ethereum mainnet)
// 풀 주소 없는 자산은 null → TVL fetch 스킵
const RWA_POOL_ADDRESSES: Record<string, string | null> = {
  // USDY/USDC Uniswap V3 (0.05% tier)
  '0x96F6eF951840721AdBF46Ac996b59E0235CB985C': '0x4dd6CaF2bB97FBC8A4DB09Ad050A671Cb5477C3',
  // PAXG/USDC Uniswap V3
  '0x45804880De22913dAFE09f4980848ECE6EcbAf78': '0xc7d485cb5EF02AC8A2D88AB2d5d7e680e0d9aFd8',
  // XAUt/USDC — 유동성 희박, null 처리
  '0x68749665FF8D2d112Fa859AA293F07A622782F38': null,
  // OUSG — OTC 위주, DEX 풀 미미
  '0x1B19C19393e2d034D8Ff31ff34c81252FcBbee92': null,
};

export interface PoolLiquidity {
  liquidityUsd: number;
  volume24hUsd: number;
  feeTier: number;        // 예: 500 = 0.05%
  token0Symbol: string;
  token1Symbol: string;
}

// Uniswap V3 Subgraph에서 풀 TVL + 24h Volume 조회
export async function fetchPoolLiquidity(
  poolAddress: string,
  subgraphUrl = UNISWAP_SUBGRAPH,
): Promise<PoolLiquidity | null> {
  try {
    const query = `{
      pool(id: "${poolAddress.toLowerCase()}") {
        totalValueLockedUSD
        volumeUSD
        feeTier
        token0 { symbol }
        token1 { symbol }
        poolDayData(first: 1, orderBy: date, orderDirection: desc) {
          volumeUSD
        }
      }
    }`;

    const res = await fetch(subgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const pool = json?.data?.pool;
    if (!pool) return null;

    return {
      liquidityUsd:  parseFloat(pool.totalValueLockedUSD || '0'),
      volume24hUsd:  parseFloat(pool.poolDayData?.[0]?.volumeUSD || '0'),
      feeTier:       parseInt(pool.feeTier || '3000'),
      token0Symbol:  pool.token0?.symbol || '',
      token1Symbol:  pool.token1?.symbol || '',
    };
  } catch (e) {
    console.warn('[fetchPoolLiquidity] 실패:', e);
    return null;
  }
}

// 유동성 표시용 포맷 헬퍼
export function formatLiquidity(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(2)}B`;
  if (usd >= 1_000_000)     return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000)         return `$${(usd / 1_000).toFixed(1)}K`;
  return `$${usd.toFixed(0)}`;
}

// 유동성 수준 레이블 + 색상
export function getLiquidityLevel(usd: number): { label: string; color: string } {
  if (usd >= 50_000_000)  return { label: '매우 높음', color: 'text-emerald-400' };
  if (usd >= 10_000_000)  return { label: '높음',     color: 'text-emerald-400' };
  if (usd >= 1_000_000)   return { label: '보통',     color: 'text-teal-400'  };
  if (usd >= 100_000)     return { label: '낮음',     color: 'text-blue-400'  };
  return                         { label: '매우 낮음', color: 'text-red-400'     };
}

// price impact % 계산 (1inch quote의 toAmountMinusFee 활용)
// impact = (midprice_output - actual_output) / midprice_output * 100
export function calcPriceImpact(
  inputUsd: number,
  outputTokens: number,
  tokenPriceUsd: number,
): number {
  if (!inputUsd || !outputTokens || !tokenPriceUsd) return 0;
  const midOutput  = inputUsd / tokenPriceUsd;       // 슬리피지 없을 때 수령량
  const impact     = ((midOutput - outputTokens) / midOutput) * 100;
  return Math.max(0, parseFloat(impact.toFixed(3)));
}

// RWA 토큰 주소로 풀 주소 조회 헬퍼
export function getPoolAddress(tokenAddress: string): string | null {
  return RWA_POOL_ADDRESSES[tokenAddress] ?? null;
}