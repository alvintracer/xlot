// ============================================================
// RWASwapModal.tsx
// Feature 2: 실물 시장 vs DEX 절약 계산기
// Feature 4: 멀티 DEX 경로 실시간 표시
// Fix: credentials/hasKyc/colors 타입 오류 수정
// ============================================================

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  X, ShieldCheck, AlertCircle, ArrowRightLeft,
  Loader2, ExternalLink, Check, Info, TrendingUp, Zap
} from 'lucide-react';
import { useActiveAccount } from 'thirdweb/react';

import type { RWAAsset } from '../constants/rwaAssets';
import { RWAMarketVisualPanel } from './RWAMarketVisual';
import { RWA_LIQUIDITY_FALLBACK } from '../services/rwaService';
import { RWA_CATEGORY_COLORS, RWA_CATEGORY_LABELS } from '../constants/rwaAssets';
import { formatApy, getChainName } from '../services/rwaService';
import type { RWAPriceMap, NAVData } from '../services/rwaService';
import {
  getSwapQuote, executeSwap, checkAllowance, buildApprovalTx, EXPLORER,
  getSwapRoute, getDexLabel, getDexColor,
  formatLiquidity, getLiquidityLevel,
} from '../services/swapService';
import type { SwapQuote, DEXRouteResult } from '../services/swapService';
// Fix 1: hasValidCredential은 (userId, claimType) 시그니처 — credentials 배열 state 제거
import { hasValidCredential } from '../services/credentialService';

// ============================================================
type ModalStep =
  | 'input' | 'kyc_gate' | 'fx_gate' | 'quote'
  | 'confirm' | 'approving' | 'swapping' | 'done' | 'error';

const FX_THRESHOLD_USD = 10_000;
const ROUTE_DEBOUNCE_MS = 700;

const FX_PURPOSE_OPTIONS = [
  '해외 투자', '자산 운용', '유학/교육비', '해외 부동산', '기타 재산 형성',
];

// Fix 2: colors 타입에 icon 포함
type CategoryColors = { bg: string; border: string; text: string; icon: string };

interface ComparisonData {
  navAmount: string;
  dexAmount: string;
  diffAmount: string;
  diffUsd: number;
  isDexBetter: boolean;
  navAnnual: number | null;
  dexAnnual: number | null;
  extraAnnual: number | null;
}

// ============================================================
interface RWASwapModalProps {
  asset: RWAAsset;
  prices: RWAPriceMap;
  navData: NAVData | null;
  onClose: () => void;
  onKycRequest?: () => void;
}

// ============================================================
export function RWASwapModal({ asset, prices, navData, onClose, onKycRequest }: RWASwapModalProps) {
  const smartAccount = useActiveAccount();
  const colors: CategoryColors = RWA_CATEGORY_COLORS[asset.category];
  const price = prices[asset.id];

  const [step, setStep]             = useState<ModalStep>('input');
  const [amountUsdc, setAmountUsdc] = useState('');
  const [fxPurpose, setFxPurpose]   = useState('');
  const [quote, setQuote]           = useState<SwapQuote | null>(null);
  const [txHash, setTxHash]         = useState('');
  const [errorMsg, setErrorMsg]     = useState('');

  // Fix 1+3: hasKyc를 boolean state로, hasValidCredential(userId) 직접 호출
  const [hasKyc, setHasKyc]               = useState(false);
  const [isCheckingKyc, setIsCheckingKyc] = useState(true);

  useEffect(() => {
    if (!smartAccount) return;
    setIsCheckingKyc(true);
    // hasValidCredential은 async (userId, claimType) → Promise<boolean>
    hasValidCredential(smartAccount.address, 'NON_SANCTIONED')
      .then(setHasKyc)
      .catch(() => setHasKyc(false))
      .finally(() => setIsCheckingKyc(false));
  }, [smartAccount]);

  // Feature 4: 실시간 경로
  const [routeResult, setRouteResult]         = useState<DEXRouteResult | null>(null);
  const [isRouteFetching, setIsRouteFetching] = useState(false);
  const routeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (routeTimerRef.current) clearTimeout(routeTimerRef.current);
    const amount = parseFloat(amountUsdc) || 0;
    if (amount < asset.minInvestmentUsd) { setRouteResult(null); return; }

    routeTimerRef.current = setTimeout(async () => {
      setIsRouteFetching(true);
      try {
        const result = await getSwapRoute(
          asset.chainId, asset.buyWithAddress, asset.contractAddress,
          amountUsdc, 6, asset.decimals, 'USDC', asset.symbol,
        );
        setRouteResult(result);
      } catch (e) {
        console.warn('[RWASwapModal] route fetch 실패', e);
      } finally {
        setIsRouteFetching(false);
      }
    }, ROUTE_DEBOUNCE_MS);

    return () => { if (routeTimerRef.current) clearTimeout(routeTimerRef.current); };
  }, [amountUsdc, asset]);

  // 금액 계산
  const usdcAmount   = parseFloat(amountUsdc) || 0;
  const exchangeRate = price?.priceKrw && price?.priceUsd ? price.priceKrw / price.priceUsd : 1450;
  const amountKrw    = usdcAmount * exchangeRate;

  const estimatedRwaAmount = useMemo(() => {
    if (!usdcAmount || !price?.priceUsd || price.priceUsd === 0) return '0';
    return (usdcAmount / price.priceUsd).toFixed(6);
  }, [usdcAmount, price]);

  // Feature 2: 비교 계산
  const comparison = useMemo((): ComparisonData | null => {
    if (!usdcAmount || usdcAmount < 1 || !navData || !price?.priceUsd) return null;
    const navPrice = navData.navUsd;
    const dexPrice = price.priceUsd;
    if (!navPrice || !dexPrice) return null;
    const navAmount  = usdcAmount / navPrice;
    const dexAmount  = usdcAmount / dexPrice;
    const diffAmount = dexAmount - navAmount;
    const diffUsd    = diffAmount * dexPrice;
    const apy        = asset.fallbackApy;
    const navAnnual  = apy > 0 ? (usdcAmount * apy) / 100 : null;
    const dexAnnual  = apy > 0 && navAnnual !== null
      ? navAnnual + (Math.abs(diffAmount) * dexPrice * apy) / 100 : null;
    return {
      navAmount:   navAmount.toFixed(6),
      dexAmount:   dexAmount.toFixed(6),
      diffAmount:  Math.abs(diffAmount).toFixed(6),
      diffUsd:     Math.abs(diffUsd),
      isDexBetter: diffAmount > 0,
      navAnnual,
      dexAnnual,
      extraAnnual: dexAnnual !== null && navAnnual !== null ? dexAnnual - navAnnual : null,
    };
  }, [usdcAmount, navData, price, asset.fallbackApy]);

  const needsFxGate = usdcAmount >= FX_THRESHOLD_USD;

  const handleProceed = async () => {
    if (!smartAccount) return;
    if (!hasKyc) { setStep('kyc_gate'); return; }
    if (needsFxGate && !fxPurpose) { setStep('fx_gate'); return; }
    await fetchQuote();
  };

  const fetchQuote = async () => {
    if (!smartAccount) return;
    setStep('quote');
    try {
      const q = await getSwapQuote(
        asset.chainId, asset.buyWithAddress, asset.contractAddress,
        amountUsdc, 6, asset.decimals, smartAccount.address, 0.5,
      );
      setQuote(q);
      setStep('confirm');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '견적 조회 실패');
      setStep('error');
    }
  };

  const handleExecute = async () => {
    if (!smartAccount || !quote) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = (window as any).ethereum;
    if (!provider) { setErrorMsg('지갑 프로바이더를 찾을 수 없습니다.'); setStep('error'); return; }
    try {
      const allowance = await checkAllowance(asset.chainId, asset.buyWithAddress, smartAccount.address);
      if (allowance < BigInt(quote.fromAmount)) {
        setStep('approving');
        const approveTx = await buildApprovalTx(asset.chainId, asset.buyWithAddress, quote.fromAmount);
        await provider.request({
          method: 'eth_sendTransaction',
          params: [{ from: smartAccount.address, to: approveTx.to, data: approveTx.data,
            gas: `0x${parseInt(approveTx.gas || '100000').toString(16)}`,
            gasPrice: `0x${parseInt(approveTx.gasPrice || '30000000000').toString(16)}` }],
        });
      }
      setStep('swapping');
      const hash = await executeSwap(quote, provider);
      setTxHash(hash);
      setStep('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '트랜잭션 실패');
      setStep('error');
    }
  };

  const explorerUrl = txHash ? `${EXPLORER[asset.chainId] || 'https://etherscan.io/tx/'}${txHash}` : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      {/* pb-20: 모바일 하단 탭바(~64px) 위로 올림 */}
      <div className="w-full max-w-md bg-slate-950 border-t border-slate-800 rounded-t-3xl p-6 pb-20 space-y-5 animate-slide-up max-h-[85vh] overflow-y-auto custom-scrollbar">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${colors.bg} border ${colors.border} flex items-center justify-center text-xl`}>
              {colors.icon}
            </div>
            <div>
              <p className="text-sm font-black text-white">{asset.symbol} 매수</p>
              <p className="text-xs text-slate-500">{asset.issuer} · {getChainName(asset.chainId)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 transition-colors">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {(step === 'input' || step === 'fx_gate') && (
          <InputStep
            asset={asset} price={price} colors={colors}
            amountUsdc={amountUsdc} setAmountUsdc={setAmountUsdc}
            usdcAmount={usdcAmount} amountKrw={amountKrw}
            estimatedRwaAmount={routeResult ? routeResult.toAmountDisplay : estimatedRwaAmount}
            isRouteQuote={!!routeResult}
            needsFxGate={needsFxGate} fxPurpose={fxPurpose}
            setFxPurpose={setFxPurpose} showFxForm={step === 'fx_gate'}
            hasKyc={hasKyc} isCheckingKyc={isCheckingKyc}
            comparison={comparison}
            routeResult={routeResult} isRouteFetching={isRouteFetching}
            navData={navData}
            onProceed={handleProceed}
          />
        )}

        {step === 'kyc_gate' && (
          <KycGateStep onRequestKyc={() => { onClose(); onKycRequest?.(); }} onBack={() => setStep('input')} />
        )}

        {step === 'quote' && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2 size={32} className="animate-spin text-emerald-400" />
            <p className="text-sm text-slate-400 font-bold">최적 경로 탐색 중...</p>
            <p className="text-xs text-slate-600">1inch DEX 어그리게이터 조회</p>
          </div>
        )}

        {step === 'confirm' && quote && (
          <ConfirmStep asset={asset} quote={quote} amountUsdc={amountUsdc}
            fxPurpose={fxPurpose} routeResult={routeResult}
            onExecute={handleExecute} onBack={() => setStep('input')} />
        )}

        {(step === 'approving' || step === 'swapping') && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2 size={32} className="animate-spin text-cyan-400" />
            <p className="text-sm text-white font-black">
              {step === 'approving' ? 'USDC 승인 중...' : '스왑 실행 중...'}
            </p>
            <p className="text-xs text-slate-500">지갑에서 트랜잭션을 승인해주세요</p>
          </div>
        )}

        {step === 'done' && (
          <DoneStep asset={asset} amountUsdc={amountUsdc}
            estimatedRwaAmount={estimatedRwaAmount}
            txHash={txHash} explorerUrl={explorerUrl} onClose={onClose} />
        )}

        {step === 'error' && (
          <ErrorStep message={errorMsg} onRetry={() => setStep('input')} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

// ============================================================
// InputStep
// ============================================================
function InputStep({
  asset, price, colors,
  amountUsdc, setAmountUsdc, usdcAmount, amountKrw,
  estimatedRwaAmount, isRouteQuote,
  needsFxGate, fxPurpose, setFxPurpose, showFxForm,
  hasKyc, isCheckingKyc, comparison,
  routeResult, isRouteFetching, navData, onProceed,
}: {
  asset: RWAAsset;
  price: RWAPriceMap[string] | undefined;
  colors: CategoryColors;
  amountUsdc: string; setAmountUsdc: (v: string) => void;
  usdcAmount: number; amountKrw: number;
  estimatedRwaAmount: string; isRouteQuote: boolean;
  needsFxGate: boolean; fxPurpose: string; setFxPurpose: (v: string) => void;
  showFxForm: boolean; hasKyc: boolean; isCheckingKyc: boolean;
  comparison: ComparisonData | null;
  routeResult: DEXRouteResult | null; isRouteFetching: boolean;
  navData: NAVData | null;
  onProceed: () => void;
}) {
  const apy = price?.apy ?? asset.fallbackApy;

  return (
    <div className="space-y-4">

      {/* APY 배지 */}
      <div className={`flex items-center justify-between ${colors.bg} border ${colors.border} rounded-xl px-4 py-3`}>
        <span className="text-xs text-slate-400 font-bold">{RWA_CATEGORY_LABELS[asset.category]}</span>
        <span className={`text-sm font-black ${colors.text}`}>{formatApy(apy)}</span>
      </div>

      {/* USDC 입력 */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 focus-within:border-slate-600 transition-colors">
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs font-bold text-slate-400">지불 (USDC)</span>
          <span className="text-xs text-slate-500">최소 ${asset.minInvestmentUsd.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-xs font-black text-blue-400 shrink-0">$</div>
          <input type="number" value={amountUsdc} onChange={e => setAmountUsdc(e.target.value)}
            placeholder="0.00"
            className="flex-1 min-w-0 bg-transparent text-right text-3xl font-black text-white outline-none placeholder-slate-700" />
        </div>
        <div className="text-right mt-2 w-full truncate">
          <span className="text-xs text-slate-500 font-mono">
            ≈ ₩{amountKrw.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      {/* 화살표 */}
      <div className="flex justify-center">
        <div className="bg-slate-900 p-2 rounded-xl border border-slate-800 text-slate-500">
          <ArrowRightLeft size={16} className="rotate-90" />
        </div>
      </div>

      {/* 받는 자산 */}
      <div className={`${colors.bg} border ${colors.border} rounded-2xl p-4`}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold text-slate-400">받기 ({asset.symbol})</span>
          <span className="text-[9px] text-slate-500 flex items-center gap-1">
            {isRouteFetching
              ? <><Loader2 size={9} className="animate-spin" /> 경로 탐색 중</>
              : isRouteQuote
                ? <><Zap size={9} className="text-cyan-400" /> 1inch 견적</>
                : '예상 수령액'}
          </span>
        </div>
        <div className="text-3xl font-black text-white text-right break-all">{estimatedRwaAmount}</div>
        {price?.priceUsd && (
          <div className="text-right text-xs text-slate-500 mt-1 font-mono">
            1 {asset.symbol} = ${price.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </div>
        )}
      </div>

      {/* Feature 4: DEX 경로 패널 */}
      {(routeResult || isRouteFetching) && usdcAmount >= asset.minInvestmentUsd && (
        <RoutePanel routeResult={routeResult} isLoading={isRouteFetching} />
      )}

      {/* Feature 2: 비교 계산기 */}
      {comparison && usdcAmount >= asset.minInvestmentUsd && (
        <ComparisonCalculator asset={asset} comparison={comparison} usdcAmount={usdcAmount} />
      )}

      {/* ── 시장 분석 시각화 패널 — 항상 표시 ── */}
      {navData && (
        <RWAMarketVisualPanel
          asset={asset}
          navData={navData}
          routeResult={routeResult}
          liquidityFallback={RWA_LIQUIDITY_FALLBACK[asset.id] ?? null}
        />
      )}

      {/* FX법 게이트 */}
      {(needsFxGate || showFxForm) && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Info size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-300 font-bold">외국환거래법 제18조 — $10,000 이상 거래 시 목적 입력 필수</p>
          </div>
          <div className="space-y-2">
            {FX_PURPOSE_OPTIONS.map(opt => (
              <button key={opt} onClick={() => setFxPurpose(opt)}
                className={`w-full text-left text-xs font-bold px-3 py-2.5 rounded-xl border transition-all flex items-center justify-between
                  ${fxPurpose === opt
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'}`}>
                {opt}
                {fxPurpose === opt && <Check size={12} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* KYC 상태 */}
      <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ${
        isCheckingKyc ? 'bg-slate-900 border border-slate-800' :
        hasKyc ? 'bg-emerald-500/10 border border-emerald-500/20' :
                 'bg-red-500/10 border border-red-500/20'}`}>
        {isCheckingKyc
          ? <Loader2 size={12} className="animate-spin text-slate-500" />
          : hasKyc
            ? <ShieldCheck size={12} className="text-emerald-400" />
            : <AlertCircle size={12} className="text-red-400" />}
        <span className={`text-xs font-bold ${
          isCheckingKyc ? 'text-slate-500' : hasKyc ? 'text-emerald-400' : 'text-red-400'}`}>
          {isCheckingKyc ? 'KYC 확인 중...' : hasKyc ? 'KYC 인증 완료' : 'KYC 인증 필요 — NON_SANCTIONED'}
        </span>
      </div>

      {/* 실행 버튼 */}
      <button onClick={onProceed}
        disabled={usdcAmount < asset.minInvestmentUsd || isCheckingKyc}
        className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] disabled:opacity-40 disabled:shadow-none transition-all shadow-lg">
        {usdcAmount < asset.minInvestmentUsd
          ? `최소 $${asset.minInvestmentUsd.toLocaleString()} 이상 입력`
          : needsFxGate && !fxPurpose && !showFxForm
            ? '다음 — 거래 목적 입력'
            : `${asset.symbol} 매수하기`}
      </button>
    </div>
  );
}

// ============================================================
// Feature 4+5: RoutePanel — DEX 경로 + 유동성/풀 깊이
// ============================================================
function RoutePanel({ routeResult, isLoading }: {
  routeResult: DEXRouteResult | null; isLoading: boolean;
}) {
  if (isLoading && !routeResult) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={13} className="text-cyan-400" />
          <span className="text-xs font-black text-white">DEX 경로 탐색 중</span>
          <Loader2 size={11} className="animate-spin text-slate-500 ml-auto" />
        </div>
        <div className="space-y-2">
          {[60, 30, 10].map((w, i) => (
            <div key={i} className="flex items-center gap-2 animate-pulse">
              <div className="h-2.5 bg-slate-800 rounded-full" style={{ width: `${w}%` }} />
              <div className="h-2 bg-slate-800 rounded w-16" />
            </div>
          ))}
        </div>
        {/* 유동성 스켈레톤 */}
        <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-3 gap-2 animate-pulse">
          {[0,1,2].map(i => <div key={i} className="h-8 bg-slate-800 rounded-xl" />)}
        </div>
      </div>
    );
  }
  if (!routeResult || routeResult.routes.length === 0) return null;

  const liqLevel = routeResult.liquidityUsd !== null
    ? getLiquidityLevel(routeResult.liquidityUsd) : null;

  // price impact 색상
  const impactColor = !routeResult.priceImpactPct ? 'text-slate-400'
    : routeResult.priceImpactPct < 0.1  ? 'text-emerald-400'
    : routeResult.priceImpactPct < 0.5  ? 'text-yellow-400'
    : 'text-red-400';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-cyan-400" />
          <span className="text-xs font-black text-white">1inch 최적 경로</span>
          {isLoading && <Loader2 size={10} className="animate-spin text-slate-500" />}
        </div>
        <span className="text-[9px] text-slate-500">{routeResult.routes.length}개 DEX 활용</span>
      </div>

      {/* 통합 비중 바 */}
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        {routeResult.routes.map((r, i) => (
          <div key={i}
            style={{ width: `${r.part}%`, backgroundColor: getDexColor(r.name) }}
            className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-500"
            title={`${getDexLabel(r.name)}: ${r.part}%`}
          />
        ))}
      </div>

      {/* DEX별 비중 목록 */}
      <div className="space-y-2">
        {routeResult.routes.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getDexColor(r.name) }} />
            <span className="text-xs text-slate-300 font-bold flex-1 truncate">{getDexLabel(r.name)}</span>
            <div className="flex-1 max-w-[80px] bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${r.part}%`, backgroundColor: getDexColor(r.name) }} />
            </div>
            <span className="text-xs font-black text-slate-400 w-10 text-right">{r.part}%</span>
          </div>
        ))}
      </div>

      {/* ── Feature 5: 유동성 / 풀 깊이 ── */}
      <div className="pt-3 border-t border-slate-800 space-y-2">

        {/* 3-column 지표 */}
        <div className="grid grid-cols-3 gap-2">

          {/* TVL */}
          <div className="bg-slate-800/60 rounded-xl px-2.5 py-2 text-center">
            <p className="text-[9px] text-slate-500 mb-0.5">풀 유동성</p>
            {routeResult.liquidityUsd !== null ? (
              <p className={`text-xs font-black ${liqLevel?.color}`}>
                {formatLiquidity(routeResult.liquidityUsd)}
              </p>
            ) : (
              <p className="text-xs text-slate-600">—</p>
            )}
          </div>

          {/* 24h Volume */}
          <div className="bg-slate-800/60 rounded-xl px-2.5 py-2 text-center">
            <p className="text-[9px] text-slate-500 mb-0.5">24h 거래량</p>
            {routeResult.volume24hUsd !== null ? (
              <p className="text-xs font-black text-slate-300">
                {formatLiquidity(routeResult.volume24hUsd)}
              </p>
            ) : (
              <p className="text-xs text-slate-600">—</p>
            )}
          </div>

          {/* Price Impact */}
          <div className="bg-slate-800/60 rounded-xl px-2.5 py-2 text-center">
            <p className="text-[9px] text-slate-500 mb-0.5">슬리피지</p>
            {routeResult.priceImpactPct !== null ? (
              <p className={`text-xs font-black ${impactColor}`}>
                {routeResult.priceImpactPct < 0.01
                  ? '<0.01%'
                  : `${routeResult.priceImpactPct.toFixed(2)}%`}
              </p>
            ) : (
              <p className="text-xs text-slate-600">—</p>
            )}
          </div>
        </div>

        {/* 유동성 수준 설명 */}
        {liqLevel && routeResult.liquidityUsd !== null && (
          <div className={`flex items-center gap-2 rounded-xl px-3 py-1.5 ${
            routeResult.liquidityUsd >= 1_000_000
              ? 'bg-emerald-500/10 border border-emerald-500/20'
              : 'bg-orange-500/10 border border-orange-500/20'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${liqLevel.color.replace('text-', 'bg-')}`} />
            <p className="text-[10px] text-slate-400">
              유동성 <span className={`font-bold ${liqLevel.color}`}>{liqLevel.label}</span>
              {routeResult.liquidityUsd >= 1_000_000
                ? ' — 대량 매수도 슬리피지 최소화'
                : ' — 소량 분할 매수 권장'}
            </p>
          </div>
        )}

        {/* 풀 정보 없을 때 안내 */}
        {routeResult.liquidityUsd === null && (
          <p className="text-[10px] text-slate-600 text-center">
            유동성 데이터 미지원 자산 — OTC 또는 발행사 직접 매수 가능
          </p>
        )}

        {/* 가스비 */}
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-slate-500">예상 가스비</span>
          <span className="text-[10px] text-slate-400 font-mono">
            ≈ ${routeResult.estimatedGasUsd.toFixed(3)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Feature 2: ComparisonCalculator
// ============================================================
function ComparisonCalculator({ asset, comparison, usdcAmount }: {
  asset: RWAAsset; comparison: ComparisonData; usdcAmount: number;
}) {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp size={13} className="text-emerald-400" />
        <span className="text-xs font-black text-white">실물 시장 vs DEX 비교</span>
        <span className="text-[9px] text-slate-500 ml-auto">
          ${usdcAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC 기준
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-800 rounded-xl p-3">
          <p className="text-[9px] text-slate-500 font-bold mb-1.5">실물 시장 (NAV)</p>
          <p className="text-base font-black text-slate-300">
            {comparison.navAmount}
            <span className="text-[10px] text-slate-500 font-normal ml-1">{asset.symbol}</span>
          </p>
          {comparison.navAnnual !== null && (
            <p className="text-[10px] text-slate-500 mt-1.5">
              연수익 <span className="text-slate-300 font-bold">${comparison.navAnnual.toFixed(2)}</span>
            </p>
          )}
        </div>

        <div className={`rounded-xl p-3 ${comparison.isDexBetter
          ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-slate-800'}`}>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[9px] text-slate-500 font-bold">DEX (xLOT)</p>
            {comparison.isDexBetter && (
              <span className="text-[8px] font-black bg-emerald-500 text-white px-1 py-0.5 rounded">최적</span>
            )}
          </div>
          <p className={`text-base font-black ${comparison.isDexBetter ? 'text-emerald-400' : 'text-white'}`}>
            {comparison.dexAmount}
            <span className="text-[10px] text-slate-500 font-normal ml-1">{asset.symbol}</span>
          </p>
          {comparison.dexAnnual !== null && (
            <p className="text-[10px] text-slate-500 mt-1.5">
              연수익 <span className={`font-bold ${comparison.isDexBetter ? 'text-emerald-400' : 'text-slate-300'}`}>
                ${comparison.dexAnnual.toFixed(2)}
              </span>
            </p>
          )}
        </div>
      </div>

      {comparison.isDexBetter && comparison.diffUsd >= 0.01 && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-400">DEX에서 더 받는 수량</p>
              <p className="text-xs font-black text-emerald-400 mt-0.5">+{comparison.diffAmount} {asset.symbol}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400">USD 환산 절약</p>
              <p className="text-base font-black text-emerald-400">+${comparison.diffUsd.toFixed(2)}</p>
            </div>
          </div>
          {comparison.extraAnnual !== null && comparison.extraAnnual > 0 && (
            <div className="mt-2 pt-2 border-t border-emerald-500/20 flex justify-between">
              <span className="text-[10px] text-slate-500">연간 추가 수익</span>
              <span className="text-[10px] font-black text-emerald-400">+${comparison.extraAnnual.toFixed(3)}/yr</span>
            </div>
          )}
        </div>
      )}

      {!comparison.isDexBetter && (
        <div className="bg-slate-800/50 rounded-xl px-3 py-2 flex items-center gap-2">
          <Info size={11} className="text-slate-500 shrink-0" />
          <p className="text-[10px] text-slate-500">현재 DEX가 NAV 대비 소폭 프리미엄 상태입니다. 즉시성이 필요할 때 유리합니다.</p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ConfirmStep
// ============================================================
function ConfirmStep({ asset, quote, amountUsdc, fxPurpose, routeResult, onExecute, onBack }: {
  asset: RWAAsset; quote: SwapQuote; amountUsdc: string; fxPurpose: string;
  routeResult: DEXRouteResult | null; onExecute: () => void; onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-bold text-white text-center">거래 내역 확인</p>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 text-sm">
        <Row label="지불"        value={`${amountUsdc} USDC`} />
        <Row label="수령 (예상)" value={`${quote.toAmountDisplay} ${asset.symbol}`} highlight />
        <div className="border-t border-slate-800 pt-3 space-y-2">
          <Row label="가스 비용" value={`≈ $${quote.estimatedGasUsd.toFixed(3)}`} muted />
          <Row label="슬리피지"  value="0.5%" muted />
          {fxPurpose && <Row label="거래 목적" value={fxPurpose} />}
        </div>
      </div>

      {/* 경로 요약 */}
      {routeResult && routeResult.routes.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={12} className="text-cyan-400" />
            <span className="text-xs font-black text-white">실행 경로</span>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
            {routeResult.routes.map((r, i) => (
              <div key={i}
                style={{ width: `${r.part}%`, backgroundColor: getDexColor(r.name) }}
                className="h-full first:rounded-l-full last:rounded-r-full" />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
            {routeResult.routes.map((r, i) => (
              <span key={i} className="text-[10px] text-slate-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: getDexColor(r.name) }} />
                {getDexLabel(r.name)} <span className="text-slate-600">{r.part}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
        <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
        <p className="text-xs text-emerald-300 font-bold">KYC 인증 확인됨 — 거래 진행 가능</p>
      </div>
      <button onClick={onExecute}
        className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all">
        스왑 실행하기
      </button>
      <button onClick={onBack}
        className="w-full py-3 rounded-2xl font-bold text-sm text-slate-400 bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all">
        돌아가기
      </button>
    </div>
  );
}

// ============================================================
// KycGateStep / DoneStep / ErrorStep / Row
// ============================================================
function KycGateStep({ onRequestKyc, onBack }: { onRequestKyc: () => void; onBack: () => void }) {
  return (
    <div className="space-y-5 py-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <ShieldCheck size={28} className="text-red-400" />
        </div>
        <div>
          <p className="text-base font-black text-white">KYC 인증 필요</p>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            RWA 자산 투자를 위해<br />
            <span className="text-white font-bold">NON_SANCTIONED</span> 인증이 필요합니다.
          </p>
        </div>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2 text-xs text-slate-400">
        <p className="font-bold text-white text-sm">인증 내용</p>
        <p>• 제재 대상 아님 확인 (OFAC, UN 제재 목록)</p>
        <p>• TranSight KYT 스크리닝</p>
        <p>• EIP-712 서명 기반 Verifiable Credential 발급</p>
        <p>• 1회 인증 후 1년간 유효</p>
      </div>
      <button onClick={onRequestKyc}
        className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all">
        KYC 인증 받기
      </button>
      <button onClick={onBack}
        className="w-full py-3 rounded-2xl font-bold text-sm text-slate-400 bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all">
        돌아가기
      </button>
    </div>
  );
}

function DoneStep({ asset, amountUsdc, estimatedRwaAmount, txHash, explorerUrl, onClose }: {
  asset: RWAAsset; amountUsdc: string; estimatedRwaAmount: string;
  txHash: string; explorerUrl: string; onClose: () => void;
}) {
  return (
    <div className="space-y-5 py-4 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 flex items-center justify-center">
          <Check size={28} className="text-emerald-400" />
        </div>
        <p className="text-lg font-black text-white">매수 완료!</p>
        <p className="text-sm text-slate-400">
          <span className="text-white font-bold">{estimatedRwaAmount} {asset.symbol}</span>를<br />
          <span className="text-slate-300">{amountUsdc} USDC</span>로 구매했습니다
        </p>
      </div>
      {txHash && (
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
          트랜잭션 확인 <ExternalLink size={12} />
        </a>
      )}
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-300">
        {asset.fallbackApy > 0
          ? '🎉 이제부터 매일 yield가 자동으로 accrual됩니다'
          : '🏅 실물 자산 가격 변동에 따라 수익이 발생합니다'}
      </div>
      <button onClick={onClose}
        className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-emerald-500 to-teal-500 transition-all">
        닫기
      </button>
    </div>
  );
}

function ErrorStep({ message, onRetry, onClose }: {
  message: string; onRetry: () => void; onClose: () => void;
}) {
  return (
    <div className="space-y-5 py-4 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertCircle size={28} className="text-red-400" />
        </div>
        <p className="text-base font-black text-white">오류 발생</p>
        <p className="text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 font-mono break-all">
          {message || '알 수 없는 오류가 발생했습니다.'}
        </p>
      </div>
      <button onClick={onRetry}
        className="w-full py-4 rounded-2xl font-black text-base text-white bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-all">
        다시 시도
      </button>
      <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">닫기</button>
    </div>
  );
}

function Row({ label, value, highlight, muted }: {
  label: string; value: string; highlight?: boolean; muted?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className={`text-xs font-bold ${highlight ? 'text-emerald-400 text-sm' : muted ? 'text-slate-500' : 'text-white'}`}>
        {value}
      </span>
    </div>
  );
}