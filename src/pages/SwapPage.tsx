// src/pages/SwapPage.tsx
// [Phase 3 Final v3]
// ChartPanel: lightweight-charts 캔들스틱으로 교체
// PC: 3컬럼 DEX 레이아웃 / Mobile: 스택

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ArrowRightLeft, ChevronDown, Loader2, AlertCircle,
  Check, AlertTriangle, RefreshCw, TrendingUp, TrendingDown,
  Zap, ExternalLink, ChevronUp, Activity, Search
} from "lucide-react";
import { useActiveAccount } from "thirdweb/react";
import { getMyWallets } from "../services/walletService";
import type { WalletSlot, WalletAsset } from "../services/walletService";
import { fetchCryptoPrices } from "../services/priceService";
import type { PriceData } from "../services/priceService";
import { TOKEN_LIST, getChainIdByNetwork } from "../constants/tokens";
import type { Token } from "../constants/tokens";
import { TokenSelectModal } from "../components/TokenSelectModal";

import {
  getSwapQuote, executeSwap, getOHLCHistory,
  checkAllowance, buildApprovalTx, EXPLORER
} from "../services/swapService";
import type { SwapQuote, OHLCPoint, RouteProtocol } from "../services/swapService";

// ─── 주요 자산 마스터 목록 ────────────────────────────────────────────────────

interface MarketAsset {
  symbol: string;
  name: string;
  color: string;
  tokenAddress: string;
  decimals: number;
  chainId: number;
}

const MARKET_ASSETS: MarketAsset[] = [
  { symbol: 'ETH',  name: 'Ethereum', color: 'cyan',   tokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', decimals: 18, chainId: 1 },
  { symbol: 'BTC',  name: 'Bitcoin',  color: 'blue', tokenAddress: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', decimals: 8,  chainId: 1 },
  { symbol: 'SOL',  name: 'Solana',   color: 'purple', tokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', decimals: 9,  chainId: 1 },
  { symbol: 'POL',  name: 'Polygon',  color: 'violet', tokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', decimals: 18, chainId: 137 },
  { symbol: 'USDC', name: 'USD Coin', color: 'blue',   tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6,  chainId: 1 },
  { symbol: 'USDT', name: 'Tether',   color: 'green',  tokenAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6,  chainId: 1 },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type InputMode = 'TOKEN' | 'KRW' | 'USD';
type ChartRange = '7D' | '14D' | '30D' | '90D';

const CHART_DAYS: Record<ChartRange, 1 | 7 | 14 | 30 | 90> = {
  '7D': 7, '14D': 14, '30D': 30, '90D': 90,
};

const FX_THRESHOLD_USD = 10_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(price: number, currency: 'usd' | 'krw', rate: number) {
  if (currency === 'krw')
    return `₩${(price * rate).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;
  return price >= 1
    ? `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${price.toFixed(6)}`;
}

function getAssetPrice(symbol: string, prices: PriceData | null): number {
  if (!prices) return 0;
  const s = symbol.toLowerCase();
  const t = prices.tokens;
  if (s === 'eth')  return t.eth.usd;
  if (s === 'btc')  return t.btc.usd;
  if (s === 'sol')  return t.sol.usd;
  if (s === 'pol' || s === 'matic') return t.pol.usd;
  if (s === 'usdc') return t.usdc.usd;
  if (s === 'usdt') return t.usdt.usd;
  return 0;
}

function getAssetChange(symbol: string, prices: PriceData | null): number {
  if (!prices) return 0;
  const s = symbol.toLowerCase();
  const t = prices.tokens;
  if (s === 'eth')  return t.eth.change;
  if (s === 'btc')  return t.btc.change;
  if (s === 'sol')  return t.sol.change;
  if (s === 'pol' || s === 'matic') return t.pol.change;
  return 0;
}

// ─── AssetRow ─────────────────────────────────────────────────────────────────

function AssetRow({ asset, price, change, isSelected, onClick }: {
  asset: MarketAsset; price: number; change: number; isSelected: boolean; onClick: () => void;
}) {
  const isUp = change >= 0;
  return (
    <button onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-left
        ${isSelected ? 'bg-slate-700/70 border border-slate-600' : 'hover:bg-slate-800/50 border border-transparent'}`}>
      <div className="flex items-center gap-2.5">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black
          bg-${asset.color}-500/15 border border-${asset.color}-500/30 text-${asset.color}-400`}>
          {asset.symbol.slice(0, 2)}
        </div>
        <div>
          <p className="text-xs font-bold text-white leading-none">{asset.symbol}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{asset.name}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xs font-bold text-white font-mono">
          {price > 0 ? (price >= 1 ? `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : `$${price.toFixed(4)}`) : '—'}
        </p>
        {change !== 0 && (
          <p className={`text-[10px] font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
            {isUp ? '+' : ''}{change.toFixed(2)}%
          </p>
        )}
      </div>
    </button>
  );
}

// ─── RouteBadge ───────────────────────────────────────────────────────────────

function RouteBadge({ name, part }: { name: string; part: number }) {
  const short = name
    .replace('_V', 'v').replace('UNISWAP', 'UNI')
    .replace('BALANCER', 'BAL').replace('CURVE', 'CRV').replace('SUSHISWAP', 'SUSHI');
  return (
    <span className="flex items-center gap-1 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full text-[10px] font-bold text-slate-300">
      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
      {short} {part}%
    </span>
  );
}

// ─── CandleChart ─────────────────────────────────────────────────────────────
// lightweight-charts를 직접 DOM에 마운트
// React state 대신 ref + imperativeHandle 패턴

interface CandleChartProps {
  data: OHLCPoint[];
  height?: number;
}

function CandleChart({ data, height = 260 }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let chart: any;
    let canceled = false;

    // lightweight-charts를 동적 import (SSR 안전 + 번들 분리)
    import('lightweight-charts').then(({ createChart, CandlestickSeries, CrosshairMode }) => {
      if (canceled || !containerRef.current) return;

      // 이미 있으면 제거
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      chart = createChart(containerRef.current, {
        width:  containerRef.current.clientWidth,
        height: height,
        layout: {
          background: { color: 'transparent' },
          textColor: '#64748b',
        },
        grid: {
          vertLines: { color: '#1e293b', style: 1 },
          horzLines: { color: '#1e293b', style: 1 },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: '#334155', labelBackgroundColor: '#1e293b' },
          horzLine: { color: '#334155', labelBackgroundColor: '#1e293b' },
        },
        rightPriceScale: {
          borderColor: '#1e293b',
          textColor: '#64748b',
          autoScale: true,
          scaleMargins: {
            top: 0.05,
            bottom: 0.05,
          },
        },
        timeScale: {
          borderColor: '#1e293b',
          timeVisible: true,
          secondsVisible: false,
          fixLeftEdge: true,
          fixRightEdge: true,
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
        handleScale:  { mouseWheel: true, pinch: true },
      });

      const series = chart.addSeries(CandlestickSeries, {
        upColor:          '#22d3ee',
        downColor:        '#f87171',
        borderUpColor:    '#22d3ee',
        borderDownColor:  '#f87171',
        wickUpColor:      '#22d3ee',
        wickDownColor:    '#f87171',
        borderVisible:    true,
        wickVisible:      true,
      });

      if (data.length > 0) {
        series.setData(data);
        chart.timeScale().fitContent();
      }

      chartRef.current  = chart;
      seriesRef.current = series;

      // 리사이즈 대응
      const ro = new ResizeObserver(entries => {
        const entry = entries[0];
        if (entry && chartRef.current) {
          chartRef.current.applyOptions({
            width: entry.contentRect.width,
            height: entry.contentRect.height > 0 ? entry.contentRect.height : height
          });
        }
      });
      ro.observe(containerRef.current);

      // cleanup에서 ro도 해제
      (chart as any).__ro = ro;
    });

    return () => {
      canceled = true;
      if (chart) {
        (chart as any).__ro?.disconnect();
        chart.remove();
        chartRef.current  = null;
        seriesRef.current = null;
      }
    };
  }, []); // 차트 인스턴스는 최초 1회만 생성

  // 데이터만 바뀌면 setData로 업데이트
  useEffect(() => {
    if (seriesRef.current && data.length > 0) {
      seriesRef.current.setData(data);
      chartRef.current?.timeScale().fitContent();
    }
  }, [data]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: `${height}px` }}
      className="rounded-xl overflow-hidden"
    />
  );
}

// ─── ChartPanel ───────────────────────────────────────────────────────────────

function ChartPanel({ asset, prices, chartHeight = 260 }: { asset: MarketAsset; prices: PriceData | null; chartHeight?: number }) {
  const [ohlcData, setOhlcData]     = useState<OHLCPoint[]>([]);
  const [chartRange, setChartRange] = useState<ChartRange>('30D');
  const [currency, setCurrency]     = useState<'usd' | 'krw'>('usd');
  const [loading, setLoading]       = useState(false);
  const fetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rate = prices?.exchangeRate || 1450;

  useEffect(() => {
    if (fetchRef.current) clearTimeout(fetchRef.current);
    fetchRef.current = setTimeout(() => {
      setLoading(true);
      getOHLCHistory(asset.symbol, CHART_DAYS[chartRange], currency)
        .then(d => {
          // KRW 환산: CoinGecko KRW OHLC가 있지만 환율 곱셈도 동일 결과
          // currency='krw' 로 직접 요청하므로 별도 변환 불필요
          setOhlcData(d);
        })
        .catch(() => setOhlcData([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => { if (fetchRef.current) clearTimeout(fetchRef.current); };
  }, [asset.symbol, chartRange, currency]);

  const price    = getAssetPrice(asset.symbol, prices);
  const change   = getAssetChange(asset.symbol, prices);
  const isUp     = change >= 0;

  // OHLC 기간 통계
  const stats = useMemo(() => {
    if (ohlcData.length < 2) return null;
    const high  = Math.max(...ohlcData.map(d => d.high));
    const low   = Math.min(...ohlcData.map(d => d.low));
    const open  = ohlcData[0].open;
    const close = ohlcData[ohlcData.length - 1].close;
    const pct   = ((close - open) / open) * 100;
    return { high, low, open, close, pct, isUp: pct >= 0 };
  }, [ohlcData]);

  return (
    <div className="flex flex-col h-full">

      {/* 헤더 */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 mb-2">
            <div className={`w-9 h-9 rounded-full bg-${asset.color}-500/15 border border-${asset.color}-500/30 flex items-center justify-center text-sm font-black text-${asset.color}-400 shrink-0`}>
              {asset.symbol.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <span className="text-lg font-black text-white">{asset.symbol}</span>
              <span className="text-xs text-slate-500 ml-2 truncate">{asset.name}</span>
            </div>
          </div>
          <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1">
            <p className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight break-words">
              {fmtPrice(price, currency, rate)}
            </p>
            <span className={`flex items-center gap-1 text-sm font-bold mb-1 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
              {isUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {isUp ? '+' : ''}{change.toFixed(2)}%
              <span className="text-slate-500 text-xs font-normal ml-0.5">24h</span>
            </span>
          </div>
        </div>

        {/* 통화 토글 */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex bg-slate-800 rounded-xl p-0.5">
            {(['usd', 'krw'] as const).map(c => (
              <button key={c} onClick={() => setCurrency(c)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${currency === c ? 'bg-slate-600 text-white' : 'text-slate-500'}`}>
                {c.toUpperCase()}
              </button>
            ))}
          </div>
          {stats && (
            <div className="text-right space-y-0.5">
              <p className="text-[10px] text-slate-500">H <span className="text-emerald-400 font-mono">{fmtPrice(stats.high, currency, rate)}</span></p>
              <p className="text-[10px] text-slate-500">L <span className="text-red-400 font-mono">{fmtPrice(stats.low, currency, rate)}</span></p>
            </div>
          )}
        </div>
      </div>

      {/* 캔들 차트 */}
      <div className="relative mb-3 flex-shrink-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 rounded-xl z-10">
            <Loader2 size={18} className="animate-spin text-cyan-400" />
          </div>
        )}
        {ohlcData.length > 0
          ? <CandleChart data={ohlcData} height={chartHeight} />
          : !loading && (
            <div style={{ height: chartHeight }} className="flex items-center justify-center text-xs text-slate-600 rounded-xl bg-slate-900/40">
              데이터 없음
            </div>
          )
        }
      </div>

      {/* 기간 선택 */}
      <div className="flex gap-1.5 mb-4">
        {(['7D', '14D', '30D', '90D'] as ChartRange[]).map(r => (
          <button key={r} onClick={() => setChartRange(r)}
            className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-all
              ${chartRange === r ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}>
            {r}
          </button>
        ))}
      </div>

      {/* 기간 통계 */}
      {stats && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl px-3 py-2.5">
            <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">기간 변동 ({chartRange})</p>
            <p className={`text-sm font-bold ${stats.isUp ? 'text-emerald-400' : 'text-red-400'}`}>
              {stats.isUp ? '+' : ''}{stats.pct.toFixed(2)}%
            </p>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl px-3 py-2.5">
            <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">24h 변동</p>
            <p className={`text-sm font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
              {isUp ? '+' : ''}{change.toFixed(2)}%
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SwapPanel ────────────────────────────────────────────────────────────────

interface SwapPanelProps {
  selectedAsset: MarketAsset;
  prices: PriceData | null;
  wallets: WalletSlot[];
  selectedWallet: WalletSlot | null;
  onWalletChange: (w: WalletSlot) => void;
}

function SwapPanel({ selectedAsset, prices, wallets, selectedWallet, onWalletChange }: SwapPanelProps) {
  const smartAccount = useActiveAccount();

  const [fromAsset, setFromAsset]   = useState<WalletAsset | null>(null);
  const [toToken, setToToken]       = useState<Token | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [inputMode, setInputMode]   = useState<InputMode>('TOKEN');
  const [slippage, setSlippage]     = useState(0.5);
  const [showSettings, setShowSettings] = useState(false);
  const [isFromModalOpen, setIsFromModalOpen] = useState(false);
  const [isToModalOpen, setIsToModalOpen]     = useState(false);

  const [quote, setQuote]           = useState<SwapQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [swapping, setSwapping]     = useState(false);
  const [txHash, setTxHash]         = useState<string | null>(null);
  const quoteRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fxReason, setFxReason]     = useState("");

  // 선택 자산 → toToken 자동 설정
  useEffect(() => {
    const found = TOKEN_LIST.find(t => t.symbol === selectedAsset.symbol && t.chainId === selectedAsset.chainId);
    if (found) setToToken(found);
  }, [selectedAsset]);

  const myAssets = useMemo(() => {
    if (!selectedWallet) return [];
    if (selectedWallet.assets?.length) return selectedWallet.assets;
    if (selectedWallet.addresses.evm)
      return [{ symbol: 'ETH', name: 'Ethereum', balance: selectedWallet.balances.evm || 0, price: prices?.tokens.eth.usd || 0, value: 0, change: 0, network: 'Sepolia', isNative: true } as WalletAsset];
    return [];
  }, [selectedWallet, prices]);

  useEffect(() => { if (myAssets.length && !fromAsset) setFromAsset(myAssets[0]); }, [myAssets]);

  const finalSellAmount = useMemo(() => {
    if (!amountInput || !fromAsset) return "0";
    const val = parseFloat(amountInput);
    if (isNaN(val)) return "0";
    const rate = prices?.exchangeRate || 1450;
    if (inputMode === 'TOKEN') return amountInput;
    if (inputMode === 'KRW')   return fromAsset.price * rate > 0 ? (val / (fromAsset.price * rate)).toFixed(6) : "0";
    if (inputMode === 'USD')   return fromAsset.price > 0 ? (val / fromAsset.price).toFixed(6) : "0";
    return "0";
  }, [amountInput, inputMode, fromAsset, prices]);

  const swapValueUsd = useMemo(() =>
    !fromAsset ? 0 : parseFloat(finalSellAmount || '0') * (fromAsset.price || 0),
    [finalSellAmount, fromAsset]);

  const convertedDisplay = useMemo(() => {
    if (!finalSellAmount || !fromAsset || finalSellAmount === '0') return "";
    const amt  = parseFloat(finalSellAmount);
    const rate = prices?.exchangeRate || 1450;
    if (inputMode === 'TOKEN') return `≈ ₩${(amt * fromAsset.price * rate).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;
    return `≈ ${finalSellAmount} ${fromAsset.symbol}`;
  }, [finalSellAmount, inputMode, fromAsset, prices]);

  // 1inch 견적
  const fetchQuote = useCallback(async () => {
    if (!fromAsset || !toToken || !finalSellAmount || finalSellAmount === '0' || !selectedWallet?.addresses?.evm) {
      setQuote(null); return;
    }
    const chainId  = getChainIdByNetwork(fromAsset.network);
    const fromAddr = fromAsset.isNative ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' : (fromAsset as any).address || '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    setQuoteLoading(true); setQuoteError(null);
    try {
      const q = await getSwapQuote(chainId, fromAddr, toToken.address, finalSellAmount,
        fromAsset.isNative ? 18 : (fromAsset as any).decimals || 18,
        toToken.decimals, selectedWallet.addresses.evm!, slippage);
      q.fromToken.symbol = fromAsset.symbol;
      q.toToken.symbol   = toToken.symbol;
      setQuote(q);
    } catch (e: any) {
      setQuoteError(e.message || '견적 조회 실패'); setQuote(null);
    } finally { setQuoteLoading(false); }
  }, [fromAsset, toToken, finalSellAmount, selectedWallet, slippage]);

  useEffect(() => {
    if (quoteRef.current) clearTimeout(quoteRef.current);
    quoteRef.current = setTimeout(fetchQuote, 700);
    return () => { if (quoteRef.current) clearTimeout(quoteRef.current); };
  }, [fetchQuote]);

  const EVM_WALLET_TYPES = ['XLOT', 'XLOT_SSS', 'METAMASK', 'RABBY', 'WALLETCONNECT', 'BYBIT', 'BITGET', 'TRUST'];
  const canSwap   = EVM_WALLET_TYPES.includes(selectedWallet?.wallet_type || '');
  const fxOk      = swapValueUsd < FX_THRESHOLD_USD || fxReason.trim().length >= 5;
  const canSubmit = canSwap && finalSellAmount !== '0' && !!toToken && fxOk && !!quote && !quoteLoading;

  const handleSwap = async () => {
    if (!canSubmit || !smartAccount || !quote) return;
    setSwapping(true);
    try {
      const chainId = getChainIdByNetwork(fromAsset!.network);
      if (!fromAsset!.isNative && selectedWallet?.addresses?.evm) {
        const addr      = (fromAsset as any).address;
        const allowance = await checkAllowance(chainId, addr, selectedWallet.addresses.evm);
        if (BigInt(allowance) < BigInt(quote.fromAmount)) {
          const apTx = await buildApprovalTx(chainId, addr);
          const win  = window as any;
          await win.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: selectedWallet.addresses.evm, to: apTx.to, data: apTx.data, value: '0x0' }] });
          await new Promise(r => setTimeout(r, 3000));
        }
      }
      const hash = await executeSwap(quote, (window as any).ethereum);
      setTxHash(hash); setAmountInput(""); setQuote(null);
    } catch (e: any) {
      if (!e.message?.includes('rejected')) alert('스왑 실패: ' + e.message);
    } finally { setSwapping(false); }
  };

  const availableBuyTokens = useMemo(() => {
    if (!fromAsset) return TOKEN_LIST;
    const chainId  = getChainIdByNetwork(fromAsset.network);
    const filtered = TOKEN_LIST.filter(t => t.chainId === chainId && t.symbol !== fromAsset.symbol);
    return filtered.length ? filtered : TOKEN_LIST;
  }, [fromAsset]);

  return (
    <div className="flex flex-col gap-3">

      {/* TX 성공 */}
      {txHash && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check size={13} className="text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400">스왑 완료</span>
          </div>
          <a href={`${EXPLORER[getChainIdByNetwork(fromAsset?.network)] || ''}${txHash}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white font-mono">
            {txHash.slice(0, 8)}...{txHash.slice(-6)} <ExternalLink size={9} />
          </a>
          <button onClick={() => setTxHash(null)} className="text-slate-500 text-xs">✕</button>
        </div>
      )}

      {/* 지갑 + 슬리피지 */}
      <div className="flex items-center justify-between gap-2">
        <select value={selectedWallet?.id || ''}
          onChange={e => { const w = wallets.find(w => w.id === e.target.value); if (w) onWalletChange(w); }}
          className="flex-1 bg-slate-800 border border-slate-700 text-xs text-white rounded-xl px-3 py-2 outline-none truncate">
          {wallets.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
        <button onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl whitespace-nowrap">
          {slippage}% {showSettings ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
      </div>

      {showSettings && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3">
          <p className="text-[10px] text-slate-500 font-bold mb-2 uppercase tracking-wider">슬리피지</p>
          <div className="flex gap-2">
            {[0.1, 0.5, 1.0, 3.0].map(s => (
              <button key={s} onClick={() => setSlippage(s)}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${slippage === s ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                {s}%
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pay */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pay</span>
          <span className="text-[10px] text-slate-500">
            {fromAsset?.balance.toFixed(6) || '0'} {fromAsset?.symbol}
            <button onClick={() => setAmountInput(fromAsset?.balance.toString() || '')}
              className="ml-1.5 text-cyan-400 font-bold hover:text-cyan-300"> MAX</button>
          </span>
        </div>
        <div className="flex gap-3 items-center">
          <button onClick={() => setIsFromModalOpen(true)}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 transition-all shrink-0">
            <div className="w-6 h-6 rounded-full bg-cyan-500/15 flex items-center justify-center text-[10px] font-bold text-cyan-400">
              {fromAsset?.symbol?.[0] || 'E'}
            </div>
            <span className="text-sm font-bold text-white">{fromAsset?.symbol || 'ETH'}</span>
            <ChevronDown size={11} className="text-slate-500" />
          </button>
          <input type="number" value={amountInput} onChange={e => setAmountInput(e.target.value)}
            placeholder="0.0"
            className="flex-1 bg-transparent text-right text-2xl font-black text-white outline-none placeholder-slate-700 min-w-0" />
        </div>
        <div className="flex justify-between mt-2">
          <button onClick={() => setInputMode(p => p === 'TOKEN' ? 'KRW' : p === 'KRW' ? 'USD' : 'TOKEN')}
            className="text-[10px] text-cyan-400/60 hover:text-cyan-400 flex items-center gap-1">
            <ArrowRightLeft size={9} />{inputMode === 'TOKEN' ? `${fromAsset?.symbol || 'TOKEN'} 기준` : `${inputMode} 기준`}
          </button>
          <span className="text-[11px] text-slate-500 font-mono">{convertedDisplay}</span>
        </div>
      </div>

      {/* Arrow */}
      <div className="flex justify-center -my-1">
        <div className="bg-slate-700 border-2 border-slate-800 rounded-xl p-1.5 text-slate-400">
          <ArrowRightLeft size={12} className="rotate-90" />
        </div>
      </div>

      {/* Receive */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Receive</span>
        <div className="flex gap-3 items-center mt-2">
          <button onClick={() => setIsToModalOpen(true)}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 transition-all shrink-0">
            <div className="w-6 h-6 rounded-full bg-blue-500/15 flex items-center justify-center text-[10px] font-bold text-blue-400">
              {toToken?.symbol?.[0] || '?'}
            </div>
            <span className="text-sm font-bold text-white">{toToken?.symbol || 'USDC'}</span>
            <ChevronDown size={11} className="text-slate-500" />
          </button>
          <div className="flex-1 text-right">
            {quoteLoading
              ? <div className="flex items-center justify-end gap-2 h-8"><Loader2 size={12} className="animate-spin text-slate-500" /><span className="text-slate-500 text-sm">조회 중</span></div>
              : <span className={`text-2xl font-black font-mono ${quote ? 'text-cyan-400' : 'text-slate-700'}`}>{quote?.toAmountDisplay || '0.0'}</span>
            }
          </div>
        </div>
      </div>

      {/* Quote Details */}
      {quote && !quoteLoading && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
          {quote.route.length > 0 && (
            <div className="px-3 py-2.5 border-b border-slate-800">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Activity size={10} className="text-slate-500" />
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">라우트</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {quote.route.slice(0, 4).map((r: RouteProtocol, i: number) => <RouteBadge key={i} name={r.name} part={r.part} />)}
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 divide-x divide-slate-800">
            <div className="px-3 py-2 text-center">
              <p className="text-[9px] text-slate-500 uppercase mb-0.5">Gas</p>
              <p className="text-[11px] font-bold text-slate-300 font-mono">${quote.estimatedGasUsd.toFixed(2)}</p>
            </div>
            <div className="px-3 py-2 text-center">
              <p className="text-[9px] text-slate-500 uppercase mb-0.5">슬리피지</p>
              <p className="text-[11px] font-bold text-slate-300 font-mono">{slippage}%</p>
            </div>
            <div className="px-3 py-2 text-center">
              <p className="text-[9px] text-slate-500 uppercase mb-0.5">체인</p>
              <p className="text-[11px] font-bold text-slate-300">{fromAsset?.network || 'ETH'}</p>
            </div>
          </div>
          <div className="px-3 py-1.5 flex justify-end border-t border-slate-800">
            <button onClick={fetchQuote} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-cyan-400 transition-colors">
              <RefreshCw size={9} /> 갱신
            </button>
          </div>
        </div>
      )}

      {quoteError && (
        <div className="px-4 py-3 bg-blue-500/8 border border-blue-500/20 rounded-2xl">
          <p className="text-[11px] text-blue-400">{quoteError}</p>
        </div>
      )}

      {/* FX */}
      {swapValueUsd >= FX_THRESHOLD_USD && canSwap && (
        <div className="bg-cyan-500/8 border border-cyan-500/30 rounded-2xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={12} className="text-cyan-400 shrink-0" />
            <p className="text-[11px] font-bold text-cyan-400">외국환거래법 제18조 — 거래 목적 입력 필수</p>
          </div>
          <textarea value={fxReason} onChange={e => setFxReason(e.target.value)}
            placeholder="거래 목적 (최소 5자)" rows={2}
            className="w-full bg-slate-950 text-white text-xs p-2.5 rounded-xl border border-cyan-500/30 focus:border-cyan-400 outline-none resize-none placeholder-slate-600" />
        </div>
      )}

      {/* Action */}
      {!canSwap && selectedWallet ? (
        <div className="flex flex-col items-center gap-2 p-4 bg-blue-500/8 border border-blue-500/20 rounded-2xl text-center">
          <AlertCircle size={18} className="text-blue-400" />
          <p className="text-xs font-bold text-blue-400">스왑 미지원 지갑</p>
          <p className="text-[10px] text-slate-400">took 및 EVM 호환지갑(MetaMask, Rabby 등)만 지원</p>
        </div>
      ) : (
        <button onClick={handleSwap} disabled={!canSubmit || swapping}
          className="w-full py-3.5 rounded-2xl font-black text-sm text-white bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 hover:shadow-[0_0_30px_rgba(34,211,238,0.2)] disabled:opacity-40 disabled:shadow-none transition-all shadow-lg">
          {swapping
            ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> 전송 중...</span>
            : quoteLoading
            ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> 견적 조회 중...</span>
            : <span className="flex items-center justify-center gap-2"><Zap size={14} /> SWAP {toToken?.symbol}</span>
          }
        </button>
      )}

      {/* Modals */}
      <TokenSelectModal isOpen={isToModalOpen} onClose={() => setIsToModalOpen(false)} onSelect={setToToken} tokens={availableBuyTokens} />

      {isFromModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-end justify-center p-4">
          <div className="bg-slate-900 w-full max-w-sm rounded-3xl p-5 border border-slate-800 max-h-[60vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-white text-sm">보낼 자산</h3>
              <button onClick={() => setIsFromModalOpen(false)} className="text-slate-400">✕</button>
            </div>
            {myAssets.map((asset, i: number) => (
              <button key={i} onClick={() => { setFromAsset(asset); setIsFromModalOpen(false); setQuote(null); setAmountInput(''); }}
                className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between mb-2 transition-all
                  ${fromAsset?.symbol === asset.symbol ? 'bg-slate-800 border-cyan-500' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-cyan-400">{asset.symbol[0]}</div>
                  <div>
                    <p className="text-sm font-bold text-white">{asset.symbol}</p>
                    <p className="text-[10px] text-slate-500">{asset.network}</p>
                  </div>
                </div>
                <p className="text-sm font-bold text-white font-mono">{asset.balance.toFixed(4)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SwapPage() {
  const smartAccount = useActiveAccount();

  const [wallets, setWallets]               = useState<WalletSlot[]>([]);
  const [prices, setPrices]                 = useState<PriceData | null>(null);
  const [isLoading, setIsLoading]           = useState(true);
  const [selectedWallet, setSelectedWallet] = useState<WalletSlot | null>(null);
  const [selectedAsset, setSelectedAsset]   = useState<MarketAsset>(MARKET_ASSETS[0]);
  const [assetSearch, setAssetSearch]       = useState("");

  useEffect(() => {
    if (!smartAccount) return;
    (async () => {
      try {
        const [wList, pData] = await Promise.all([getMyWallets(smartAccount.address), fetchCryptoPrices()]);
        const valid = wList.filter(w => w.wallet_type !== 'UPBIT');
        setWallets(valid);
        setPrices(pData);
        setSelectedWallet(valid.find(w => w.wallet_type === 'XLOT') || valid[0]);
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
    })();
  }, [smartAccount]);

  const filteredAssets = useMemo(() =>
    MARKET_ASSETS.filter(a =>
      a.symbol.toLowerCase().includes(assetSearch.toLowerCase()) ||
      a.name.toLowerCase().includes(assetSearch.toLowerCase())
    ), [assetSearch]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-cyan-400" size={28} />
    </div>
  );

  return (
    <>
      {/* ════════════════════════════════════════
          PC 레이아웃 (md 이상)
          자산목록 | 차트 | 주문
      ════════════════════════════════════════ */}
      <div className="hidden md:flex h-[calc(100vh-64px)] overflow-hidden">

        {/* 자산 사이드바 */}
        <div className="w-52 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
          <div className="p-3 border-b border-slate-800">
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
              <Search size={11} className="text-slate-500 shrink-0" />
              <input value={assetSearch} onChange={e => setAssetSearch(e.target.value)}
                placeholder="검색" className="bg-transparent text-xs text-white outline-none w-full placeholder-slate-600" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest px-3 py-2">주요 자산</p>
            <div className="space-y-0.5">
              {filteredAssets.map(asset => (
                <AssetRow key={asset.symbol} asset={asset}
                  price={getAssetPrice(asset.symbol, prices)}
                  change={getAssetChange(asset.symbol, prices)}
                  isSelected={selectedAsset.symbol === asset.symbol}
                  onClick={() => setSelectedAsset(asset)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 차트 패널 */}
        <div className="flex-1 bg-slate-950 overflow-y-auto p-6 custom-scrollbar">
          <ChartPanel asset={selectedAsset} prices={prices} chartHeight={450} />
        </div>

        {/* 주문 패널 */}
        <div className="w-[300px] shrink-0 bg-slate-900 border-l border-slate-800 overflow-y-auto p-4 custom-scrollbar">
          <h3 className="text-sm font-black text-white flex items-center gap-2 mb-4">
            <Zap size={13} className="text-cyan-400" /> Swap
            <span className="text-[10px] font-normal text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">1inch</span>
          </h3>
          <SwapPanel selectedAsset={selectedAsset} prices={prices}
            wallets={wallets} selectedWallet={selectedWallet} onWalletChange={setSelectedWallet} />
        </div>
      </div>

      {/* ════════════════════════════════════════
          모바일 레이아웃 (md 미만)
      ════════════════════════════════════════ */}
      <div className="md:hidden pb-24">

        {/* 자산 가로 탭 */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pt-4 pb-2">
          {MARKET_ASSETS.map(asset => {
            const change     = getAssetChange(asset.symbol, prices);
            const isUp       = change >= 0;
            const isSelected = selectedAsset.symbol === asset.symbol;
            return (
              <button key={asset.symbol} onClick={() => setSelectedAsset(asset)}
                className={`flex flex-col items-center shrink-0 px-3 py-2 rounded-2xl border transition-all
                  ${isSelected ? `bg-${asset.color}-500/15 border-${asset.color}-500/40` : 'bg-slate-900 border-slate-800'}`}>
                <div className={`w-7 h-7 rounded-full bg-${asset.color}-500/10 flex items-center justify-center text-[10px] font-black text-${asset.color}-400 mb-1`}>
                  {asset.symbol.slice(0, 2)}
                </div>
                <span className={`text-xs font-bold ${isSelected ? `text-${asset.color}-300` : 'text-slate-300'}`}>{asset.symbol}</span>
                {change !== 0 && (
                  <span className={`text-[9px] font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isUp ? '+' : ''}{change.toFixed(1)}%
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 모바일 차트 */}
        <div className="mx-4 mt-2 bg-slate-900 border border-slate-800 rounded-3xl p-4">
          <ChartPanel asset={selectedAsset} prices={prices} />
        </div>

        {/* 모바일 주문 */}
        <div className="mx-4 mt-3 bg-slate-900 border border-slate-800 rounded-3xl p-4">
          <h3 className="text-sm font-black text-white flex items-center gap-2 mb-4">
            <Zap size={13} className="text-cyan-400" /> Swap
            <span className="text-[10px] font-normal text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">1inch</span>
          </h3>
          <SwapPanel selectedAsset={selectedAsset} prices={prices}
            wallets={wallets} selectedWallet={selectedWallet} onWalletChange={setSelectedWallet} />
        </div>
      </div>
    </>
  );
}