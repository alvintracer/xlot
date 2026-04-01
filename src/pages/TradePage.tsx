// ============================================================
// TradePage.tsx
// Mobile: 기존 모달 방식
// PC:     거래소 스팟 레이아웃
//         ┌─────────────────┬──────────────────┐
//         │  좌측 패널       │  우측 패널         │
//         │  - 시장 분석     │  - 자산 목록       │
//         │  - 가격 비교     │  (RWAYieldPanel)  │
//         │  - 스프레드 게이지│                   │
//         │  - 유동성 도넛   │                   │
//         │  - 매수 폼       │                   │
//         └─────────────────┴──────────────────┘
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { RWAYieldPanel } from '../components/RWAYieldPanel';
import { RWASwapModal } from '../components/RWASwapModal';
import { RWAMarketVisualPanel } from '../components/RWAMarketVisual';
import type { RWAAsset } from '../constants/rwaAssets';
import { ALL_RWA_ASSETS, RWA_CATEGORY_COLORS } from '../constants/rwaAssets';
import { fetchRWAPrices, fetchNAVData, RWA_LIQUIDITY_FALLBACK, formatApy, getChainName } from '../services/rwaService';
import type { RWAPriceMap, NAVMap } from '../services/rwaService';
import { getSwapRoute } from '../services/swapService';
import type { DEXRouteResult } from '../services/swapService';
import { useActiveAccount } from 'thirdweb/react';
import { hasValidKYC } from '../services/credentialService';
import { hasKYCOnDevice } from '../services/kycDeviceService';
import {
  X, ShieldCheck, AlertCircle, ArrowRightLeft,
  Loader2, Check, Info, ChevronRight, BarChart2
} from 'lucide-react';
import { KYCRegistrationModal } from '../components/KYCRegistrationModal';

// ============================================================
// Hook: 화면 너비 감지
// ============================================================
function useIsPC() {
  const [isPC, setIsPC] = useState(() => window.innerWidth >= 1024);
  useEffect(() => {
    const handler = () => setIsPC(window.innerWidth >= 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isPC;
}

// ============================================================
interface TradePageProps {
  onKycRequest?: () => void;
}

const FX_THRESHOLD_USD = 10_000;
const FX_PURPOSE_OPTIONS = ['해외 투자', '자산 운용', '유학/교육비', '해외 부동산', '기타 재산 형성'];

// ============================================================
export function TradePage({ onKycRequest }: TradePageProps) {
  const isPC = useIsPC();
  const smartAccount = useActiveAccount();

  const [prices, setPrices]   = useState<RWAPriceMap>({});
  const [navMap, setNavMap]   = useState<NAVMap>({});
  const [isLoading, setIsLoading] = useState(true);

  // PC: 선택된 자산 (좌측 패널)
  const [activeAsset, setActiveAsset] = useState<RWAAsset>(ALL_RWA_ASSETS[0]);
  // PC: 좌측 패널 route 결과
  const [panelRoute, setPanelRoute]   = useState<DEXRouteResult | null>(null);
  const [isRouteFetching, setIsRouteFetching] = useState(false);

  // Mobile: 스왑 모달
  const [mobileSelectedAsset, setMobileSelectedAsset] = useState<RWAAsset | null>(null);

  // PC: 매수 폼 state
  const [amountUsdc, setAmountUsdc] = useState('');
  const [fxPurpose, setFxPurpose]   = useState('');
  const [hasKyc, setHasKyc]         = useState(false);
  const [isCheckingKyc, setIsCheckingKyc] = useState(true);
  const [buyStep, setBuyStep]       = useState<'idle' | 'fx' | 'confirm' | 'buying' | 'done'>('idle');
  const [showKYCReg, setShowKYCReg] = useState(false);

  useEffect(() => {
    fetchRWAPrices().then(data => {
      setPrices(data);
      setIsLoading(false);
      fetchNAVData(data).then(setNavMap).catch(console.error);
    }).catch(console.error);
  }, []);

  // KYC 체크 — DB 배지(NON_SANCTIONED) OR 로컬 실명 저장 여부
  useEffect(() => {
    if (!smartAccount) return;
    setIsCheckingKyc(true);
    // 로컬에 KYC 저장된 경우 즉시 통과 (PIN 입력 없이 여부만 확인)
    if (hasKYCOnDevice(smartAccount.address)) {
      setHasKyc(true);
      setIsCheckingKyc(false);
      return;
    }
    // 로컬 없으면 DB 배지 확인
    hasValidKYC(smartAccount.address)
      .then(setHasKyc)
      .catch(() => setHasKyc(false))
      .finally(() => setIsCheckingKyc(false));
  }, [smartAccount]);

  // PC: 자산 선택 시 route fetch
  const fetchRouteForAsset = useCallback(async (asset: RWAAsset, amount: string) => {
    const num = parseFloat(amount) || 0;
    if (num < asset.minInvestmentUsd) { setPanelRoute(null); return; }
    setIsRouteFetching(true);
    try {
      const result = await getSwapRoute(
        asset.chainId, asset.buyWithAddress, asset.contractAddress,
        amount, 6, asset.decimals, 'USDC', asset.symbol,
      );
      setPanelRoute(result);
    } catch (e) {
      console.warn('[TradePage] route fetch 실패', e);
    } finally {
      setIsRouteFetching(false);
    }
  }, []);

  const handleAssetSelect = (asset: RWAAsset) => {
    setActiveAsset(asset);
    setAmountUsdc('');
    setPanelRoute(null);
    setBuyStep('idle');
    setFxPurpose('');
  };

  // 금액 변경 시 route debounce
  useEffect(() => {
    if (!isPC) return;
    const timer = setTimeout(() => {
      if (amountUsdc) fetchRouteForAsset(activeAsset, amountUsdc);
      else setPanelRoute(null);
    }, 700);
    return () => clearTimeout(timer);
  }, [amountUsdc, activeAsset, isPC, fetchRouteForAsset]);

  // ── 모바일 렌더 ──
  if (!isPC) {
    return (
      <div className="p-4 pb-24 animate-fade-in">
        <RWAYieldPanel onSelectAsset={setMobileSelectedAsset} />
        {mobileSelectedAsset && (
          <RWASwapModal
            asset={mobileSelectedAsset}
            prices={prices}
            navData={navMap[mobileSelectedAsset.id] ?? null}
            onClose={() => setMobileSelectedAsset(null)}
            onKycRequest={() => setShowKYCReg(true)}
          />
        )}
        {showKYCReg && (
          <KYCRegistrationModal
            onClose={() => setShowKYCReg(false)}
            onSuccess={() => window.location.reload()}
          />
        )}
      </div>
    );
  }

  // ── PC 렌더 ──
  const navData    = navMap[activeAsset.id] ?? null;
  const price      = prices[activeAsset.id];
  const colors     = RWA_CATEGORY_COLORS[activeAsset.category];
  const usdcAmount = parseFloat(amountUsdc) || 0;
  const exchangeRate = price?.priceKrw && price?.priceUsd ? price.priceKrw / price.priceUsd : 1450;
  const needsFxGate  = usdcAmount >= FX_THRESHOLD_USD;
  const estimatedRwa = price?.priceUsd && usdcAmount
    ? (usdcAmount / price.priceUsd).toFixed(6) : '0';
  const canBuy = usdcAmount >= activeAsset.minInvestmentUsd && !isCheckingKyc;

  const handleBuy = () => {
    if (!hasKyc)              { setShowKYCReg(true); return; }
    if (needsFxGate && !fxPurpose) { setBuyStep('fx'); return; }
    setBuyStep('confirm');
  };

  return (
    <div className="h-screen flex flex-col bg-slate-950 overflow-hidden">

      {/* PC 탑바 */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-800 shrink-0">
        <BarChart2 size={18} className="text-emerald-400" />
        <span className="text-sm font-black text-white tracking-wide">
          TRADE <span className="text-emerald-400">.</span>
        </span>
        <span className="text-xs text-slate-500">규제 준수 실물 자산 DEX 어그리게이터</span>
        {navData && (
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] text-slate-500">DEX 가격</p>
              <p className="text-sm font-black text-white">
                {price?.priceUsd
                  ? price.priceUsd >= 1000
                    ? `$${price.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : `$${price.priceUsd.toFixed(4)}`
                  : '—'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-500">NAV</p>
              <p className="text-sm font-black text-slate-400">
                {navData.navUsd >= 1000
                  ? `$${navData.navUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : `$${navData.navUsd.toFixed(4)}`}
              </p>
            </div>
            <div className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
              navData.isDiscount
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}>
              {navData.spreadPct > 0 ? '+' : ''}{navData.spreadPct.toFixed(3)}%
              <span className="ml-1 opacity-70">{navData.isDiscount ? '할인' : '프리미엄'}</span>
            </div>
          </div>
        )}
      </div>

      {/* 본문 — 2컬럼 */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── 좌측 패널: 시장 분석 + 매수 폼 ── */}
        <div className="w-[420px] shrink-0 border-r border-slate-800 flex flex-col overflow-hidden">

          {/* 자산 선택 헤더 */}
          <div className={`flex items-center gap-3 px-5 py-4 border-b border-slate-800 ${colors.bg}`}>
            <div className={`w-10 h-10 rounded-xl ${colors.bg} border ${colors.border} flex items-center justify-center text-xl shrink-0`}>
              {colors.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-white">{activeAsset.symbol}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}>
                  {formatApy(activeAsset.fallbackApy)}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">{activeAsset.name}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-slate-500">{getChainName(activeAsset.chainId)}</p>
              <p className="text-[10px] text-slate-500">{activeAsset.issuer}</p>
            </div>
          </div>

          {/* 스크롤 영역: 시각화 + 매수 폼 */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">

            {/* 시장 분석 시각화 */}
            {navData && (
              <RWAMarketVisualPanel
                asset={activeAsset}
                navData={navData}
                routeResult={panelRoute}
                liquidityFallback={RWA_LIQUIDITY_FALLBACK[activeAsset.id] ?? null}
              />
            )}

            {/* 매수 폼 */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-black text-white">매수</p>

              {/* USDC 입력 */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 focus-within:border-slate-600 transition-colors">
                <div className="flex justify-between mb-2">
                  <span className="text-[10px] text-slate-500">지불 (USDC)</span>
                  <span className="text-[10px] text-slate-500">최소 ${activeAsset.minInvestmentUsd.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-xs font-black text-blue-400 shrink-0">$</div>
                  <input
                    type="number" value={amountUsdc}
                    onChange={e => { setAmountUsdc(e.target.value); setBuyStep('idle'); }}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-right text-2xl font-black text-white outline-none placeholder-slate-700"
                  />
                </div>
                <div className="text-right mt-1">
                  <span className="text-[10px] text-slate-600 font-mono">
                    ≈ ₩{(usdcAmount * exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              {/* 화살표 */}
              <div className="flex justify-center">
                <div className="bg-slate-800 p-1.5 rounded-lg border border-slate-700 text-slate-500">
                  <ArrowRightLeft size={14} className="rotate-90" />
                </div>
              </div>

              {/* 받는 자산 */}
              <div className={`${colors.bg} border ${colors.border} rounded-xl p-3`}>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-slate-400">받기 ({activeAsset.symbol})</span>
                  <span className="text-[9px] text-slate-500">
                    {isRouteFetching ? '조회 중...' : panelRoute ? '⚡ 1inch' : '예상'}
                  </span>
                </div>
                <p className={`text-2xl font-black text-right ${colors.text}`}>
                  {panelRoute ? panelRoute.toAmountDisplay : estimatedRwa}
                </p>
              </div>

              {/* FX 목적 선택 */}
              {(needsFxGate || buyStep === 'fx') && (
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Info size={11} className="text-cyan-400 shrink-0" />
                    <p className="text-[10px] text-cyan-300 font-bold">외국환거래법 — 거래 목적 필수</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {FX_PURPOSE_OPTIONS.map(opt => (
                      <button key={opt} onClick={() => { setFxPurpose(opt); setBuyStep('idle'); }}
                        className={`text-[10px] font-bold px-2 py-1.5 rounded-lg border transition-all text-left ${
                          fxPurpose === opt
                            ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'}`}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* KYC 상태 */}
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${
                isCheckingKyc ? 'bg-slate-900 border border-slate-800' :
                hasKyc ? 'bg-emerald-500/10 border border-emerald-500/20' :
                         'bg-red-500/10 border border-red-500/20'}`}>
                {isCheckingKyc ? <Loader2 size={11} className="animate-spin text-slate-500" />
                  : hasKyc ? <ShieldCheck size={11} className="text-emerald-400" />
                  : <AlertCircle size={11} className="text-red-400" />}
                <span className={`text-[10px] font-bold ${
                  isCheckingKyc ? 'text-slate-500' : hasKyc ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isCheckingKyc ? 'KYC 확인 중...' : hasKyc ? 'KYC 인증 완료' : 'KYC 인증 필요'}
                </span>
                {!hasKyc && !isCheckingKyc && (
                  <button onClick={() => setShowKYCReg(true)}
                    className="ml-auto text-[10px] text-cyan-400 hover:text-cyan-300 font-bold">
                    인증 →
                  </button>
                )}
              </div>

              {/* 매수 버튼 */}
              {buyStep === 'done' ? (
                <div className="w-full py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center gap-2">
                  <Check size={14} className="text-emerald-400" />
                  <span className="text-sm font-black text-emerald-400">매수 완료</span>
                </div>
              ) : (
                <button onClick={handleBuy} disabled={!canBuy}
                  className="w-full py-3 rounded-xl font-black text-sm text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:opacity-40 disabled:shadow-none transition-all">
                  {!canBuy && usdcAmount < activeAsset.minInvestmentUsd
                    ? `최소 $${activeAsset.minInvestmentUsd.toLocaleString()} 이상`
                    : !hasKyc ? 'KYC 인증 후 매수'
                    : needsFxGate && !fxPurpose ? '거래 목적 선택 후 매수'
                    : `${activeAsset.symbol} 매수하기`}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── 우측 패널: 자산 목록 ── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <PCAssetList
            assets={ALL_RWA_ASSETS}
            activeAsset={activeAsset}
            prices={prices}
            navMap={navMap}
            onSelect={handleAssetSelect}
            isLoading={isLoading}
          />
        </div>
      </div>

      {showKYCReg && (
        <KYCRegistrationModal
          onClose={() => setShowKYCReg(false)}
          onSuccess={() => window.location.reload()}
        />
      )}
    </div>
  );
}

// ============================================================
// PC 전용 자산 목록 (테이블형)
// ============================================================
function PCAssetList({
  assets, activeAsset, prices, navMap, onSelect, isLoading,
}: {
  assets: RWAAsset[];
  activeAsset: RWAAsset;
  prices: RWAPriceMap;
  navMap: NAVMap;
  onSelect: (a: RWAAsset) => void;
  isLoading: boolean;
}) {
  return (
    <div className="p-5 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-black text-white">자산 목록</p>
        <p className="text-[10px] text-slate-500">{assets.length}개 RWA 자산</p>
      </div>

      {/* 컬럼 헤더 */}
      <div className="grid grid-cols-6 gap-2 px-3 pb-1 border-b border-slate-800">
        {['자산', 'DEX 가격', 'NAV', '괴리율', 'APY / 수익', '유동성'].map(h => (
          <p key={h} className="text-[9px] text-slate-600 font-bold">{h}</p>
        ))}
      </div>

      {/* 자산 행 */}
      {isLoading ? (
        <div className="space-y-2">
          {[0,1,2,3,4].map(i => (
            <div key={i} className="h-14 bg-slate-900 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {assets.map(asset => {
            const price   = prices[asset.id];
            const nav     = navMap[asset.id];
            const liq     = RWA_LIQUIDITY_FALLBACK[asset.id];
            const colors  = RWA_CATEGORY_COLORS[asset.category];
            const isActive = activeAsset.id === asset.id;

            const priceDisplay = price?.priceUsd
              ? price.priceUsd >= 1000
                ? `$${price.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : `$${price.priceUsd.toFixed(4)}`
              : '—';

            const navDisplay = nav?.navUsd
              ? nav.navUsd >= 1000
                ? `$${nav.navUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : `$${nav.navUsd.toFixed(4)}`
              : '—';

            const liqDisplay = liq
              ? liq.liquidityUsd >= 1_000_000
                ? `$${(liq.liquidityUsd / 1_000_000).toFixed(1)}M`
                : `$${(liq.liquidityUsd / 1_000).toFixed(0)}K`
              : '—';

            return (
              <button key={asset.id} onClick={() => onSelect(asset)}
                className={`w-full grid grid-cols-6 gap-2 items-center px-3 py-3 rounded-xl border text-left transition-all ${
                  isActive
                    ? `${colors.bg} ${colors.border} border`
                    : 'bg-slate-900/50 border-slate-800 hover:bg-slate-900 hover:border-slate-700'
                }`}>

                {/* 자산 */}
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center text-sm shrink-0`}>
                    {colors.icon}
                  </div>
                  <div>
                    <p className={`text-xs font-black ${isActive ? colors.text : 'text-white'}`}>
                      {asset.symbol}
                    </p>
                    <p className="text-[9px] text-slate-600 truncate">{asset.issuer}</p>
                  </div>
                </div>

                {/* DEX 가격 */}
                <div>
                  <p className="text-xs font-bold text-white">{priceDisplay}</p>
                  {price?.change24h !== undefined && (
                    <p className={`text-[9px] font-bold ${price.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {price.change24h >= 0 ? '+' : ''}{price.change24h.toFixed(2)}%
                    </p>
                  )}
                </div>

                {/* NAV */}
                <p className="text-xs text-slate-400 font-mono">{navDisplay}</p>

                {/* 괴리율 */}
                {nav ? (
                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black w-fit ${
                    nav.isDiscount
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-red-500/10 text-red-400'
                  }`}>
                    {nav.spreadPct > 0 ? '+' : ''}{nav.spreadPct.toFixed(3)}%
                  </div>
                ) : <p className="text-[9px] text-slate-600">—</p>}

                {/* APY */}
                <div>
                  <p className={`text-xs font-black ${asset.fallbackApy > 0 ? 'text-emerald-400' : 'text-teal-400'}`}>
                    {formatApy(asset.fallbackApy)}
                  </p>
                  {asset.fallbackApy > 0 && (
                    <p className="text-[9px] text-slate-600">
                      $10K→ +${((10000 * asset.fallbackApy) / 100).toFixed(0)}/yr
                    </p>
                  )}
                </div>

                {/* 유동성 */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-300 font-mono">{liqDisplay}</p>
                    {liq && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className={`w-1 h-1 rounded-full ${
                          liq.liquidityUsd >= 10_000_000 ? 'bg-emerald-400'
                          : liq.liquidityUsd >= 1_000_000 ? 'bg-teal-400'
                          : 'bg-blue-400'
                        }`} />
                        <p className="text-[9px] text-slate-600">TVL</p>
                      </div>
                    )}
                  </div>
                  <ChevronRight size={12} className={isActive ? colors.text : 'text-slate-700'} />
                </div>
              </button>
            );
          })}

          {/* Coming Soon */}
          <div className="w-full grid grid-cols-6 gap-2 items-center px-3 py-3 rounded-xl border border-dashed border-slate-800 opacity-40">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-sm">📋</div>
              <div>
                <p className="text-xs font-black text-slate-500">Credit</p>
                <p className="text-[9px] text-slate-700">Maple / Centrifuge</p>
              </div>
            </div>
            <p className="text-[9px] text-slate-700 col-span-5">준비 중 — Coming Soon</p>
          </div>
        </div>
      )}
    </div>
  );
}