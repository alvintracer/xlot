// ============================================================
// TradePage.tsx — RWA Market Intelligence + Best Execution
//
// Mobile: RWAYieldPanel -> RWASwapModal (preserved)
// PC:     3-layer architecture:
//         ┌──────────────────────────────────────────────────┐
//         │  Layer 0: Aggregator Summary Strip               │
//         ├──────────────────────┬───────────────────────────┤
//         │  Layer 2+3:          │  Layer 1:                 │
//         │  Instrument Detail   │  Market Scanner Board     │
//         │  + Execution Drawer  │  (Asset-class tabs,       │
//         │  (Charts, Structure, │   structure filters,      │
//         │   Buy Form, KYC/FX)  │   sortable columns)       │
//         └──────────────────────┴───────────────────────────┘
// ============================================================

import { useState, useEffect, useCallback } from 'react';
// RWAYieldPanel no longer used in mobile (synced with instrument model)
import { RWASwapModal } from '../components/RWASwapModal';
import { RWAMarketVisualPanel } from '../components/RWAMarketVisual';
import { RWAMarketScanner } from '../components/RWAMarketScanner';
import { BadgeStrip, ConfidenceMeter, DisclosurePanel } from '../components/RWADisclosureBadges';

// Legacy types (backward compat for existing components)
import type { RWAAsset } from '../constants/rwaAssets';
import { ALL_RWA_ASSETS, RWA_CATEGORY_COLORS } from '../constants/rwaAssets';

// New instrument model
import { ALL_INSTRUMENTS, getExecutableInstruments, instrumentToLegacyAsset } from '../constants/rwaInstruments';
import type { RWAInstrument, AssetClass } from '../types/rwaInstrument';
import { ASSET_CLASS_META, STRUCTURE_LABELS, EXECUTION_LABELS } from '../types/rwaInstrument';
import { computeConfidence } from '../services/confidenceScoringService';
import { generateDisclosure } from '../services/disclosureService';

import { fetchRWAPrices, fetchNAVData, RWA_LIQUIDITY_FALLBACK, formatApy, getChainName } from '../services/rwaService';
import type { RWAPriceMap, NAVMap } from '../services/rwaService';
import { getBestRWAExecution } from '../services/providers/rwaExecutionProvider';
import type { RouteOption } from '../services/providers/rwaExecutionProvider';
import type { DEXRouteResult } from '../services/swapService';
import { useActiveAccount } from 'thirdweb/react';
import { hasValidKYC } from '../services/credentialService';
import { hasKYCOnDevice } from '../services/kycDeviceService';
import {
  ShieldCheck, AlertCircle, ArrowRightLeft,
  Loader2, Info, Globe, Route as RouteIcon, Database, Clock,
  ChevronDown, Star, Zap, Eye, TrendingUp
} from 'lucide-react';
import { KYCRegistrationModal } from '../components/KYCRegistrationModal';

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

export function TradePage({ onKycRequest }: TradePageProps) {
  const isPC = useIsPC();
  const smartAccount = useActiveAccount();

  const [prices, setPrices]   = useState<RWAPriceMap>({});
  const [navMap, setNavMap]   = useState<NAVMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Selected instrument (new model)
  const [selectedInstrument, setSelectedInstrument] = useState<RWAInstrument>(ALL_INSTRUMENTS[0]);

  // Legacy asset bridge for existing components (charts, swap modal)
  const [activeAsset, setActiveAsset] = useState<RWAAsset>(ALL_RWA_ASSETS[0]);

  // Execution state
  const [bestRoutes, setBestRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number>(0);
  const [isRouteFetching, setIsRouteFetching] = useState(false);

  // Buy Form State
  const [amountUsdc, setAmountUsdc] = useState('');
  const [fxPurpose, setFxPurpose]   = useState('');
  const [hasKyc, setHasKyc]         = useState(false);
  const [isCheckingKyc, setIsCheckingKyc] = useState(true);
  const [buyStep, setBuyStep]       = useState<'idle' | 'fx' | 'confirm' | 'buying' | 'done' | 'compare'>('idle');
  const [showKYCReg, setShowKYCReg] = useState(false);

  // Mobile
  // Mobile state moved to mobile render section

  // ── Data fetch ──
  useEffect(() => {
    fetchRWAPrices().then(data => {
      setPrices(data);
      setIsLoading(false);
      setLastUpdated(new Date());
      fetchNAVData(data).then(setNavMap).catch(console.error);
    }).catch(console.error);
  }, []);

  // ── KYC check ──
  useEffect(() => {
    if (!smartAccount) return;
    setIsCheckingKyc(true);
    if (hasKYCOnDevice(smartAccount.address)) {
      setHasKyc(true);
      setIsCheckingKyc(false);
      return;
    }
    hasValidKYC(smartAccount.address)
      .then(setHasKyc)
      .catch(() => setHasKyc(false))
      .finally(() => setIsCheckingKyc(false));
  }, [smartAccount]);

  // ── Instrument selection handler ──
  const handleInstrumentSelect = (inst: RWAInstrument) => {
    setSelectedInstrument(inst);
    // Bridge to legacy asset for existing chart components
    const legacy = instrumentToLegacyAsset(inst);
    if (legacy) {
      setActiveAsset(legacy as RWAAsset);
    }
    setAmountUsdc('');
    setBestRoutes([]);
    setBuyStep('idle');
    setFxPurpose('');
  };

  // ── Route fetching ──
  const fetchRoutes = useCallback(async (inst: RWAInstrument, amount: string) => {
    if (inst.executionAvailability !== 'swappable_now') {
      setBestRoutes([]);
      return;
    }
    const chain = inst.chains[0];
    if (!chain) return;
    const num = parseFloat(amount) || 0;
    if (num < inst.minInvestmentUsd) {
      setBestRoutes([]);
      return;
    }
    setIsRouteFetching(true);
    try {
      const nav = navMap[inst.id]?.navUsd || null;
      const legacyAsset = instrumentToLegacyAsset(inst);
      if (!legacyAsset) return;
      const results = await getBestRWAExecution(
        legacyAsset as RWAAsset,
        amount, chain.decimals === 6 ? 6 : 6, chain.decimals,
        smartAccount?.address || '0x0000000000000000000000000000000000000000',
        nav, 0.5
      );
      setBestRoutes(results);
      setSelectedRouteIndex(0);
      if (results.length > 0) setBuyStep('compare');
    } catch (e) {
      console.warn('[TradePage] route fetch fail', e);
      setBestRoutes([]);
    } finally {
      setIsRouteFetching(false);
    }
  }, [navMap, smartAccount]);

  // Debounced route fetch
  useEffect(() => {
    if (!isPC) return;
    const timer = setTimeout(() => {
      if (amountUsdc) fetchRoutes(selectedInstrument, amountUsdc);
      else setBestRoutes([]);
    }, 700);
    return () => clearTimeout(timer);
  }, [amountUsdc, selectedInstrument, isPC, fetchRoutes]);

  // ── Mobile state ──
  const [mobileClassFilter, setMobileClassFilter] = useState<'all' | AssetClass>('all');
  const [mobileSelectedInst, setMobileSelectedInst] = useState<RWAInstrument | null>(null);

  const mobileFilteredInsts = ALL_INSTRUMENTS.filter(i =>
    mobileClassFilter === 'all' ? true : i.assetClass === mobileClassFilter
  );

  // ── Mobile render (synced with PC instrument model) ──
  if (!isPC) {
    return (
      <div className="pb-28 animate-fade-in bg-[#020617] min-h-screen">
        {/* Mobile Header */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <Globe size={16} className="text-blue-500" />
            <span className="text-xs font-black text-white">RWA Market Intelligence</span>
          </div>
          <p className="text-[10px] text-slate-500">{ALL_INSTRUMENTS.length} instruments · {new Set(ALL_INSTRUMENTS.map(i => i.assetClass)).size} asset classes</p>
        </div>

        {/* Asset Class Tabs (horizontal scroll) */}
        <div className="px-4 pb-3 overflow-x-auto">
          <div className="flex gap-1.5 min-w-max">
            {[
              { id: 'all' as const, label: 'All', icon: '🌐' },
              ...Object.values(ASSET_CLASS_META).map(m => ({ id: m.id, label: m.label, icon: m.icon })),
            ].map(tab => (
              <button key={tab.id} onClick={() => setMobileClassFilter(tab.id)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all ${
                  mobileClassFilter === tab.id
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                    : 'bg-slate-900 text-slate-400 border border-slate-800'
                }`}>
                <span>{tab.icon}</span>{tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Instrument List */}
        <div className="px-4 space-y-2">
          {mobileFilteredInsts.map(inst => {
            const acMeta = ASSET_CLASS_META[inst.assetClass];
            const execMeta = EXECUTION_LABELS[inst.executionAvailability];
            const structMeta = STRUCTURE_LABELS[inst.structureType];
            const prc = prices[inst.id];
            const nav = navMap[inst.id];

            const priceDisplay = prc?.priceUsd
              ? prc.priceUsd >= 1000 ? `$${prc.priceUsd.toLocaleString(undefined, {maximumFractionDigits: 0})}` : `$${prc.priceUsd.toFixed(4)}`
              : `$${inst.fallbackNavUsd >= 100 ? inst.fallbackNavUsd.toFixed(0) : inst.fallbackNavUsd.toFixed(2)}`;

            return (
              <button key={inst.id}
                onClick={() => setMobileSelectedInst(inst)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-left hover:border-slate-700 transition-all">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${acMeta.color.bg} border ${acMeta.color.border} flex items-center justify-center text-lg shrink-0`}>
                    {acMeta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-sm font-black text-white truncate">{inst.symbol}</p>
                      <p className="text-sm font-mono font-bold text-white">{priceDisplay}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-slate-500 truncate">{inst.issuer}</p>
                      {inst.fallbackApy > 0 && (
                        <span className="text-[10px] font-black text-emerald-400">{inst.fallbackApy.toFixed(1)}% APY</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border border-transparent ${structMeta.color}`}>
                        {structMeta.label}
                      </span>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${execMeta.color}`}>
                        {execMeta.icon} {execMeta.label}
                      </span>
                      {nav && (
                        <span className={`text-[9px] font-black ${nav.isDiscount ? 'text-emerald-400' : 'text-red-400'}`}>
                          {nav.spreadPct > 0 ? '+' : ''}{nav.spreadPct.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronDown size={14} className="text-slate-600 -rotate-90 shrink-0" />
                </div>
              </button>
            );
          })}

          {mobileFilteredInsts.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-600">No instruments in this category</div>
          )}
        </div>

        {/* Mobile Detail Modal */}
        {mobileSelectedInst && (() => {
          const inst = mobileSelectedInst;
          const isExec = inst.executionAvailability === 'swappable_now';
          const legacyAsset = instrumentToLegacyAsset(inst);
          const acMeta = ASSET_CLASS_META[inst.assetClass];

          // For executable assets with a valid legacy bridge, use the existing RWASwapModal
          if (isExec && legacyAsset) {
            return (
              <RWASwapModal
                asset={legacyAsset as RWAAsset}
                prices={prices}
                navData={navMap[inst.id] ?? null}
                onClose={() => setMobileSelectedInst(null)}
                onKycRequest={() => setShowKYCReg(true)}
              />
            );
          }

          // For non-executable assets, show an info-only bottom sheet
          return (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setMobileSelectedInst(null)}>
              <div className="w-full max-w-md bg-slate-950 border-t border-slate-800 rounded-t-3xl p-6 pb-20 space-y-4 animate-slide-up max-h-[85vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${acMeta.color.bg} border ${acMeta.color.border} flex items-center justify-center text-xl`}>
                      {acMeta.icon}
                    </div>
                    <div>
                      <p className="text-sm font-black text-white">{inst.displayName}</p>
                      <p className="text-xs text-slate-500">{inst.issuer} · {inst.symbol}</p>
                    </div>
                  </div>
                  <button onClick={() => setMobileSelectedInst(null)} className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800">
                    <AlertCircle size={16} className="text-slate-400" />
                  </button>
                </div>

                {/* Badges */}
                <BadgeStrip instrument={inst} />

                {/* Description */}
                <p className="text-xs text-slate-400 leading-relaxed">{inst.description}</p>

                {/* Underlying */}
                <div className="bg-slate-900 rounded-xl p-3 border border-slate-800">
                  <p className="text-[10px] text-slate-500 font-bold mb-1">Underlying Reference</p>
                  <p className="text-xs text-white">{inst.underlyingReference}</p>
                </div>

                {/* Status indicator */}
                <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 text-center space-y-2">
                  <Eye size={20} className="mx-auto text-slate-600" />
                  <p className="text-sm font-bold text-slate-400">
                    {inst.executionAvailability === 'tracked_only' && 'Tracked Market'}
                    {inst.executionAvailability === 'platform_only' && 'Platform Access Required'}
                    {inst.executionAvailability === 'quote_only' && 'Quote Only'}
                  </p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {inst.executionAvailability === 'tracked_only' && 'This instrument is tracked for market intelligence. Execution is not currently integrated.'}
                    {inst.executionAvailability === 'platform_only' && `Execute via ${inst.issuer} platform directly.`}
                    {inst.executionAvailability === 'quote_only' && 'Quotes available but no execution path integrated.'}
                  </p>
                </div>

                {/* Disclosure */}
                <DisclosurePanel instrument={inst} />

                {/* Close button */}
                <button onClick={() => setMobileSelectedInst(null)}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm text-slate-400 bg-slate-900 border border-slate-800">
                  Close
                </button>
              </div>
            </div>
          );
        })()}

        {showKYCReg && <KYCRegistrationModal onClose={() => setShowKYCReg(false)} onSuccess={() => window.location.reload()} />}
      </div>
    );
  }

  // ── Computed values ──
  const totalInstruments = ALL_INSTRUMENTS.length;
  const executableCount = getExecutableInstruments().length;
  const trackedCount = totalInstruments - executableCount;
  const supportedChains = new Set(ALL_INSTRUMENTS.flatMap(i => i.chains.map(c => c.chainId))).size;
  const assetClasses = new Set(ALL_INSTRUMENTS.map(i => i.assetClass)).size;
  const bestDiscountAsset = Object.entries(navMap).filter(([,n]) => n.isDiscount).sort(([,a],[,b]) => a.spreadPct - b.spreadPct)[0];
  const maxApy = Math.max(...ALL_INSTRUMENTS.map(i => i.fallbackApy));

  const inst = selectedInstrument;
  const acMeta = ASSET_CLASS_META[inst.assetClass];
  const confidence = computeConfidence(inst);
  const disclosure = generateDisclosure(inst);
  const isExecutable = inst.executionAvailability === 'swappable_now';
  const navData = navMap[inst.id] ?? null;
  const usdcAmount = parseFloat(amountUsdc) || 0;
  const needsFxGate = usdcAmount >= FX_THRESHOLD_USD;
  const activeRoute = bestRoutes[selectedRouteIndex];
  const canBuy = isExecutable && usdcAmount >= inst.minInvestmentUsd && !isCheckingKyc && bestRoutes.length > 0;

  // Bridge for RWAMarketVisualPanel
  const panelRoute: DEXRouteResult | null = activeRoute ? {
    chainId: inst.chains[0]?.chainId || 0,
    fromSymbol: 'USDC',
    toSymbol: inst.symbol,
    fromAmountDisplay: amountUsdc,
    toAmountDisplay: activeRoute.toAmountDisplay,
    estimatedGasUsd: activeRoute.estimatedGasUsd,
    routes: activeRoute.route,
    fetchedAt: Date.now(),
    liquidityUsd: null,
    volume24hUsd: null,
    priceImpactPct: activeRoute.priceImpact,
  } : null;

  const handleBuy = () => {
    if (!hasKyc) return setShowKYCReg(true);
    if (needsFxGate && !fxPurpose) return setBuyStep('fx');
    setBuyStep('confirm');
  };

  return (
    <div className="h-screen flex flex-col bg-[#020617] overflow-hidden text-slate-300 font-sans">

      {/* ═══ LAYER 0: AGGREGATOR SUMMARY STRIP ═══ */}
      <div className="flex items-center gap-5 px-6 py-2.5 bg-[#0a0f1e] border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2 pr-5 border-r border-slate-800">
          <Globe size={18} className="text-blue-500" />
          <div>
            <div className="text-[9px] text-blue-400/80 font-bold uppercase tracking-widest">RWA Market Intelligence</div>
            <div className="text-xs font-black text-white">Best Execution Aggregator</div>
          </div>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <div>
            <p className="text-[9px] text-slate-500 font-bold">Instruments</p>
            <p className="font-mono text-white">{totalInstruments} <span className="text-[9px] text-slate-600">({executableCount} exec · {trackedCount} tracked)</span></p>
          </div>
          <div>
            <p className="text-[9px] text-slate-500 font-bold">Coverage</p>
            <p className="font-mono text-white">{assetClasses} Classes · {supportedChains} Chains</p>
          </div>
          <div>
            <p className="text-[9px] text-slate-500 font-bold">Best Discount</p>
            <p className="font-mono text-emerald-400">
              {bestDiscountAsset ? `${Math.abs(bestDiscountAsset[1].spreadPct).toFixed(2)}%` : 'None'}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-slate-500 font-bold">Max Yield</p>
            <p className="font-mono text-emerald-400">{maxApy.toFixed(1)}%</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Clock size={11} className="text-slate-500" />
            <span className="text-[9px] text-slate-400 font-mono">Live · {lastUpdated.toLocaleTimeString()}</span>
          </div>
        </div>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ═══ LEFT: INSTRUMENT DETAIL + EXECUTION DRAWER ═══ */}
        <div className="w-[520px] xl:w-[560px] shrink-0 border-r border-slate-800 flex flex-col overflow-y-auto custom-scrollbar bg-[#050914]">

          {/* ── Instrument Header ── */}
          <div className="p-5 border-b border-slate-800 bg-gradient-to-b from-[#0a0f1e] to-transparent">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl ${acMeta.color.bg} border ${acMeta.color.border} flex items-center justify-center text-xl shadow-lg`}>
                  {acMeta.icon}
                </div>
                <div>
                  <h1 className="text-lg font-black text-white">{inst.displayName}</h1>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-bold text-slate-400">{inst.issuer}</span>
                    <span className="text-[9px] text-slate-600">·</span>
                    <span className="text-[9px] text-slate-500">{inst.symbol}</span>
                  </div>
                </div>
              </div>
              <div className={`px-2 py-1 rounded text-[9px] font-bold ${acMeta.color.bg} ${acMeta.color.text} border ${acMeta.color.border}`}>
                {acMeta.label.toUpperCase()}
              </div>
            </div>

            {/* Structure & Rights Badges */}
            <BadgeStrip instrument={inst} />

            {/* Underlying reference */}
            <div className="mt-3 text-[10px] text-slate-500">
              <span className="font-bold">Underlying:</span>{' '}
              <span className="text-slate-400">{inst.underlyingReference}</span>
            </div>

            {/* Key metadata cards */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
                <p className="text-[9px] text-slate-500 font-bold">NAV Source</p>
                <p className="text-[11px] font-medium text-white truncate mt-0.5">{inst.navLabel}</p>
                <p className="text-[11px] font-mono text-slate-300 mt-0.5">
                  ${navData?.navUsd ? navData.navUsd.toFixed(4) : inst.fallbackNavUsd}
                </p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
                <p className="text-[9px] text-slate-500 font-bold">Confidence</p>
                <ConfidenceMeter report={confidence} />
              </div>
            </div>

            {/* Chain deployments */}
            {inst.chains.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[9px] font-bold text-slate-500 uppercase">Available On</p>
                <div className="flex gap-1.5 flex-wrap">
                  {inst.chains.map(c => (
                    <span key={c.chainId} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-bold text-slate-400">
                      <Database size={10} />
                      {c.chainName}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Routers */}
            {inst.routers.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] text-slate-600 font-bold">Routers:</span>
                {inst.routers.filter(r => r.isLive).map(r => (
                  <span key={r.name} className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-bold">{r.name}</span>
                ))}
              </div>
            )}
          </div>

          {/* ── Scrollable content area ── */}
          <div className="p-5 pb-32 space-y-5">

            {/* Description */}
            <p className="text-xs text-slate-500 leading-relaxed">{inst.description}</p>

            {/* Disclosure panel */}
            <DisclosurePanel instrument={inst} />

            {/* ── Charts (preserved from original — conditional) ── */}
            {navData && isExecutable && (
              <RWAMarketVisualPanel
                asset={activeAsset}
                navData={navData}
                routeResult={panelRoute}
                liquidityFallback={RWA_LIQUIDITY_FALLBACK[activeAsset.id] ?? null}
              />
            )}

            {/* For non-executable instruments: show info-only state */}
            {!isExecutable && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-center space-y-3">
                <Eye size={24} className="mx-auto text-slate-600" />
                <p className="text-sm font-bold text-slate-400">
                  {inst.executionAvailability === 'tracked_only' && 'Tracked Market'}
                  {inst.executionAvailability === 'platform_only' && 'Platform Access Required'}
                  {inst.executionAvailability === 'quote_only' && 'Quote Only'}
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {inst.executionAvailability === 'tracked_only' && 'This instrument is tracked for market intelligence. Execution is not currently integrated.'}
                  {inst.executionAvailability === 'platform_only' && `Execute via ${inst.issuer} platform. DEX integration pending.`}
                  {inst.executionAvailability === 'quote_only' && 'Quotes can be obtained but execution routes are not available.'}
                </p>
                {inst.disclaimerShort && (
                  <p className="text-[10px] text-slate-600 italic">{inst.disclaimerShort}</p>
                )}
              </div>
            )}

            {/* ── Execution / Buy Form (only for swappable_now) ── */}
            {isExecutable && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-black text-white flex items-center gap-2">
                    <Zap size={14} className="text-emerald-400" />
                    Execution Quote
                  </span>
                  <span className="text-[10px] text-slate-500 bg-slate-950 px-2 py-1 rounded">
                    Min ${inst.minInvestmentUsd.toLocaleString()}
                  </span>
                </div>

                <div className="space-y-4">
                  {/* USDC Input */}
                  <div className="bg-[#050914] border border-slate-800 rounded-xl p-4 focus-within:border-blue-500/50 transition-colors">
                    <div className="flex justify-between mb-2">
                      <span className="text-xs text-slate-500">Pay with USDC</span>
                    </div>
                    <input
                      type="number" value={amountUsdc}
                      onChange={e => { setAmountUsdc(e.target.value); setBuyStep('idle'); }}
                      placeholder="0.00"
                      className="w-full bg-transparent text-2xl font-black text-white outline-none placeholder-slate-700"
                    />
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-center -my-2 relative z-10">
                    <div className="bg-slate-800 p-2 rounded-full border border-slate-700">
                      <ArrowRightLeft size={14} className="rotate-90 text-slate-400" />
                    </div>
                  </div>

                  {/* Output */}
                  <div className={`${activeRoute ? 'bg-blue-500/10 border-blue-500/30' : 'bg-[#050914] border-slate-800'} border rounded-xl p-4 transition-colors min-h-[80px]`}>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs text-slate-400">Receive {inst.symbol}</span>
                      <span className="text-[10px] text-slate-500">
                        {isRouteFetching ? 'Scanning venues...' : activeRoute ? activeRoute.providerName : ''}
                      </span>
                    </div>
                    {isRouteFetching ? (
                      <div className="animate-pulse flex items-center justify-between h-8">
                        <div className="h-7 bg-slate-800 rounded w-1/2" />
                        <Loader2 className="animate-spin text-blue-400" size={18} />
                      </div>
                    ) : activeRoute ? (
                      <p className="text-2xl font-black text-white">{activeRoute.toAmountDisplay}</p>
                    ) : (
                      <p className="text-2xl font-black text-slate-700">0.00</p>
                    )}
                  </div>

                  {/* Route Comparison */}
                  {bestRoutes.length > 0 && (
                    <div className="bg-slate-950 rounded-xl border border-slate-800 p-3">
                      <div className="flex items-center justify-between cursor-pointer" onClick={() => setBuyStep(buyStep === 'compare' ? 'idle' : 'compare')}>
                        <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                          <RouteIcon size={14} />
                          {bestRoutes.length > 1 ? `Compare ${bestRoutes.length} Routes` : 'Route Details'}
                        </span>
                        <ChevronDown size={14} className={`text-slate-500 transition-transform ${buyStep === 'compare' ? 'rotate-180' : ''}`} />
                      </div>
                      {buyStep === 'compare' && (
                        <div className="space-y-3 mt-2 pt-2 border-t border-slate-800">
                          {bestRoutes.map((rt, i) => (
                            <div key={i} onClick={() => { setSelectedRouteIndex(i); setBuyStep('confirm'); }}
                              className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                                selectedRouteIndex === i ? 'bg-blue-500/10 border-blue-500/30' : 'bg-slate-900 border-slate-800 hover:border-slate-600'
                              }`}>
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className="text-xs font-black text-white">{rt.providerName}</p>
                                  <p className="text-[10px] text-slate-500">
                                    Score: <strong className={i === 0 ? 'text-emerald-400' : 'text-white'}>{rt.executionScore}</strong>
                                  </p>
                                </div>
                                <p className="text-sm font-mono font-black text-white">{rt.toAmountDisplay} {inst.symbol}</p>
                              </div>
                              <div className="grid grid-cols-4 gap-1 pt-2 border-t border-slate-800/60">
                                <div className="p-1 rounded bg-slate-950 text-center">
                                  <p className="text-[8px] text-slate-500 font-bold">Output</p>
                                  <p className="text-[10px] text-emerald-400 font-mono">+{rt.scoreBreakdown.baseOutput}</p>
                                </div>
                                <div className="p-1 rounded bg-slate-950 text-center">
                                  <p className="text-[8px] text-slate-500 font-bold">Impact</p>
                                  <p className="text-[10px] text-red-400 font-mono">{rt.scoreBreakdown.priceImpactPenalty}</p>
                                </div>
                                <div className="p-1 rounded bg-slate-950 text-center">
                                  <p className="text-[8px] text-slate-500 font-bold">Gas</p>
                                  <p className="text-[10px] text-red-400 font-mono">{rt.scoreBreakdown.gasPenalty}</p>
                                </div>
                                <div className="p-1 rounded bg-slate-950 text-center">
                                  <p className="text-[8px] text-slate-500 font-bold">NAV Δ</p>
                                  <p className={`text-[10px] font-mono ${rt.scoreBreakdown.navDiscountBonus > 0 ? 'text-emerald-400' : rt.scoreBreakdown.navDiscountBonus < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                                    {rt.scoreBreakdown.navDiscountBonus > 0 ? '+' : ''}{rt.scoreBreakdown.navDiscountBonus}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Execution Intelligence */}
                  {activeRoute && buyStep !== 'compare' && (
                    <div className="bg-emerald-500/5 rounded-xl border border-emerald-500/20 p-3">
                      <p className="text-[10px] font-bold text-emerald-400 mb-1 flex items-center gap-1"><Star size={10} /> Execution Intelligence</p>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Best output via <strong className="text-white">{activeRoute.providerName}</strong>
                        {inst.chains[0] && ` on ${inst.chains[0].chainName}`}.
                        {activeRoute.navSpread < 0 ? ` ${Math.abs(activeRoute.navSpread).toFixed(2)}% discount to NAV.` : ''}
                        {' '}Impact: {(activeRoute.priceImpact || 0).toFixed(2)}%.
                      </p>
                    </div>
                  )}

                  {/* KYC & FX Gates (preserved) */}
                  {activeRoute && (
                    <>
                      {(needsFxGate || buyStep === 'fx') && (
                        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3 space-y-2">
                          <div className="flex items-center gap-1.5">
                            <Info size={11} className="text-cyan-400 shrink-0" />
                            <p className="text-[10px] text-cyan-300 font-bold">FX Gate — 거래 목적 필수</p>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {FX_PURPOSE_OPTIONS.map(opt => (
                              <button key={opt} onClick={() => { setFxPurpose(opt); setBuyStep('confirm'); }}
                                className={`text-[10px] font-bold px-2 py-1.5 rounded-lg border transition-all text-left ${
                                  fxPurpose === opt ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300' : 'bg-slate-900 border-slate-800 text-slate-400'
                                }`}>{opt}</button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${hasKyc ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                        {hasKyc ? <ShieldCheck size={11} className="text-emerald-400" /> : <AlertCircle size={11} className="text-red-400" />}
                        <span className={`text-[10px] font-bold ${hasKyc ? 'text-emerald-400' : 'text-red-400'}`}>
                          {hasKyc ? 'KYC Verified' : 'KYC Required'}
                        </span>
                        {!hasKyc && (
                          <button onClick={() => setShowKYCReg(true)} className="ml-auto text-[10px] text-blue-400 hover:text-blue-300 font-bold">Verify →</button>
                        )}
                      </div>
                    </>
                  )}

                  {/* Buy Button */}
                  <button onClick={handleBuy} disabled={!canBuy || isRouteFetching}
                    className="w-full py-3 rounded-xl font-black text-sm text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:bg-slate-800 transition-all shadow-[0_0_15px_rgba(37,99,235,0.2)]">
                    {isRouteFetching ? 'Scanning Venues...'
                      : !canBuy && usdcAmount < inst.minInvestmentUsd && usdcAmount > 0 ? `Min $${inst.minInvestmentUsd.toLocaleString()}`
                      : !canBuy && usdcAmount > 0 ? 'No viable route'
                      : !hasKyc ? 'Complete KYC'
                      : needsFxGate && !fxPurpose ? 'Select FX Purpose'
                      : 'Execute Order'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT: MARKET SCANNER ═══ */}
        <div className="flex-1 bg-[#0a0f1e] flex flex-col overflow-hidden">
          <RWAMarketScanner
            prices={prices}
            navMap={navMap}
            onSelectInstrument={handleInstrumentSelect}
            selectedId={selectedInstrument.id}
          />
        </div>
      </div>

      {showKYCReg && <KYCRegistrationModal onClose={() => setShowKYCReg(false)} onSuccess={() => window.location.reload()} />}
    </div>
  );
}